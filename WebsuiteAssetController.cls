/**
 * WebsuiteAssetController — image and video uploads for the editor. Stores an
 * uploaded file as a ContentVersion (optionally linked to its site) and
 * returns the ContentDocumentId plus a servable download URL. The editor
 * keeps both on the section (imageAssetId + imageUrl, or the video
 * equivalents), so rendering never needs a second lookup.
 *
 * Mirrors the existing logo pattern in WebsuiteClientController: files are
 * served via /sfc/servlet.shepherd/version/download/<versionId>.
 */
public with sharing class WebsuiteAssetController {
    @AuraEnabled
    public static AssetResult uploadImage(String fileName, String base64Data, Id siteId) {
        return saveAsset(fileName, 'image', base64Data, siteId);
    }

    /** Same storage path as uploadImage — ContentVersion doesn't care what
     * kind of bytes it holds. A separate method only exists so the client's
     * intent (and its own size/type validation) stays explicit. */
    @AuraEnabled
    public static AssetResult uploadVideo(String fileName, String base64Data, Id siteId) {
        return saveAsset(fileName, 'video', base64Data, siteId);
    }

    private static AssetResult saveAsset(String fileName, String kind, String base64Data, Id siteId) {
        if (String.isBlank(base64Data)) {
            throw new AuraHandledException('No ' + kind + ' data was provided.');
        }
        String safeName = String.isBlank(fileName) ? kind : fileName;
        ContentVersion cv = new ContentVersion(
            Title = safeName,
            PathOnClient = safeName,
            VersionData = EncodingUtil.base64Decode(base64Data)
        );
        try {
            insert cv;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }

        ContentVersion saved = [
            SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id LIMIT 1
        ];

        // Best-effort link to the site so the file is associated with it. A
        // brand-new, unsaved draft has no siteId yet — that's fine.
        if (siteId != null) {
            try {
                insert new ContentDocumentLink(
                    ContentDocumentId = saved.ContentDocumentId,
                    LinkedEntityId = siteId,
                    ShareType = 'V'
                );
            } catch (Exception ignored) {
                // Linking is a convenience, not a requirement for the URL to work.
            }
        }

        AssetResult result = new AssetResult();
        result.assetId = saved.ContentDocumentId;
        result.url = '/sfc/servlet.shepherd/version/download/' + saved.Id;
        return result;
    }

    /**
     * Every file already uploaded for this site (via the ContentDocumentLink
     * written by uploadImage/uploadVideo), newest first — the editor's asset
     * library. A flat list on purpose: folders would need their own object
     * and UI (they're modelled client-side instead, in SiteConfig). FileType
     * (e.g. 'PNG', 'MP4') lets the library tell images and videos apart
     * without a second round trip.
     */
    @AuraEnabled
    public static List<AssetItem> getAssets(Id siteId) {
        List<AssetItem> items = new List<AssetItem>();
        if (siteId == null) {
            return items;
        }
        Set<Id> docIds = new Set<Id>();
        for (ContentDocumentLink l : [
            SELECT ContentDocumentId
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :siteId
        ]) {
            docIds.add(l.ContentDocumentId);
        }
        if (docIds.isEmpty()) {
            return items;
        }
        for (ContentVersion v : [
            SELECT Id, Title, ContentDocumentId, FileType
            FROM ContentVersion
            WHERE ContentDocumentId IN :docIds AND IsLatest = TRUE
            ORDER BY CreatedDate DESC
        ]) {
            AssetItem item = new AssetItem();
            item.assetId = v.ContentDocumentId;
            item.title = v.Title;
            item.url = '/sfc/servlet.shepherd/version/download/' + v.Id;
            item.fileType = v.FileType;
            items.add(item);
        }
        return items;
    }

    public class AssetResult {
        @AuraEnabled
        public Id assetId;
        @AuraEnabled
        public String url;
    }

    public class AssetItem {
        @AuraEnabled
        public Id assetId;
        @AuraEnabled
        public String title;
        @AuraEnabled
        public String url;
        @AuraEnabled
        public String fileType;
    }
}