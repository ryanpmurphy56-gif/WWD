public without sharing class MemberController {

    @AuraEnabled(cacheable=true)
    public static Members_Card__c getMemberDetails() {
        Id userId = UserInfo.getUserId();
        List<User> users = [
            SELECT Id, ContactId, Contact.AccountId
            FROM User WHERE Id = :userId LIMIT 1
        ];
        if (users.isEmpty()) return null;
        User u = users[0];
        if (u.ContactId == null || u.Contact.AccountId == null) return null;

        List<Members_Card__c> cards = [
            SELECT Id, Name, Member_Number__c, Barcode__c,
                   Account__c, Contact__c, Start_Date__c, Expiry_Date__c
            FROM Members_Card__c
            WHERE Account__c = :u.Contact.AccountId
            ORDER BY CreatedDate DESC LIMIT 1
        ];
        return cards.isEmpty() ? null : cards[0];
    }
}