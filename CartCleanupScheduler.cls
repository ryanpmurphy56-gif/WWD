/**
 * Marks Active carts untouched for 14+ days as Abandoned so the live-ops
 * dashboard reflects real shopping activity. Schedule daily:
 *   System.schedule('Nightly Cart Cleanup', '0 30 2 * * ?', new CartCleanupScheduler());
 */
public without sharing class CartCleanupScheduler implements Schedulable {

    @TestVisible private static final Integer STALE_DAYS = 14;

    public void execute(SchedulableContext sc) {
        abandonStaleCarts();
    }

    public static Integer abandonStaleCarts() {
        Datetime cutoff = Datetime.now().addDays(-STALE_DAYS);
        List<Cart__c> stale = [
            SELECT Id FROM Cart__c
            WHERE Status__c = 'Active' AND LastModifiedDate < :cutoff
            LIMIT 5000
        ];
        for (Cart__c cart : stale) {
            cart.Status__c = 'Abandoned';
        }
        if (!stale.isEmpty()) update stale;
        return stale.size();
    }
}