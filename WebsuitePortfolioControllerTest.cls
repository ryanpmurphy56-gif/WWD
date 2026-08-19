@isTest
private class WebsuitePortfolioControllerTest {
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wport',
            Email = 'websuite.portfolio.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.portfolio.tester.' + System.now().getTime() + '@example.com.wstest'
        );
        insert u;
        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Websuite_Command_Center' LIMIT 1];
        insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id);
        return u;
    }

    private static Id buildSite(String name) {
        return WebsuiteSiteController.createSite(
            name,
            '{"siteId":"abc","meta":{"businessName":"' + name + '"},"pages":[]}'
        );
    }

    @isTest
    static void savePortfolioItemInsertsAndUpdates() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Portfolio site');

            Test.startTest();
            Id itemId = WebsuitePortfolioController.savePortfolioItem(siteId, null, 'Brand refresh', 'Branding', 'A full brand refresh.', null, null, null, false);
            Test.stopTest();

            System.assertNotEquals(null, itemId, 'Item created');
            Websuite_Portfolio_Item__c saved = [SELECT Name, Category__c, Is_Active__c FROM Websuite_Portfolio_Item__c WHERE Id = :itemId];
            System.assertEquals('Brand refresh', saved.Name, 'Title persisted as Name');
            System.assertEquals('Branding', saved.Category__c, 'Category persisted');
            System.assertEquals(false, saved.Is_Active__c, 'Starts inactive');

            WebsuitePortfolioController.savePortfolioItem(siteId, itemId, 'Brand refresh (edited)', 'Branding', 'A full brand refresh.', null, null, null, true);
            Websuite_Portfolio_Item__c updated = [SELECT Name, Is_Active__c FROM Websuite_Portfolio_Item__c WHERE Id = :itemId];
            System.assertEquals('Brand refresh (edited)', updated.Name, 'Title updated in place, not duplicated');
            System.assertEquals(true, updated.Is_Active__c, 'Now active');
        }
    }

    @isTest
    static void savePortfolioItemRejectsMissingRequiredFields() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Reject site');
            Boolean threw = false;
            try {
                WebsuitePortfolioController.savePortfolioItem(siteId, null, '', 'Category', '', null, null, null, false);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Blank title is rejected');
        }
    }

    @isTest
    static void getPortfolioItemsReturnsAllRegardlessOfActiveStatus() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('List site');
            WebsuitePortfolioController.savePortfolioItem(siteId, null, 'Inactive item', 'Cat', '', null, null, null, false);
            WebsuitePortfolioController.savePortfolioItem(siteId, null, 'Active item', 'Cat', '', null, null, null, true);

            Test.startTest();
            List<WebsuitePortfolioController.PortfolioItemView> all = WebsuitePortfolioController.getPortfolioItems(siteId);
            Test.stopTest();

            System.assertEquals(2, all.size(), 'Both active and inactive items listed');
        }
    }

    @isTest
    static void getActivePortfolioItemsOnlyReturnsActive() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Active site');
            WebsuitePortfolioController.savePortfolioItem(siteId, null, 'Inactive item', 'Cat', '', null, null, null, false);
            WebsuitePortfolioController.savePortfolioItem(siteId, null, 'Active item', 'Cat', '', null, null, null, true);

            Test.startTest();
            List<WebsuitePortfolioController.PortfolioItemView> active = WebsuitePortfolioController.getActivePortfolioItems(siteId);
            Test.stopTest();

            System.assertEquals(1, active.size(), 'Only the active item is returned');
            System.assertEquals('Active item', active[0].title, 'It is the active one');
        }
    }

    @isTest
    static void getActivePortfolioItemsDoesNotLeakOtherSites() {
        User u = buildUser();
        System.runAs(u) {
            Id siteA = buildSite('Site A');
            Id siteB = buildSite('Site B');
            WebsuitePortfolioController.savePortfolioItem(siteA, null, 'Item A', 'Cat', '', null, null, null, true);
            WebsuitePortfolioController.savePortfolioItem(siteB, null, 'Item B', 'Cat', '', null, null, null, true);

            List<WebsuitePortfolioController.PortfolioItemView> forA = WebsuitePortfolioController.getActivePortfolioItems(siteA);
            System.assertEquals(1, forA.size(), 'Only site A\'s item returned');
            System.assertEquals('Item A', forA[0].title, 'Correct item');
        }
    }

    @isTest
    static void deletePortfolioItemRemovesRecord() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Delete site');
            Id itemId = WebsuitePortfolioController.savePortfolioItem(siteId, null, 'Temp', 'Cat', '', null, null, null, false);

            Test.startTest();
            WebsuitePortfolioController.deletePortfolioItem(itemId);
            Test.stopTest();

            List<Websuite_Portfolio_Item__c> remaining = [SELECT Id FROM Websuite_Portfolio_Item__c WHERE Id = :itemId];
            System.assertEquals(0, remaining.size(), 'Item deleted');
        }
    }

    @isTest
    static void deletePortfolioItemRejectsMissingId() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuitePortfolioController.deletePortfolioItem(null);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Null id is rejected');
        }
    }
}