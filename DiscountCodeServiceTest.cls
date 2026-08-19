@isTest
private class DiscountCodeServiceTest {

    @isTest
    static void percentCodeDiscountsSubtotal() {
        insert PnPTestFactory.makeCode('TEN', 10, null);
        DiscountCodeService.CodeResult r = DiscountCodeService.checkCode('ten', 50, false);
        System.assert(r.valid, 'code matches case-insensitively');
        System.assertEquals(5.00, r.discountAmount);
    }

    @isTest
    static void fixedAmountCodeIsCappedAtSubtotal() {
        insert PnPTestFactory.makeCode('TWENTY', null, 20);
        DiscountCodeService.CodeResult r = DiscountCodeService.evaluate('TWENTY', 12, false);
        System.assert(r.valid);
        System.assertEquals(12, r.discountAmount, 'never discounts below $0');
    }

    @isTest
    static void unknownAndBlankCodesAreInvalid() {
        System.assertEquals(false, DiscountCodeService.evaluate('NOPE', 50, false).valid);
        System.assertEquals(false, DiscountCodeService.evaluate('', 50, false).valid);
        System.assertEquals(false, DiscountCodeService.evaluate(null, 50, false).valid);
    }

    @isTest
    static void inactiveExpiredAndFutureCodesAreRejected() {
        Discount_Code__c off = PnPTestFactory.makeCode('OFF', 10, null);
        off.Active__c = false;
        Discount_Code__c expired = PnPTestFactory.makeCode('EXPIRED', 10, null);
        expired.End_Date__c = Date.today().addDays(-1);
        Discount_Code__c future = PnPTestFactory.makeCode('FUTURE', 10, null);
        future.Start_Date__c = Date.today().addDays(7);
        insert new List<Discount_Code__c>{ off, expired, future };

        System.assertEquals(false, DiscountCodeService.evaluate('OFF', 50, false).valid);
        System.assertEquals(false, DiscountCodeService.evaluate('EXPIRED', 50, false).valid);
        System.assertEquals(false, DiscountCodeService.evaluate('FUTURE', 50, false).valid);
    }

    @isTest
    static void usageLimitIsEnforced() {
        Discount_Code__c code = PnPTestFactory.makeCode('LIMITED', 10, null);
        code.Max_Uses__c = 1;
        insert code;

        System.assert(DiscountCodeService.evaluate('LIMITED', 50, false).valid);
        DiscountCodeService.redeem(code.Id);
        System.assertEquals(1, [SELECT Times_Used__c FROM Discount_Code__c WHERE Id = :code.Id].Times_Used__c);
        System.assertEquals(false, DiscountCodeService.evaluate('LIMITED', 50, false).valid,
            'limit reached — no further redemptions');
    }

    @isTest
    static void memberOnlyAndMinimumSpendRules() {
        Discount_Code__c vip = PnPTestFactory.makeCode('VIP', 10, null);
        vip.Member_Only__c = true;
        Discount_Code__c big = PnPTestFactory.makeCode('BIG', 10, null);
        big.Min_Subtotal__c = 100;
        insert new List<Discount_Code__c>{ vip, big };

        System.assertEquals(false, DiscountCodeService.evaluate('VIP', 50, false).valid);
        System.assert(DiscountCodeService.evaluate('VIP', 50, true).valid);
        System.assertEquals(false, DiscountCodeService.evaluate('BIG', 99, false).valid);
        System.assert(DiscountCodeService.evaluate('BIG', 100, false).valid);
    }
}