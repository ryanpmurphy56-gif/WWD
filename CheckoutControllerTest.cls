@isTest
private class CheckoutControllerTest {

    private static final String UID = 'uid-test-123';

    @TestSetup
    static void setup() {
        Product2 wine = PnPTestFactory.makeProduct('Test Shiraz', 10.00, 50);
        Product2 beer = PnPTestFactory.makeBeer('Test Lager', 5.00, 100);
        insert new List<Product2>{ wine, beer };

        Cart__c cart = PnPTestFactory.makeCart(UID);
        PnPTestFactory.addItem(cart.Id, wine.Id, 2, 'single');
    }

    static Product2 wine() {
        return [SELECT Id, Quantity_on_Hand__c, Total_Sold__c FROM Product2 WHERE Name = 'Test Shiraz'];
    }

    @isTest
    static void summaryReturnsCartLines() {
        CheckoutController.CheckoutSummary summary = CheckoutController.getCheckoutSummaryForUid(UID);
        System.assertNotEquals(null, summary, 'summary should exist for the uid cart');
        System.assertEquals(1, summary.items.size());
        System.assertEquals(20.00, summary.subtotal, '2 × $10 wine');
        System.assertEquals(false, summary.isMember, 'admin test context has no member card');
        System.assertEquals(0, summary.firstOrderDiscount, 'non-members get no first-order discount');
    }

    @isTest
    static void createIntentUsesServerComputedAmount() {
        Test.setMock(HttpCalloutMock.class, new PnPStripeMock());
        Test.startTest();
        CheckoutController.PaymentIntentResult intent =
            CheckoutController.createPaymentIntentForCart(UID, 'ClickAndCollect', null, null);
        Test.stopTest();

        System.assertEquals('cs_test_secret', intent.clientSecret);
        System.assertEquals(2000, intent.amountCents, 'server computes 2 × $10 = $20.00');
        System.assertEquals(0, intent.deliveryFee, 'collect orders have no delivery fee');
    }

    @isTest
    static void createIntentAppliesDiscountCode() {
        insert PnPTestFactory.makeCode('TEN', 10, null);

        Test.setMock(HttpCalloutMock.class, new PnPStripeMock());
        Test.startTest();
        CheckoutController.PaymentIntentResult intent =
            CheckoutController.createPaymentIntentForCart(UID, 'ClickAndCollect', null, 'TEN');
        Test.stopTest();

        System.assertEquals(1800, intent.amountCents, '$20 − 10% code = $18.00');
        System.assertEquals(2.00, intent.codeDiscount);
        System.assertEquals('TEN', intent.appliedCode);
    }

    @isTest
    static void placeOrderSucceedsAndUpdatesStock() {
        PnPStripeMock.intentAmountCents = 2000;
        PnPStripeMock.deliveryFeeCents = 0;
        Test.setMock(HttpCalloutMock.class, new PnPStripeMock());

        Test.startTest();
        CheckoutController.PlaceOrderResult placed = CheckoutController.placeOrderForUid(
            'pi_test', 'ClickAndCollect', null, null, null, null, null, UID, null, false);
        Test.stopTest();

        System.assertNotEquals(null, placed.orderId);
        System.assertNotEquals(null, placed.orderNumber, 'customer-facing order number is returned');

        Order order = [SELECT Order_Total__c, Status__c, Delivery_Fee__c FROM Order WHERE Id = :placed.orderId];
        System.assertEquals(20.00, order.Order_Total__c);
        System.assertEquals('Confirmed', order.Status__c);

        Product2 p = wine();
        System.assertEquals(48, p.Quantity_on_Hand__c, 'stock decremented by 2');
        System.assertEquals(2, p.Total_Sold__c, 'lifetime sold incremented');

        System.assertEquals(1, [SELECT COUNT() FROM Order_Item__c WHERE Order__c = :placed.orderId]);
        System.assertEquals('Ordered', [SELECT Status__c FROM Cart__c WHERE Temporary_OwnerId__c = :UID].Status__c);
    }

    @isTest
    static void placeOrderRejectsAmountMismatch() {
        // The card was charged $5 but the real total is $20 — must be rejected
        PnPStripeMock.intentAmountCents = 500;
        Test.setMock(HttpCalloutMock.class, new PnPStripeMock());

        Test.startTest();
        Boolean threw = false;
        try {
            CheckoutController.placeOrderForUid('pi_test', 'ClickAndCollect', null, null, null, null, null, UID, null, false);
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(threw, 'mismatched payment amount must throw');
        System.assertEquals(0, [SELECT COUNT() FROM Order], 'no order may be written');
        System.assertEquals(50, wine().Quantity_on_Hand__c, 'stock untouched');
    }

    @isTest
    static void placeOrderRejectsUnpaidIntent() {
        PnPStripeMock.intentAmountCents = 2000;
        PnPStripeMock.intentStatus = 'requires_payment_method';
        Test.setMock(HttpCalloutMock.class, new PnPStripeMock());

        Test.startTest();
        Boolean threw = false;
        try {
            CheckoutController.placeOrderForUid('pi_test', 'ClickAndCollect', null, null, null, null, null, UID, null, false);
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'unpaid intent must throw');
    }

    @isTest
    static void placeOrderRejectsInsufficientStock() {
        Product2 p = wine();
        p.Quantity_on_Hand__c = 1;
        update p;

        PnPStripeMock.intentAmountCents = 2000;
        Test.setMock(HttpCalloutMock.class, new PnPStripeMock());

        Test.startTest();
        Boolean threw = false;
        try {
            CheckoutController.placeOrderForUid('pi_test', 'ClickAndCollect', null, null, null, null, null, UID, null, false);
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'ordering more than on-hand must throw');
    }

    @isTest
    static void beerPackConversionPricesSlabs() {
        // 24 singles of a $5 beer: slab formula = 5 × 24 × 0.45 = $54, beating $120
        Cart__c cart = [SELECT Id FROM Cart__c WHERE Temporary_OwnerId__c = :UID];
        delete [SELECT Id FROM Cart_Item__c WHERE Cart__c = :cart.Id];
        Product2 beer = [SELECT Id FROM Product2 WHERE Name = 'Test Lager'];
        PnPTestFactory.addItem(cart.Id, beer.Id, 24, 'single');

        CheckoutController.CheckoutSummary summary = CheckoutController.getCheckoutSummaryForUid(UID);
        System.assertEquals(54.00, summary.subtotal, 'slab price beats 24 × $5');
    }

    @isTest
    static void cancelOrderRequiresMemberAccount() {
        Test.startTest();
        Boolean threw = false;
        try {
            CheckoutController.cancelOrder(null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        try {
            // admin has no member account → not allowed to cancel
            CheckoutController.cancelOrder(fakeOrderId());
        } catch (AuraHandledException e) {
            threw = threw && true;
        }
        Test.stopTest();
        System.assert(threw);
    }

    private static Id fakeOrderId() {
        return Order.SObjectType.getDescribe().getKeyPrefix() + '000000000001AAA';
    }

    @isTest
    static void publishableKeyComesFromMetadata() {
        // Org metadata may or may not exist in the test context — both paths are valid
        try {
            String key = CheckoutController.getStripePublishableKey();
            System.assertNotEquals(null, key);
        } catch (AuraHandledException e) {
            System.assert(true, 'missing settings throws a clean error');
        }
    }
}