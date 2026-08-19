/**
 * CRUD + guest-facing reads for a site's Shop products (F13, scoped down —
 * see Websuite_Product__c's description for why there's no cart/checkout
 * here: the org's existing commerce stack is single-tenant, built for one
 * specific store, not reusable per Websuite site).
 *
 * getProducts()       — every product for a site (editor's product manager).
 * saveProduct()       — insert (productId blank) or update (productId set).
 * deleteProduct()     — remove one product.
 * getActiveProducts() — active-only read, for sectionShop's live render.
 */
public with sharing class WebsuiteProductController {
    @AuraEnabled(cacheable=true)
    public static List<ProductView> getProducts(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<ProductView> views = new List<ProductView>();
        for (Websuite_Product__c p : [
            SELECT Id, Name, Price__c, Description__c, Image_Asset_Id__c, Image_Url__c, Buy_Link__c, Is_Active__c
            FROM Websuite_Product__c
            WHERE Website_Site__c = :siteId
            WITH USER_MODE
            ORDER BY CreatedDate DESC
        ]) {
            views.add(toView(p));
        }
        return views;
    }

    @AuraEnabled(cacheable=true)
    public static List<ProductView> getActiveProducts(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<ProductView> views = new List<ProductView>();
        for (Websuite_Product__c p : [
            SELECT Id, Name, Price__c, Description__c, Image_Asset_Id__c, Image_Url__c, Buy_Link__c, Is_Active__c
            FROM Websuite_Product__c
            WHERE Website_Site__c = :siteId AND Is_Active__c = true
            WITH USER_MODE
            ORDER BY CreatedDate DESC
        ]) {
            views.add(toView(p));
        }
        return views;
    }

    @AuraEnabled
    public static Id saveProduct(
        Id siteId,
        Id productId,
        String name,
        Decimal price,
        String description,
        String imageAssetId,
        String imageUrl,
        String buyLink,
        Boolean isActive
    ) {
        if (siteId == null || String.isBlank(name)) {
            throw new AuraHandledException('A site and a name are required.');
        }
        Websuite_Product__c p = new Websuite_Product__c(
            Id = productId,
            Website_Site__c = siteId,
            Name = name.trim().left(80),
            Price__c = price,
            Description__c = description,
            Image_Asset_Id__c = imageAssetId,
            Image_Url__c = imageUrl,
            Buy_Link__c = buyLink,
            Is_Active__c = isActive != false
        );
        Boolean isNew = productId == null;
        if (isNew && !Schema.sObjectType.Websuite_Product__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to create products.');
        }
        if (!isNew && !Schema.sObjectType.Websuite_Product__c.isUpdateable()) {
            throw new AuraHandledException('You do not have permission to edit products.');
        }
        try {
            upsert p;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
        return p.Id;
    }

    @AuraEnabled
    public static void deleteProduct(Id productId) {
        if (productId == null) {
            throw new AuraHandledException('A product is required.');
        }
        if (!Schema.sObjectType.Websuite_Product__c.isDeletable()) {
            throw new AuraHandledException('You do not have permission to delete products.');
        }
        try {
            delete new Websuite_Product__c(Id = productId);
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    private static ProductView toView(Websuite_Product__c p) {
        ProductView v = new ProductView();
        v.id = p.Id;
        v.name = p.Name;
        v.price = p.Price__c;
        v.description = p.Description__c;
        v.imageAssetId = p.Image_Asset_Id__c;
        v.imageUrl = p.Image_Url__c;
        v.buyLink = p.Buy_Link__c;
        v.isActive = p.Is_Active__c;
        return v;
    }

    public class ProductView {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String name;
        @AuraEnabled
        public Decimal price;
        @AuraEnabled
        public String description;
        @AuraEnabled
        public String imageAssetId;
        @AuraEnabled
        public String imageUrl;
        @AuraEnabled
        public String buyLink;
        @AuraEnabled
        public Boolean isActive;
    }
}