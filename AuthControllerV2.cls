public without sharing class AuthControllerV2 {

    @AuraEnabled
    public static String registerUser(
        String firstName, String lastName, String email,
        String birthdate, String phoneNumber, String password
    ) {
        // ===== VALIDATION (outside try so messages bubble up cleanly) =====
        if (String.isBlank(firstName) || String.isBlank(lastName) || String.isBlank(email)) {
            throw new AuraHandledException('Please fill in all required fields.');
        }
        if (String.isBlank(birthdate) || String.isBlank(phoneNumber)) {
            throw new AuraHandledException('Please enter your birthdate and phone number.');
        }
        if (String.isBlank(password) || password.length() < 8) {
            throw new AuraHandledException('Please choose a password of at least 8 characters.');
        }

        String cleanFirst = firstName.trim();
        String cleanLast  = lastName.trim();
        String cleanEmail = email.trim().toLowerCase();
        String cleanPhone = phoneNumber.trim();

        if (!isValidEmail(cleanEmail)) {
            throw new AuraHandledException('Please enter a valid email address.');
        }

        Date parsedBirthdate;
        try {
            parsedBirthdate = Date.valueOf(birthdate);
        } catch (Exception e) {
            throw new AuraHandledException('Please enter a valid birthdate.');
        }

        // Age check enforced in Apex (defence in depth — validation rule on Account also enforces this)
        Integer ageInYears = parsedBirthdate.daysBetween(Date.today()) / 365;
        if (ageInYears < 18) {
            throw new AuraHandledException('You must be 18 or over to register.');
        }

        List<User> existing = [SELECT Id FROM User WHERE Username = :cleanEmail LIMIT 1];
        if (!existing.isEmpty()) {
            throw new AuraHandledException('An account with this email already exists.');
        }

        // ===== REGISTRATION =====
        try {
            Profile memberProfile = getCommunityProfile();

            Account acct = new Account(
                Name            = cleanFirst + ' ' + cleanLast,
                Birthdate__c    = parsedBirthdate,
                Phone_Number__c = cleanPhone,
                Join_Date__c    = Date.today(),
                Email__c        = cleanEmail
            );
            insert acct;

            Contact con = new Contact(
                FirstName = cleanFirst,
                LastName  = cleanLast,
                Email     = cleanEmail,
                Phone     = cleanPhone,
                AccountId = acct.Id
            );
            insert con;

            User newUser = new User(
                FirstName         = cleanFirst,
                LastName          = cleanLast,
                Email             = cleanEmail,
                Username          = cleanEmail,
                Alias             = buildAlias(cleanFirst, cleanLast),
                CommunityNickname = buildCommunityNickname(cleanFirst, cleanLast, cleanEmail),
                ProfileId         = memberProfile.Id,
                LocaleSidKey      = 'en_AU',
                LanguageLocaleKey = 'en_US',
                TimeZoneSidKey    = 'Australia/Sydney',
                EmailEncodingKey  = 'UTF-8',
                ContactId         = con.Id
            );

            // Three-argument call: sets the user-chosen password so they can sign in immediately
            String createdUserId = Site.createExternalUser(newUser, acct.Id, password);

            if (String.isBlank(createdUserId)) {
                throw new AuraHandledException('Account could not be created. Please try again.');
            }

            // Async because User insert + Member Card insert in same transaction = mixed DML error
            createMembershipCardAsync(createdUserId);

            // Log the new user straight in — returns the frontdoor URL the browser must follow
            ApexPages.PageReference loginResult = Site.login(cleanEmail, password, homeUrl());
            if (loginResult != null && String.isNotBlank(loginResult.getUrl())) {
                return loginResult.getUrl();
            }
            return 'SUCCESS';

        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            System.debug('REGISTRATION ERROR: ' + e.getMessage() + ' | ' + e.getStackTraceString());
            throw new AuraHandledException('Registration failed: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static String loginUser(String email, String password) {
        if (String.isBlank(email) || String.isBlank(password)) {
            throw new AuraHandledException('Please enter your email and password.');
        }

        try {
            String cleanEmail = email.trim().toLowerCase();

            List<User> users = [
                SELECT Id, Username, IsActive
                FROM User
                WHERE Username = :cleanEmail
                LIMIT 1
            ];

            if (users.isEmpty()) {
                throw new AuraHandledException('Login failed. Please check your email and password.');
            }
            if (!users[0].IsActive) {
                throw new AuraHandledException('This account is inactive. Please contact support.');
            }

            ApexPages.PageReference loginResult = Site.login(users[0].Username, password, homeUrl());
            if (loginResult != null) {
                String redirectUrl = loginResult.getUrl();
                // Fall back to the site home if Salesforce returns an internal VF path (e.g. /vforcesite/...)
                if (String.isBlank(redirectUrl) || redirectUrl.containsIgnoreCase('/vforcesite')) {
                    redirectUrl = homeUrl();
                }
                return redirectUrl;
            }
            throw new AuraHandledException('Login failed. Please check your email and password.');

        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Login failed. Please check your email and password.');
        }
    }

    @AuraEnabled
    public static void forgotPassword(String email) {
        if (String.isBlank(email)) {
            throw new AuraHandledException('Please enter your email address.');
        }

        try {
            String cleanEmail = email.trim().toLowerCase();
            Site.forgotPassword(cleanEmail);
            // Note: we don't throw on false return — Salesforce returns false for non-existent
            // emails to prevent account enumeration. Always return success to the user.
        } catch (Exception e) {
            System.debug('Forgot password error: ' + e.getMessage());
            // Silent — don't leak whether email exists
        }
    }

    // In-site password change for a logged-in member — no email round trip needed
    @AuraEnabled
    public static void changePassword(String oldPassword, String newPassword, String confirmPassword) {
        if (String.isBlank(oldPassword) || String.isBlank(newPassword) || String.isBlank(confirmPassword)) {
            throw new AuraHandledException('Please fill in all password fields.');
        }
        if (newPassword != confirmPassword) {
            throw new AuraHandledException('New passwords do not match.');
        }
        if (newPassword.length() < 8) {
            throw new AuraHandledException('Your new password must be at least 8 characters.');
        }
        try {
            Site.changePassword(newPassword, confirmPassword, oldPassword);
        } catch (Exception e) {
            String msg = e.getMessage();
            throw new AuraHandledException(String.isBlank(msg)
                ? 'Password change failed. Please check your current password.' : msg);
        }
    }

    // ===== Self-service reset for a logged-in member who has forgotten their current password =====
    // A 6-digit code is sent to the member's on-file email (SMS is not wired yet). After the member
    // verifies the code we set a new password directly, so the current password isn't required.

    private static final Integer CODE_TTL_MINUTES    = 10;
    private static final Integer MAX_VERIFY_ATTEMPTS = 5;
    private static final Integer MAX_REQUESTS_WINDOW = 3;   // per rolling 15 minutes

    // Issues a fresh code and returns a masked destination (e.g. "ja•••@gmail.com") for the UI.
    @AuraEnabled
    public static String requestPasswordResetCode(String channel) {
        String ch = String.isBlank(channel) ? 'email' : channel.trim().toLowerCase();
        if (ch != 'email') {
            throw new AuraHandledException('Text-message codes aren\'t available yet — please use email.');
        }

        Id userId = UserInfo.getUserId();
        List<User> users = [SELECT Id, Email, FirstName FROM User WHERE Id = :userId LIMIT 1];
        if (users.isEmpty() || String.isBlank(users[0].Email)) {
            throw new AuraHandledException('No email address is on file for your account. Please contact support.');
        }
        User u = users[0];

        // Rate limit — cap how many codes can be issued in a short window
        Datetime windowStart = Datetime.now().addMinutes(-15);
        Integer recent = [
            SELECT COUNT() FROM Password_Reset_Code__c
            WHERE User__c = :userId AND CreatedDate >= :windowStart
        ];
        if (recent >= MAX_REQUESTS_WINDOW) {
            throw new AuraHandledException('Too many code requests. Please wait a few minutes and try again.');
        }

        // Invalidate any outstanding codes so only the newest one works
        List<Password_Reset_Code__c> outstanding = [
            SELECT Id FROM Password_Reset_Code__c
            WHERE User__c = :userId AND Consumed__c = false
        ];
        for (Password_Reset_Code__c c : outstanding) c.Consumed__c = true;
        if (!outstanding.isEmpty()) update outstanding;

        String code = generateSixDigitCode();
        insert new Password_Reset_Code__c(
            User__c       = userId,
            Code_Hash__c  = hashResetCode(code, userId),
            Expires_At__c = Datetime.now().addMinutes(CODE_TTL_MINUTES),
            Channel__c    = 'Email',
            Consumed__c   = false,
            Attempts__c   = 0
        );

        try {
            sendCodeEmail(u.Email, u.FirstName, code);
        } catch (Exception e) {
            throw new AuraHandledException('We couldn\'t send the code right now. Please try again shortly.');
        }
        return maskEmail(u.Email);
    }

    // Verifies the code and, when valid, sets the new password (no current password needed).
    @AuraEnabled
    public static void resetPasswordWithCode(String code, String newPassword, String confirmPassword) {
        if (String.isBlank(code) || String.isBlank(newPassword) || String.isBlank(confirmPassword)) {
            throw new AuraHandledException('Please enter the code and your new password.');
        }
        if (newPassword != confirmPassword) {
            throw new AuraHandledException('New passwords do not match.');
        }
        if (newPassword.length() < 8) {
            throw new AuraHandledException('Your new password must be at least 8 characters.');
        }

        Id userId = UserInfo.getUserId();
        List<Password_Reset_Code__c> codes = [
            SELECT Id, Code_Hash__c, Expires_At__c, Consumed__c, Attempts__c
            FROM Password_Reset_Code__c
            WHERE User__c = :userId AND Consumed__c = false
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
        if (codes.isEmpty()) {
            throw new AuraHandledException('No active code found. Please request a new one.');
        }
        Password_Reset_Code__c prc = codes[0];

        if (prc.Expires_At__c < Datetime.now()) {
            prc.Consumed__c = true;
            update prc;
            throw new AuraHandledException('That code has expired. Please request a new one.');
        }
        if (prc.Attempts__c != null && prc.Attempts__c >= MAX_VERIFY_ATTEMPTS) {
            prc.Consumed__c = true;
            update prc;
            throw new AuraHandledException('Too many incorrect attempts. Please request a new code.');
        }

        if (hashResetCode(code.trim(), userId) != prc.Code_Hash__c) {
            prc.Attempts__c = (prc.Attempts__c == null ? 0 : prc.Attempts__c) + 1;
            update prc;
            throw new AuraHandledException('Incorrect code. Please check and try again.');
        }

        // Valid — consume the code first, then set the password
        prc.Consumed__c = true;
        update prc;

        try {
            System.setPassword(userId, newPassword);
        } catch (Exception e) {
            String msg = e.getMessage();
            throw new AuraHandledException(String.isBlank(msg)
                ? 'Could not update your password. Please try again.' : 'Could not update your password: ' + msg);
        }
    }

    private static String generateSixDigitCode() {
        // Cast through Long so Math.abs never overflows on Integer.MIN_VALUE
        Long r = Math.abs((Long) Crypto.getRandomInteger());
        Integer sixDigits = (Integer) Math.mod(r, 1000000);
        return String.valueOf(sixDigits).leftPad(6).replace(' ', '0');
    }

    private static String hashResetCode(String code, Id userId) {
        Blob input  = Blob.valueOf(String.valueOf(userId) + ':' + code + ':pnp-pw-reset');
        Blob digest = Crypto.generateDigest('SHA-256', input);
        return EncodingUtil.convertToHex(digest);
    }

    private static void sendCodeEmail(String toAddress, String firstName, String code) {
        String name = String.isBlank(firstName) ? 'there' : firstName;
        Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
        mail.setToAddresses(new String[] { toAddress });
        mail.setSubject('Your Point & Pour verification code');
        mail.setPlainTextBody(
            'Hi ' + name + ',\n\n' +
            'Your Point & Pour password reset code is: ' + code + '\n\n' +
            'Enter it on the account page to set a new password. It expires in ' + CODE_TTL_MINUTES + ' minutes.\n\n' +
            'If you did not request this, ignore this email — your password will not change.\n\n— Point & Pour'
        );
        mail.setHtmlBody(
            '<div style="font-family:Segoe UI,Arial,sans-serif;color:#222">'
            + '<h2 style="color:#3e0f44">Point &amp; Pour</h2>'
            + '<p>Hi ' + name.escapeHtml4() + ',</p>'
            + '<p>Your password reset code is:</p>'
            + '<p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#3e0f44">' + code + '</p>'
            + '<p>Enter it on the account page to set a new password. It expires in ' + CODE_TTL_MINUTES + ' minutes.</p>'
            + '<p style="color:#777;font-size:12px">If you did not request this, ignore this email — your password will not change.</p>'
            + '</div>'
        );
        mail.setSaveAsActivity(false);
        Messaging.sendEmail(new Messaging.SingleEmailMessage[] { mail });
    }

    private static String maskEmail(String email) {
        if (String.isBlank(email) || !email.contains('@')) return 'your email';
        String[] parts = email.split('@');
        String local = parts[0];
        String shown = local.length() <= 2 ? local.substring(0, 1) : local.substring(0, 2);
        return shown + '•••@' + parts[1];
    }

    @future
    private static void createMembershipCardAsync(String userId) {
        try {
            User u = [
                SELECT Id, FirstName, LastName, ContactId, AccountId
                FROM User
                WHERE Id = :userId
                LIMIT 1
            ];

            if (u.ContactId == null || u.AccountId == null) {
                System.debug('Cannot create card: missing Contact or Account on user ' + userId);
                return;
            }

            List<Members_Card__c> existing = [
                SELECT Id FROM Members_Card__c
                WHERE Contact__c = :u.ContactId
                LIMIT 1
            ];
            if (!existing.isEmpty()) return;

            insert new Members_Card__c(
                Name           = u.FirstName + ' ' + u.LastName + ' Membership',
                Contact__c     = u.ContactId,
                Account__c     = u.AccountId,
                Start_Date__c  = Date.today(),
                Expiry_Date__c = Date.today().addYears(1)
            );

        } catch (Exception e) {
            System.debug('Membership card creation failed: ' + e.getMessage());
        }
    }

    // Site home, respecting the Experience site's path prefix ('' when served at the domain root).
    // The old hardcoded '/s/' sent users to a non-existent page after login.
    private static String homeUrl() {
        String prefix = Site.getPathPrefix();
        return String.isBlank(prefix) ? '/' : prefix + '/';
    }

    private static Profile getCommunityProfile() {
        List<Profile> profiles = [SELECT Id FROM Profile WHERE Name = 'Store Member' LIMIT 1];
        if (profiles.isEmpty()) {
            throw new AuraHandledException('Member profile configuration error. Please contact support.');
        }
        return profiles[0];
    }

    private static String buildAlias(String firstName, String lastName) {
        String fi = String.isBlank(firstName) ? 'x' : firstName.substring(0, 1);
        String ln = String.isBlank(lastName) ? 'user' : lastName.replaceAll('[^a-zA-Z0-9]', '');
        if (String.isBlank(ln)) ln = 'user';
        String alias = (fi + ln.substring(0, Math.min(7, ln.length()))).toLowerCase();
        return alias.length() > 8 ? alias.substring(0, 8) : alias;
    }

    private static String buildCommunityNickname(String firstName, String lastName, String email) {
        String base = ((firstName == null ? '' : firstName) + (lastName == null ? '' : lastName))
            .replaceAll('[^a-zA-Z0-9]', '').toLowerCase();
        if (String.isBlank(base)) {
            base = email.split('@')[0].replaceAll('[^a-zA-Z0-9]', '').toLowerCase();
        }
        if (base.length() > 20) base = base.substring(0, 20);
        String suffix = String.valueOf(Math.abs(Crypto.getRandomInteger()));
        if (suffix.length() > 5) suffix = suffix.substring(0, 5);
        return base + suffix;
    }

    private static Boolean isValidEmail(String email) {
        return Pattern.matches('^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$', email);
    }
}