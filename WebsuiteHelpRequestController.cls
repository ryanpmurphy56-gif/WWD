/**
 * Creates the stub "request help from a human" record behind the editor's exit
 * ramps (brief §2.1). Captures the note, the SiteConfig snapshot at the moment
 * of asking, the originating site (if saved), and which ramp raised it.
 *
 * Skeleton stand-in for a future Salesforce Lead/Case — the LWC contract stays
 * the same when that swap happens.
 */
public with sharing class WebsuiteHelpRequestController {
    @AuraEnabled
    public static Id requestHelp(Id siteId, String note, String snapshot, String source) {
        if (!Schema.sObjectType.Website_Help_Request__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to request help.');
        }
        Website_Help_Request__c req = new Website_Help_Request__c(
            Note__c = String.isBlank(note) ? null : note.trim(),
            Config_Snapshot__c = snapshot,
            Source__c = source == 'preview' ? 'preview' : 'editor',
            Site__c = siteId
        );
        try {
            insert req;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
        return req.Id;
    }
}