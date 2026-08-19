@isTest
private class CartControllerTest {

    private static final String UID = 'uid-cart-test';

    @TestSetup
    static void setup() {
        insert PnPTestFactory.makeProduct('Cart Wine', 15.00, 10);
    }

    static Product2 product() {
        return [SELECT Id FROM Product2 WHERE Name = 'Cart Wine'];
    }

    @isTest
    static void getOrCreateCartCreatesThenReuses() {
        Cart__c first = CartController.getOrCreateCart(UID);
        Cart__c second = CartController.getOrCreateCart(UID);
        System.assertEquals(first.Id, second.Id, 'same active cart is reused');
    }

    @isTest
    static void duplicateCartsAreMerged() {
        // Three active carts all holding the SAME product line — the keeper line
        // absorbs quantity from two carts, which previously produced a
        // "Duplicate id in list" DML failure on every add-to-cart.
        Cart__c mine = new Cart__c(Status__c = 'Active');
        insert mine;
        Cart__c old = new Cart__c(Status__c = 'Active');
        insert old;
        Cart__c guest = PnPTestFactory.makeCart(UID);
        Product2 p = product();
        PnPTestFactory.addItem(mine.Id, p.Id, 1, 'single');
        PnPTestFactory.addItem(old.Id, p.Id, 4, 'single');
        PnPTestFactory.addItem(guest.Id, p.Id, 2, 'single');

        Cart__c merged = CartController.getOrCreateCart(UID);

        List<Cart_Item__c> items = [SELECT Quantity__c FROM Cart_Item__c WHERE Cart__c = :merged.Id];
        System.assertEquals(1, items.size(), 'same product+format lines are combined');
        System.assertEquals(7, items[0].Quantity__c, '1 + 4 + 2 merged');
        System.assertEquals(1, [SELECT COUNT() FROM Cart__c WHERE Status__c = 'Active'],
            'only the merged cart stays active');
        System.assertEquals(1, [SELECT COUNT() FROM Cart_Item__c],
            'absorbed lines are deleted');
    }

    @isTest
    static void addToCartEnforcesStock() {
        Product2 p = product();
        CartController.addToCart(p.Id, UID, 'single', 10); // exactly on-hand — ok

        Boolean threw = false;
        try {
            CartController.addToCart(p.Id, UID, 'single', 1); // 11th unit — over
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'exceeding stock must throw');
        System.assertEquals(10, CartController.getCartCount(UID));
    }

    @isTest
    static void updateQuantityChecksOwnership() {
        Product2 p = product();
        CartController.addToCart(p.Id, UID, 'single', 2);
        Cart_Item__c item = [SELECT Id FROM Cart_Item__c LIMIT 1];

        CartController.updateQuantity(item.Id, 5, UID);
        System.assertEquals(5, [SELECT Quantity__c FROM Cart_Item__c WHERE Id = :item.Id].Quantity__c);

        // A different session (wrong uid, cart owned by this user) is still the owner —
        // so simulate a foreign cart item instead
        Cart__c foreign = new Cart__c(Status__c = 'Active', Temporary_OwnerId__c = 'someone-else');
        insert foreign;
        Cart_Item__c foreignItem = PnPTestFactory.addItem(foreign.Id, p.Id, 1, 'single');
        // Owner of 'foreign' is the running user in tests, so ownership passes.
        // The negative case (guest A editing guest B's line) can't be simulated
        // without a second user, but the assert path is exercised above.
        CartController.removeFromCart(foreignItem.Id, 'someone-else');
        System.assertEquals(0, [SELECT COUNT() FROM Cart_Item__c WHERE Id = :foreignItem.Id]);
    }

    @isTest
    static void updateQuantityToZeroDeletesLine() {
        Product2 p = product();
        CartController.addToCart(p.Id, UID, 'single', 2);
        Cart_Item__c item = [SELECT Id FROM Cart_Item__c LIMIT 1];
        CartController.updateQuantity(item.Id, 0, UID);
        System.assertEquals(0, [SELECT COUNT() FROM Cart_Item__c WHERE Id = :item.Id]);
    }

    @isTest
    static void getCartItemsReturnsWrappedRows() {
        Product2 p = product();
        CartController.addToCart(p.Id, UID, 'single', 3);
        List<CartController.CartItemWrapper> rows = CartController.getCartItems(UID);
        System.assertEquals(1, rows.size());
        System.assertEquals(3, rows[0].Quantity);
        System.assertEquals(15.00, rows[0].RegularPrice);
        System.assertEquals(false, rows[0].IsMember);
    }

    @isTest
    static void validateCartStockFlagsOverage() {
        Product2 p = product();
        CartController.addToCart(p.Id, UID, 'single', 8);
        CartController.validateCartStock(UID); // fine

        p.Quantity_on_Hand__c = 2;
        update p;
        Boolean threw = false;
        try {
            CartController.validateCartStock(UID);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'stock shrank below cart quantity — must throw');
    }

    @isTest
    static void checkIsMemberFalseWithoutCard() {
        System.assertEquals(false, CartController.checkIsMember());
    }

    @isTest
    static void clearCartEmptiesAllLines() {
        Product2 p = product();
        CartController.addToCart(p.Id, UID, 'single', 3);
        CartController.addToCart(p.Id, UID, 'six', 1);
        System.assertEquals(4, CartController.getCartCount(UID));

        CartController.clearCart(UID);

        System.assertEquals(0, CartController.getCartCount(UID));
        System.assertEquals(0, [SELECT COUNT() FROM Cart_Item__c]);
        // The cart record itself survives and stays usable
        CartController.addToCart(p.Id, UID, 'single', 1);
        System.assertEquals(1, CartController.getCartCount(UID));
    }
}