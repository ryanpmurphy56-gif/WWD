public class FunnelDailyAggregator implements Schedulable, Database.Batchable<SObject> {

    private Date targetDate;

    /** Constructor for scheduled run — defaults to yesterday */
    public FunnelDailyAggregator() {
        this.targetDate = Date.today().addDays(-1);
    }

    /** Constructor for manual run on a specific date — used for backfill */
    public FunnelDailyAggregator(Date d) {
        this.targetDate = d;
    }

    public void execute(SchedulableContext sc) {
        // Compute "yesterday" at run time — using this.targetDate would freeze the
        // date the moment the job was scheduled and re-aggregate that day forever
        Database.executeBatch(new FunnelDailyAggregator(Date.today().addDays(-1)), 200);
    }

    public Database.QueryLocator start(Database.BatchableContext bc) {
        Datetime startOfDay = Datetime.newInstance(targetDate, Time.newInstance(0, 0, 0, 0));
        Datetime endOfDay   = Datetime.newInstance(targetDate.addDays(1), Time.newInstance(0, 0, 0, 0));

        return Database.getQueryLocator([
            SELECT Id, Product__c, Event_Type__c, Quantity__c, Unit_Price__c
            FROM Funnel_Event__c
            WHERE Event_Timestamp__c >= :startOfDay
              AND Event_Timestamp__c <  :endOfDay
        ]);
    }

    public void execute(Database.BatchableContext bc, List<Funnel_Event__c> scope) {
        Map<Id, RollupAggregate> aggregates = new Map<Id, RollupAggregate>();

        for (Funnel_Event__c evt : scope) {
            if (!aggregates.containsKey(evt.Product__c)) {
                aggregates.put(evt.Product__c, new RollupAggregate());
            }
            RollupAggregate agg = aggregates.get(evt.Product__c);
            Decimal qty = evt.Quantity__c != null ? evt.Quantity__c : 1;
            Decimal price = evt.Unit_Price__c != null ? evt.Unit_Price__c : 0;

            if (evt.Event_Type__c == 'View')                  agg.views++;
            else if (evt.Event_Type__c == 'Add_to_Cart')      agg.adds++;
            else if (evt.Event_Type__c == 'Remove_from_Cart') agg.removes++;
            else if (evt.Event_Type__c == 'Checkout_Start')   agg.checkouts++;
            else if (evt.Event_Type__c == 'Purchase') {
                agg.purchases++;
                agg.revenue += (qty * price);
            }
        }

        List<Funnel_Daily_Rollup__c> rollups = new List<Funnel_Daily_Rollup__c>();
        String dateStr = String.valueOf(targetDate);

        for (Id productId : aggregates.keySet()) {
            RollupAggregate agg = aggregates.get(productId);
            String uniqueKey = productId + '|' + dateStr;

            rollups.add(new Funnel_Daily_Rollup__c(
                Unique_Key__c       = uniqueKey,
                Product__c          = productId,
                Aggregation_Date__c = targetDate,
                Views__c            = agg.views,
                Add_to_Cart__c      = agg.adds,
                Remove_from_Cart__c = agg.removes,
                Checkout_Starts__c  = agg.checkouts,
                Purchases__c        = agg.purchases,
                Revenue__c          = agg.revenue,
                Name                = 'Rollup ' + dateStr
            ));
        }

        if (!rollups.isEmpty()) {
            Schema.SObjectField uniqueField = Funnel_Daily_Rollup__c.Unique_Key__c;
            Database.upsert(rollups, uniqueField, false);
        }
    }

    public void finish(Database.BatchableContext bc) {}

    private class RollupAggregate {
        Integer views = 0;
        Integer adds = 0;
        Integer removes = 0;
        Integer checkouts = 0;
        Integer purchases = 0;
        Decimal revenue = 0;
    }
}