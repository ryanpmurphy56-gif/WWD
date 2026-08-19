/**
 * Backs the Command Center's "For Review" tab — the manual publish gate.
 * Customers submit a draft for review (WebsiteSiteController.submitForReview,
 * which only sets Review_Status__c/Submitted_At__c); approveSite() below is
 * the ONLY place in the org that flips Is_Published__c true. Kept as its own
 * class (rather than adding methods to WebsuiteSiteController) so the
 * reviewer permission set's Apex class access grant is scoped to just the
 * review actions, separate from the customer-facing editor's create/save/load.
 */
public with sharing class WebsuiteReviewController {
    /** Sites awaiting review, oldest submission first. */
    @AuraEnabled(cacheable=true)
    public static List<ReviewQueueItem> getPendingReview() {
        List<ReviewQueueItem> items = new List<ReviewQueueItem>();
        for (Website_Site__c s : [
            SELECT Id, Name, Submitted_At__c, Contact__r.Name, Contact__r.Account.Name
            FROM Website_Site__c
            WHERE Review_Status__c = 'Pending Review'
            WITH USER_MODE
            ORDER BY Submitted_At__c ASC NULLS LAST
        ]) {
            ReviewQueueItem item = new ReviewQueueItem();
            item.id = s.Id;
            item.name = s.Name;
            item.submittedAt = s.Submitted_At__c;
            item.contactName = s.Contact__r != null ? s.Contact__r.Name : null;
            item.companyName = (s.Contact__r != null && s.Contact__r.Account != null)
                ? s.Contact__r.Account.Name
                : null;
            items.add(item);
        }
        return items;
    }

    /**
     * Full draft config for one site, for the reviewer's preview. This is the
     * one place outside the editor itself allowed to read Config__c regardless
     * of publish state — gated to the reviewer permission set, never granted
     * to the guest/public profile (see WebsuitePublicSiteController, which is
     * deliberately kept separate and Published_Config__c-only for that reason).
     */
    @AuraEnabled(cacheable=true)
    public static ReviewSiteView getSiteForReview(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site record is required.');
        }
        List<Website_Site__c> sites = [
            SELECT Id, Name, Config__c, Review_Status__c, Submitted_At__c, Domain__c, Review_Notes__c
            FROM Website_Site__c
            WHERE Id = :siteId
            WITH USER_MODE
            LIMIT 1
        ];
        if (sites.isEmpty()) {
            throw new AuraHandledException('That site could not be found.');
        }
        ReviewSiteView v = new ReviewSiteView();
        v.id = sites[0].Id;
        v.name = sites[0].Name;
        v.config = sites[0].Config__c;
        v.reviewStatus = sites[0].Review_Status__c;
        v.submittedAt = sites[0].Submitted_At__c;
        v.domain = sites[0].Domain__c;
        v.reviewNotes = sites[0].Review_Notes__c;
        return v;
    }

    /**
     * Approve: copies the reviewed draft into Published_Config__c, flips
     * Is_Published__c, snapshots a Website_Site_Version__c row (same history
     * mechanism the old direct-publish flow used), records the domain the
     * reviewer set up and who approved it, and resets Review_Status__c so the
     * next edit needs its own submission.
     */
    @AuraEnabled
    public static PublishResult approveSite(Id siteId, String domain, String notes) {
        if (siteId == null) {
            throw new AuraHandledException('A site record is required.');
        }
        if (!Schema.sObjectType.Website_Site__c.isUpdateable() || !Schema.sObjectType.Website_Site_Version__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to approve sites.');
        }
        List<Website_Site__c> sites = [
            SELECT Id, Config__c
            FROM Website_Site__c
            WHERE Id = :siteId
            WITH USER_MODE
            LIMIT 1
        ];
        if (sites.isEmpty()) {
            throw new AuraHandledException('That site could not be found.');
        }
        if (String.isBlank(sites[0].Config__c)) {
            throw new AuraHandledException('Nothing to publish yet.');
        }
        DateTime now = DateTime.now();
        try {
            update new Website_Site__c(
                Id = siteId,
                Published_Config__c = sites[0].Config__c,
                Is_Published__c = true,
                Published_At__c = now,
                Domain__c = String.isBlank(domain) ? null : domain.trim(),
                Review_Status__c = 'Not Submitted',
                Review_Notes__c = notes,
                Reviewed_By__c = UserInfo.getUserId(),
                Reviewed_At__c = now
            );
            insert new Website_Site_Version__c(
                Website_Site__c = siteId,
                Snapshot_Config__c = sites[0].Config__c,
                Published_At__c = now
            );
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
        PublishResult result = new PublishResult();
        result.publishedAt = now;
        return result;
    }

    /**
     * Sends a site back to the customer without publishing. Is_Published__c
     * and Published_Config__c are left untouched — if the site was already
     * live, it stays live on its last-approved version while the new draft
     * gets reworked.
     */
    @AuraEnabled
    public static void rejectSite(Id siteId, String notes) {
        if (siteId == null) {
            throw new AuraHandledException('A site record is required.');
        }
        if (!Schema.sObjectType.Website_Site__c.isUpdateable()) {
            throw new AuraHandledException('You do not have permission to review sites.');
        }
        try {
            update new Website_Site__c(
                Id = siteId,
                Review_Status__c = 'Changes Requested',
                Review_Notes__c = notes,
                Reviewed_By__c = UserInfo.getUserId(),
                Reviewed_At__c = DateTime.now()
            );
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    /** One row in the review queue table. */
    public class ReviewQueueItem {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String name;
        @AuraEnabled
        public DateTime submittedAt;
        @AuraEnabled
        public String contactName;
        @AuraEnabled
        public String companyName;
    }

    /** Full detail for the reviewer's preview panel. */
    public class ReviewSiteView {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String name;
        @AuraEnabled
        public String config;
        @AuraEnabled
        public String reviewStatus;
        @AuraEnabled
        public DateTime submittedAt;
        @AuraEnabled
        public String domain;
        @AuraEnabled
        public String reviewNotes;
    }

    public class PublishResult {
        @AuraEnabled
        public DateTime publishedAt;
    }
}
