public without sharing class PnpV2MemberController {

    @AuraEnabled(cacheable=true)
    public static Map<String, String> getCurrentMemberProfile() {
        User u = [SELECT Id, FirstName, LastName, Email FROM User WHERE Id = :UserInfo.getUserId() LIMIT 1];
        Map<String, String> profile = new Map<String, String>();
        profile.put('fullName', (u.FirstName != null ? u.FirstName : '') + ' ' + (u.LastName != null ? u.LastName : ''));
        profile.put('email', u.Email != null ? u.Email : '');

        Id accountId = resolveMemberAccountId();
        if (accountId != null) {
            List<Account> accts = [
                SELECT Phone_Number__c, ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode
                FROM Account WHERE Id = :accountId LIMIT 1
            ];
            if (!accts.isEmpty()) {
                profile.put('phone',    accts[0].Phone_Number__c);
                profile.put('street',   accts[0].ShippingStreet);
                profile.put('suburb',   accts[0].ShippingCity);
                profile.put('state',    accts[0].ShippingState);
                profile.put('postcode', accts[0].ShippingPostalCode);
            }
        }
        return profile;
    }

    /** Update the member's phone and default delivery address. */
    @AuraEnabled
    public static void updateMemberProfile(
        String phone, String street, String suburb, String state, String postcode
    ) {
        Id accountId = resolveMemberAccountId();
        if (accountId == null) {
            throw new AuraHandledException('No member account found for your login.');
        }
        Account acct = new Account(Id = accountId);
        if (phone != null)    acct.Phone_Number__c    = phone.trim();
        if (street != null)   acct.ShippingStreet     = street.trim();
        if (suburb != null)   acct.ShippingCity       = suburb.trim();
        if (state != null)    acct.ShippingState      = state.trim();
        if (postcode != null) acct.ShippingPostalCode = postcode.trim();
        try {
            update acct;
        } catch (Exception e) {
            throw new AuraHandledException('Could not save your details: ' + e.getMessage());
        }
    }

    // Orders a customer may still cancel themselves (matches CheckoutController.cancelOrder)
    private static final Set<String> CANCELLABLE = new Set<String>{ 'Pending', 'Confirmed', 'Picked' };

    @AuraEnabled(cacheable=false)
    public static List<OrderSummary> getOrderHistory() {
        // Orders are attributed to the member's Account at checkout
        // (see CheckoutController.resolveOrderAccountId), so query by Account —
        // OwnerId is whoever ran the transaction and misses member purchases.
        Id accountId = resolveMemberAccountId();
        if (accountId == null) return new List<OrderSummary>();

        List<Order> orders = [
            SELECT Id, OrderNumber, CreatedDate, Order_Total__c, Status__c,
                   Fulfilment_Type__c, Tracking_Number__c, Delivery_Fee__c,
                   First_Order_Discount__c, Discount_Code_Amount__c
            FROM Order
            WHERE AccountId = :accountId
            ORDER BY CreatedDate DESC
            LIMIT 50
        ];

        Map<Id, List<OrderLine>> linesByOrder = new Map<Id, List<OrderLine>>();
        for (Order_Item__c item : [
            SELECT Order__c, Product_Name__c, Quantity__c, Unit_Price__c, Line_Total__c,
                   Product__c, Product__r.Product_Image_Field__c
            FROM Order_Item__c
            WHERE Order__c IN :orders
            ORDER BY Product_Name__c
        ]) {
            if (!linesByOrder.containsKey(item.Order__c)) {
                linesByOrder.put(item.Order__c, new List<OrderLine>());
            }
            OrderLine line = new OrderLine();
            line.productId = item.Product__c;
            line.productName = item.Product_Name__c;
            line.productImage = item.Product__r != null ? item.Product__r.Product_Image_Field__c : null;
            line.quantity = item.Quantity__c;
            line.unitPrice = item.Unit_Price__c;
            line.lineTotal = item.Line_Total__c;
            linesByOrder.get(item.Order__c).add(line);
        }

        List<OrderSummary> result = new List<OrderSummary>();
        for (Order o : orders) {
            OrderSummary row = new OrderSummary();
            row.orderId = o.Id;
            row.orderNumber = o.OrderNumber;
            row.createdDate = o.CreatedDate;
            row.total = o.Order_Total__c != null ? o.Order_Total__c : 0;
            row.status = o.Status__c != null ? o.Status__c : '';
            row.fulfilmentType = o.Fulfilment_Type__c != null ? o.Fulfilment_Type__c : '';
            row.trackingNumber = o.Tracking_Number__c;
            row.deliveryFee = o.Delivery_Fee__c;
            row.discount = sumDiscounts(o);
            row.canCancel = CANCELLABLE.contains(o.Status__c);
            row.lines = linesByOrder.containsKey(o.Id) ? linesByOrder.get(o.Id) : new List<OrderLine>();
            result.add(row);
        }
        return result;
    }

    private static Decimal sumDiscounts(Order o) {
        Decimal total = 0;
        if (o.First_Order_Discount__c != null) total += o.First_Order_Discount__c;
        if (o.Discount_Code_Amount__c != null) total += o.Discount_Code_Amount__c;
        return total;
    }

    private static Id resolveMemberAccountId() {
        return PnPUserContext.resolveMemberAccountId();
    }

    /** Latest membership card for the logged-in member (null if none). */
    @AuraEnabled(cacheable=true)
    public static Members_Card__c getMemberDetails() {
        Id accountId = PnPUserContext.resolveMemberAccountId();
        if (accountId == null) return null;

        List<Members_Card__c> cards = [
            SELECT Id, Name, Member_Number__c, Barcode__c,
                   Account__c, Contact__c, Start_Date__c, Expiry_Date__c
            FROM Members_Card__c
            WHERE Account__c = :accountId
            ORDER BY CreatedDate DESC LIMIT 1
        ];
        return cards.isEmpty() ? null : cards[0];
    }

    public class OrderSummary {
        @AuraEnabled public Id orderId;
        @AuraEnabled public String orderNumber;
        @AuraEnabled public Datetime createdDate;
        @AuraEnabled public Decimal total;
        @AuraEnabled public String status;
        @AuraEnabled public String fulfilmentType;
        @AuraEnabled public String trackingNumber;
        @AuraEnabled public Decimal deliveryFee;
        @AuraEnabled public Decimal discount;
        @AuraEnabled public Boolean canCancel;
        @AuraEnabled public List<OrderLine> lines;
    }

    public class OrderLine {
        @AuraEnabled public Id productId;
        @AuraEnabled public String productName;
        @AuraEnabled public String productImage;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public Decimal unitPrice;
        @AuraEnabled public Decimal lineTotal;
    }
}