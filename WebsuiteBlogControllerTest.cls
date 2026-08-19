@isTest
private class WebsuiteBlogControllerTest {
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wblog',
            Email = 'websuite.blog.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.blog.tester.' + System.now().getTime() + '@example.com.wstest'
        );
        insert u;
        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Websuite_Command_Center' LIMIT 1];
        insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id);
        return u;
    }

    private static Id buildSite(String name) {
        return WebsuiteSiteController.createSite(
            name,
            '{"siteId":"abc","meta":{"businessName":"' + name + '"},"pages":[]}'
        );
    }

    @isTest
    static void savePostInsertsAndUpdates() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Blog site');

            Test.startTest();
            Id postId = WebsuiteBlogController.savePost(siteId, null, 'First post', 'first-post', 'A summary', 'Body text', null, null, false);
            Test.stopTest();

            System.assertNotEquals(null, postId, 'Post created');
            Websuite_Blog_Post__c saved = [SELECT Name, Slug__c, Is_Published__c FROM Websuite_Blog_Post__c WHERE Id = :postId];
            System.assertEquals('First post', saved.Name, 'Title persisted as Name');
            System.assertEquals('first-post', saved.Slug__c, 'Slug persisted');
            System.assertEquals(false, saved.Is_Published__c, 'Starts unpublished');

            WebsuiteBlogController.savePost(siteId, postId, 'First post (edited)', 'first-post', 'A summary', 'Body text', null, null, true);
            Websuite_Blog_Post__c updated = [SELECT Name, Is_Published__c, Published_At__c FROM Websuite_Blog_Post__c WHERE Id = :postId];
            System.assertEquals('First post (edited)', updated.Name, 'Title updated in place, not duplicated');
            System.assertEquals(true, updated.Is_Published__c, 'Now published');
            System.assertNotEquals(null, updated.Published_At__c, 'Publish timestamp stamped');
        }
    }

    @isTest
    static void savePostRejectsMissingRequiredFields() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Reject site');
            Boolean threw = false;
            try {
                WebsuiteBlogController.savePost(siteId, null, '', 'slug', '', '', null, null, false);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Blank title is rejected');
        }
    }

    @isTest
    static void getPostsReturnsAllRegardlessOfPublishStatus() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('List site');
            WebsuiteBlogController.savePost(siteId, null, 'Draft', 'draft', '', '', null, null, false);
            WebsuiteBlogController.savePost(siteId, null, 'Live', 'live', '', '', null, null, true);

            Test.startTest();
            List<WebsuiteBlogController.PostView> all = WebsuiteBlogController.getPosts(siteId);
            Test.stopTest();

            System.assertEquals(2, all.size(), 'Both draft and published posts listed');
        }
    }

    @isTest
    static void getPublishedPostsOnlyReturnsPublished() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Published site');
            WebsuiteBlogController.savePost(siteId, null, 'Draft', 'draft', '', '', null, null, false);
            WebsuiteBlogController.savePost(siteId, null, 'Live', 'live', '', '', null, null, true);

            Test.startTest();
            List<WebsuiteBlogController.PostView> published = WebsuiteBlogController.getPublishedPosts(siteId);
            Test.stopTest();

            System.assertEquals(1, published.size(), 'Only the published post is returned');
            System.assertEquals('Live', published[0].title, 'It is the published one');
        }
    }

    @isTest
    static void getPublishedPostsDoesNotLeakOtherSites() {
        User u = buildUser();
        System.runAs(u) {
            Id siteA = buildSite('Site A');
            Id siteB = buildSite('Site B');
            WebsuiteBlogController.savePost(siteA, null, 'A post', 'a-post', '', '', null, null, true);
            WebsuiteBlogController.savePost(siteB, null, 'B post', 'b-post', '', '', null, null, true);

            List<WebsuiteBlogController.PostView> forA = WebsuiteBlogController.getPublishedPosts(siteA);
            System.assertEquals(1, forA.size(), 'Only site A\'s post returned');
            System.assertEquals('A post', forA[0].title, 'Correct post');
        }
    }

    @isTest
    static void deletePostRemovesRecord() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Delete site');
            Id postId = WebsuiteBlogController.savePost(siteId, null, 'Temp', 'temp', '', '', null, null, false);

            Test.startTest();
            WebsuiteBlogController.deletePost(postId);
            Test.stopTest();

            List<Websuite_Blog_Post__c> remaining = [SELECT Id FROM Websuite_Blog_Post__c WHERE Id = :postId];
            System.assertEquals(0, remaining.size(), 'Post deleted');
        }
    }

    @isTest
    static void deletePostRejectsMissingId() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteBlogController.deletePost(null);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Null id is rejected');
        }
    }
}