@isTest
private class WebsuiteClientControllerTest {
    // A user holding the Websuite Command Center permission set, so tests
    // exercise the same FLS-enforced (USER_MODE) path the LWC hits at runtime.
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wsuite',
            Email = 'websuite.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.tester.' + System.now().getTime() + '@example.com.wstest'
        );
        insert u;
        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Websuite_Command_Center' LIMIT 1];
        insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id);
        return u;
    }

    private static void seed() {
        insert new List<Websuite_Client__c>{
            new Websuite_Client__c(Name = 'Alpha', Visible__c = true, Sort_Order__c = 2),
            new Websuite_Client__c(Name = 'Bravo', Visible__c = false, Sort_Order__c = 1),
            new Websuite_Client__c(Name = 'Charlie', Visible__c = true, Sort_Order__c = 3)
        };
    }

    @isTest
    static void getClientsReturnsAllOrdered() {
        User u = buildUser();
        System.runAs(u) {
            seed();
            List<WebsuiteClientController.ClientView> result = WebsuiteClientController.getClients();
            System.assertEquals(3, result.size(), 'All clients returned');
            System.assertEquals('Bravo', result[0].name, 'Ordered by Sort_Order ascending');
            System.assertEquals(false, result[0].hasLogo, 'No file attached yet');
            System.assertEquals(null, result[0].logoUrl, 'No logo URL without a file');
        }
    }

    @isTest
    static void getClientsResolvesLogoAndHero() {
        User u = buildUser();
        System.runAs(u) {
            Websuite_Client__c c = new Websuite_Client__c(
                Name = 'Delta',
                Visible__c = true,
                Sort_Order__c = 1,
                Is_Hero__c = true
            );
            insert c;

            ContentVersion cv = new ContentVersion(
                Title = 'delta-logo',
                PathOnClient = 'delta-logo.png',
                VersionData = Blob.valueOf('fake-image-bytes')
            );
            insert cv;
            Id docId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
            insert new ContentDocumentLink(
                ContentDocumentId = docId,
                LinkedEntityId = c.Id,
                ShareType = 'V'
            );

            List<WebsuiteClientController.ClientView> result = WebsuiteClientController.getClients();
            WebsuiteClientController.ClientView delta;
            for (WebsuiteClientController.ClientView v : result) {
                if (v.id == c.Id) {
                    delta = v;
                }
            }
            System.assertNotEquals(null, delta, 'Delta returned');
            System.assertEquals(true, delta.isHero, 'Hero flag surfaced');
            System.assertEquals(true, delta.hasLogo, 'Attached image detected');
            System.assert(
                delta.logoUrl != null &&
                delta.logoUrl.startsWith('/sfc/servlet.shepherd/version/download/'),
                'Logo download URL built: ' + delta.logoUrl
            );
        }
    }

    @isTest
    static void getVisibleClientsFiltersHidden() {
        User u = buildUser();
        System.runAs(u) {
            seed();
            List<WebsuiteClientController.ClientView> result = WebsuiteClientController.getVisibleClients();
            System.assertEquals(2, result.size(), 'Only visible clients returned');
            System.assertEquals('Alpha', result[0].name, 'Ordered by Sort_Order ascending (Bravo hidden)');
            for (WebsuiteClientController.ClientView c : result) {
                System.assert(c.visible, 'Every returned client is visible');
            }
        }
    }

    @isTest
    static void saveClientsPersistsChanges() {
        User u = buildUser();
        System.runAs(u) {
            seed();
            List<WebsuiteClientController.ClientView> clients = WebsuiteClientController.getClients();
            List<Websuite_Client__c> toSave = new List<Websuite_Client__c>{
                new Websuite_Client__c(
                    Id = clients[0].id,
                    Visible__c = true,
                    Sort_Order__c = 9,
                    Is_Hero__c = true
                )
            };

            Test.startTest();
            WebsuiteClientController.saveClients(toSave);
            Test.stopTest();

            Websuite_Client__c reloaded = [
                SELECT Visible__c, Sort_Order__c, Is_Hero__c FROM Websuite_Client__c WHERE Id = :clients[0].id
            ];
            System.assertEquals(9, reloaded.Sort_Order__c, 'Sort order persisted');
            System.assertEquals(true, reloaded.Visible__c, 'Visibility persisted');
            System.assertEquals(true, reloaded.Is_Hero__c, 'Hero flag persisted');
        }
    }

    @isTest
    static void createClientInsertsAtEndOfOrder() {
        User u = buildUser();
        System.runAs(u) {
            seed(); // max Sort_Order__c is 3
            Test.startTest();
            Id newId = WebsuiteClientController.createClient('Echo', 'New kid', 'https://echo.example');
            Test.stopTest();

            System.assertNotEquals(null, newId, 'New record Id returned');
            Websuite_Client__c created = [
                SELECT Name, Tagline__c, Website_Url__c, Visible__c, Is_Hero__c, Sort_Order__c
                FROM Websuite_Client__c
                WHERE Id = :newId
            ];
            System.assertEquals('Echo', created.Name, 'Name saved');
            System.assertEquals('New kid', created.Tagline__c, 'Tagline saved');
            System.assertEquals('https://echo.example', created.Website_Url__c, 'URL saved');
            System.assertEquals(true, created.Visible__c, 'New company is visible');
            System.assertEquals(false, created.Is_Hero__c, 'New company is not hero');
            System.assertEquals(4, created.Sort_Order__c, 'Placed at end of order');
        }
    }

    @isTest
    static void createClientRejectsBlankName() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteClientController.createClient('   ', null, null);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Blank name is rejected');
        }
    }

    @isTest
    static void createClientDefaultsOrderWhenEmpty() {
        User u = buildUser();
        System.runAs(u) {
            Test.startTest();
            Id newId = WebsuiteClientController.createClient('First', null, null);
            Test.stopTest();
            Websuite_Client__c created = [
                SELECT Sort_Order__c, Tagline__c FROM Websuite_Client__c WHERE Id = :newId
            ];
            System.assertEquals(1, created.Sort_Order__c, 'First company gets order 1');
            System.assertEquals(null, created.Tagline__c, 'Blank tagline stored as null');
        }
    }

    @isTest
    static void ensureLogoDistributionCreatesOneRecord() {
        User u = buildUser();
        System.runAs(u) {
            Websuite_Client__c c = new Websuite_Client__c(Name = 'Foxtrot', Visible__c = true, Sort_Order__c = 1);
            insert c;
            ContentVersion cv = new ContentVersion(
                Title = 'foxtrot-logo',
                PathOnClient = 'foxtrot-logo.png',
                VersionData = Blob.valueOf('fake-image-bytes')
            );
            insert cv;
            Id docId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
            insert new ContentDocumentLink(ContentDocumentId = docId, LinkedEntityId = c.Id, ShareType = 'V');

            Test.startTest();
            WebsuiteClientController.ensureLogoDistribution(c.Id);
            Test.stopTest();

            // DistributionPublicUrl can populate asynchronously on the platform, so
            // this only asserts the distribution itself was created, not the URL.
            System.assertEquals(
                1,
                [SELECT COUNT() FROM ContentDistribution WHERE ContentDocumentId = :docId],
                'One public distribution created for the logo file'
            );
        }
    }

    @isTest
    static void ensureLogoDistributionIsIdempotent() {
        User u = buildUser();
        System.runAs(u) {
            Websuite_Client__c c = new Websuite_Client__c(Name = 'Golf', Visible__c = true, Sort_Order__c = 1);
            insert c;
            ContentVersion cv = new ContentVersion(
                Title = 'golf-logo',
                PathOnClient = 'golf-logo.png',
                VersionData = Blob.valueOf('fake-image-bytes')
            );
            insert cv;
            Id docId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
            insert new ContentDocumentLink(ContentDocumentId = docId, LinkedEntityId = c.Id, ShareType = 'V');

            Test.startTest();
            WebsuiteClientController.ensureLogoDistribution(c.Id);
            WebsuiteClientController.ensureLogoDistribution(c.Id);
            Test.stopTest();

            System.assertEquals(
                1,
                [SELECT COUNT() FROM ContentDistribution WHERE ContentDocumentId = :docId],
                'Calling it again does not create a duplicate distribution'
            );
        }
    }

    @isTest
    static void ensureLogoDistributionNoOpWithoutFile() {
        User u = buildUser();
        System.runAs(u) {
            Websuite_Client__c c = new Websuite_Client__c(Name = 'Hotel', Visible__c = true, Sort_Order__c = 1);
            insert c;

            Test.startTest();
            WebsuiteClientController.ensureLogoDistribution(c.Id);
            Test.stopTest();

            System.assertEquals(0, [SELECT COUNT() FROM ContentDistribution], 'Nothing to distribute yet');
        }
    }

    @isTest
    static void saveClientsHandlesEmpty() {
        User u = buildUser();
        System.runAs(u) {
            seed();
            Test.startTest();
            WebsuiteClientController.saveClients(new List<Websuite_Client__c>());
            WebsuiteClientController.saveClients(null);
            Test.stopTest();
            System.assertEquals(3, [SELECT COUNT() FROM Websuite_Client__c], 'No rows changed');
        }
    }
}