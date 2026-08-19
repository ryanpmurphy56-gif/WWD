public without sharing class CartController {

    @AuraEnabled
    public static Cart__c getOrCreateCart(String uid) {
        List<Cart__c> existing = [
            SELECT Id, OwnerId, Temporary_OwnerId__c FROM Cart__c
            WHERE (OwnerId = :UserInfo.getUserId() OR Temporary_OwnerId__c = :uid)
              AND Status__c = 'Active'
            ORDER BY CreatedDate ASC
        ];
        if (existing.size() > 1) {
            // A guest cart (matched by uid) and the member's own cart both exist —
            // merge the newer carts' items into the oldest and retire the rest
            return mergeCarts(existing);
        }
        if (!existing.isEmpty()) return existing[0];
        Cart__c c = new Cart__c(Status__c = 'Active', Temporary_OwnerId__c = uid);
        insert c;
        return c;
    }

    // Combines duplicate active carts into the oldest one. Same product+format
    // lines are summed; the emptied carts are marked Abandoned.
    private static Cart__c mergeCarts(List<Cart__c> carts) {
        Cart__c keeper = carts[0];
        List<Id> mergedIds = new List<Id>();
        for (Integer i = 1; i < carts.size(); i++) mergedIds.add(carts[i].Id);

        Map<String, Cart_Item__c> keeperByKey = new Map<String, Cart_Item__c>();
        for (Cart_Item__c item : [
            SELECT Id, Product__c, Selected_Format__c, Quantity__c
            FROM Cart_Item__c WHERE Cart__c = :keeper.Id
        ]) {
            keeperByKey.put(item.Product__c + '|' + item.Selected_Format__c, item);
        }

        // Keyed by record Id: the same keeper line can absorb quantity from
        // several merged carts, but it must appear in the update DML only once
        Map<Id, Cart_Item__c> dirtyById = new Map<Id, Cart_Item__c>();
        List<Cart_Item__c> absorbed = new List<Cart_Item__c>();
        for (Cart_Item__c item : [
            SELECT Id, Cart__c, Product__c, Selected_Format__c, Quantity__c
            FROM Cart_Item__c WHERE Cart__c IN :mergedIds
        ]) {
            String key = item.Product__c + '|' + item.Selected_Format__c;
            if (keeperByKey.containsKey(key)) {
                Cart_Item__c target = keeperByKey.get(key);
                target.Quantity__c += item.Quantity__c;
                dirtyById.put(target.Id, target);
                absorbed.add(item);
            } else {
                item.Cart__c = keeper.Id;
                dirtyById.put(item.Id, item);
                keeperByKey.put(key, item);
            }
        }
        if (!dirtyById.isEmpty()) update dirtyById.values();
        if (!absorbed.isEmpty()) delete absorbed;

        List<Cart__c> retired = new List<Cart__c>();
        for (Id cartId : mergedIds) {
            retired.add(new Cart__c(Id = cartId, Status__c = 'Abandoned'));
        }
        if (!retired.isEmpty()) update retired;

        return keeper;
    }

    // A cart item may only be touched by the cart's owner (or the guest session
    // that created it) — record Ids alone are not authorisation.
    private static void assertItemOwnership(Id cartItemId, String uid) {
        List<Cart_Item__c> items = [
            SELECT Id, Cart__r.OwnerId, Cart__r.Temporary_OwnerId__c
            FROM Cart_Item__c WHERE Id = :cartItemId LIMIT 1
        ];
        if (items.isEmpty()) {
            throw new AuraHandledException('Cart item not found.');
        }
        Boolean owned = items[0].Cart__r.OwnerId == UserInfo.getUserId()
            || (String.isNotBlank(uid) && items[0].Cart__r.Temporary_OwnerId__c == uid);
        if (!owned) {
            throw new AuraHandledException('This cart item does not belong to your cart.');
        }
    }

    @AuraEnabled(cacheable=false)
    public static List<CartItemWrapper> getCartItems(String uid) {
        Cart__c cart         = getOrCreateCart(uid);
        Boolean memberStatus = PnPUserContext.isMember();

        List<Cart_Item__c> items = [
            SELECT Id, Product__c,
                   Product__r.Name, Product__r.Family, Product__r.Price__c,
                   Product__r.Members_Price_Individual__c, Product__r.Price_6_Pack_New__c,
                   Product__r.Price_Slab_of_24_new__c, Product__r.Members_Price_6_Pack__c,
                   Product__r.Members_Price_Slab_of_24__c, Product__r.Product_Image_Field__c,
                   Product__r.Quantity_on_Hand__c,
                   Quantity__c, Selected_Format__c
            FROM Cart_Item__c
            WHERE Cart__c = :cart.Id
            ORDER BY CreatedDate ASC
        ];

        Set<Id> productIds = new Set<Id>();
        for (Cart_Item__c ci : items) productIds.add(ci.Product__c);
        Map<Id, Decimal> pbePrice = new Map<Id, Decimal>();
        if (!productIds.isEmpty()) {
            for (PricebookEntry pbe : [
                SELECT Product2Id, UnitPrice FROM PricebookEntry
                WHERE Product2Id IN :productIds AND IsActive = true
                  AND Pricebook2.Name = 'Standard Price Book'
            ]) { pbePrice.put(pbe.Product2Id, pbe.UnitPrice); }
        }

        List<CartItemWrapper> wrapped = new List<CartItemWrapper>();
        for (Cart_Item__c item : items) {
            CartItemWrapper w    = new CartItemWrapper();
            w.Id                 = item.Id;
            w.ProductId          = item.Product__c;
            w.Quantity           = item.Quantity__c;
            w.SelectedFormat     = item.Selected_Format__c;
            w.ProductName        = item.Product__r.Name;
            w.ProductImage       = item.Product__r.Product_Image_Field__c;
            w.QuantityOnHand     = item.Product__r.Quantity_on_Hand__c;
            w.ProductFamily      = item.Product__r.Family;
            Decimal custPrice    = item.Product__r.Price__c;
            w.RegularPrice       = custPrice != null ? custPrice
                : (pbePrice.containsKey(item.Product__c) ? pbePrice.get(item.Product__c) : 0);
            w.SixPackPrice       = item.Product__r.Price_6_Pack_New__c;
            w.SlabPrice          = item.Product__r.Price_Slab_of_24_new__c;
            w.MemberPrice        = memberStatus ? item.Product__r.Members_Price_Individual__c : null;
            w.MemberSixPackPrice = memberStatus ? item.Product__r.Members_Price_6_Pack__c     : null;
            w.MemberSlabPrice    = memberStatus ? item.Product__r.Members_Price_Slab_of_24__c : null;
            w.IsMember           = memberStatus;
            wrapped.add(w);
        }
        return wrapped;
    }

    @AuraEnabled
    public static void addToCart(Id productId, String uid, String selectedFormat, Integer quantity) {
        Integer qtyToAdd = (quantity == null || quantity < 1) ? 1 : quantity;
        Cart__c cart     = getOrCreateCart(uid);
        Product2 product = [SELECT Id, Quantity_on_Hand__c FROM Product2 WHERE Id = :productId];
        List<Cart_Item__c> existing = [
            SELECT Id, Quantity__c FROM Cart_Item__c
            WHERE Cart__c = :cart.Id AND Product__c = :productId AND Selected_Format__c = :selectedFormat
            LIMIT 1
        ];
        if (!existing.isEmpty()) {
            Cart_Item__c item = existing[0];
            Decimal newQty   = item.Quantity__c + qtyToAdd;
            if (product.Quantity_on_Hand__c != null && newQty > product.Quantity_on_Hand__c) {
                throw new AuraHandledException('Sorry, only ' + Integer.valueOf(product.Quantity_on_Hand__c) + ' in stock.');
            }
            item.Quantity__c = newQty;
            update item;
        } else {
            if (product.Quantity_on_Hand__c != null && product.Quantity_on_Hand__c < qtyToAdd) {
                if (product.Quantity_on_Hand__c < 1) {
                    throw new AuraHandledException('Sorry, this product is out of stock.');
                }
                throw new AuraHandledException('Sorry, only ' + Integer.valueOf(product.Quantity_on_Hand__c) + ' in stock.');
            }
            insert new Cart_Item__c(
                Cart__c            = cart.Id,
                Product__c         = productId,
                Quantity__c        = qtyToAdd,
                Selected_Format__c = selectedFormat
            );
        }
    }

    @AuraEnabled
    public static void validateCartStock(String uid) {
        Cart__c cart = getOrCreateCart(uid);
        // The same product can appear on multiple cart lines (different formats),
        // so validate against the summed quantity per product
        Map<Id, Decimal> requestedByProduct = new Map<Id, Decimal>();
        Map<Id, Cart_Item__c> itemByProduct = new Map<Id, Cart_Item__c>();
        for (Cart_Item__c item : [
            SELECT Product__c, Quantity__c, Product__r.Name, Product__r.Quantity_on_Hand__c
            FROM Cart_Item__c WHERE Cart__c = :cart.Id
        ]) {
            Decimal runningQty = requestedByProduct.containsKey(item.Product__c)
                ? requestedByProduct.get(item.Product__c) : 0;
            requestedByProduct.put(item.Product__c, runningQty + item.Quantity__c);
            itemByProduct.put(item.Product__c, item);
        }
        List<String> problems = new List<String>();
        for (Id productId : requestedByProduct.keySet()) {
            Cart_Item__c item = itemByProduct.get(productId);
            Decimal onHand = item.Product__r.Quantity_on_Hand__c;
            if (onHand != null && requestedByProduct.get(productId) > onHand) {
                problems.add(item.Product__r.Name + ' (only ' + Integer.valueOf(onHand) + ' available)');
            }
        }
        if (!problems.isEmpty()) {
            throw new AuraHandledException(
                'Not enough stock for: ' + String.join(problems, ', ') + '. Please adjust your cart.'
            );
        }
    }

    @AuraEnabled
    public static void updateQuantity(Id cartItemId, Decimal newQuantity, String uid) {
        assertItemOwnership(cartItemId, uid);
        Cart_Item__c item   = [SELECT Id, Product__c FROM Cart_Item__c WHERE Id = :cartItemId LIMIT 1];
        Product2    product = [SELECT Quantity_on_Hand__c FROM Product2 WHERE Id = :item.Product__c LIMIT 1];
        if (product.Quantity_on_Hand__c != null && newQuantity > product.Quantity_on_Hand__c) {
            throw new AuraHandledException('Sorry, not enough stock available.');
        }
        if (newQuantity <= 0) { delete item; }
        else { item.Quantity__c = newQuantity; update item; }
    }

    @AuraEnabled
    public static void removeFromCart(Id cartItemId, String uid) {
        assertItemOwnership(cartItemId, uid);
        delete [SELECT Id FROM Cart_Item__c WHERE Id = :cartItemId LIMIT 1];
    }

    /** Empties the caller's active cart in one action. */
    @AuraEnabled
    public static void clearCart(String uid) {
        Cart__c cart = getOrCreateCart(uid);
        delete [SELECT Id FROM Cart_Item__c WHERE Cart__c = :cart.Id];
    }

    @AuraEnabled(cacheable=false)
    public static Integer getCartCount(String uid) {
        Cart__c cart = getOrCreateCart(uid);
        AggregateResult[] res = [SELECT SUM(Quantity__c) total FROM Cart_Item__c WHERE Cart__c = :cart.Id];
        if (res.isEmpty() || res[0].get('total') == null) return 0;
        return Integer.valueOf(res[0].get('total'));
    }

    @AuraEnabled(cacheable=true)
    public static Boolean checkIsMember() { return PnPUserContext.isMember(); }

    public class CartItemWrapper {
        @AuraEnabled public String  Id;
        @AuraEnabled public String  ProductId;
        @AuraEnabled public Decimal Quantity;
        @AuraEnabled public String  SelectedFormat;
        @AuraEnabled public String  ProductName;
        @AuraEnabled public String  ProductImage;
        @AuraEnabled public Decimal QuantityOnHand;
        @AuraEnabled public String  ProductFamily;
        @AuraEnabled public Decimal RegularPrice;
        @AuraEnabled public Decimal SixPackPrice;
        @AuraEnabled public Decimal SlabPrice;
        @AuraEnabled public Decimal MemberPrice;
        @AuraEnabled public Decimal MemberSixPackPrice;
        @AuraEnabled public Decimal MemberSlabPrice;
        @AuraEnabled public Boolean IsMember;
    }
}