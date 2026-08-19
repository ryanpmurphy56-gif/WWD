/**
 * CRUD + guest-facing reads for a site's portfolio items (F8b CMS collection).
 * Same shape as WebsuiteBlogController: items live as
 * Websuite_Portfolio_Item__c records, not inside SiteConfig JSON, so a
 * portfolioList section renders live.
 *
 * getPortfolioItems()       — every item for a site (editor's manager).
 * savePortfolioItem()       — insert (itemId blank) or update (itemId set).
 * deletePortfolioItem()     — remove one item.
 * getActivePortfolioItems() — active-only read, for sectionPortfolioList's live render.
 */
public with sharing class WebsuitePortfolioController {
    @AuraEnabled(cacheable=true)
    public static List<PortfolioItemView> getPortfolioItems(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<PortfolioItemView> views = new List<PortfolioItemView>();
        for (Websuite_Portfolio_Item__c i : [
            SELECT Id, Name, Category__c, Description__c, Image_Asset_Id__c, Image_Url__c, Project_Url__c, Is_Active__c
            FROM Websuite_Portfolio_Item__c
            WHERE Website_Site__c = :siteId
            WITH USER_MODE
            ORDER BY CreatedDate DESC
        ]) {
            views.add(toView(i));
        }
        return views;
    }

    @AuraEnabled(cacheable=true)
    public static List<PortfolioItemView> getActivePortfolioItems(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<PortfolioItemView> views = new List<PortfolioItemView>();
        for (Websuite_Portfolio_Item__c i : [
            SELECT Id, Name, Category__c, Description__c, Image_Asset_Id__c, Image_Url__c, Project_Url__c, Is_Active__c
            FROM Websuite_Portfolio_Item__c
            WHERE Website_Site__c = :siteId AND Is_Active__c = true
            WITH USER_MODE
            ORDER BY CreatedDate DESC
        ]) {
            views.add(toView(i));
        }
        return views;
    }

    @AuraEnabled
    public static Id savePortfolioItem(
        Id siteId,
        Id itemId,
        String title,
        String category,
        String description,
        String imageAssetId,
        String imageUrl,
        String projectUrl,
        Boolean isActive
    ) {
        if (siteId == null || String.isBlank(title)) {
            throw new AuraHandledException('A site and a title are required.');
        }
        Websuite_Portfolio_Item__c i = new Websuite_Portfolio_Item__c(
            Id = itemId,
            Website_Site__c = siteId,
            Name = title.trim().left(80),
            Category__c = category,
            Description__c = description,
            Image_Asset_Id__c = imageAssetId,
            Image_Url__c = imageUrl,
            Project_Url__c = projectUrl,
            Is_Active__c = isActive != false
        );
        Boolean isNew = itemId == null;
        if (isNew && !Schema.sObjectType.Websuite_Portfolio_Item__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to create portfolio items.');
        }
        if (!isNew && !Schema.sObjectType.Websuite_Portfolio_Item__c.isUpdateable()) {
            throw new AuraHandledException('You do not have permission to edit portfolio items.');
        }
        try {
            upsert i;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
        return i.Id;
    }

    @AuraEnabled
    public static void deletePortfolioItem(Id itemId) {
        if (itemId == null) {
            throw new AuraHandledException('A portfolio item is required.');
        }
        if (!Schema.sObjectType.Websuite_Portfolio_Item__c.isDeletable()) {
            throw new AuraHandledException('You do not have permission to delete portfolio items.');
        }
        try {
            delete new Websuite_Portfolio_Item__c(Id = itemId);
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    private static PortfolioItemView toView(Websuite_Portfolio_Item__c i) {
        PortfolioItemView v = new PortfolioItemView();
        v.id = i.Id;
        v.title = i.Name;
        v.category = i.Category__c;
        v.description = i.Description__c;
        v.imageAssetId = i.Image_Asset_Id__c;
        v.imageUrl = i.Image_Url__c;
        v.projectUrl = i.Project_Url__c;
        v.isActive = i.Is_Active__c;
        return v;
    }

    public class PortfolioItemView {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String title;
        @AuraEnabled
        public String category;
        @AuraEnabled
        public String description;
        @AuraEnabled
        public String imageAssetId;
        @AuraEnabled
        public String imageUrl;
        @AuraEnabled
        public String projectUrl;
        @AuraEnabled
        public Boolean isActive;
    }
}