/**
 * CRUD + guest-facing reads for a site's blog posts (F8 CMS foundation).
 * Posts live as Websuite_Blog_Post__c records, not inside SiteConfig JSON —
 * that's the actual distinction between "content" and "CMS content" in this
 * app: a blogList section renders live from these records, so publishing a
 * new post never requires re-saving the page that shows it.
 *
 * getPosts()          — every post for a site (editor's post manager), newest first.
 * savePost()          — insert (postId blank) or update (postId set).
 * deletePost()        — remove one post.
 * getPublishedPosts() — published-only read, for sectionBlogList's live render.
 */
public with sharing class WebsuiteBlogController {
    @AuraEnabled(cacheable=true)
    public static List<PostView> getPosts(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<PostView> views = new List<PostView>();
        for (Websuite_Blog_Post__c p : [
            SELECT Id, Name, Slug__c, Excerpt__c, Body__c, Cover_Image_Asset_Id__c, Cover_Image_Url__c, Is_Published__c, Published_At__c
            FROM Websuite_Blog_Post__c
            WHERE Website_Site__c = :siteId
            WITH USER_MODE
            ORDER BY CreatedDate DESC
        ]) {
            views.add(toView(p));
        }
        return views;
    }

    @AuraEnabled(cacheable=true)
    public static List<PostView> getPublishedPosts(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<PostView> views = new List<PostView>();
        for (Websuite_Blog_Post__c p : [
            SELECT Id, Name, Slug__c, Excerpt__c, Body__c, Cover_Image_Asset_Id__c, Cover_Image_Url__c, Is_Published__c, Published_At__c
            FROM Websuite_Blog_Post__c
            WHERE Website_Site__c = :siteId AND Is_Published__c = true
            WITH USER_MODE
            ORDER BY Published_At__c DESC
        ]) {
            views.add(toView(p));
        }
        return views;
    }

    @AuraEnabled
    public static Id savePost(
        Id siteId,
        Id postId,
        String title,
        String slug,
        String excerpt,
        String body,
        String coverAssetId,
        String coverUrl,
        Boolean isPublished
    ) {
        if (siteId == null || String.isBlank(title) || String.isBlank(slug)) {
            throw new AuraHandledException('A site, title and slug are required.');
        }
        Websuite_Blog_Post__c p = new Websuite_Blog_Post__c(
            Id = postId,
            Website_Site__c = siteId,
            Name = title.trim().left(80),
            Slug__c = slug.trim().left(150),
            Excerpt__c = excerpt,
            Body__c = body,
            Cover_Image_Asset_Id__c = coverAssetId,
            Cover_Image_Url__c = coverUrl,
            Is_Published__c = isPublished == true,
            Published_At__c = isPublished == true ? DateTime.now() : null
        );
        Boolean isNew = postId == null;
        if (isNew && !Schema.sObjectType.Websuite_Blog_Post__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to create posts.');
        }
        if (!isNew && !Schema.sObjectType.Websuite_Blog_Post__c.isUpdateable()) {
            throw new AuraHandledException('You do not have permission to edit posts.');
        }
        try {
            upsert p;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
        return p.Id;
    }

    @AuraEnabled
    public static void deletePost(Id postId) {
        if (postId == null) {
            throw new AuraHandledException('A post is required.');
        }
        if (!Schema.sObjectType.Websuite_Blog_Post__c.isDeletable()) {
            throw new AuraHandledException('You do not have permission to delete posts.');
        }
        try {
            delete new Websuite_Blog_Post__c(Id = postId);
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    private static PostView toView(Websuite_Blog_Post__c p) {
        PostView v = new PostView();
        v.id = p.Id;
        v.title = p.Name;
        v.slug = p.Slug__c;
        v.excerpt = p.Excerpt__c;
        v.body = p.Body__c;
        v.coverImageAssetId = p.Cover_Image_Asset_Id__c;
        v.coverImageUrl = p.Cover_Image_Url__c;
        v.isPublished = p.Is_Published__c;
        v.publishedAt = p.Published_At__c;
        return v;
    }

    public class PostView {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String title;
        @AuraEnabled
        public String slug;
        @AuraEnabled
        public String excerpt;
        @AuraEnabled
        public String body;
        @AuraEnabled
        public String coverImageAssetId;
        @AuraEnabled
        public String coverImageUrl;
        @AuraEnabled
        public Boolean isPublished;
        @AuraEnabled
        public DateTime publishedAt;
    }
}