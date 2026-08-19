/**
 * Shared user-context helpers for the storefront controllers.
 * Single source of truth for "which member Account is this?" and
 * "do they hold a valid membership card?" — previously copy-pasted
 * (and drifting) across five controllers.
 */
public without sharing class PnPUserContext {

    // Portal users carry AccountId directly; fall back to the contact's account.
    // Null for guests and internal users without a member account.
    public static Id resolveMemberAccountId() {
        List<User> u = [
            SELECT AccountId, ContactId, Contact.AccountId
            FROM User WHERE Id = :UserInfo.getUserId() LIMIT 1
        ];
        if (u.isEmpty()) return null;
        if (u[0].AccountId != null) return u[0].AccountId;
        return u[0].ContactId != null ? u[0].Contact.AccountId : null;
    }

    // Membership cards are permanent unless an expiry has been set explicitly
    public static Boolean isMember() {
        Id accountId = resolveMemberAccountId();
        if (accountId == null) return false;
        return ![
            SELECT Id FROM Members_Card__c
            WHERE Account__c = :accountId
              AND (Expiry_Date__c = null OR Expiry_Date__c >= TODAY)
            LIMIT 1
        ].isEmpty();
    }
}