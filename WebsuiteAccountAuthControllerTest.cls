@isTest
private class WebsuiteAccountAuthControllerTest {

    private static Websuite_Account__c makeAccount(String email) {
        Websuite_Account__c a = new Websuite_Account__c(
            Email__c = email,
            First_Name__c = 'Ada',
            Last_Name__c = 'Lovelace'
        );
        insert a;
        return a;
    }

    private static Websuite_Account_Login_Code__c makeCode(Id accountId, String code, Integer expiresInMinutes) {
        Websuite_Account_Login_Code__c lc = new Websuite_Account_Login_Code__c(
            Account__c = accountId,
            Code_Hash__c = WebsuiteAccountAuthController.hashCode(code, accountId),
            Expires_At__c = Datetime.now().addMinutes(expiresInMinutes)
        );
        insert lc;
        return lc;
    }

    // Regression test for INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY: a real
    // Guest User can insert a Websuite_Account__c row fine, but under `with
    // sharing` couldn't then reference that row's own Id in another object's
    // lookup field, because org-wide sharing defaults (even Public Read/Write)
    // don't grant guests row-level read access — see the class header comment.
    // Runs the real end-to-end flow as the WebSuite site's own Guest User (not
    // just any guest — this org hosts multiple Experience sites); silently
    // no-ops if that site doesn't exist here (e.g. a scratch org).
    @isTest
    static void signUpAndVerifySucceedsAsRealGuestUser() {
        List<User> guests = [SELECT Id FROM User WHERE UserType = 'Guest' AND IsActive = true AND Name LIKE '%WebSuite%' LIMIT 1];
        if (guests.isEmpty()) {
            return;
        }
        System.runAs(guests[0]) {
            Test.startTest();
            WebsuiteAccountAuthController.LoginRequestResult signupResult = WebsuiteAccountAuthController.signUpAndSendCode(
                'guest-flow-test@example.com', 'Ryan', 'Murphy', '0400 000 000'
            );
            Test.stopTest();

            System.assertEquals('CODE_SENT', signupResult.status, 'Signup succeeds end-to-end as a real Guest User');
        }
        // Queried as the test-context (admin) user, not inside runAs — a Guest
        // User's own SELECT here would silently return zero rows for a record it
        // just created itself, the same "secure guest user record access"
        // sharing restriction the class header explains for lookups on INSERT.
        Websuite_Account__c created = [SELECT Phone__c FROM Websuite_Account__c WHERE Email__c = 'guest-flow-test@example.com'];
        System.assertEquals('0400 000 000', created.Phone__c, 'Phone persists through the same guest-permission path as the other fields');
    }

    // Isolates whether a real Guest User can see the account it JUST created
    // itself when verifyLoginCode's OWN findAccount() runs — as opposed to
    // signUpAndSendCode's, which the test above already confirms works. Uses a
    // deliberately wrong code: if the account is visible, verifyLoginCode gets
    // as far as recording a failed Websuite_Account_Login_Attempt__c row before
    // rejecting it; if the account is NOT visible, it throws immediately and no
    // attempt row is ever created — that difference is how this test tells the
    // two failure modes apart (both surface the same "Invalid or expired code"
    // message to the user, so the UI alone can't distinguish them).
    @isTest
    static void verifyLoginCodeCanSeeAccountCreatedByTheSameGuestRequest() {
        List<User> guests = [SELECT Id FROM User WHERE UserType = 'Guest' AND IsActive = true AND Name LIKE '%WebSuite%' LIMIT 1];
        if (guests.isEmpty()) {
            return;
        }
        System.runAs(guests[0]) {
            Test.startTest();
            WebsuiteAccountAuthController.signUpAndSendCode('guest-verify-test@example.com', 'Ryan', 'Murphy', '');
            try {
                WebsuiteAccountAuthController.verifyLoginCode('guest-verify-test@example.com', 'WRONGCODE');
                System.assert(false, 'A wrong code must always be rejected');
            } catch (AuraHandledException e) {
                // Expected — the assertions below are what actually distinguish why.
            }
            Test.stopTest();
        }
        Id accountId = [SELECT Id FROM Websuite_Account__c WHERE Email__c = 'guest-verify-test@example.com'].Id;
        Integer attempts = [
            SELECT COUNT() FROM Websuite_Account_Login_Attempt__c
            WHERE Code__r.Account__c = :accountId
        ];
        System.assertEquals(
            1,
            attempts,
            'verifyLoginCode found the guest-created account and recorded the failed attempt — ' +
                'if this fails with 0, the account itself was invisible to verifyLoginCode\'s own query as the same guest.'
        );
    }

    @isTest
    static void requestLoginCodeReturnsNameRequiredForUnknownEmail() {
        Test.startTest();
        WebsuiteAccountAuthController.LoginRequestResult result =
            WebsuiteAccountAuthController.requestLoginCode('new@example.com');
        Test.stopTest();

        System.assertEquals('NAME_REQUIRED', result.status, 'No account yet for this email');
        System.assertEquals(0, [SELECT COUNT() FROM Websuite_Account__c], 'No record created for an unknown email');
    }

    @isTest
    static void requestLoginCodeSendsCodeForExistingAccount() {
        Websuite_Account__c account = makeAccount('ada@example.com');

        Test.startTest();
        WebsuiteAccountAuthController.LoginRequestResult result =
            WebsuiteAccountAuthController.requestLoginCode('ADA@example.com');
        Test.stopTest();

        System.assertEquals('CODE_SENT', result.status, 'Existing account gets a code immediately');
        System.assert(result.maskedEmail.contains('@example.com'), 'Masked email keeps the domain');
        System.assertEquals(1, [SELECT COUNT() FROM Websuite_Account_Login_Code__c WHERE Account__c = :account.Id]);
    }

    @isTest
    static void requestLoginCodeRejectsInvalidEmail() {
        Boolean threw = false;
        try {
            WebsuiteAccountAuthController.requestLoginCode('not-an-email');
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assertEquals(true, threw, 'Malformed email is rejected');
    }

    @isTest
    static void signUpAndSendCodeCreatesAccountOnce() {
        Test.startTest();
        WebsuiteAccountAuthController.signUpAndSendCode('new@example.com', 'Grace', 'Hopper', '555-0100');
        WebsuiteAccountAuthController.signUpAndSendCode('NEW@example.com', 'Grace', 'Hopper', '555-0100');
        Test.stopTest();

        List<Websuite_Account__c> accounts = [SELECT Email__c, First_Name__c, Last_Name__c, Phone__c FROM Websuite_Account__c];
        System.assertEquals(1, accounts.size(), 'Second call reuses the account instead of duplicating it');
        System.assertEquals('new@example.com', accounts[0].Email__c, 'Email stored lowercased/trimmed');
        System.assertEquals('555-0100', accounts[0].Phone__c, 'Phone stored on signup');
        System.assertEquals(2, [SELECT COUNT() FROM Websuite_Account_Login_Code__c WHERE Account__c = :accounts[0].Id]);
    }

    @isTest
    static void signUpAndSendCodeAllowsBlankPhone() {
        Test.startTest();
        WebsuiteAccountAuthController.signUpAndSendCode('nophone@example.com', 'Grace', 'Hopper', '');
        Test.stopTest();

        Websuite_Account__c account = [SELECT Phone__c FROM Websuite_Account__c WHERE Email__c = 'nophone@example.com'];
        System.assertEquals(null, account.Phone__c, 'Phone is optional — blank does not block signup');
    }

    @isTest
    static void signUpAndSendCodeRejectsBlankName() {
        Boolean threw = false;
        try {
            WebsuiteAccountAuthController.signUpAndSendCode('x@example.com', '', 'Hopper', '');
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assertEquals(true, threw, 'First/last name required for a brand new account');
    }

    @isTest
    static void verifyLoginCodeSucceedsAndMintsSession() {
        Websuite_Account__c account = makeAccount('ada@example.com');
        String code = WebsuiteAccountAuthController.generateCode();
        Websuite_Account_Login_Code__c lc = makeCode(account.Id, code, 10);

        Test.startTest();
        WebsuiteAccountAuthController.AccountSession session =
            WebsuiteAccountAuthController.verifyLoginCode('ada@example.com', code);
        Test.stopTest();

        System.assertEquals(account.Id, session.accountId);
        System.assertNotEquals(null, session.sessionToken, 'A raw session token is returned once, on verify');

        List<Websuite_Account_Login_Attempt__c> attempts = [
            SELECT Success__c FROM Websuite_Account_Login_Attempt__c WHERE Code__c = :lc.Id
        ];
        System.assertEquals(1, attempts.size(), 'One attempt row recorded');
        System.assertEquals(true, attempts[0].Success__c);

        List<Websuite_Account_Session__c> sessions = [
            SELECT Token_Hash__c FROM Websuite_Account_Session__c WHERE Account__c = :account.Id
        ];
        System.assertEquals(1, sessions.size(), 'One session row created');
        System.assertEquals(
            WebsuiteAccountAuthController.hashSessionToken(session.sessionToken, account.Id),
            sessions[0].Token_Hash__c,
            'Only the hash of the session token is persisted'
        );
    }

    @isTest
    static void verifyLoginCodeRejectsWrongCodeAndCountsAttempt() {
        Websuite_Account__c account = makeAccount('ada@example.com');
        Websuite_Account_Login_Code__c lc = makeCode(account.Id, 'ABCDEF', 10);

        Boolean threw = false;
        Test.startTest();
        try {
            WebsuiteAccountAuthController.verifyLoginCode('ada@example.com', 'ZZZZZZ');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw, 'Wrong code is rejected');
        List<Websuite_Account_Login_Attempt__c> attempts = [
            SELECT Success__c FROM Websuite_Account_Login_Attempt__c WHERE Code__c = :lc.Id
        ];
        System.assertEquals(1, attempts.size(), 'Failed attempt is counted');
        System.assertEquals(false, attempts[0].Success__c);
    }

    @isTest
    static void verifyLoginCodeLocksAfterTooManyAttempts() {
        Websuite_Account__c account = makeAccount('ada@example.com');
        Websuite_Account_Login_Code__c lc = makeCode(account.Id, 'ABCDEF', 10);

        List<Websuite_Account_Login_Attempt__c> priorAttempts = new List<Websuite_Account_Login_Attempt__c>();
        for (Integer i = 0; i < 5; i++) {
            priorAttempts.add(new Websuite_Account_Login_Attempt__c(Code__c = lc.Id, Success__c = false));
        }
        insert priorAttempts;

        Boolean threw = false;
        Test.startTest();
        try {
            WebsuiteAccountAuthController.verifyLoginCode('ada@example.com', 'ABCDEF');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw, 'Locked out after 5 failed attempts, even with the right code');
    }

    @isTest
    static void verifyLoginCodeRejectsAlreadyUsedCode() {
        Websuite_Account__c account = makeAccount('ada@example.com');
        Websuite_Account_Login_Code__c lc = makeCode(account.Id, 'ABCDEF', 10);
        insert new Websuite_Account_Login_Attempt__c(Code__c = lc.Id, Success__c = true);

        Boolean threw = false;
        Test.startTest();
        try {
            WebsuiteAccountAuthController.verifyLoginCode('ada@example.com', 'ABCDEF');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw, 'A code already used once can never be replayed');
    }

    @isTest
    static void verifyLoginCodeRejectsExpiredCode() {
        Websuite_Account__c account = makeAccount('ada@example.com');
        makeCode(account.Id, 'ABCDEF', -1);

        Boolean threw = false;
        Test.startTest();
        try {
            WebsuiteAccountAuthController.verifyLoginCode('ada@example.com', 'ABCDEF');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw, 'Expired code is rejected');
    }

    @isTest
    static void issueCodeRateLimitsRepeatedRequests() {
        makeAccount('ada@example.com');

        Test.startTest();
        WebsuiteAccountAuthController.requestLoginCode('ada@example.com');
        WebsuiteAccountAuthController.requestLoginCode('ada@example.com');
        WebsuiteAccountAuthController.requestLoginCode('ada@example.com');
        Boolean threw = false;
        try {
            WebsuiteAccountAuthController.requestLoginCode('ada@example.com');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw, 'A 4th request within 15 minutes is throttled');
    }

    @isTest
    static void getCurrentAccountReturnsSessionForValidToken() {
        Websuite_Account__c account = makeAccount('ada@example.com');
        String rawToken = WebsuiteAccountAuthController.generateSessionToken();
        insert new Websuite_Account_Session__c(
            Account__c = account.Id,
            Token_Hash__c = WebsuiteAccountAuthController.hashSessionToken(rawToken, account.Id),
            Expires_At__c = Datetime.now().addDays(1)
        );

        Test.startTest();
        WebsuiteAccountAuthController.AccountSession session =
            WebsuiteAccountAuthController.getCurrentAccount(account.Id, rawToken);
        Test.stopTest();

        System.assertNotEquals(null, session, 'Valid, unexpired token resolves to a session');
        System.assertEquals('ada@example.com', session.email);
    }

    @isTest
    static void getCurrentAccountReturnsNullForWrongToken() {
        Websuite_Account__c account = makeAccount('ada@example.com');
        insert new Websuite_Account_Session__c(
            Account__c = account.Id,
            Token_Hash__c = WebsuiteAccountAuthController.hashSessionToken('correct-token', account.Id),
            Expires_At__c = Datetime.now().addDays(1)
        );

        WebsuiteAccountAuthController.AccountSession session =
            WebsuiteAccountAuthController.getCurrentAccount(account.Id, 'wrong-token');
        System.assertEquals(null, session, 'A mismatched token never resolves');
    }

    @isTest
    static void getCurrentAccountReturnsNullForExpiredSession() {
        Websuite_Account__c account = makeAccount('ada@example.com');
        String rawToken = WebsuiteAccountAuthController.generateSessionToken();
        insert new Websuite_Account_Session__c(
            Account__c = account.Id,
            Token_Hash__c = WebsuiteAccountAuthController.hashSessionToken(rawToken, account.Id),
            Expires_At__c = Datetime.now().addDays(-1)
        );

        WebsuiteAccountAuthController.AccountSession session =
            WebsuiteAccountAuthController.getCurrentAccount(account.Id, rawToken);
        System.assertEquals(null, session, 'An expired session never resolves, even with the right token');
    }

    @isTest
    static void logoutRevokesSessionServerSide() {
        Websuite_Account__c account = makeAccount('ada@example.com');
        String rawToken = WebsuiteAccountAuthController.generateSessionToken();
        Websuite_Account_Session__c session = new Websuite_Account_Session__c(
            Account__c = account.Id,
            Token_Hash__c = WebsuiteAccountAuthController.hashSessionToken(rawToken, account.Id),
            Expires_At__c = Datetime.now().addDays(1)
        );
        insert session;

        Test.startTest();
        WebsuiteAccountAuthController.logout(account.Id, rawToken);
        WebsuiteAccountAuthController.AccountSession afterLogout =
            WebsuiteAccountAuthController.getCurrentAccount(account.Id, rawToken);
        Test.stopTest();

        System.assertEquals(null, afterLogout, 'Token stops working immediately after logout');
        System.assertEquals(
            1,
            [SELECT COUNT() FROM Websuite_Account_Session_Revocation__c WHERE Session__c = :session.Id],
            'Logout is recorded as a revocation row, not a delete/edit'
        );
    }

    @isTest
    static void getMySitesReturnsOnlySitesOwnedByThisAccount() {
        Websuite_Account__c account = makeAccount('ada@example.com');
        Websuite_Account__c otherAccount = makeAccount('other@example.com');
        insert new Website_Site__c(Name = 'Mine', Config__c = '{}', Websuite_Account__c = account.Id);
        insert new Website_Site__c(Name = 'Not mine', Config__c = '{}', Websuite_Account__c = otherAccount.Id);
        insert new Website_Site__c(Name = 'Unattributed', Config__c = '{}');

        Test.startTest();
        List<WebsuiteAccountAuthController.SiteSummary> mySites = WebsuiteAccountAuthController.getMySites(account.Id);
        Test.stopTest();

        System.assertEquals(1, mySites.size(), 'Only the site owned by this account is returned');
        System.assertEquals('Mine', mySites[0].name);
    }
}
