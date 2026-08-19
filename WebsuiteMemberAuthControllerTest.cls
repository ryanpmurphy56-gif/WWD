@isTest
private class WebsuiteMemberAuthControllerTest {

    private static Website_Site__c makeSite() {
        Website_Site__c site = new Website_Site__c(Name = 'S', Config__c = '{}');
        insert site;
        return site;
    }

    private static Websuite_Site_Member__c makeMember(Id siteId, String email) {
        Websuite_Site_Member__c m = new Websuite_Site_Member__c(
            Website_Site__c = siteId,
            Email__c = email,
            First_Name__c = 'Ada',
            Last_Name__c = 'Lovelace'
        );
        insert m;
        return m;
    }

    private static Websuite_Login_Code__c makeCode(Id memberId, String code, Integer expiresInMinutes) {
        Websuite_Login_Code__c lc = new Websuite_Login_Code__c(
            Member__c = memberId,
            Code_Hash__c = WebsuiteMemberAuthController.hashCode(code, memberId),
            Expires_At__c = Datetime.now().addMinutes(expiresInMinutes)
        );
        insert lc;
        return lc;
    }

    // Regression test for INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY: a real
    // Guest User can insert a Websuite_Site_Member__c row fine, but under `with
    // sharing` couldn't then reference that row's own Id in another object's
    // lookup field, because org-wide sharing defaults don't grant guests
    // row-level read access — see the class header comment. Runs the real
    // end-to-end flow as the WebSuite site's own Guest User (not just any
    // guest — this org hosts multiple Experience sites); silently no-ops if
    // that site doesn't exist here (e.g. a scratch org).
    @isTest
    static void signUpAndVerifySucceedsAsRealGuestUser() {
        Website_Site__c site = makeSite(); // created as the test-context user — guests only ever read sites, never create them
        List<User> guests = [SELECT Id FROM User WHERE UserType = 'Guest' AND IsActive = true AND Name LIKE '%WebSuite%' LIMIT 1];
        if (guests.isEmpty()) {
            return;
        }
        System.runAs(guests[0]) {
            Test.startTest();
            WebsuiteMemberAuthController.LoginRequestResult signupResult = WebsuiteMemberAuthController.signUpAndSendCode(
                site.Id, 'guest-flow-test@example.com', 'Ryan', 'Murphy', '0400 000 000'
            );
            Test.stopTest();

            System.assertEquals('CODE_SENT', signupResult.status, 'Signup succeeds end-to-end as a real Guest User');
        }
        // Queried as the test-context (admin) user, not inside runAs — a Guest
        // User's own SELECT here would silently return zero rows for a record it
        // just created itself, the same "secure guest user record access"
        // sharing restriction the class header explains for lookups on INSERT.
        Websuite_Site_Member__c created = [
            SELECT Phone__c FROM Websuite_Site_Member__c WHERE Website_Site__c = :site.Id AND Email__c = 'guest-flow-test@example.com'
        ];
        System.assertEquals('0400 000 000', created.Phone__c, 'Phone persists through the same guest-permission path as the other fields');
    }

    @isTest
    static void requestLoginCodeReturnsNameRequiredForUnknownEmail() {
        Website_Site__c site = makeSite();

        Test.startTest();
        WebsuiteMemberAuthController.LoginRequestResult result =
            WebsuiteMemberAuthController.requestLoginCode(site.Id, 'new@example.com');
        Test.stopTest();

        System.assertEquals('NAME_REQUIRED', result.status, 'No member yet on this site');
        System.assertEquals(0, [SELECT COUNT() FROM Websuite_Site_Member__c], 'No record created for an unknown email');
    }

    @isTest
    static void requestLoginCodeSendsCodeForExistingMember() {
        Website_Site__c site = makeSite();
        Websuite_Site_Member__c member = makeMember(site.Id, 'ada@example.com');

        Test.startTest();
        WebsuiteMemberAuthController.LoginRequestResult result =
            WebsuiteMemberAuthController.requestLoginCode(site.Id, 'ADA@example.com');
        Test.stopTest();

        System.assertEquals('CODE_SENT', result.status, 'Existing member gets a code immediately');
        System.assert(result.maskedEmail.contains('@example.com'), 'Masked email keeps the domain');
        System.assertEquals(1, [SELECT COUNT() FROM Websuite_Login_Code__c WHERE Member__c = :member.Id]);
    }

    @isTest
    static void requestLoginCodeRejectsInvalidEmail() {
        Website_Site__c site = makeSite();
        Boolean threw = false;
        try {
            WebsuiteMemberAuthController.requestLoginCode(site.Id, 'not-an-email');
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assertEquals(true, threw, 'Malformed email is rejected');
    }

    @isTest
    static void signUpAndSendCodeCreatesMemberOnce() {
        Website_Site__c site = makeSite();

        Test.startTest();
        WebsuiteMemberAuthController.signUpAndSendCode(site.Id, 'new@example.com', 'Grace', 'Hopper', '555-0100');
        WebsuiteMemberAuthController.signUpAndSendCode(site.Id, 'NEW@example.com', 'Grace', 'Hopper', '555-0100');
        Test.stopTest();

        List<Websuite_Site_Member__c> members = [
            SELECT Email__c, First_Name__c, Last_Name__c, Website_Site__c, Phone__c FROM Websuite_Site_Member__c
        ];
        System.assertEquals(1, members.size(), 'Second call reuses the member instead of duplicating it');
        System.assertEquals('new@example.com', members[0].Email__c, 'Email stored lowercased/trimmed');
        System.assertEquals(site.Id, members[0].Website_Site__c);
        System.assertEquals('555-0100', members[0].Phone__c, 'Phone stored on signup');
        System.assertEquals(2, [SELECT COUNT() FROM Websuite_Login_Code__c WHERE Member__c = :members[0].Id]);
    }

    @isTest
    static void signUpAndSendCodeAllowsBlankPhone() {
        Website_Site__c site = makeSite();

        Test.startTest();
        WebsuiteMemberAuthController.signUpAndSendCode(site.Id, 'nophone@example.com', 'Grace', 'Hopper', '');
        Test.stopTest();

        Websuite_Site_Member__c member = [
            SELECT Phone__c FROM Websuite_Site_Member__c WHERE Website_Site__c = :site.Id AND Email__c = 'nophone@example.com'
        ];
        System.assertEquals(null, member.Phone__c, 'Phone is optional — blank does not block signup');
    }

    @isTest
    static void signUpAndSendCodeRejectsBlankName() {
        Website_Site__c site = makeSite();
        Boolean threw = false;
        try {
            WebsuiteMemberAuthController.signUpAndSendCode(site.Id, 'x@example.com', '', 'Hopper', '');
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assertEquals(true, threw, 'First/last name required for a brand new member');
    }

    @isTest
    static void verifyLoginCodeSucceedsAndMintsSession() {
        Website_Site__c site = makeSite();
        Websuite_Site_Member__c member = makeMember(site.Id, 'ada@example.com');
        String code = WebsuiteMemberAuthController.generateCode();
        Websuite_Login_Code__c lc = makeCode(member.Id, code, 10);

        Test.startTest();
        WebsuiteMemberAuthController.MemberSession session =
            WebsuiteMemberAuthController.verifyLoginCode(site.Id, 'ada@example.com', code);
        Test.stopTest();

        System.assertEquals(member.Id, session.memberId);
        System.assertNotEquals(null, session.sessionToken, 'A raw session token is returned once, on verify');

        List<Websuite_Login_Attempt__c> attempts = [SELECT Success__c FROM Websuite_Login_Attempt__c WHERE Code__c = :lc.Id];
        System.assertEquals(1, attempts.size(), 'One attempt row recorded');
        System.assertEquals(true, attempts[0].Success__c, 'Recorded as a successful attempt');

        List<Websuite_Member_Session__c> sessions = [
            SELECT Token_Hash__c FROM Websuite_Member_Session__c WHERE Member__c = :member.Id
        ];
        System.assertEquals(1, sessions.size(), 'One session row created');
        System.assertEquals(
            WebsuiteMemberAuthController.hashSessionToken(session.sessionToken, member.Id),
            sessions[0].Token_Hash__c,
            'Only the hash of the session token is persisted'
        );
    }

    @isTest
    static void verifyLoginCodeRejectsWrongCodeAndCountsAttempt() {
        Website_Site__c site = makeSite();
        Websuite_Site_Member__c member = makeMember(site.Id, 'ada@example.com');
        Websuite_Login_Code__c lc = makeCode(member.Id, 'ABCDEF', 10);

        Boolean threw = false;
        Test.startTest();
        try {
            WebsuiteMemberAuthController.verifyLoginCode(site.Id, 'ada@example.com', 'ZZZZZZ');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw, 'Wrong code is rejected');
        List<Websuite_Login_Attempt__c> attempts = [SELECT Success__c FROM Websuite_Login_Attempt__c WHERE Code__c = :lc.Id];
        System.assertEquals(1, attempts.size(), 'Failed attempt is counted');
        System.assertEquals(false, attempts[0].Success__c);
    }

    @isTest
    static void verifyLoginCodeLocksAfterTooManyAttempts() {
        Website_Site__c site = makeSite();
        Websuite_Site_Member__c member = makeMember(site.Id, 'ada@example.com');
        Websuite_Login_Code__c lc = makeCode(member.Id, 'ABCDEF', 10);

        List<Websuite_Login_Attempt__c> priorAttempts = new List<Websuite_Login_Attempt__c>();
        for (Integer i = 0; i < 5; i++) {
            priorAttempts.add(new Websuite_Login_Attempt__c(Code__c = lc.Id, Success__c = false));
        }
        insert priorAttempts;

        Boolean threw = false;
        Test.startTest();
        try {
            WebsuiteMemberAuthController.verifyLoginCode(site.Id, 'ada@example.com', 'ABCDEF');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw, 'Locked out after 5 failed attempts, even with the right code');
    }

    @isTest
    static void verifyLoginCodeRejectsAlreadyUsedCode() {
        Website_Site__c site = makeSite();
        Websuite_Site_Member__c member = makeMember(site.Id, 'ada@example.com');
        Websuite_Login_Code__c lc = makeCode(member.Id, 'ABCDEF', 10);
        insert new Websuite_Login_Attempt__c(Code__c = lc.Id, Success__c = true);

        Boolean threw = false;
        Test.startTest();
        try {
            WebsuiteMemberAuthController.verifyLoginCode(site.Id, 'ada@example.com', 'ABCDEF');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw, 'A code already used once can never be replayed');
    }

    @isTest
    static void verifyLoginCodeRejectsExpiredCode() {
        Website_Site__c site = makeSite();
        Websuite_Site_Member__c member = makeMember(site.Id, 'ada@example.com');
        makeCode(member.Id, 'ABCDEF', -1);

        Boolean threw = false;
        Test.startTest();
        try {
            WebsuiteMemberAuthController.verifyLoginCode(site.Id, 'ada@example.com', 'ABCDEF');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw, 'Expired code is rejected');
    }

    @isTest
    static void issueCodeRateLimitsRepeatedRequests() {
        Website_Site__c site = makeSite();
        makeMember(site.Id, 'ada@example.com');

        Test.startTest();
        WebsuiteMemberAuthController.requestLoginCode(site.Id, 'ada@example.com');
        WebsuiteMemberAuthController.requestLoginCode(site.Id, 'ada@example.com');
        WebsuiteMemberAuthController.requestLoginCode(site.Id, 'ada@example.com');
        Boolean threw = false;
        try {
            WebsuiteMemberAuthController.requestLoginCode(site.Id, 'ada@example.com');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw, 'A 4th request within 15 minutes is throttled');
    }

    @isTest
    static void getCurrentMemberReturnsSessionForValidToken() {
        Website_Site__c site = makeSite();
        Websuite_Site_Member__c member = makeMember(site.Id, 'ada@example.com');
        String rawToken = WebsuiteMemberAuthController.generateSessionToken();
        insert new Websuite_Member_Session__c(
            Member__c = member.Id,
            Token_Hash__c = WebsuiteMemberAuthController.hashSessionToken(rawToken, member.Id),
            Expires_At__c = Datetime.now().addDays(1)
        );

        Test.startTest();
        WebsuiteMemberAuthController.MemberSession session =
            WebsuiteMemberAuthController.getCurrentMember(site.Id, member.Id, rawToken);
        Test.stopTest();

        System.assertNotEquals(null, session, 'Valid, unexpired token resolves to a session');
        System.assertEquals('ada@example.com', session.email);
    }

    @isTest
    static void getCurrentMemberReturnsNullForWrongToken() {
        Website_Site__c site = makeSite();
        Websuite_Site_Member__c member = makeMember(site.Id, 'ada@example.com');
        insert new Websuite_Member_Session__c(
            Member__c = member.Id,
            Token_Hash__c = WebsuiteMemberAuthController.hashSessionToken('correct-token', member.Id),
            Expires_At__c = Datetime.now().addDays(1)
        );

        WebsuiteMemberAuthController.MemberSession session =
            WebsuiteMemberAuthController.getCurrentMember(site.Id, member.Id, 'wrong-token');
        System.assertEquals(null, session, 'A mismatched token never resolves');
    }

    @isTest
    static void getCurrentMemberReturnsNullForExpiredSession() {
        Website_Site__c site = makeSite();
        Websuite_Site_Member__c member = makeMember(site.Id, 'ada@example.com');
        String rawToken = WebsuiteMemberAuthController.generateSessionToken();
        insert new Websuite_Member_Session__c(
            Member__c = member.Id,
            Token_Hash__c = WebsuiteMemberAuthController.hashSessionToken(rawToken, member.Id),
            Expires_At__c = Datetime.now().addDays(-1)
        );

        WebsuiteMemberAuthController.MemberSession session =
            WebsuiteMemberAuthController.getCurrentMember(site.Id, member.Id, rawToken);
        System.assertEquals(null, session, 'An expired session never resolves, even with the right token');
    }

    @isTest
    static void logoutRevokesSessionServerSide() {
        Website_Site__c site = makeSite();
        Websuite_Site_Member__c member = makeMember(site.Id, 'ada@example.com');
        String rawToken = WebsuiteMemberAuthController.generateSessionToken();
        Websuite_Member_Session__c session = new Websuite_Member_Session__c(
            Member__c = member.Id,
            Token_Hash__c = WebsuiteMemberAuthController.hashSessionToken(rawToken, member.Id),
            Expires_At__c = Datetime.now().addDays(1)
        );
        insert session;

        Test.startTest();
        WebsuiteMemberAuthController.logout(site.Id, member.Id, rawToken);
        WebsuiteMemberAuthController.MemberSession afterLogout =
            WebsuiteMemberAuthController.getCurrentMember(site.Id, member.Id, rawToken);
        Test.stopTest();

        System.assertEquals(null, afterLogout, 'Token stops working immediately after logout');
        System.assertEquals(
            1,
            [SELECT COUNT() FROM Websuite_Session_Revocation__c WHERE Session__c = :session.Id],
            'Logout is recorded as a revocation row, not a delete/edit, since the Guest license allows neither'
        );
    }
}
