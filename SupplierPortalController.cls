public with sharing class SupplierPortalController {

    // Allows tests to bypass the community-user lookup
    @TestVisible private static Id testSupplierId;

    // ── Wrappers ──────────────────────────────────────────────────────────────

    public class ProductRow {
        @AuraEnabled public String  productId;
        @AuraEnabled public String  name;
        @AuraEnabled public String  category;
        @AuraEnabled public Decimal sellingPrice;
        @AuraEnabled public Decimal quantityOnHand;
        @AuraEnabled public Decimal minimumQuantity;
        @AuraEnabled public Integer totalSold;
        @AuraEnabled public String  stockStatus;
    }

    public class PortalSummary {
        @AuraEnabled public Integer rangedCount;
        @AuraEnabled public Integer unitsSold;
        @AuraEnabled public Integer lowStockCount;
        @AuraEnabled public Integer openRequests;
    }

    public class SupplierProfile {
        @AuraEnabled public String supplierName;
        @AuraEnabled public String contactName;
        @AuraEnabled public String contactEmail;
    }

    // ── Profile ───────────────────────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static SupplierProfile getSupplierProfile() {
        Id userId = UserInfo.getUserId();
        User u = [SELECT ContactId, Name, Email FROM User WHERE Id = :userId LIMIT 1];

        SupplierProfile profile = new SupplierProfile();
        profile.contactName  = u.Name;
        profile.contactEmail = u.Email;

        if (u.ContactId != null) {
            Contact c = [SELECT Account.Name FROM Contact WHERE Id = :u.ContactId LIMIT 1];
            profile.supplierName = c.Account != null ? c.Account.Name : null;
        }

        return profile;
    }

    // ── Ranged products ───────────────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static List<ProductRow> getRangedProducts() {
        Id supplierId = getSupplierId();

        // Quantity_on_Hand__c is the store's live stock figure (the one checkout
        // decrements) — Stock_On_Hand__c is a legacy field and must not be used
        List<Product2> products = [
            SELECT Id, Name, Family, Quantity_on_Hand__c,
                   Minimum_Quantity__c, Selling_Price__c
            FROM Product2
            WHERE Supplier__c = :supplierId
              AND IsActive = true
            ORDER BY Name
        ];

        Map<Id, Integer> soldMap = getSoldMap(new Map<Id, Product2>(products).keySet());

        List<ProductRow> rows = new List<ProductRow>();
        for (Product2 p : products) {
            ProductRow row    = new ProductRow();
            row.productId     = p.Id;
            row.name          = p.Name;
            row.category      = p.Family;
            row.sellingPrice  = p.Selling_Price__c;
            row.quantityOnHand  = p.Quantity_on_Hand__c != null ? p.Quantity_on_Hand__c : 0;
            row.minimumQuantity = p.Minimum_Quantity__c;
            row.totalSold     = soldMap.containsKey(p.Id) ? soldMap.get(p.Id) : 0;
            row.stockStatus   = calcStockStatus(p);
            rows.add(row);
        }
        return rows;
    }

    // ── Summary tiles ─────────────────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static PortalSummary getPortalSummary() {
        Id supplierId = getSupplierId();

        List<Product2> products = [
            SELECT Id, Quantity_on_Hand__c, Minimum_Quantity__c
            FROM Product2
            WHERE Supplier__c = :supplierId
              AND IsActive = true
        ];

        Integer lowStockCount = 0;
        for (Product2 p : products) {
            if (calcStockStatus(p) != 'In Stock') lowStockCount++;
        }

        Map<Id, Integer> soldMap = getSoldMap(new Map<Id, Product2>(products).keySet());
        Integer totalSold = 0;
        for (Integer qty : soldMap.values()) {
            totalSold += qty;
        }

        Integer openRequests = [
            SELECT COUNT() FROM Promotion_Request__c
            WHERE Supplier__c = :supplierId
              AND Status__c NOT IN ('Approved', 'Declined')
        ];

        PortalSummary s  = new PortalSummary();
        s.rangedCount    = products.size();
        s.unitsSold      = totalSold;
        s.lowStockCount  = lowStockCount;
        s.openRequests   = openRequests;
        return s;
    }

    // ── Promotion requests ────────────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static List<Promotion_Request__c> getPromotionRequests() {
        Id supplierId = getSupplierId();
        return [
            SELECT Id, Name, Status__c,
                   Product__c, Product__r.Name,
                   Proposed_Price__c, Start_Date__c, End_Date__c,
                   Supplier_Notes__c, Store_Response__c
            FROM Promotion_Request__c
            WHERE Supplier__c = :supplierId
            ORDER BY CreatedDate DESC
            LIMIT 200
        ];
    }

    @AuraEnabled
    public static void submitPromotionRequest(
        String  productId,
        Decimal proposedPrice,
        Date    startDate,
        Date    endDate,
        String  notes
    ) {
        Id supplierId = getSupplierId();

        if (String.isBlank(productId)) {
            throw new AuraHandledException('A product must be selected.');
        }

        insert new Promotion_Request__c(
            Product__c        = productId,
            Supplier__c       = supplierId,
            Proposed_Price__c = proposedPrice,
            Start_Date__c     = startDate,
            End_Date__c       = endDate,
            Supplier_Notes__c = notes,
            Status__c         = 'Submitted'
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Id getSupplierId() {
        if (testSupplierId != null) return testSupplierId;

        Id userId = UserInfo.getUserId();
        List<User> users = [SELECT ContactId FROM User WHERE Id = :userId LIMIT 1];

        if (users.isEmpty() || users[0].ContactId == null) {
            throw new AuraHandledException('No contact record is linked to your user.');
        }

        List<Contact> contacts = [SELECT AccountId FROM Contact WHERE Id = :users[0].ContactId LIMIT 1];

        if (contacts.isEmpty() || contacts[0].AccountId == null) {
            throw new AuraHandledException('No supplier account is linked to your contact.');
        }

        return contacts[0].AccountId;
    }

    private static String calcStockStatus(Product2 p) {
        Decimal qty    = p.Quantity_on_Hand__c != null ? p.Quantity_on_Hand__c : 0;
        Decimal minQty = p.Minimum_Quantity__c != null ? p.Minimum_Quantity__c : 0;
        if (qty <= 0)      return 'Out of Stock';
        if (qty <= minQty) return 'Low Stock';
        return 'In Stock';
    }

    // Web checkout writes custom Order_Item__c lines (not standard OrderItem),
    // so units sold must be aggregated from there
    private static Map<Id, Integer> getSoldMap(Set<Id> productIds) {
        Map<Id, Integer> result = new Map<Id, Integer>();
        if (productIds.isEmpty()) return result;

        for (AggregateResult ar : [
            SELECT Product__c pid, SUM(Quantity__c) total
            FROM Order_Item__c
            WHERE Product__c IN :productIds
            GROUP BY Product__c
        ]) {
            Decimal raw = (Decimal) ar.get('total');
            result.put((Id) ar.get('pid'), raw != null ? raw.intValue() : 0);
        }
        return result;
    }
}