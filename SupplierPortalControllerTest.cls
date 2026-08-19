@isTest
public class SupplierPortalControllerTest {

    @TestSetup
    static void setupData() {
        // Account carries required member fields in this org
        Account supplier = PnPTestFactory.makeMemberAccount('Test Supplier Pty Ltd');
        supplier.Name = 'Test Supplier Pty Ltd';
        insert supplier;

        Product2 prod1 = new Product2(
            Name               = 'Test Chardonnay',
            IsActive           = true,
            Supplier__c        = supplier.Id,
            Selling_Price__c   = 28.00,
            Minimum_Quantity__c = 10,
            Family             = 'Wine',
            Product_Sub_Family__c = 'Chardonnay'
        );
        Product2 prod2 = new Product2(
            Name               = 'Test Lager',
            IsActive           = true,
            Supplier__c        = supplier.Id,
            Selling_Price__c   = 12.00,
            Minimum_Quantity__c = 20,
            Family             = 'Beer',
            Product_Sub_Family__c = 'Lager'
        );
        insert new List<Product2>{ prod1, prod2 };

        Promotion_Request__c req = new Promotion_Request__c(
            Product__c        = prod1.Id,
            Supplier__c       = supplier.Id,
            Status__c         = 'Submitted',
            Supplier_Notes__c = 'National campaign — co-op funding available.'
        );
        insert req;
    }

    private static Id supplierId() {
        return [SELECT Id FROM Account WHERE Name = 'Test Supplier Pty Ltd' LIMIT 1].Id;
    }

    // ── getRangedProducts ─────────────────────────────────────────────────────

    @isTest
    static void testGetRangedProducts_returnsBothProducts() {
        SupplierPortalController.testSupplierId = supplierId();

        Test.startTest();
        List<SupplierPortalController.ProductRow> rows = SupplierPortalController.getRangedProducts();
        Test.stopTest();

        System.assertEquals(2, rows.size(), 'Should return 2 ranged products');
        for (SupplierPortalController.ProductRow r : rows) {
            System.assertNotEquals(null, r.name,        'Name should be populated');
            System.assertNotEquals(null, r.stockStatus, 'Stock status should be set');
            System.assertEquals(0, r.totalSold,         'No orders in test context');
        }
    }

    @isTest
    static void testGetRangedProducts_stockStatusOut() {
        // QuantityOnHand defaults to null/0 in test data → Out of Stock
        SupplierPortalController.testSupplierId = supplierId();

        Test.startTest();
        List<SupplierPortalController.ProductRow> rows = SupplierPortalController.getRangedProducts();
        Test.stopTest();

        for (SupplierPortalController.ProductRow r : rows) {
            System.assertEquals('Out of Stock', r.stockStatus,
                'No inventory set → Out of Stock expected for ' + r.name);
        }
    }

    // ── getPortalSummary ──────────────────────────────────────────────────────

    @isTest
    static void testGetPortalSummary_counts() {
        SupplierPortalController.testSupplierId = supplierId();

        Test.startTest();
        SupplierPortalController.PortalSummary s = SupplierPortalController.getPortalSummary();
        Test.stopTest();

        System.assertEquals(2, s.rangedCount,   '2 products ranged');
        System.assertEquals(1, s.openRequests,  '1 submitted request');
        System.assertEquals(0, s.unitsSold,     'No orders in test context');
        System.assertEquals(2, s.lowStockCount, 'Both products are out of stock (qty=0)');
    }

    // ── getPromotionRequests ──────────────────────────────────────────────────

    @isTest
    static void testGetPromotionRequests_returnsSubmitted() {
        SupplierPortalController.testSupplierId = supplierId();

        Test.startTest();
        List<Promotion_Request__c> reqs = SupplierPortalController.getPromotionRequests();
        Test.stopTest();

        System.assertEquals(1, reqs.size(), 'Should return 1 request');
        System.assertEquals('Submitted', reqs[0].Status__c);
        System.assertNotEquals(null, reqs[0].Product__r.Name, 'Product name should be populated');
    }

    // ── submitPromotionRequest ────────────────────────────────────────────────

    @isTest
    static void testSubmitPromotionRequest_insertsRecord() {
        Id sid  = supplierId();
        Id prod = [SELECT Id FROM Product2 WHERE Name = 'Test Chardonnay' LIMIT 1].Id;
        SupplierPortalController.testSupplierId = sid;

        Test.startTest();
        SupplierPortalController.submitPromotionRequest(
            prod, 22.00, Date.today(), Date.today().addDays(14), 'Summer campaign'
        );
        Test.stopTest();

        List<Promotion_Request__c> all = [
            SELECT Id FROM Promotion_Request__c WHERE Supplier__c = :sid
        ];
        System.assertEquals(2, all.size(), 'Setup request + new request = 2');
    }

    @isTest
    static void testSubmitPromotionRequest_noProductThrows() {
        SupplierPortalController.testSupplierId = supplierId();

        Test.startTest();
        try {
            SupplierPortalController.submitPromotionRequest(null, null, null, null, null);
            System.assert(false, 'Expected AuraHandledException not thrown');
        } catch (AuraHandledException e) {
            System.assertNotEquals(null, e.getMessage());
        }
        Test.stopTest();
    }

    // ── getSupplierId error path ──────────────────────────────────────────────

    @isTest
    static void testGetRangedProducts_noContactThrows() {
        // testSupplierId NOT set — running user has no ContactId
        try {
            SupplierPortalController.getRangedProducts();
            System.assert(false, 'Expected AuraHandledException');
        } catch (AuraHandledException e) {
            System.assertNotEquals(null, e.getMessage());
        }
    }
}