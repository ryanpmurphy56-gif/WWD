/**
 * CRUD + guest-facing reads for a site's testimonials (F8b CMS collection).
 * Same shape as WebsuiteBlogController: testimonials live as
 * Websuite_Testimonial__c records, not inside SiteConfig JSON, so a
 * testimonialList section renders live.
 *
 * getTestimonials()       — every testimonial for a site (editor's manager).
 * saveTestimonial()       — insert (testimonialId blank) or update (set).
 * deleteTestimonial()     — remove one testimonial.
 * getActiveTestimonials() — active-only read, for sectionTestimonialList's live render.
 */
public with sharing class WebsuiteTestimonialController {
    @AuraEnabled(cacheable=true)
    public static List<TestimonialView> getTestimonials(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<TestimonialView> views = new List<TestimonialView>();
        for (Websuite_Testimonial__c t : [
            SELECT Id, Name, Quote__c, Role_Company__c, Photo_Asset_Id__c, Photo_Url__c, Is_Active__c
            FROM Websuite_Testimonial__c
            WHERE Website_Site__c = :siteId
            WITH USER_MODE
            ORDER BY CreatedDate DESC
        ]) {
            views.add(toView(t));
        }
        return views;
    }

    @AuraEnabled(cacheable=true)
    public static List<TestimonialView> getActiveTestimonials(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<TestimonialView> views = new List<TestimonialView>();
        for (Websuite_Testimonial__c t : [
            SELECT Id, Name, Quote__c, Role_Company__c, Photo_Asset_Id__c, Photo_Url__c, Is_Active__c
            FROM Websuite_Testimonial__c
            WHERE Website_Site__c = :siteId AND Is_Active__c = true
            WITH USER_MODE
            ORDER BY CreatedDate DESC
        ]) {
            views.add(toView(t));
        }
        return views;
    }

    @AuraEnabled
    public static Id saveTestimonial(
        Id siteId,
        Id testimonialId,
        String authorName,
        String quote,
        String roleCompany,
        String photoAssetId,
        String photoUrl,
        Boolean isActive
    ) {
        if (siteId == null || String.isBlank(authorName) || String.isBlank(quote)) {
            throw new AuraHandledException('A site, author name and quote are required.');
        }
        Websuite_Testimonial__c t = new Websuite_Testimonial__c(
            Id = testimonialId,
            Website_Site__c = siteId,
            Name = authorName.trim().left(80),
            Quote__c = quote,
            Role_Company__c = roleCompany,
            Photo_Asset_Id__c = photoAssetId,
            Photo_Url__c = photoUrl,
            Is_Active__c = isActive != false
        );
        Boolean isNew = testimonialId == null;
        if (isNew && !Schema.sObjectType.Websuite_Testimonial__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to create testimonials.');
        }
        if (!isNew && !Schema.sObjectType.Websuite_Testimonial__c.isUpdateable()) {
            throw new AuraHandledException('You do not have permission to edit testimonials.');
        }
        try {
            upsert t;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
        return t.Id;
    }

    @AuraEnabled
    public static void deleteTestimonial(Id testimonialId) {
        if (testimonialId == null) {
            throw new AuraHandledException('A testimonial is required.');
        }
        if (!Schema.sObjectType.Websuite_Testimonial__c.isDeletable()) {
            throw new AuraHandledException('You do not have permission to delete testimonials.');
        }
        try {
            delete new Websuite_Testimonial__c(Id = testimonialId);
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    private static TestimonialView toView(Websuite_Testimonial__c t) {
        TestimonialView v = new TestimonialView();
        v.id = t.Id;
        v.authorName = t.Name;
        v.quote = t.Quote__c;
        v.roleCompany = t.Role_Company__c;
        v.photoAssetId = t.Photo_Asset_Id__c;
        v.photoUrl = t.Photo_Url__c;
        v.isActive = t.Is_Active__c;
        return v;
    }

    public class TestimonialView {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String authorName;
        @AuraEnabled
        public String quote;
        @AuraEnabled
        public String roleCompany;
        @AuraEnabled
        public String photoAssetId;
        @AuraEnabled
        public String photoUrl;
        @AuraEnabled
        public Boolean isActive;
    }
}