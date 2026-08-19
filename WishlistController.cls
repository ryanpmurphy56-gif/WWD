public with sharing class WishlistController {

    // ── Shared helper ────────────────────────────────────────────────────────

    private static Id getMemberAccountId() {
        Id accountId = PnPUserContext.resolveMemberAccountId();
        if (accountId == null) {
            // Internal users (e.g. an admin previewing the site) are authenticated but
            // have no member account — tell them why instead of "you must be logged in"
            if (UserInfo.getUserType() == 'Standard') {
                throw new AuraHandledException(
                    'You are browsing with an internal Salesforce session, which has no member account. ' +
                    'Sign in as a store member (use a private/incognito window) to use the wishlist.');
            }
            throw new AuraHandledException('You must be logged in as a member to use the wishlist.');
        }
        return accountId;
    }

    // ── Member-facing methods ────────────────────────────────────────────────

    @AuraEnabled(cacheable=false)
    public static List<WishlistItemWrapper> getWishlist() {
        Id accountId = getMemberAccountId();
        List<Wishlist_Item__c> items = [
            SELECT Id, Product__c,
                   Product__r.Name, Product__r.Family, Product__r.Product_Sub_Family__c,
                   Product__r.Price__c, Product__r.Members_Price_Individual__c,
                   Product__r.Product_Image_Field__c, Product__r.Quantity_on_Hand__c,
                   Product__r.IsActive
            FROM Wishlist_Item__c
            WHERE Account__c = :accountId
              AND Product__r.IsActive = true
            ORDER BY CreatedDate DESC
        ];

        List<WishlistItemWrapper> wrapped = new List<WishlistItemWrapper>();
        for (Wishlist_Item__c item : items) {
            WishlistItemWrapper w = new WishlistItemWrapper();
            w.Id           = item.Id;
            w.ProductId    = item.Product__c;
            w.ProductName  = item.Product__r.Name;
            w.ProductFamily= item.Product__r.Family;
            w.ProductImage = item.Product__r.Product_Image_Field__c;
            w.Price        = item.Product__r.Price__c;
            w.MemberPrice  = item.Product__r.Members_Price_Individual__c;
            w.InStock      = item.Product__r.Quantity_on_Hand__c == null
                          || item.Product__r.Quantity_on_Hand__c > 0;
            wrapped.add(w);
        }
        return wrapped;
    }

    @AuraEnabled
    public static String addToWishlist(Id productId) {
        Id accountId = getMemberAccountId();

        // Prevent duplicates
        List<Wishlist_Item__c> existing = [
            SELECT Id FROM Wishlist_Item__c
            WHERE Account__c = :accountId AND Product__c = :productId
            LIMIT 1
        ];
        if (!existing.isEmpty()) return existing[0].Id;

        Wishlist_Item__c item = new Wishlist_Item__c(
            Account__c = accountId,
            Product__c = productId
        );
        insert item;
        return item.Id;
    }

    @AuraEnabled
    public static void removeFromWishlist(Id wishlistItemId) {
        Id accountId = getMemberAccountId();
        List<Wishlist_Item__c> items = [
            SELECT Id FROM Wishlist_Item__c
            WHERE Id = :wishlistItemId AND Account__c = :accountId
            LIMIT 1
        ];
        if (!items.isEmpty()) delete items[0];
    }

    @AuraEnabled
    public static void moveToCart(Id wishlistItemId, String uid) {
        Id accountId = getMemberAccountId();
        List<Wishlist_Item__c> items = [
            SELECT Id, Product__c FROM Wishlist_Item__c
            WHERE Id = :wishlistItemId AND Account__c = :accountId
            LIMIT 1
        ];
        if (items.isEmpty()) throw new AuraHandledException('Wishlist item not found.');

        CartController.addToCart(items[0].Product__c, uid, 'single', 1);
        delete items[0];
    }

    // Returns the wishlistItemId if the product is already saved, else null
    @AuraEnabled(cacheable=false)
    public static String getWishlistStatus(Id productId) {
        Id accountId = PnPUserContext.resolveMemberAccountId();
        if (accountId == null) return null;

        List<Wishlist_Item__c> items = [
            SELECT Id FROM Wishlist_Item__c
            WHERE Account__c = :accountId AND Product__c = :productId
            LIMIT 1
        ];
        return items.isEmpty() ? null : items[0].Id;
    }

    // ── Owner analytics ──────────────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static List<WishlistInsightRow> getWishlistInsights() {
        // Price__c is a formula field, which SOQL cannot GROUP BY — aggregate on
        // the product id alone and join the price/family details afterwards
        AggregateResult[] results = [
            SELECT Product__c productId, COUNT(Id) total
            FROM Wishlist_Item__c
            GROUP BY Product__c
            ORDER BY COUNT(Id) DESC
            LIMIT 20
        ];

        Set<Id> productIds = new Set<Id>();
        for (AggregateResult ar : results) {
            productIds.add((Id) ar.get('productId'));
        }
        Map<Id, Product2> products = new Map<Id, Product2>([
            SELECT Id, Name, Price__c, Family FROM Product2 WHERE Id IN :productIds
        ]);

        List<WishlistInsightRow> rows = new List<WishlistInsightRow>();
        for (AggregateResult ar : results) {
            Product2 p = products.get((Id) ar.get('productId'));
            if (p == null) continue;
            WishlistInsightRow row = new WishlistInsightRow();
            row.ProductId   = p.Id;
            row.ProductName = p.Name;
            row.Price       = p.Price__c;
            row.Family      = p.Family;
            row.TotalSaves  = (Integer) ar.get('total');
            rows.add(row);
        }
        return rows;
    }

    // ── Wrappers ─────────────────────────────────────────────────────────────

    public class WishlistItemWrapper {
        @AuraEnabled public String  Id;
        @AuraEnabled public String  ProductId;
        @AuraEnabled public String  ProductName;
        @AuraEnabled public String  ProductFamily;
        @AuraEnabled public String  ProductImage;
        @AuraEnabled public Decimal Price;
        @AuraEnabled public Decimal MemberPrice;
        @AuraEnabled public Boolean InStock;
    }

    public class WishlistInsightRow {
        @AuraEnabled public Id      ProductId;
        @AuraEnabled public String  ProductName;
        @AuraEnabled public Decimal Price;
        @AuraEnabled public String  Family;
        @AuraEnabled public Integer TotalSaves;
    }
}