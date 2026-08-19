@IsTest
private class FunnelTrackerTest {

    @TestSetup
    static void setup() {
        Product2 p = new Product2(Name = 'Test Beer', IsActive = true,
            Family = 'Beer', Product_Sub_Family__c = 'Lager');
        insert p;

        Cart__c c = new Cart__c(Status__c = 'Active');
        insert c;
    }

    @IsTest
    static void recordEvent_insertsRow() {
        Product2 p = [SELECT Id FROM Product2 LIMIT 1];
        Cart__c c = [SELECT Id FROM Cart__c LIMIT 1];

        Test.startTest();
        FunnelTracker.recordEvent('View', p.Id, 'sess-abc-123', c.Id, 1, 25.00);
        Test.stopTest();

        List<Funnel_Event__c> events = [
            SELECT Event_Type__c, Product__c, Session_Id__c
            FROM Funnel_Event__c
        ];
        System.assertEquals(1, events.size(), 'One event should be inserted');
        System.assertEquals('View', events[0].Event_Type__c);
        System.assertEquals('sess-abc-123', events[0].Session_Id__c);
    }

    @IsTest
    static void recordEvent_swallowsExceptionsOnBadData() {
        Test.startTest();
        FunnelTracker.recordEvent('NotARealType', null, 'sess', null, 1, 0);
        Test.stopTest();

        System.assert(true, 'Should not throw');
    }

    @IsTest
    static void recordPurchaseEvents_insertsOnePerLine() {
        Product2 p = [SELECT Id FROM Product2 LIMIT 1];

        // Standard Order requires an Account, and Account carries required member fields
        Account acct = new Account(
            Name = 'Funnel Test Account',
            Email__c = 'funnel@test.invalid',
            Phone_Number__c = '0400000000',
            Birthdate__c = Date.newInstance(1990, 1, 1),
            Join_Date__c = Date.today()
        );
        insert acct;

        Order ord = new Order(
            AccountId = acct.Id,
            EffectiveDate = Date.today(),
            Status = 'Draft',
            Status__c = 'Confirmed',
            Order_Total__c = 100,
            Age_Verification__c = true
        );
        insert ord;

        List<Order_Item__c> lines = new List<Order_Item__c>{
            new Order_Item__c(Order__c = ord.Id, Product__c = p.Id, Quantity__c = 2, Unit_Price__c = 25),
            new Order_Item__c(Order__c = ord.Id, Product__c = p.Id, Quantity__c = 1, Unit_Price__c = 50)
        };
        insert lines;

        Test.startTest();
        FunnelTracker.recordPurchaseEvents(ord.Id, lines, 'sess-xyz');
        Test.stopTest();

        List<Funnel_Event__c> events = [
            SELECT Event_Type__c FROM Funnel_Event__c WHERE Event_Type__c = 'Purchase'
        ];
        System.assertEquals(2, events.size(), 'One Purchase event per order line');
    }
}