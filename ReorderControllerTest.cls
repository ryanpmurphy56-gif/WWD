@isTest
private class ReorderControllerTest {

    @TestSetup
    static void setup() {
        Account supplier = PnPTestFactory.makeMemberAccount('Test Supplier Co');
        insert supplier;
        Product2 p = PnPTestFactory.makeProduct('Reorder Wine', 20, 3);
        p.Supplier__c = supplier.Id;
        insert p;
    }

    static Product2 product() {
        return [SELECT Id, Quantity_on_Hand__c, Supplier__c FROM Product2 WHERE Name = 'Reorder Wine'];
    }

    @isTest
    static void createReorderQueuesOnePerProduct() {
        Product2 p = product();
        ReorderController.createReorder(p.Id, 10);
        ReorderController.createReorder(p.Id, 24); // re-order updates, no duplicate

        List<Reorder_Request__c> pending = [SELECT Quantity__c, Supplier__c FROM Reorder_Request__c WHERE Status__c = 'Pending'];
        System.assertEquals(1, pending.size());
        System.assertEquals(24, pending[0].Quantity__c);
        System.assertEquals(p.Supplier__c, pending[0].Supplier__c);
    }

    @isTest
    static void createReorderValidatesInput() {
        Boolean threw = false;
        try { ReorderController.createReorder(product().Id, 0); } catch (AuraHandledException e) { threw = true; }
        System.assert(threw, 'zero quantity rejected');
    }

    @isTest
    static void sendOrderSheetsMarksSent() {
        ReorderController.createReorder(product().Id, 12);
        Test.startTest();
        String result = ReorderController.sendOrderSheets();
        Test.stopTest();
        System.assert(result.contains('order sheet'), result);
        System.assertEquals(1, [SELECT COUNT() FROM Reorder_Request__c WHERE Status__c = 'Sent']);
    }

    @isTest
    static void markReceivedAddsToStock() {
        Product2 p = product();
        ReorderController.createReorder(p.Id, 12);
        Reorder_Request__c request = [SELECT Id FROM Reorder_Request__c LIMIT 1];
        request.Status__c = 'Sent';
        update request;

        Test.startTest();
        ReorderController.markReceived(request.Id);
        Test.stopTest();

        System.assertEquals(15, product().Quantity_on_Hand__c, '3 on hand + 12 received');
        request = [SELECT Status__c, Received_Date__c FROM Reorder_Request__c WHERE Id = :request.Id];
        System.assertEquals('Received', request.Status__c);
        System.assertNotEquals(null, request.Received_Date__c);

        // Receiving twice must not double the stock
        Boolean threw = false;
        try { ReorderController.markReceived(request.Id); } catch (AuraHandledException e) { threw = true; }
        System.assert(threw, 'already-received reorder rejected');
        System.assertEquals(15, product().Quantity_on_Hand__c);
    }

    @isTest
    static void getPendingReordersIncludesSent() {
        ReorderController.createReorder(product().Id, 6);
        List<ReorderController.ReorderRow> rows = ReorderController.getPendingReorders();
        System.assertEquals(1, rows.size());
        System.assertEquals('Pending', rows[0].status);
    }

    @isTest
    static void cancelRemovesPendingOnly() {
        ReorderController.createReorder(product().Id, 6);
        Reorder_Request__c request = [SELECT Id FROM Reorder_Request__c LIMIT 1];
        ReorderController.cancelReorder(request.Id);
        System.assertEquals(0, [SELECT COUNT() FROM Reorder_Request__c]);
    }
}