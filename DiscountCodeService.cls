/**
 * Discount code validation and redemption.
 *
 * Stacking policy (single source of truth):
 *  - Member pricing and site-sale percentages always apply first, per item.
 *  - A discount code and the 15% first-order member discount NEVER stack —
 *    the customer automatically gets whichever is larger.
 *  - Delivery is never discounted.
 */
public without sharing class DiscountCodeService {

    public class CodeResult {
        @AuraEnabled public Boolean valid = false;
        @AuraEnabled public String message = '';
        @AuraEnabled public Id codeId;
        @AuraEnabled public String code;
        @AuraEnabled public Decimal discountAmount = 0; // dollars off the given subtotal
    }

    /** LWC preview: validate a code against the caller's current cart subtotal. */
    @AuraEnabled
    public static CodeResult checkCode(String code, Decimal subtotal, Boolean isMember) {
        return evaluate(code, subtotal == null ? 0 : subtotal, isMember == true);
    }

    /**
     * Core evaluation. Returns an invalid result with a customer-safe message
     * rather than throwing, so the checkout can show it inline.
     */
    public static CodeResult evaluate(String code, Decimal subtotal, Boolean isMember) {
        CodeResult result = new CodeResult();
        if (String.isBlank(code)) {
            result.message = 'Please enter a code.';
            return result;
        }

        String cleaned = code.trim().toUpperCase();
        List<Discount_Code__c> matches = [
            SELECT Id, Name, Active__c, Discount_Percent__c, Discount_Amount__c,
                   Start_Date__c, End_Date__c, Max_Uses__c, Times_Used__c,
                   Min_Subtotal__c, Member_Only__c
            FROM Discount_Code__c
            WHERE Name = :cleaned
            LIMIT 1
        ];
        if (matches.isEmpty()) {
            result.message = 'That code isn\'t valid.';
            return result;
        }

        Discount_Code__c dc = matches[0];
        Date today = Date.today();

        if (!dc.Active__c) {
            result.message = 'That code is no longer active.';
            return result;
        }
        if (dc.Start_Date__c != null && dc.Start_Date__c > today) {
            result.message = 'That code isn\'t active yet.';
            return result;
        }
        if (dc.End_Date__c != null && dc.End_Date__c < today) {
            result.message = 'That code has expired.';
            return result;
        }
        if (dc.Max_Uses__c != null) {
            Decimal used = dc.Times_Used__c == null ? 0 : dc.Times_Used__c;
            if (used >= dc.Max_Uses__c) {
                result.message = 'That code has reached its redemption limit.';
                return result;
            }
        }
        if (dc.Member_Only__c && !isMember) {
            result.message = 'That code is for members only. Sign in with a member account to use it.';
            return result;
        }
        if (dc.Min_Subtotal__c != null && subtotal < dc.Min_Subtotal__c) {
            result.message = 'That code needs a minimum spend of $'
                + dc.Min_Subtotal__c.setScale(2) + '.';
            return result;
        }

        Decimal amount = 0;
        if (dc.Discount_Percent__c != null && dc.Discount_Percent__c > 0) {
            amount = (subtotal * dc.Discount_Percent__c / 100).setScale(2, RoundingMode.HALF_UP);
        } else if (dc.Discount_Amount__c != null && dc.Discount_Amount__c > 0) {
            amount = dc.Discount_Amount__c.setScale(2, RoundingMode.HALF_UP);
        }
        if (amount <= 0) {
            result.message = 'That code has no discount configured.';
            return result;
        }
        if (amount > subtotal) amount = subtotal; // never discount below $0

        result.valid = true;
        result.codeId = dc.Id;
        result.code = dc.Name;
        result.discountAmount = amount;
        result.message = 'Code applied — $' + amount + ' off.';
        return result;
    }

    /** Locks the code row and increments its use count. Call inside order placement. */
    public static void redeem(Id codeId) {
        if (codeId == null) return;
        List<Discount_Code__c> rows = [
            SELECT Id, Times_Used__c FROM Discount_Code__c WHERE Id = :codeId FOR UPDATE
        ];
        if (rows.isEmpty()) return;
        rows[0].Times_Used__c = (rows[0].Times_Used__c == null ? 0 : rows[0].Times_Used__c) + 1;
        update rows[0];
    }
}