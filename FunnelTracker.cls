public without sharing class FunnelTracker {

    /**
     * Called from LWCs (View, Add_to_Cart, Remove_from_Cart, Checkout_Start).
     * Wrapped to be fire-and-forget — exceptions are swallowed so tracking
     * failures never break the user experience.
     */
    @AuraEnabled
    public static void recordEvent(
        String eventType,
        Id productId,
        String sessionId,
        Id cartId,
        Decimal quantity,
        Decimal unitPrice
    ) {
        try {
            recordEventAsync(
                eventType,
                productId,
                sessionId,
                cartId,
                quantity,
                unitPrice,
                UserInfo.getUserId()
            );
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'FunnelTracker.recordEvent failed: ' + e.getMessage());
        }
    }

    /**
     * Async insert — runs in a separate transaction so the LWC call returns
     * immediately. Tracking is best-effort; failures are logged, not thrown.
     */
    @future
    public static void recordEventAsync(
        String eventType,
        Id productId,
        String sessionId,
        Id cartId,
        Decimal quantity,
        Decimal unitPrice,
        Id userId
    ) {
        try {
            Funnel_Event__c evt = new Funnel_Event__c(
                Event_Type__c      = eventType,
                Product__c         = productId,
                Session_Id__c      = sessionId,
                Cart__c            = cartId,
                Quantity__c        = quantity != null ? quantity : 1,
                Unit_Price__c      = unitPrice,
                Event_Timestamp__c = System.now(),
                Source__c          = 'Web'
            );

            if (userId != null && !isGuestUser(userId)) {
                evt.User__c = userId;
            }

            insert evt;
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'FunnelTracker async insert failed: ' + e.getMessage());
        }
    }

    /**
     * Synchronous purchase logger — called from CheckoutController.placeOrder
     * AFTER the order is committed. Inserts one Funnel_Event__c per order line.
     */
    public static void recordPurchaseEvents(Id orderId, List<Order_Item__c> orderItems, String sessionId) {
        if (orderItems == null || orderItems.isEmpty()) return;

        List<Funnel_Event__c> events = new List<Funnel_Event__c>();
        for (Order_Item__c item : orderItems) {
            events.add(new Funnel_Event__c(
                Event_Type__c      = 'Purchase',
                Product__c         = item.Product__c,
                Session_Id__c      = sessionId,
                User__c            = isGuestUser(UserInfo.getUserId()) ? null : UserInfo.getUserId(),
                Order__c           = orderId,
                Quantity__c        = item.Quantity__c,
                Unit_Price__c      = item.Unit_Price__c,
                Event_Timestamp__c = System.now(),
                Source__c          = 'Web'
            ));
        }

        try {
            insert events;
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'FunnelTracker purchase events failed: ' + e.getMessage());
        }
    }

    private static Boolean isGuestUser(Id userId) {
        if (userId == null) return true;
        try {
            User u = [SELECT UserType FROM User WHERE Id = :userId LIMIT 1];
            return u.UserType == 'Guest';
        } catch (Exception e) {
            return false;
        }
    }
}