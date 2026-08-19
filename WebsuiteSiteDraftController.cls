/**
 * Backs the layout engine (websuiteWizard -> siteEditorShell).
 *
 * Editor visitors are unauthenticated guests with no user record, so drafts
 * are keyed by a client-generated token (kept in the browser's localStorage)
 * rather than by the running user.
 *
 * getDraft()  — the draft JSON for a token, or null if none saved yet.
 * saveDraft() — upserts the draft JSON for a token.
 */
public with sharing class WebsuiteSiteDraftController {
    @AuraEnabled(cacheable=true)
    public static String getDraft(String token) {
        if (String.isBlank(token)) {
            return null;
        }
        List<Websuite_Site_Draft__c> rows = [
            SELECT Draft_Payload__c
            FROM Websuite_Site_Draft__c
            WHERE Draft_Token__c = :token
            WITH USER_MODE
            LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0].Draft_Payload__c;
    }

    @AuraEnabled
    public static void saveDraft(String token, String json, String businessName) {
        if (String.isBlank(token)) {
            throw new AuraHandledException('A draft token is required.');
        }
        if (!Schema.sObjectType.Websuite_Site_Draft__c.isCreateable()
            || !Schema.sObjectType.Websuite_Site_Draft__c.isUpdateable()) {
            throw new AuraHandledException('You do not have permission to save this draft.');
        }
        Websuite_Site_Draft__c draft = new Websuite_Site_Draft__c(
            Draft_Token__c = token,
            Name = String.isBlank(businessName) ? 'Untitled draft' : businessName.trim().left(80),
            Draft_Business_Name__c = String.isBlank(businessName) ? null : businessName.trim(),
            Draft_Payload__c = json
        );
        try {
            upsert draft Draft_Token__c;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}