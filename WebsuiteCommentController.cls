/**
 * F10 collaboration basics: a site-level note/comment thread for a Websuite
 * editor team. Deliberately site-level rather than pinned to a section —
 * per-section pinning was scoped down for time (see the build map).
 */
public with sharing class WebsuiteCommentController {
    @AuraEnabled(cacheable=true)
    public static List<CommentView> getComments(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<CommentView> views = new List<CommentView>();
        for (Websuite_Site_Comment__c c : [
            SELECT Id, Body__c, Author_Name__c, Resolved__c, CreatedDate
            FROM Websuite_Site_Comment__c
            WHERE Website_Site__c = :siteId
            WITH USER_MODE
            ORDER BY CreatedDate DESC
        ]) {
            views.add(toView(c));
        }
        return views;
    }

    @AuraEnabled
    public static Id addComment(Id siteId, String body) {
        if (siteId == null || String.isBlank(body)) {
            throw new AuraHandledException('A site and a comment body are required.');
        }
        if (!Schema.sObjectType.Websuite_Site_Comment__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to add comments.');
        }
        Websuite_Site_Comment__c c = new Websuite_Site_Comment__c(
            Website_Site__c = siteId,
            Body__c = body,
            Author_Name__c = UserInfo.getName()
        );
        try {
            insert c;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
        return c.Id;
    }

    @AuraEnabled
    public static void setResolved(Id commentId, Boolean resolved) {
        if (commentId == null) {
            throw new AuraHandledException('A comment is required.');
        }
        if (!Schema.sObjectType.Websuite_Site_Comment__c.isUpdateable()) {
            throw new AuraHandledException('You do not have permission to edit comments.');
        }
        try {
            update new Websuite_Site_Comment__c(Id = commentId, Resolved__c = resolved == true);
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static void deleteComment(Id commentId) {
        if (commentId == null) {
            throw new AuraHandledException('A comment is required.');
        }
        if (!Schema.sObjectType.Websuite_Site_Comment__c.isDeletable()) {
            throw new AuraHandledException('You do not have permission to delete comments.');
        }
        try {
            delete new Websuite_Site_Comment__c(Id = commentId);
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    private static CommentView toView(Websuite_Site_Comment__c c) {
        CommentView v = new CommentView();
        v.id = c.Id;
        v.body = c.Body__c;
        v.authorName = c.Author_Name__c;
        v.resolved = c.Resolved__c;
        v.createdAt = c.CreatedDate;
        return v;
    }

    public class CommentView {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String body;
        @AuraEnabled
        public String authorName;
        @AuraEnabled
        public Boolean resolved;
        @AuraEnabled
        public DateTime createdAt;
    }
}