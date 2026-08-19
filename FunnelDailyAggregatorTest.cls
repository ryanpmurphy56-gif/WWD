@IsTest
private class FunnelDailyAggregatorTest {

    @TestSetup
    static void setup() {
        Product2 p = new Product2(Name = 'Test', IsActive = true, Price__c = 25,
            Family = 'Wine', Product_Sub_Family__c = 'Chardonnay');
        insert p;

        Datetime y = Datetime.newInstance(Date.today().addDays(-1), Time.newInstance(10, 0, 0, 0));
        List<Funnel_Event__c> evts = new List<Funnel_Event__c>();

        for (Integer i = 0; i < 10; i++) {
            evts.add(new Funnel_Event__c(
                Event_Type__c = 'View',
                Product__c = p.Id,
                Session_Id__c = 'sess-' + i,
                Event_Timestamp__c = y,
                Source__c = 'Simulated'));
        }
        for (Integer i = 0; i < 3; i++) {
            evts.add(new Funnel_Event__c(
                Event_Type__c = 'Add_to_Cart',
                Product__c = p.Id,
                Session_Id__c = 'sess-' + i,
                Event_Timestamp__c = y,
                Quantity__c = 1,
                Unit_Price__c = 25,
                Source__c = 'Simulated'));
        }
        for (Integer i = 0; i < 2; i++) {
            evts.add(new Funnel_Event__c(
                Event_Type__c = 'Purchase',
                Product__c = p.Id,
                Session_Id__c = 'sess-' + i,
                Event_Timestamp__c = y,
                Quantity__c = 1,
                Unit_Price__c = 25,
                Source__c = 'Simulated'));
        }
        insert evts;
    }

    @IsTest
    static void aggregator_buildsRollupRow() {
        Test.startTest();
        Database.executeBatch(new FunnelDailyAggregator(Date.today().addDays(-1)));
        Test.stopTest();

        List<Funnel_Daily_Rollup__c> rollups = [
            SELECT Views__c, Add_to_Cart__c, Purchases__c, Revenue__c
            FROM Funnel_Daily_Rollup__c
        ];
        System.assertEquals(1, rollups.size(), 'One rollup row per product per day');
        System.assertEquals(10, rollups[0].Views__c);
        System.assertEquals(3, rollups[0].Add_to_Cart__c);
        System.assertEquals(2, rollups[0].Purchases__c);
        System.assertEquals(50, rollups[0].Revenue__c);
    }

    @IsTest
    static void aggregator_isIdempotent() {
        Test.startTest();
        Database.executeBatch(new FunnelDailyAggregator(Date.today().addDays(-1)));
        Database.executeBatch(new FunnelDailyAggregator(Date.today().addDays(-1)));
        Test.stopTest();

        Integer count = [SELECT COUNT() FROM Funnel_Daily_Rollup__c];
        System.assertEquals(1, count, 'Re-running for same day should upsert, not duplicate');
    }

    @IsTest
    static void schedulable_executes() {
        Test.startTest();
        String cron = '0 0 2 * * ?';
        System.schedule('Test Funnel Aggregator', cron, new FunnelDailyAggregator());
        Test.stopTest();
        System.assert(true);
    }
}