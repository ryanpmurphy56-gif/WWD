/**
 * WebsuiteMemberAuthController — passwordless email-code login for a site's
 * Member Login block (sectionMemberLogin). Runs as the Site Guest User on the
 * published route, so every method is explicitly scoped by siteId rather than
 * relying on record ownership or an internal user's sharing rules.
 *
 * Every write here is a plain INSERT — never an UPDATE or DELETE. That's not
 * a style choice: the Guest User license does not allow the Edit or Delete
 * object permissions on custom objects at all ("The user license doesn't
 * allow the permission: Edit/Delete ..."), so nothing this controller does
 * can flip a status field, or remove a row, on an existing record. Login
 * codes are issued once and never mutated; "used" / "too many attempts" are
 * derived by counting Websuite_Login_Attempt__c rows instead of updating a
 * Consumed__c/Attempts__c field. Sessions live in their own object
 * (Websuite_Member_Session__c, one row per login), and logout works the same
 * insert-only way: it adds a Websuite_Session_Revocation__c row rather than
 * deleting or editing the session — a session is valid only while it is
 * unexpired AND has no matching revocation row.
 *
 * Codes and session tokens are only ever stored as salted SHA-256 hashes. The
 * browser holds the one raw session token (paired with the member Id) in
 * localStorage; nothing sensitive enough to replay a session lives on the
 * server side of that pair.
 *
 * `without sharing`, matching AuthControllerV2's own convention — but note
 * that alone does NOT fix Guest User record access, for either writes or
 * reads. Salesforce enforces "secure guest user record access" as a hard,
 * unconditional platform rule: a guest can INSERT a Websuite_Site_Member__c
 * row fine, but referencing that row's own Id in another object's lookup
 * field on the next INSERT fails with INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY
 * — and, confirmed by a real-Guest-User regression test, a plain SELECT for
 * that same row (e.g. inside verifyLoginCode, moments after
 * signUpAndSendCode created it) can silently return zero rows too. Neither
 * `with sharing` nor `without sharing` changes this — every DML statement
 * here runs via Database.insert(record, AccessLevel.SYSTEM_MODE), and every
 * SOQL query runs via Database.query/countQuery(str, AccessLevel.SYSTEM_MODE)
 * instead of plain `insert`/`[SELECT ...]`. This class's own isCreateable()
 * checks (still meaningful — they reflect the permission set's actual grant)
 * remain the real authorization boundary; SYSTEM_MODE only clears the
 * platform's row-visibility check on the DML/SOQL itself.
 */
public without sharing class WebsuiteMemberAuthController {

    private static final Integer CODE_TTL_MINUTES = 15;
    private static final Integer SESSION_TTL_DAYS = 30;
    private static final Integer MAX_VERIFY_ATTEMPTS = 5;
    private static final Integer MAX_REQUESTS_WINDOW = 3; // codes per rolling 15 minutes, per member
    private static final String CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/1/I/O
    private static final Pattern EMAIL_PATTERN = Pattern.compile('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');

    // ===== Step 1: email submitted =====
    // Existing member on this site -> a code is sent immediately.
    // No such member -> NAME_REQUIRED, so the client can collect a name and
    // call signUpAndSendCode instead of creating a record from an email alone.
    @AuraEnabled
    public static LoginRequestResult requestLoginCode(Id siteId, String email) {
        String cleanEmail = validatedEmail(email);
        if (siteId == null) {
            throw new AuraHandledException('Missing site.');
        }

        Websuite_Site_Member__c member = findMember(siteId, cleanEmail);
        LoginRequestResult result = new LoginRequestResult();
        if (member == null) {
            result.status = 'NAME_REQUIRED';
            return result;
        }

        issueCode(member);
        result.status = 'CODE_SENT';
        result.maskedEmail = maskEmail(cleanEmail);
        return result;
    }

    // ===== Step 2 (new visitors only): name (+ optional phone) submitted, create + send =====
    @AuraEnabled
    public static LoginRequestResult signUpAndSendCode(Id siteId, String email, String firstName, String lastName, String phone) {
        String cleanEmail = validatedEmail(email);
        if (siteId == null) {
            throw new AuraHandledException('Missing site.');
        }
        if (String.isBlank(firstName) || String.isBlank(lastName)) {
            throw new AuraHandledException('Please enter your first and last name.');
        }

        Websuite_Site_Member__c member = findMember(siteId, cleanEmail);
        if (member == null) {
            if (!Schema.sObjectType.Websuite_Site_Member__c.isCreateable()) {
                throw new AuraHandledException('You do not have permission to sign up.');
            }
            member = new Websuite_Site_Member__c(
                Website_Site__c = siteId,
                Email__c = cleanEmail,
                First_Name__c = firstName.trim().left(80),
                Last_Name__c = lastName.trim().left(80),
                Phone__c = String.isBlank(phone) ? null : phone.trim().left(40)
            );
            try {
                Database.insert(member, AccessLevel.SYSTEM_MODE);
            } catch (DmlException e) {
                throw new AuraHandledException('Could not create your account. Please try again.');
            }
        }

        issueCode(member);
        LoginRequestResult result = new LoginRequestResult();
        result.status = 'CODE_SENT';
        result.maskedEmail = maskEmail(cleanEmail);
        return result;
    }

    // ===== Step 3: code verified -> issue a session =====
    @AuraEnabled
    public static MemberSession verifyLoginCode(Id siteId, String email, String code) {
        String cleanEmail = validatedEmail(email);
        if (siteId == null || String.isBlank(code)) {
            throw new AuraHandledException('Please enter the code from your email.');
        }

        Websuite_Site_Member__c member = findMember(siteId, cleanEmail);
        if (member == null) {
            throw new AuraHandledException('Invalid or expired code. Please try again.');
        }

        Id mbrId = member.Id;
        List<Websuite_Login_Code__c> codes = Database.query(
            'SELECT Id, Code_Hash__c, Expires_At__c FROM Websuite_Login_Code__c ' +
                'WHERE Member__c = :mbrId ORDER BY CreatedDate DESC LIMIT 1',
            AccessLevel.SYSTEM_MODE
        );
        if (codes.isEmpty()) {
            throw new AuraHandledException('Invalid or expired code. Please try again.');
        }
        Websuite_Login_Code__c lc = codes[0];
        if (lc.Expires_At__c < Datetime.now()) {
            throw new AuraHandledException('Invalid or expired code. Please try again.');
        }

        Id codeId = lc.Id;
        List<Websuite_Login_Attempt__c> attempts = Database.query(
            'SELECT Id, Success__c FROM Websuite_Login_Attempt__c WHERE Code__c = :codeId',
            AccessLevel.SYSTEM_MODE
        );
        if (attempts.size() >= MAX_VERIFY_ATTEMPTS) {
            throw new AuraHandledException('Too many incorrect attempts. Please request a new code.');
        }
        for (Websuite_Login_Attempt__c a : attempts) {
            if (a.Success__c) {
                throw new AuraHandledException('Invalid or expired code. Please try again.');
            }
        }

        if (!Schema.sObjectType.Websuite_Login_Attempt__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to verify a code.');
        }
        if (hashCode(code.trim().toUpperCase(), member.Id) != lc.Code_Hash__c) {
            Database.insert(new Websuite_Login_Attempt__c(Code__c = lc.Id, Success__c = false), AccessLevel.SYSTEM_MODE);
            throw new AuraHandledException('Invalid or expired code. Please try again.');
        }
        Database.insert(new Websuite_Login_Attempt__c(Code__c = lc.Id, Success__c = true), AccessLevel.SYSTEM_MODE);

        String rawToken = generateSessionToken();
        if (!Schema.sObjectType.Websuite_Member_Session__c.isCreateable()) {
            throw new AuraHandledException('Could not complete login. Please try again.');
        }
        try {
            Database.insert(
                new Websuite_Member_Session__c(
                    Member__c = member.Id,
                    Token_Hash__c = hashSessionToken(rawToken, member.Id),
                    Expires_At__c = Datetime.now().addDays(SESSION_TTL_DAYS)
                ),
                AccessLevel.SYSTEM_MODE
            );
        } catch (DmlException e) {
            throw new AuraHandledException('Could not complete login. Please try again.');
        }

        return toSession(member, rawToken);
    }

    // ===== Auto-login on return visit =====
    // Returns null (not an exception) for any invalid/expired/mismatched
    // session — the client just falls back to the email screen.
    @AuraEnabled
    public static MemberSession getCurrentMember(Id siteId, Id memberId, String sessionToken) {
        if (siteId == null || memberId == null || String.isBlank(sessionToken)) {
            return null;
        }
        List<Websuite_Site_Member__c> members = Database.query(
            'SELECT Id, Email__c, First_Name__c, Last_Name__c FROM Websuite_Site_Member__c ' +
                'WHERE Id = :memberId AND Website_Site__c = :siteId LIMIT 1',
            AccessLevel.SYSTEM_MODE
        );
        if (members.isEmpty()) {
            return null;
        }
        Websuite_Site_Member__c member = members[0];
        Websuite_Member_Session__c session = liveSession(member.Id, hashSessionToken(sessionToken, member.Id));
        if (session == null) {
            return null;
        }
        return toSession(member, null);
    }

    // ===== Logout =====
    // Inserts a revocation marker for the one matching session (see the class
    // header — Delete isn't available to the Guest User license either).
    // Best-effort: a missing/already-revoked session is not an error, the
    // client clears its local copy either way.
    @AuraEnabled
    public static void logout(Id siteId, Id memberId, String sessionToken) {
        if (siteId == null || memberId == null || String.isBlank(sessionToken)) {
            return;
        }
        List<Websuite_Site_Member__c> members = Database.query(
            'SELECT Id FROM Websuite_Site_Member__c WHERE Id = :memberId AND Website_Site__c = :siteId LIMIT 1',
            AccessLevel.SYSTEM_MODE
        );
        if (members.isEmpty()) {
            return;
        }
        Websuite_Member_Session__c session = liveSession(memberId, hashSessionToken(sessionToken, memberId));
        if (session == null || !Schema.sObjectType.Websuite_Session_Revocation__c.isCreateable()) {
            return;
        }
        Database.insert(new Websuite_Session_Revocation__c(Session__c = session.Id), AccessLevel.SYSTEM_MODE);
    }

    // The one unexpired, unrevoked session matching a member+token-hash pair, or null.
    private static Websuite_Member_Session__c liveSession(Id memberId, String tokenHash) {
        Datetime notExpired = Datetime.now();
        List<Websuite_Member_Session__c> sessions = Database.query(
            'SELECT Id FROM Websuite_Member_Session__c ' +
                'WHERE Member__c = :memberId AND Token_Hash__c = :tokenHash AND Expires_At__c >= :notExpired',
            AccessLevel.SYSTEM_MODE
        );
        if (sessions.isEmpty()) {
            return null;
        }
        Set<Id> sessionIds = new Set<Id>();
        for (Websuite_Member_Session__c s : sessions) {
            sessionIds.add(s.Id);
        }
        List<Websuite_Session_Revocation__c> revocations = Database.query(
            'SELECT Session__c FROM Websuite_Session_Revocation__c WHERE Session__c IN :sessionIds',
            AccessLevel.SYSTEM_MODE
        );
        Set<Id> revokedIds = new Set<Id>();
        for (Websuite_Session_Revocation__c r : revocations) {
            revokedIds.add(r.Session__c);
        }
        for (Websuite_Member_Session__c s : sessions) {
            if (!revokedIds.contains(s.Id)) {
                return s;
            }
        }
        return null;
    }

    // ================= internals =================

    private static String validatedEmail(String email) {
        String cleanEmail = normalizeEmail(email);
        if (String.isBlank(cleanEmail) || !EMAIL_PATTERN.matcher(cleanEmail).matches()) {
            throw new AuraHandledException('Please enter a valid email address.');
        }
        return cleanEmail;
    }

    private static String normalizeEmail(String email) {
        return email == null ? '' : email.trim().toLowerCase();
    }

    private static Websuite_Site_Member__c findMember(Id siteId, String email) {
        List<Websuite_Site_Member__c> members = Database.query(
            'SELECT Id, Email__c, First_Name__c, Last_Name__c FROM Websuite_Site_Member__c ' +
                'WHERE Website_Site__c = :siteId AND Email__c = :email LIMIT 1',
            AccessLevel.SYSTEM_MODE
        );
        return members.isEmpty() ? null : members[0];
    }

    private static void issueCode(Websuite_Site_Member__c member) {
        Datetime windowStart = Datetime.now().addMinutes(-15);
        Id mbrId = member.Id;
        Integer recent = Database.countQuery(
            'SELECT COUNT() FROM Websuite_Login_Code__c WHERE Member__c = :mbrId AND CreatedDate >= :windowStart',
            AccessLevel.SYSTEM_MODE
        );
        if (recent >= MAX_REQUESTS_WINDOW) {
            throw new AuraHandledException('Too many code requests. Please wait a few minutes and try again.');
        }

        String code = generateCode();
        if (!Schema.sObjectType.Websuite_Login_Code__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to request a code.');
        }
        Database.insert(
            new Websuite_Login_Code__c(
                Member__c = member.Id,
                Code_Hash__c = hashCode(code, member.Id),
                Expires_At__c = Datetime.now().addMinutes(CODE_TTL_MINUTES)
            ),
            AccessLevel.SYSTEM_MODE
        );

        try {
            sendCodeEmail(member.Email__c, member.First_Name__c, code);
        } catch (Exception e) {
            throw new AuraHandledException('We couldn\'t send the code right now. Please try again shortly.');
        }
    }

    @TestVisible
    private static String generateCode() {
        String code = '';
        for (Integer i = 0; i < 6; i++) {
            Long r = Math.abs((Long) Crypto.getRandomInteger());
            Integer idx = (Integer) Math.mod(r, CODE_ALPHABET.length());
            code += CODE_ALPHABET.substring(idx, idx + 1);
        }
        return code;
    }

    @TestVisible
    private static String hashCode(String code, Id memberId) {
        Blob input = Blob.valueOf(String.valueOf(memberId) + ':' + code + ':websuite-login-code');
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', input));
    }

    @TestVisible
    private static String generateSessionToken() {
        return EncodingUtil.convertToHex(Crypto.generateAesKey(256));
    }

    @TestVisible
    private static String hashSessionToken(String rawToken, Id memberId) {
        Blob input = Blob.valueOf(String.valueOf(memberId) + ':' + rawToken + ':websuite-session');
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', input));
    }

    private static String maskEmail(String email) {
        if (String.isBlank(email) || !email.contains('@')) {
            return 'your email';
        }
        String[] parts = email.split('@');
        String local = parts[0];
        String shown = local.length() <= 2 ? local.substring(0, 1) : local.substring(0, 2);
        return shown + '•••@' + parts[1];
    }

    // Set this to a verified Organization-Wide Email Address Id once one exists
    // (Setup > Organization-Wide Addresses) — blank until then. Hardcoded rather
    // than queried at runtime: a Guest User likely can't SOQL-query
    // OrgWideEmailAddress at all (it's setup/config metadata), which would make
    // a dynamic lookup silently useless for guests even after configuring one.
    // setOrgWideEmailAddressId only needs the Id value, not read access to the
    // object, so a hardcoded Id sidesteps that entirely.
    //
    // Why this matters: without an explicit sender, Messaging.SingleEmailMessage
    // falls back to the running user's own "email" — for the Site Guest User
    // that's a synthetic ...@<orgId>.org.force.com placeholder, not a real
    // deliverable address. Real mail providers silently drop it: Salesforce
    // reports the send as successful (queued), but nothing ever arrives, with
    // no visible error anywhere in Apex.
    private static final Id ORG_WIDE_EMAIL_ADDRESS_ID = '0D2QE0000002XHd0AM';

    private static void sendCodeEmail(String toAddress, String firstName, String code) {
        String name = String.isBlank(firstName) ? 'there' : firstName;
        Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
        if (ORG_WIDE_EMAIL_ADDRESS_ID != null) {
            mail.setOrgWideEmailAddressId(ORG_WIDE_EMAIL_ADDRESS_ID);
        }
        mail.setToAddresses(new String[] { toAddress });
        mail.setSubject('Your login code: ' + code);
        mail.setPlainTextBody(
            'Hi ' + name + ',\n\n' +
            'Use this code to log in: ' + code + '\n\n' +
            'It expires in ' + CODE_TTL_MINUTES + ' minutes. If you didn\'t request this, you can ignore this email.'
        );
        mail.setHtmlBody(
            '<div style="font-family:Segoe UI,Arial,sans-serif;color:#222">'
            + '<p>Hi ' + name.escapeHtml4() + ',</p>'
            + '<p>Use this code to log in:</p>'
            + '<p style="font-size:28px;font-weight:bold;letter-spacing:6px">' + code.escapeHtml4() + '</p>'
            + '<p>It expires in ' + CODE_TTL_MINUTES + ' minutes.</p>'
            + '<p style="color:#777;font-size:12px">If you didn\'t request this, you can ignore this email.</p>'
            + '</div>'
        );
        mail.setSaveAsActivity(false);
        // Messaging.sendEmail does NOT throw for most delivery failures (bad
        // deliverability setting, missing Send Email permission, etc.) — it
        // returns a result that must be checked, or a silent non-delivery
        // looks identical to success. issueCode's caller already converts any
        // exception here into a generic user-facing message.
        Messaging.SendEmailResult[] results = Messaging.sendEmail(new Messaging.SingleEmailMessage[] { mail }, false);
        if (results == null || results.isEmpty() || !results[0].isSuccess()) {
            String detail = (results != null && !results.isEmpty() && !results[0].getErrors().isEmpty())
                ? results[0].getErrors()[0].getMessage()
                : 'Unknown error';
            System.debug(LoggingLevel.ERROR, 'WebsuiteMemberAuthController: code email not delivered — ' + detail);
            throw new EmailDeliveryException('Code email was not delivered: ' + detail);
        }
    }

    private class EmailDeliveryException extends Exception {}

    private static MemberSession toSession(Websuite_Site_Member__c member, String rawToken) {
        MemberSession s = new MemberSession();
        s.memberId = member.Id;
        s.sessionToken = rawToken;
        s.firstName = member.First_Name__c;
        s.lastName = member.Last_Name__c;
        s.email = member.Email__c;
        return s;
    }

    public class LoginRequestResult {
        @AuraEnabled public String status; // 'CODE_SENT' | 'NAME_REQUIRED'
        @AuraEnabled public String maskedEmail;
    }

    public class MemberSession {
        @AuraEnabled public Id memberId;
        @AuraEnabled public String sessionToken; // present only right after verifyLoginCode
        @AuraEnabled public String firstName;
        @AuraEnabled public String lastName;
        @AuraEnabled public String email;
    }
}
