@isTest
private class WebsuiteTestimonialControllerTest {
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wtesti',
            Email = 'websuite.testimonial.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.testimonial.tester.' + System.now().getTime() + '@example.com.wstest'
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
    static void saveTestimonialInsertsAndUpdates() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Testimonial site');

            Test.startTest();
            Id testimonialId = WebsuiteTestimonialController.saveTestimonial(siteId, null, 'Jamie Cole', 'Genuinely the easiest thing we\'ve done all year.', 'CEO, Acme Inc', null, null, false);
            Test.stopTest();

            System.assertNotEquals(null, testimonialId, 'Testimonial created');
            Websuite_Testimonial__c saved = [SELECT Name, Role_Company__c, Is_Active__c FROM Websuite_Testimonial__c WHERE Id = :testimonialId];
            System.assertEquals('Jamie Cole', saved.Name, 'Author name persisted as Name');
            System.assertEquals('CEO, Acme Inc', saved.Role_Company__c, 'Role/company persisted');
            System.assertEquals(false, saved.Is_Active__c, 'Starts inactive');

            WebsuiteTestimonialController.saveTestimonial(siteId, testimonialId, 'Jamie Cole', 'Updated quote text.', 'CEO, Acme Inc', null, null, true);
            Websuite_Testimonial__c updated = [SELECT Quote__c, Is_Active__c FROM Websuite_Testimonial__c WHERE Id = :testimonialId];
            System.assertEquals('Updated quote text.', updated.Quote__c, 'Quote updated in place, not duplicated');
            System.assertEquals(true, updated.Is_Active__c, 'Now active');
        }
    }

    @isTest
    static void saveTestimonialRejectsMissingRequiredFields() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Reject site');
            Boolean threw = false;
            try {
                WebsuiteTestimonialController.saveTestimonial(siteId, null, '', '', 'Role', null, null, false);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Blank author name/quote is rejected');
        }
    }

    @isTest
    static void getTestimonialsReturnsAllRegardlessOfActiveStatus() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('List site');
            WebsuiteTestimonialController.saveTestimonial(siteId, null, 'Inactive person', 'Quote', 'Role', null, null, false);
            WebsuiteTestimonialController.saveTestimonial(siteId, null, 'Active person', 'Quote', 'Role', null, null, true);

            Test.startTest();
            List<WebsuiteTestimonialController.TestimonialView> all = WebsuiteTestimonialController.getTestimonials(siteId);
            Test.stopTest();

            System.assertEquals(2, all.size(), 'Both active and inactive testimonials listed');
        }
    }

    @isTest
    static void getActiveTestimonialsOnlyReturnsActive() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Active site');
            WebsuiteTestimonialController.saveTestimonial(siteId, null, 'Inactive person', 'Quote', 'Role', null, null, false);
            WebsuiteTestimonialController.saveTestimonial(siteId, null, 'Active person', 'Quote', 'Role', null, null, true);

            Test.startTest();
            List<WebsuiteTestimonialController.TestimonialView> active = WebsuiteTestimonialController.getActiveTestimonials(siteId);
            Test.stopTest();

            System.assertEquals(1, active.size(), 'Only the active testimonial is returned');
            System.assertEquals('Active person', active[0].authorName, 'It is the active one');
        }
    }

    @isTest
    static void getActiveTestimonialsDoesNotLeakOtherSites() {
        User u = buildUser();
        System.runAs(u) {
            Id siteA = buildSite('Site A');
            Id siteB = buildSite('Site B');
            WebsuiteTestimonialController.saveTestimonial(siteA, null, 'Person A', 'Quote A', 'Role', null, null, true);
            WebsuiteTestimonialController.saveTestimonial(siteB, null, 'Person B', 'Quote B', 'Role', null, null, true);

            List<WebsuiteTestimonialController.TestimonialView> forA = WebsuiteTestimonialController.getActiveTestimonials(siteA);
            System.assertEquals(1, forA.size(), 'Only site A\'s testimonial returned');
            System.assertEquals('Person A', forA[0].authorName, 'Correct testimonial');
        }
    }

    @isTest
    static void deleteTestimonialRemovesRecord() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Delete site');
            Id testimonialId = WebsuiteTestimonialController.saveTestimonial(siteId, null, 'Temp', 'Quote', 'Role', null, null, false);

            Test.startTest();
            WebsuiteTestimonialController.deleteTestimonial(testimonialId);
            Test.stopTest();

            List<Websuite_Testimonial__c> remaining = [SELECT Id FROM Websuite_Testimonial__c WHERE Id = :testimonialId];
            System.assertEquals(0, remaining.size(), 'Testimonial deleted');
        }
    }

    @isTest
    static void deleteTestimonialRejectsMissingId() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteTestimonialController.deleteTestimonial(null);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Null id is rejected');
        }
    }
}