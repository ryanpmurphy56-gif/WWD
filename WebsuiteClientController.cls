/**
 * Backs the Websuite Command Center's Companies page and the public Trust Bar.
 *
 * getClients()             — every company, ordered, for the admin manager grid.
 * getVisibleClients()      — visible companies only, ordered, for the marketing site.
 * saveClients()             — persists visibility + ordering from the manager grid.
 * ensureLogoDistribution() — creates a guest-safe public URL for a client's logo.
 */
public with sharing class WebsuiteClientController {
    @AuraEnabled(cacheable=true)
    public static List<ClientView> getClients() {
        List<Websuite_Client__c> clients = [
            SELECT Id, Name, Visible__c, Sort_Order__c, Tagline__c, Website_Url__c, Is_Hero__c
            FROM Websuite_Client__c
            WITH USER_MODE
            ORDER BY Sort_Order__c ASC NULLS LAST, Name ASC
        ];
        Map<Id, String> logos = logoUrlsByClient(clients);
        List<ClientView> views = new List<ClientView>();
        for (Websuite_Client__c c : clients) {
            ClientView v = new ClientView();
            v.id = c.Id;
            v.name = c.Name;
            v.tagline = c.Tagline__c;
            v.websiteUrl = c.Website_Url__c;
            v.visible = c.Visible__c;
            v.sortOrder = c.Sort_Order__c;
            v.isHero = c.Is_Hero__c;
            v.logoUrl = logos.get(c.Id);
            v.hasLogo = v.logoUrl != null;
            views.add(v);
        }
        return views;
    }

    /**
     * Latest image file attached to each client, as a downloadable URL. Prefers
     * a ContentDistribution's signed public URL (created by ensureLogoDistribution
     * at upload time) over the raw /sfc/servlet.shepherd/... path, since guest
     * site users commonly lack read access to ContentDocument/ContentVersion but
     * a ContentDistribution's public URL works without any file-sharing grant at
     * all. Falls back to the shepherd path for logos uploaded before this existed
     * (no distribution yet) so nothing regresses for authenticated/internal views.
     * The most recently created file wins when a record has more than one.
     */
    private static Map<Id, String> logoUrlsByClient(List<Websuite_Client__c> clients) {
        Map<Id, String> result = new Map<Id, String>();
        if (clients == null || clients.isEmpty()) {
            return result;
        }
        Set<Id> ids = new Map<Id, Websuite_Client__c>(clients).keySet();
        try {
            Map<Id, Id> docIdByClient = new Map<Id, Id>();
            // Ordered oldest-first so the last put() for a record is its newest file.
            for (ContentDocumentLink link : [
                SELECT LinkedEntityId, ContentDocumentId, ContentDocument.LatestPublishedVersionId
                FROM ContentDocumentLink
                WHERE LinkedEntityId IN :ids
                ORDER BY ContentDocument.CreatedDate ASC
            ]) {
                docIdByClient.put(link.LinkedEntityId, link.ContentDocumentId);
                result.put(
                    link.LinkedEntityId,
                    '/sfc/servlet.shepherd/version/download/' + link.ContentDocument.LatestPublishedVersionId
                );
            }
            if (!docIdByClient.isEmpty()) {
                // DistributionPublicUrl is a computed field and can't be filtered
                // in the WHERE clause, so the null check happens after the query.
                Map<Id, String> publicUrlByDoc = new Map<Id, String>();
                for (ContentDistribution cd : [
                    SELECT ContentDocumentId, DistributionPublicUrl
                    FROM ContentDistribution
                    WHERE ContentDocumentId IN :docIdByClient.values()
                ]) {
                    if (cd.DistributionPublicUrl != null) {
                        publicUrlByDoc.put(cd.ContentDocumentId, cd.DistributionPublicUrl);
                    }
                }
                for (Id clientId : docIdByClient.keySet()) {
                    String publicUrl = publicUrlByDoc.get(docIdByClient.get(clientId));
                    if (publicUrl != null) {
                        result.put(clientId, publicUrl);
                    }
                }
            }
        } catch (Exception e) {
            // Public site/guest users may lack ContentDocumentLink/ContentDistribution
            // visibility. Degrade to no logos rather than failing the whole marketing query.
        }
        return result;
    }

    /**
     * Creates a public ContentDistribution for a client's newest logo file, so
     * logoUrlsByClient can serve a URL that works for guest visitors regardless
     * of their ContentDocument/ContentVersion access. Called right after a logo
     * upload from the Command Center (an authenticated admin context, so this
     * DML always runs with real file access) — never from the cacheable
     * getClients/getVisibleClients query methods, which can't perform DML.
     * A no-op if a distribution already exists for the current file.
     */
    @AuraEnabled
    public static void ensureLogoDistribution(Id clientId) {
        List<ContentDocumentLink> links = [
            SELECT ContentDocumentId, ContentDocument.LatestPublishedVersionId, ContentDocument.Title
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :clientId
            ORDER BY ContentDocument.CreatedDate DESC
            LIMIT 1
        ];
        if (links.isEmpty()) {
            return;
        }
        ContentDocumentLink latest = links[0];
        Integer existing = [
            SELECT COUNT()
            FROM ContentDistribution
            WHERE ContentDocumentId = :latest.ContentDocumentId
        ];
        if (existing > 0) {
            return;
        }
        try {
            insert new ContentDistribution(
                Name = latest.ContentDocument.Title,
                ContentVersionId = latest.ContentDocument.LatestPublishedVersionId,
                PreferencesAllowViewInBrowser = true,
                PreferencesAllowOriginalDownload = true,
                PreferencesLinkLatestVersion = true
            );
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    /**
     * Visible companies only, ordered, for the public marketing site (Trust Bar,
     * Project Wall, Case Studies). Carries the hero flag and resolved logo so the
     * whole site renders from one ordered source of truth.
     *
     * Is_Hero__c is included only when the running user can read it, so a guest
     * site profile without that field still gets the list (heroes just default
     * off) instead of a hard USER_MODE failure that would blank the homepage.
     */
    @AuraEnabled(cacheable=true)
    public static List<ClientView> getVisibleClients() {
        Boolean heroReadable = Schema.sObjectType.Websuite_Client__c.fields.Is_Hero__c.isAccessible();
        String soql =
            'SELECT Id, Name, Visible__c, Sort_Order__c, Tagline__c, Website_Url__c' +
            (heroReadable ? ', Is_Hero__c' : '') +
            ' FROM Websuite_Client__c WHERE Visible__c = true WITH USER_MODE' +
            ' ORDER BY Sort_Order__c ASC NULLS LAST, Name ASC';
        List<Websuite_Client__c> clients = Database.query(soql);
        Map<Id, String> logos = logoUrlsByClient(clients);
        List<ClientView> views = new List<ClientView>();
        for (Websuite_Client__c c : clients) {
            ClientView v = new ClientView();
            v.id = c.Id;
            v.name = c.Name;
            v.tagline = c.Tagline__c;
            v.websiteUrl = c.Website_Url__c;
            v.visible = c.Visible__c;
            v.sortOrder = c.Sort_Order__c;
            v.isHero = heroReadable ? c.Is_Hero__c : false;
            v.logoUrl = logos.get(c.Id);
            v.hasLogo = v.logoUrl != null;
            views.add(v);
        }
        return views;
    }

    /**
     * Upserts the rows sent from the manager grid. The client sends the full
     * working set with each row's Visible__c and Sort_Order__c already set to
     * its new value, so a single update is enough.
     */
    @AuraEnabled
    public static void saveClients(List<Websuite_Client__c> clients) {
        if (clients == null || clients.isEmpty()) {
            return;
        }
        if (!Schema.sObjectType.Websuite_Client__c.isUpdateable()) {
            throw new AuraHandledException('You do not have permission to edit Websuite Clients.');
        }
        try {
            update clients;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    /**
     * Creates a new company from the Companies manager. New rows land visible
     * and at the end of the running order so they show up ready to configure.
     * Returns the new record Id so the client can attach a logo straight away.
     */
    @AuraEnabled
    public static Id createClient(String name, String tagline, String websiteUrl) {
        if (String.isBlank(name)) {
            throw new AuraHandledException('Company name is required.');
        }
        if (!Schema.sObjectType.Websuite_Client__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to add Websuite Clients.');
        }
        AggregateResult ar = [
            SELECT MAX(Sort_Order__c) maxOrder FROM Websuite_Client__c WITH USER_MODE
        ];
        Decimal maxOrder = (Decimal) ar.get('maxOrder');
        Websuite_Client__c client = new Websuite_Client__c(
            Name = name.trim(),
            Tagline__c = String.isBlank(tagline) ? null : tagline.trim(),
            Website_Url__c = String.isBlank(websiteUrl) ? null : websiteUrl.trim(),
            Visible__c = true,
            Is_Hero__c = false,
            Sort_Order__c = (maxOrder == null ? 1 : maxOrder + 1)
        );
        try {
            insert client;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
        return client.Id;
    }

    /**
     * Flattened company row for the Command Center Companies grid, including the
     * resolved logo image URL and hero flag the SObject alone can't express.
     */
    public class ClientView {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String name;
        @AuraEnabled
        public String tagline;
        @AuraEnabled
        public String websiteUrl;
        @AuraEnabled
        public Boolean visible;
        @AuraEnabled
        public Decimal sortOrder;
        @AuraEnabled
        public Boolean isHero;
        @AuraEnabled
        public String logoUrl;
        @AuraEnabled
        public Boolean hasLogo;
    }
}