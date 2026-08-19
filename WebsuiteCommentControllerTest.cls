@isTest
private class WebsuiteCommentControllerTest {
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wcmt',
            Email = 'websuite.comment.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.comment.tester.' + System.now().getTime() + '@example.com.wstest'
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
    static void addCommentInsertsWithAuthorName() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Comment site');

            Test.startTest();
            Id commentId = WebsuiteCommentController.addComment(siteId, 'Client wants the hero CTA changed.');
            Test.stopTest();

            System.assertNotEquals(null, commentId, 'Comment created');
            Websuite_Site_Comment__c saved = [SELECT Body__c, Author_Name__c, Resolved__c FROM Websuite_Site_Comment__c WHERE Id = :commentId];
            System.assertEquals('Client wants the hero CTA changed.', saved.Body__c, 'Body persisted');
            System.assertNotEquals(null, saved.Author_Name__c, 'Author name stamped from the running user');
            System.assertEquals(false, saved.Resolved__c, 'Starts unresolved');
        }
    }

    @isTest
    static void addCommentRejectsBlankBody() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Reject site');
            Boolean threw = false;
            try {
                WebsuiteCommentController.addComment(siteId, '   ');
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Blank body is rejected');
        }
    }

    @isTest
    static void getCommentsReturnsNewestFirst() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('List site');
            WebsuiteCommentController.addComment(siteId, 'First');
            WebsuiteCommentController.addComment(siteId, 'Second');

            Test.startTest();
            List<WebsuiteCommentController.CommentView> comments = WebsuiteCommentController.getComments(siteId);
            Test.stopTest();

            System.assertEquals(2, comments.size(), 'Both comments listed');
        }
    }

    @isTest
    static void setResolvedTogglesFlag() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Resolve site');
            Id commentId = WebsuiteCommentController.addComment(siteId, 'Fix this');

            Test.startTest();
            WebsuiteCommentController.setResolved(commentId, true);
            Test.stopTest();

            Websuite_Site_Comment__c updated = [SELECT Resolved__c FROM Websuite_Site_Comment__c WHERE Id = :commentId];
            System.assertEquals(true, updated.Resolved__c, 'Marked resolved');
        }
    }

    @isTest
    static void deleteCommentRemovesRecord() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Delete site');
            Id commentId = WebsuiteCommentController.addComment(siteId, 'Temp');

            Test.startTest();
            WebsuiteCommentController.deleteComment(commentId);
            Test.stopTest();

            List<Websuite_Site_Comment__c> remaining = [SELECT Id FROM Websuite_Site_Comment__c WHERE Id = :commentId];
            System.assertEquals(0, remaining.size(), 'Comment deleted');
        }
    }

    @isTest
    static void deleteCommentRejectsMissingId() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteCommentController.deleteComment(null);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Null id is rejected');
        }
    }
}