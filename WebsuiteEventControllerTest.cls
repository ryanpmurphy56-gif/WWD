@isTest
private class WebsuiteEventControllerTest {
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wevent',
            Email = 'websuite.event.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.event.tester.' + System.now().getTime() + '@example.com.wstest'
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
    static void saveEventInsertsAndUpdates() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Event site');
            DateTime eventWhen = DateTime.now().addDays(7);

            Test.startTest();
            Id eventId = WebsuiteEventController.saveEvent(siteId, null, 'Launch party', 'Come celebrate.', eventWhen, 'The venue', null, null, null, false);
            Test.stopTest();

            System.assertNotEquals(null, eventId, 'Event created');
            Websuite_Event__c saved = [SELECT Name, Location__c, Is_Active__c FROM Websuite_Event__c WHERE Id = :eventId];
            System.assertEquals('Launch party', saved.Name, 'Title persisted as Name');
            System.assertEquals('The venue', saved.Location__c, 'Location persisted');
            System.assertEquals(false, saved.Is_Active__c, 'Starts inactive');

            WebsuiteEventController.saveEvent(siteId, eventId, 'Launch party (edited)', 'Come celebrate.', eventWhen, 'The venue', null, null, null, true);
            Websuite_Event__c updated = [SELECT Name, Is_Active__c FROM Websuite_Event__c WHERE Id = :eventId];
            System.assertEquals('Launch party (edited)', updated.Name, 'Title updated in place, not duplicated');
            System.assertEquals(true, updated.Is_Active__c, 'Now active');
        }
    }

    @isTest
    static void saveEventRejectsMissingRequiredFields() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Reject site');
            Boolean threw = false;
            try {
                WebsuiteEventController.saveEvent(siteId, null, '', 'desc', null, 'loc', null, null, null, false);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Blank title is rejected');
        }
    }

    @isTest
    static void getEventsReturnsAllRegardlessOfActiveStatusOrderedByDate() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('List site');
            DateTime later = DateTime.now().addDays(30);
            DateTime sooner = DateTime.now().addDays(5);
            WebsuiteEventController.saveEvent(siteId, null, 'Later event', '', later, '', null, null, null, false);
            WebsuiteEventController.saveEvent(siteId, null, 'Sooner event', '', sooner, '', null, null, null, true);

            Test.startTest();
            List<WebsuiteEventController.EventView> all = WebsuiteEventController.getEvents(siteId);
            Test.stopTest();

            System.assertEquals(2, all.size(), 'Both active and inactive events listed');
            System.assertEquals('Sooner event', all[0].title, 'Sooner event sorts first');
        }
    }

    @isTest
    static void getActiveEventsOnlyReturnsActive() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Active site');
            DateTime eventWhen = DateTime.now().addDays(5);
            WebsuiteEventController.saveEvent(siteId, null, 'Inactive event', '', eventWhen, '', null, null, null, false);
            WebsuiteEventController.saveEvent(siteId, null, 'Active event', '', eventWhen, '', null, null, null, true);

            Test.startTest();
            List<WebsuiteEventController.EventView> active = WebsuiteEventController.getActiveEvents(siteId);
            Test.stopTest();

            System.assertEquals(1, active.size(), 'Only the active event is returned');
            System.assertEquals('Active event', active[0].title, 'It is the active one');
        }
    }

    @isTest
    static void getActiveEventsDoesNotLeakOtherSites() {
        User u = buildUser();
        System.runAs(u) {
            Id siteA = buildSite('Site A');
            Id siteB = buildSite('Site B');
            DateTime eventWhen = DateTime.now().addDays(5);
            WebsuiteEventController.saveEvent(siteA, null, 'Event A', '', eventWhen, '', null, null, null, true);
            WebsuiteEventController.saveEvent(siteB, null, 'Event B', '', eventWhen, '', null, null, null, true);

            List<WebsuiteEventController.EventView> forA = WebsuiteEventController.getActiveEvents(siteA);
            System.assertEquals(1, forA.size(), 'Only site A\'s event returned');
            System.assertEquals('Event A', forA[0].title, 'Correct event');
        }
    }

    @isTest
    static void deleteEventRemovesRecord() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Delete site');
            Id eventId = WebsuiteEventController.saveEvent(siteId, null, 'Temp', '', null, '', null, null, null, false);

            Test.startTest();
            WebsuiteEventController.deleteEvent(eventId);
            Test.stopTest();

            List<Websuite_Event__c> remaining = [SELECT Id FROM Websuite_Event__c WHERE Id = :eventId];
            System.assertEquals(0, remaining.size(), 'Event deleted');
        }
    }

    @isTest
    static void deleteEventRejectsMissingId() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteEventController.deleteEvent(null);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Null id is rejected');
        }
    }
}