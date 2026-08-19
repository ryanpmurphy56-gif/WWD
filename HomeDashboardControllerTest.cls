@isTest
private class HomeDashboardControllerTest {

    @TestSetup
    static void setup() {
        Account acct = PnPTestFactory.makeMemberAccount('Dash Customer');
        insert acct;
        Product2 p = PnPTestFactory.makeProduct('Dash Wine', 25, 2); // low stock (min 5)
        insert p;

        Order order = new Order(
            AccountId = acct.Id, EffectiveDate = Date.today(), Status = 'Draft',
            Status__c = 'Confirmed', Fulfilment_Type__c = 'Delivery',
            Order_Total__c = 50, Delivery_Street__c = '1 Test St',
            Delivery_Suburb__c = 'Fitzroy', Delivery_State__c = 'VIC', Delivery_Postcode__c = '3065'
        );
        insert order;
        insert new Order_Item__c(
            Order__c = order.Id, Product__c = p.Id, Product_Name__c = 'Dash Wine',
            Quantity__c = 2, Unit_Price__c = 25, Line_Total__c = 50
        );
    }

    @isTest
    static void stockSummaryClassifiesLevels() {
        HomeDashboardController.StockSummary summary = HomeDashboardController.getStockSummary();
        System.assertEquals(1, summary.totalSkus);
        System.assertEquals(2, summary.totalUnits);
        System.assertEquals(1, summary.lowStockCount, 'qty 2 < min 5');
        System.assertEquals(0, summary.outOfStockCount);
    }

    @isTest
    static void salesSummaryAggregatesOrders() {
        HomeDashboardController.SalesSummary summary = HomeDashboardController.getSalesSummary(30);
        System.assertEquals(1, summary.totalOrders);
        System.assertEquals(50, summary.totalRevenue);
        System.assertEquals(50, summary.avgOrderValue);
        System.assertEquals(1, summary.recentOrders.size());
        System.assert(!summary.topProducts.isEmpty());
    }

    @isTest
    static void liveOpsCountsTodaysOrders() {
        HomeDashboardController.LiveOps ops = HomeDashboardController.getLiveOps();
        System.assertEquals(1, ops.soldTodayOrders);
        System.assertEquals(50, ops.soldTodayRevenue);
    }

    @isTest
    static void openOrdersExposeNextSteps() {
        List<HomeDashboardController.OpenOrder> open = HomeDashboardController.getOpenOrders();
        System.assertEquals(1, open.size());
        System.assertEquals('Confirmed', open[0].status);
        System.assertEquals(new List<String>{ 'Picked' }, open[0].nextStatuses);
        System.assert(open[0].deliveryAddress.contains('Fitzroy'));
    }

    @isTest
    static void updateOrderStatusFollowsPipeline() {
        Order order = [SELECT Id FROM Order LIMIT 1];

        HomeDashboardController.updateOrderStatus(order.Id, 'Picked', null);
        HomeDashboardController.updateOrderStatus(order.Id, 'Shipped', 'AP123456');

        Order updated = [SELECT Status__c, Tracking_Number__c FROM Order WHERE Id = :order.Id];
        System.assertEquals('Shipped', updated.Status__c);
        System.assertEquals('AP123456', updated.Tracking_Number__c);

        // Illegal jump: Shipped → Picked
        Boolean threw = false;
        try { HomeDashboardController.updateOrderStatus(order.Id, 'Picked', null); }
        catch (AuraHandledException e) { threw = true; }
        System.assert(threw, 'invalid transition rejected');

        HomeDashboardController.updateOrderStatus(order.Id, 'Completed', null);
        System.assertEquals(0, HomeDashboardController.getOpenOrders().size(), 'completed orders leave the queue');
    }

    @isTest
    static void funnelSummaryEmptyIsSafe() {
        HomeDashboardController.FunnelSummary summary = HomeDashboardController.getFunnelSummary(30);
        System.assertEquals(0, summary.views);
        System.assertEquals(0, summary.daily.size());
    }
}