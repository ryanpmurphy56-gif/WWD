@isTest
private class WebsuiteProductControllerTest {
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wprod',
            Email = 'websuite.product.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.product.tester.' + System.now().getTime() + '@example.com.wstest'
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
    static void saveProductInsertsAndUpdates() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Shop site');

            Test.startTest();
            Id productId = WebsuiteProductController.saveProduct(siteId, null, 'Candle', 24.5, 'Smells nice', null, null, 'https://buy.example.com/candle', true);
            Test.stopTest();

            System.assertNotEquals(null, productId, 'Product created');
            Websuite_Product__c saved = [SELECT Name, Price__c, Is_Active__c FROM Websuite_Product__c WHERE Id = :productId];
            System.assertEquals('Candle', saved.Name, 'Name persisted');
            System.assertEquals(24.5, saved.Price__c, 'Price persisted');
            System.assertEquals(true, saved.Is_Active__c, 'Active by default');

            WebsuiteProductController.saveProduct(siteId, productId, 'Candle (large)', 32, 'Smells nice', null, null, 'https://buy.example.com/candle', false);
            Websuite_Product__c updated = [SELECT Name, Price__c, Is_Active__c FROM Websuite_Product__c WHERE Id = :productId];
            System.assertEquals('Candle (large)', updated.Name, 'Updated in place, not duplicated');
            System.assertEquals(false, updated.Is_Active__c, 'Now inactive');
        }
    }

    @isTest
    static void saveProductRejectsMissingName() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Reject site');
            Boolean threw = false;
            try {
                WebsuiteProductController.saveProduct(siteId, null, '', 10, '', null, null, '', true);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Blank name is rejected');
        }
    }

    @isTest
    static void getProductsReturnsAllRegardlessOfActiveStatus() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('List site');
            WebsuiteProductController.saveProduct(siteId, null, 'Inactive item', 5, '', null, null, '', false);
            WebsuiteProductController.saveProduct(siteId, null, 'Active item', 5, '', null, null, '', true);

            Test.startTest();
            List<WebsuiteProductController.ProductView> all = WebsuiteProductController.getProducts(siteId);
            Test.stopTest();

            System.assertEquals(2, all.size(), 'Both active and inactive products listed');
        }
    }

    @isTest
    static void deleteProductRejectsMissingId() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteProductController.deleteProduct(null);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Null id is rejected');
        }
    }

    @isTest
    static void getActiveProductsOnlyReturnsActive() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Active site');
            WebsuiteProductController.saveProduct(siteId, null, 'Inactive item', 5, '', null, null, '', false);
            WebsuiteProductController.saveProduct(siteId, null, 'Active item', 5, '', null, null, '', true);

            Test.startTest();
            List<WebsuiteProductController.ProductView> active = WebsuiteProductController.getActiveProducts(siteId);
            Test.stopTest();

            System.assertEquals(1, active.size(), 'Only the active product is returned');
            System.assertEquals('Active item', active[0].name, 'It is the active one');
        }
    }

    @isTest
    static void getActiveProductsDoesNotLeakOtherSites() {
        User u = buildUser();
        System.runAs(u) {
            Id siteA = buildSite('Shop A');
            Id siteB = buildSite('Shop B');
            WebsuiteProductController.saveProduct(siteA, null, 'A item', 1, '', null, null, '', true);
            WebsuiteProductController.saveProduct(siteB, null, 'B item', 1, '', null, null, '', true);

            List<WebsuiteProductController.ProductView> forA = WebsuiteProductController.getActiveProducts(siteA);
            System.assertEquals(1, forA.size(), 'Only site A\'s product returned');
            System.assertEquals('A item', forA[0].name, 'Correct product');
        }
    }

    @isTest
    static void deleteProductRemovesRecord() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Delete site');
            Id productId = WebsuiteProductController.saveProduct(siteId, null, 'Temp', 1, '', null, null, '', true);

            Test.startTest();
            WebsuiteProductController.deleteProduct(productId);
            Test.stopTest();

            List<Websuite_Product__c> remaining = [SELECT Id FROM Websuite_Product__c WHERE Id = :productId];
            System.assertEquals(0, remaining.size(), 'Product deleted');
        }
    }
}