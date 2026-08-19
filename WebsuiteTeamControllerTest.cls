@isTest
private class WebsuiteTeamControllerTest {
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wteam',
            Email = 'websuite.team.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.team.tester.' + System.now().getTime() + '@example.com.wstest'
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
    static void saveTeamMemberInsertsAndUpdates() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Team site');

            Test.startTest();
            Id memberId = WebsuiteTeamController.saveTeamMember(siteId, null, 'Alex Morgan', 'Founder', 'Started this to do things properly.', null, null, null, false);
            Test.stopTest();

            System.assertNotEquals(null, memberId, 'Member created');
            Websuite_Team_Member__c saved = [SELECT Name, Role__c, Is_Active__c FROM Websuite_Team_Member__c WHERE Id = :memberId];
            System.assertEquals('Alex Morgan', saved.Name, 'Name persisted');
            System.assertEquals('Founder', saved.Role__c, 'Role persisted');
            System.assertEquals(false, saved.Is_Active__c, 'Starts inactive');

            WebsuiteTeamController.saveTeamMember(siteId, memberId, 'Alex Morgan (edited)', 'CEO', 'Started this to do things properly.', null, null, null, true);
            Websuite_Team_Member__c updated = [SELECT Name, Role__c, Is_Active__c FROM Websuite_Team_Member__c WHERE Id = :memberId];
            System.assertEquals('Alex Morgan (edited)', updated.Name, 'Name updated in place, not duplicated');
            System.assertEquals('CEO', updated.Role__c, 'Role updated');
            System.assertEquals(true, updated.Is_Active__c, 'Now active');
        }
    }

    @isTest
    static void saveTeamMemberRejectsMissingRequiredFields() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Reject site');
            Boolean threw = false;
            try {
                WebsuiteTeamController.saveTeamMember(siteId, null, '', 'Role', '', null, null, null, false);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Blank name is rejected');
        }
    }

    @isTest
    static void getTeamMembersReturnsAllRegardlessOfActiveStatus() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('List site');
            WebsuiteTeamController.saveTeamMember(siteId, null, 'Inactive person', 'Role', '', null, null, null, false);
            WebsuiteTeamController.saveTeamMember(siteId, null, 'Active person', 'Role', '', null, null, null, true);

            Test.startTest();
            List<WebsuiteTeamController.TeamMemberView> all = WebsuiteTeamController.getTeamMembers(siteId);
            Test.stopTest();

            System.assertEquals(2, all.size(), 'Both active and inactive members listed');
        }
    }

    @isTest
    static void getActiveTeamMembersOnlyReturnsActive() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Active site');
            WebsuiteTeamController.saveTeamMember(siteId, null, 'Inactive person', 'Role', '', null, null, null, false);
            WebsuiteTeamController.saveTeamMember(siteId, null, 'Active person', 'Role', '', null, null, null, true);

            Test.startTest();
            List<WebsuiteTeamController.TeamMemberView> active = WebsuiteTeamController.getActiveTeamMembers(siteId);
            Test.stopTest();

            System.assertEquals(1, active.size(), 'Only the active member is returned');
            System.assertEquals('Active person', active[0].name, 'It is the active one');
        }
    }

    @isTest
    static void getActiveTeamMembersDoesNotLeakOtherSites() {
        User u = buildUser();
        System.runAs(u) {
            Id siteA = buildSite('Site A');
            Id siteB = buildSite('Site B');
            WebsuiteTeamController.saveTeamMember(siteA, null, 'Person A', 'Role', '', null, null, null, true);
            WebsuiteTeamController.saveTeamMember(siteB, null, 'Person B', 'Role', '', null, null, null, true);

            List<WebsuiteTeamController.TeamMemberView> forA = WebsuiteTeamController.getActiveTeamMembers(siteA);
            System.assertEquals(1, forA.size(), 'Only site A\'s member returned');
            System.assertEquals('Person A', forA[0].name, 'Correct member');
        }
    }

    @isTest
    static void deleteTeamMemberRemovesRecord() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = buildSite('Delete site');
            Id memberId = WebsuiteTeamController.saveTeamMember(siteId, null, 'Temp', 'Role', '', null, null, null, false);

            Test.startTest();
            WebsuiteTeamController.deleteTeamMember(memberId);
            Test.stopTest();

            List<Websuite_Team_Member__c> remaining = [SELECT Id FROM Websuite_Team_Member__c WHERE Id = :memberId];
            System.assertEquals(0, remaining.size(), 'Member deleted');
        }
    }

    @isTest
    static void deleteTeamMemberRejectsMissingId() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteTeamController.deleteTeamMember(null);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Null id is rejected');
        }
    }
}