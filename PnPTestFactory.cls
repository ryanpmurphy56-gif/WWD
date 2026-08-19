/** Shared test data builders for Point n Pour tests. */
@isTest
public class PnPTestFactory {

    public static Product2 makeProduct(String name, Decimal price, Decimal qtyOnHand) {
        return new Product2(
            Name = name,
            IsActive = true,
            Family = 'Wine',
            Product_Sub_Family__c = 'Cabernet Sauvignon', // required, restricted picklist
            Price__c = price,
            Quantity_on_Hand__c = qtyOnHand,
            Minimum_Quantity__c = 5
        );
    }

    // Pack prices are formulas in this org: 6-pack = Price__c×6×0.65,
    // slab = Price__c×24×0.45 — only the unit price is writeable.
    public static Product2 makeBeer(String name, Decimal unit, Decimal qtyOnHand) {
        Product2 p = makeProduct(name, unit, qtyOnHand);
        p.Family = 'Beer';
        p.Product_Sub_Family__c = 'Lager';
        return p;
    }

    public static Account makeMemberAccount(String name) {
        return new Account(
            Name = name,
            Email__c = name.replaceAll('[^a-zA-Z0-9]', '').toLowerCase() + '@test.invalid',
            Phone_Number__c = '0400000000',
            Birthdate__c = Date.newInstance(1990, 1, 1),
            Join_Date__c = Date.today()
        );
    }

    public static Cart__c makeCart(String uid) {
        Cart__c cart = new Cart__c(Status__c = 'Active', Temporary_OwnerId__c = uid);
        insert cart;
        return cart;
    }

    public static Cart_Item__c addItem(Id cartId, Id productId, Decimal qty, String format) {
        Cart_Item__c item = new Cart_Item__c(
            Cart__c = cartId,
            Product__c = productId,
            Quantity__c = qty,
            Selected_Format__c = format
        );
        insert item;
        return item;
    }

    public static Discount_Code__c makeCode(String code, Decimal pct, Decimal amount) {
        return new Discount_Code__c(
            Name = code,
            Active__c = true,
            Discount_Percent__c = pct,
            Discount_Amount__c = amount,
            Times_Used__c = 0
        );
    }
}