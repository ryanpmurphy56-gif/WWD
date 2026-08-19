/**
 * CRUD + guest-facing reads for a site's team members (F8b CMS collection).
 * Same shape as WebsuiteBlogController: members live as Websuite_Team_Member__c
 * records, not inside SiteConfig JSON, so a teamList section renders live.
 *
 * getTeamMembers()       — every member for a site (editor's team manager).
 * saveTeamMember()       — insert (memberId blank) or update (memberId set).
 * deleteTeamMember()     — remove one member.
 * getActiveTeamMembers() — active-only read, for sectionTeamList's live render.
 */
public with sharing class WebsuiteTeamController {
    @AuraEnabled(cacheable=true)
    public static List<TeamMemberView> getTeamMembers(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<TeamMemberView> views = new List<TeamMemberView>();
        for (Websuite_Team_Member__c m : [
            SELECT Id, Name, Role__c, Bio__c, Photo_Asset_Id__c, Photo_Url__c, Linkedin_Url__c, Is_Active__c
            FROM Websuite_Team_Member__c
            WHERE Website_Site__c = :siteId
            WITH USER_MODE
            ORDER BY CreatedDate DESC
        ]) {
            views.add(toView(m));
        }
        return views;
    }

    @AuraEnabled(cacheable=true)
    public static List<TeamMemberView> getActiveTeamMembers(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<TeamMemberView> views = new List<TeamMemberView>();
        for (Websuite_Team_Member__c m : [
            SELECT Id, Name, Role__c, Bio__c, Photo_Asset_Id__c, Photo_Url__c, Linkedin_Url__c, Is_Active__c
            FROM Websuite_Team_Member__c
            WHERE Website_Site__c = :siteId AND Is_Active__c = true
            WITH USER_MODE
            ORDER BY CreatedDate DESC
        ]) {
            views.add(toView(m));
        }
        return views;
    }

    @AuraEnabled
    public static Id saveTeamMember(
        Id siteId,
        Id memberId,
        String name,
        String role,
        String bio,
        String photoAssetId,
        String photoUrl,
        String linkedinUrl,
        Boolean isActive
    ) {
        if (siteId == null || String.isBlank(name)) {
            throw new AuraHandledException('A site and a name are required.');
        }
        Websuite_Team_Member__c m = new Websuite_Team_Member__c(
            Id = memberId,
            Website_Site__c = siteId,
            Name = name.trim().left(80),
            Role__c = role,
            Bio__c = bio,
            Photo_Asset_Id__c = photoAssetId,
            Photo_Url__c = photoUrl,
            Linkedin_Url__c = linkedinUrl,
            Is_Active__c = isActive != false
        );
        Boolean isNew = memberId == null;
        if (isNew && !Schema.sObjectType.Websuite_Team_Member__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to create team members.');
        }
        if (!isNew && !Schema.sObjectType.Websuite_Team_Member__c.isUpdateable()) {
            throw new AuraHandledException('You do not have permission to edit team members.');
        }
        try {
            upsert m;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
        return m.Id;
    }

    @AuraEnabled
    public static void deleteTeamMember(Id memberId) {
        if (memberId == null) {
            throw new AuraHandledException('A team member is required.');
        }
        if (!Schema.sObjectType.Websuite_Team_Member__c.isDeletable()) {
            throw new AuraHandledException('You do not have permission to delete team members.');
        }
        try {
            delete new Websuite_Team_Member__c(Id = memberId);
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    private static TeamMemberView toView(Websuite_Team_Member__c m) {
        TeamMemberView v = new TeamMemberView();
        v.id = m.Id;
        v.name = m.Name;
        v.role = m.Role__c;
        v.bio = m.Bio__c;
        v.photoAssetId = m.Photo_Asset_Id__c;
        v.photoUrl = m.Photo_Url__c;
        v.linkedinUrl = m.Linkedin_Url__c;
        v.isActive = m.Is_Active__c;
        return v;
    }

    public class TeamMemberView {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String name;
        @AuraEnabled
        public String role;
        @AuraEnabled
        public String bio;
        @AuraEnabled
        public String photoAssetId;
        @AuraEnabled
        public String photoUrl;
        @AuraEnabled
        public String linkedinUrl;
        @AuraEnabled
        public Boolean isActive;
    }
}