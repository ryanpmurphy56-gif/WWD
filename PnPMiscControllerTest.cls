/**
 * Covers the smaller storefront controllers: ProductGridController,
 * PnpV2MemberController, WishlistController error paths,
 * AuthControllerV2 validation, CartCleanupScheduler and the recommendation batch.
 */
@isTest
private class PnPMiscControllerTest {

    @TestSetup
    static void setup() {
        Product2 a = PnPTestFactory.makeProduct('Misc Wine A', 10, 5);
        Product2 b = PnPTestFactory.makeProduct('Misc Wine B', 12, 5);
        b.Product_Sub_Family__c = 'Chardonnay';
        insert new List<Product2>{ a, b };
    }

    /* ── ProductGridController ── */

    @isTest
    static void productGridFiltersAndDetail() {
        System.assertEquals(2, ProductGridController.getProductsByFamily('all', '', '').size());
        System.assertEquals(2, ProductGridController.getProductsByFamily('Wine', '', '').size());
        System.assertEquals(1, ProductGridController.getProductsByFamily('Wine', 'Chardonnay', '').size());
        System.assertEquals(1, ProductGridController.getProductsByFamily('all', '', 'Wine A').size());

        Product2 p = [SELECT Id FROM Product2 WHERE Name = 'Misc Wine A'];
        System.assertNotEquals(null, ProductGridController.getProductById(p.Id));
        System.assertEquals(1, ProductGridController.getRelatedProducts('Wine', p.Id).size());
        System.assertEquals(0, ProductGridController.getRecommendations(p.Id).size());

        Map<String, Integer> stats = ProductGridController.getSiteStats();
        System.assertEquals(2, stats.get('productCount'));
    }

    /* ── PnpV2MemberController ── */

    @isTest
    static void memberProfileAndHistoryWithoutAccount() {
        Map<String, String> profile = PnpV2MemberController.getCurrentMemberProfile();
        System.assert(profile.containsKey('fullName'));

        // Admin test user has no member account: empty history, profile update refused
        System.assertEquals(0, PnpV2MemberController.getOrderHistory().size());
        Boolean threw = false;
        try {
            PnpV2MemberController.updateMemberProfile('0400', '1 St', 'Suburb', 'VIC', '3000');
        } catch (AuraHandledException e) { threw = true; }
        System.assert(threw);
    }

    /* ── Membership card lookup ── */

    @isTest
    static void memberCardLookupsAreNullSafe() {
        // Admin test user has no member account
        System.assertEquals(null, PnpV2MemberController.getMemberDetails());
        System.assertEquals(false, PnPUserContext.isMember());
    }

    /* ── WishlistController ── */

    @isTest
    static void wishlistRequiresMemberAccount() {
        Product2 p = [SELECT Id FROM Product2 LIMIT 1];
        Boolean threw = false;
        try { WishlistController.addToWishlist(p.Id); } catch (AuraHandledException e) { threw = true; }
        System.assert(threw, 'internal users get a clear error');

        System.assertEquals(null, WishlistController.getWishlistStatus(p.Id));
        System.assertEquals(0, WishlistController.getWishlistInsights().size());
    }

    /* ── AuthControllerV2 validation ── */

    @isTest
    static void registrationValidation() {
        assertRegisterFails('', 'Last', 'a@b.co', '1990-01-01', '0400', 'password1');
        assertRegisterFails('First', 'Last', 'not-an-email', '1990-01-01', '0400', 'password1');
        assertRegisterFails('First', 'Last', 'a@b.co', '', '0400', 'password1');
        assertRegisterFails('First', 'Last', 'a@b.co', '1990-01-01', '0400', 'short');
        // Underage
        String recent = String.valueOf(Date.today().addYears(-16));
        assertRegisterFails('First', 'Last', 'a@b.co', recent, '0400', 'password1');
        // Existing username
        assertRegisterFails('First', 'Last', UserInfo.getUserName(), '1990-01-01', '0400', 'password1');
    }

    static void assertRegisterFails(String f, String l, String e, String b, String p, String pw) {
        Boolean threw = false;
        try { AuthControllerV2.registerUser(f, l, e, b, p, pw); }
        catch (AuraHandledException ex) { threw = true; }
        System.assert(threw, 'expected validation failure for ' + e);
    }

    @isTest
    static void authMiscPaths() {
        AuthControllerV2.forgotPassword('someone@nowhere.invalid'); // silent by design
        Boolean threw = false;
        try { AuthControllerV2.loginUser('', ''); } catch (AuraHandledException e) { threw = true; }
        System.assert(threw);
        threw = false;
        try { AuthControllerV2.changePassword('a', 'b', 'c'); } catch (AuraHandledException e) { threw = true; }
        System.assert(threw, 'mismatched new passwords rejected');
    }

    /* ── CartCleanupScheduler ── */

    @isTest
    static void cartCleanupRuns() {
        PnPTestFactory.makeCart('fresh-cart');
        Test.startTest();
        System.schedule('Test Cart Cleanup', '0 0 3 * * ?', new CartCleanupScheduler());
        Integer flipped = CartCleanupScheduler.abandonStaleCarts();
        Test.stopTest();
        System.assertEquals(0, flipped, 'fresh carts stay active');
        System.assertEquals(1, [SELECT COUNT() FROM Cart__c WHERE Status__c = 'Active']);
    }

    /* ── ProductRecommendationBatch ── */

    @isTest
    static void recommendationBatchRebuildsWithoutInflation() {
        Account acct = PnPTestFactory.makeMemberAccount('Rec Customer');
        insert acct;
        List<Product2> prods = [SELECT Id, Name FROM Product2 ORDER BY Name];
        Order order = new Order(
            AccountId = acct.Id, EffectiveDate = Date.today(),
            Status = 'Draft', Status__c = 'Confirmed');
        insert order;
        insert new List<Order_Item__c>{
            new Order_Item__c(Order__c = order.Id, Product__c = prods[0].Id,
                Product_Name__c = prods[0].Name, Quantity__c = 1, Unit_Price__c = 10, Line_Total__c = 10),
            new Order_Item__c(Order__c = order.Id, Product__c = prods[1].Id,
                Product_Name__c = prods[1].Name, Quantity__c = 1, Unit_Price__c = 12, Line_Total__c = 12)
        };

        Test.startTest();
        Database.executeBatch(new ProductRecommendationBatch(), 50);
        Test.stopTest();

        List<Product_Recommendation__c> recs = [SELECT Co_Occurrence_Count__c FROM Product_Recommendation__c];
        System.assertEquals(1, recs.size(), 'one pair from one order');
        System.assertEquals(1, recs[0].Co_Occurrence_Count__c, 'absolute count, not inflated');
    }
}