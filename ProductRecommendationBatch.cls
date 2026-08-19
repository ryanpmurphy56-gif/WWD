/**
 * ProductRecommendationBatch
 *
 * Runs nightly to compute product co-occurrence scores from Order_Item__c data
 * and rebuild Product_Recommendation__c.
 *
 * Algorithm:
 *   For every confirmed order, take all products bought together and count each
 *   unique pair. Pairs are stored with the lower product Id first so the
 *   Unique_Key__c is direction-agnostic.
 *
 * The batch is STATEFUL and rebuilds counts from scratch every run: counts are
 * accumulated across all batches in memory and written once in finish() as
 * absolute values (stale pairs are deleted). Re-running therefore never
 * inflates the scores.
 *
 * Schedule via Developer Console:
 *   System.schedule('Nightly Recommendations', '0 0 2 * * ?', new ProductRecommendationBatch());
 */
public with sharing class ProductRecommendationBatch
    implements Database.Batchable<SObject>, Database.Stateful, Schedulable {

    private Map<String, Integer> countsByKey = new Map<String, Integer>();
    private Map<String, Id[]> pairByKey     = new Map<String, Id[]>();

    public void execute(SchedulableContext ctx) {
        Database.executeBatch(new ProductRecommendationBatch(), 50);
    }

    public Database.QueryLocator start(Database.BatchableContext ctx) {
        return Database.getQueryLocator(
            'SELECT Id FROM Order WHERE Status__c IN (\'Confirmed\', \'Picked\', \'Ready for Collection\', \'Shipped\', \'Fulfilled\', \'Completed\')'
        );
    }

    public void execute(Database.BatchableContext ctx, List<Order> scope) {
        Set<Id> orderIds = new Map<Id, Order>(scope).keySet();

        List<Order_Item__c> items = [
            SELECT Order__c, Product__c
            FROM Order_Item__c
            WHERE Order__c IN :orderIds
              AND Product__c != null
        ];

        // Group product IDs by order
        Map<Id, List<Id>> productsByOrder = new Map<Id, List<Id>>();
        for (Order_Item__c oi : items) {
            if (!productsByOrder.containsKey(oi.Order__c)) {
                productsByOrder.put(oi.Order__c, new List<Id>());
            }
            productsByOrder.get(oi.Order__c).add(oi.Product__c);
        }

        // Accumulate co-occurrence counts into stateful maps
        for (List<Id> products : productsByOrder.values()) {
            if (products.size() < 2) continue;
            for (Integer i = 0; i < products.size() - 1; i++) {
                for (Integer j = i + 1; j < products.size(); j++) {
                    if (products[i] == products[j]) continue;
                    String idA = products[i] <= products[j] ? products[i] : products[j];
                    String idB = products[i] <= products[j] ? products[j] : products[i];
                    String key = idA + '_' + idB;
                    countsByKey.put(key, (countsByKey.containsKey(key) ? countsByKey.get(key) : 0) + 1);
                    if (!pairByKey.containsKey(key)) {
                        pairByKey.put(key, new Id[]{ idA, idB });
                    }
                }
            }
        }
    }

    public void finish(Database.BatchableContext ctx) {
        // Absolute rebuild: upsert current pairs, delete pairs that no longer occur
        Map<String, Product_Recommendation__c> existing = new Map<String, Product_Recommendation__c>();
        for (Product_Recommendation__c rec : [
            SELECT Id, Unique_Key__c, Co_Occurrence_Count__c
            FROM Product_Recommendation__c
        ]) {
            existing.put(rec.Unique_Key__c, rec);
        }

        List<Product_Recommendation__c> toUpsert = new List<Product_Recommendation__c>();
        for (String key : countsByKey.keySet()) {
            Product_Recommendation__c rec = existing.containsKey(key)
                ? existing.get(key)
                : new Product_Recommendation__c(
                    Product_A__c   = pairByKey.get(key)[0],
                    Product_B__c   = pairByKey.get(key)[1],
                    Unique_Key__c  = key
                );
            rec.Co_Occurrence_Count__c = countsByKey.get(key);
            toUpsert.add(rec);
        }

        List<Product_Recommendation__c> toDelete = new List<Product_Recommendation__c>();
        for (String key : existing.keySet()) {
            if (!countsByKey.containsKey(key)) {
                toDelete.add(existing.get(key));
            }
        }

        if (!toUpsert.isEmpty()) upsert toUpsert Unique_Key__c;
        if (!toDelete.isEmpty()) delete toDelete;
    }
}