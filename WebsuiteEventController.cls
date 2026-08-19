/**
 * CRUD + guest-facing reads for a site's events (F8b CMS collection). Same
 * shape as WebsuiteBlogController: events live as Websuite_Event__c records,
 * not inside SiteConfig JSON, so an eventList section renders live.
 *
 * Ordered by Event_Date__c ascending (soonest first), unlike the other F8b
 * collections' CreatedDate-descending — a chronological read is the useful
 * default for a list of events. Past events are not auto-filtered out; Is_Active__c
 * is the only visibility toggle, same predictable pattern as blog/team/shop.
 *
 * getEvents()       — every event for a site (editor's event manager).
 * saveEvent()       — insert (eventId blank) or update (eventId set).
 * deleteEvent()     — remove one event.
 * getActiveEvents() — active-only read, for sectionEventList's live render.
 */
public with sharing class WebsuiteEventController {
    @AuraEnabled(cacheable=true)
    public static List<EventView> getEvents(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<EventView> views = new List<EventView>();
        for (Websuite_Event__c e : [
            SELECT Id, Name, Description__c, Event_Date__c, Location__c, Image_Asset_Id__c, Image_Url__c, Registration_Url__c, Is_Active__c
            FROM Websuite_Event__c
            WHERE Website_Site__c = :siteId
            WITH USER_MODE
            ORDER BY Event_Date__c ASC NULLS LAST
        ]) {
            views.add(toView(e));
        }
        return views;
    }

    @AuraEnabled(cacheable=true)
    public static List<EventView> getActiveEvents(Id siteId) {
        if (siteId == null) {
            throw new AuraHandledException('A site is required.');
        }
        List<EventView> views = new List<EventView>();
        for (Websuite_Event__c e : [
            SELECT Id, Name, Description__c, Event_Date__c, Location__c, Image_Asset_Id__c, Image_Url__c, Registration_Url__c, Is_Active__c
            FROM Websuite_Event__c
            WHERE Website_Site__c = :siteId AND Is_Active__c = true
            WITH USER_MODE
            ORDER BY Event_Date__c ASC NULLS LAST
        ]) {
            views.add(toView(e));
        }
        return views;
    }

    @AuraEnabled
    public static Id saveEvent(
        Id siteId,
        Id eventId,
        String title,
        String description,
        DateTime eventDate,
        String location,
        String imageAssetId,
        String imageUrl,
        String registrationUrl,
        Boolean isActive
    ) {
        if (siteId == null || String.isBlank(title)) {
            throw new AuraHandledException('A site and a title are required.');
        }
        Websuite_Event__c e = new Websuite_Event__c(
            Id = eventId,
            Website_Site__c = siteId,
            Name = title.trim().left(80),
            Description__c = description,
            Event_Date__c = eventDate,
            Location__c = location,
            Image_Asset_Id__c = imageAssetId,
            Image_Url__c = imageUrl,
            Registration_Url__c = registrationUrl,
            Is_Active__c = isActive != false
        );
        Boolean isNew = eventId == null;
        if (isNew && !Schema.sObjectType.Websuite_Event__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to create events.');
        }
        if (!isNew && !Schema.sObjectType.Websuite_Event__c.isUpdateable()) {
            throw new AuraHandledException('You do not have permission to edit events.');
        }
        try {
            upsert e;
        } catch (DmlException ex) {
            throw new AuraHandledException(ex.getMessage());
        }
        return e.Id;
    }

    @AuraEnabled
    public static void deleteEvent(Id eventId) {
        if (eventId == null) {
            throw new AuraHandledException('An event is required.');
        }
        if (!Schema.sObjectType.Websuite_Event__c.isDeletable()) {
            throw new AuraHandledException('You do not have permission to delete events.');
        }
        try {
            delete new Websuite_Event__c(Id = eventId);
        } catch (DmlException ex) {
            throw new AuraHandledException(ex.getMessage());
        }
    }

    private static EventView toView(Websuite_Event__c e) {
        EventView v = new EventView();
        v.id = e.Id;
        v.title = e.Name;
        v.description = e.Description__c;
        v.eventDate = e.Event_Date__c;
        v.location = e.Location__c;
        v.imageAssetId = e.Image_Asset_Id__c;
        v.imageUrl = e.Image_Url__c;
        v.registrationUrl = e.Registration_Url__c;
        v.isActive = e.Is_Active__c;
        return v;
    }

    public class EventView {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String title;
        @AuraEnabled
        public String description;
        @AuraEnabled
        public DateTime eventDate;
        @AuraEnabled
        public String location;
        @AuraEnabled
        public String imageAssetId;
        @AuraEnabled
        public String imageUrl;
        @AuraEnabled
        public String registrationUrl;
        @AuraEnabled
        public Boolean isActive;
    }
}