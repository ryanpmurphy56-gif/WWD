@isTest
private class WebsuiteAssetControllerTest {
    @isTest
    static void uploadImageStoresFileAndReturnsUrl() {
        Website_Site__c site = new Website_Site__c(Name = 'S', Config__c = '{}');
        insert site;
        String b64 = EncodingUtil.base64Encode(Blob.valueOf('fake-image-bytes'));

        Test.startTest();
        WebsuiteAssetController.AssetResult r = WebsuiteAssetController.uploadImage('logo.png', b64, site.Id);
        Test.stopTest();

        System.assertNotEquals(null, r.assetId, 'ContentDocumentId returned');
        System.assert(
            r.url != null && r.url.startsWith('/sfc/servlet.shepherd/version/download/'),
            'Download URL built: ' + r.url
        );
        System.assertEquals(1, [SELECT COUNT() FROM ContentDocument], 'One document created');
        System.assertEquals(
            1,
            [SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId = :site.Id],
            'Linked to the site'
        );
    }

    @isTest
    static void uploadImageWithoutSiteStillWorks() {
        String b64 = EncodingUtil.base64Encode(Blob.valueOf('bytes'));
        Test.startTest();
        WebsuiteAssetController.AssetResult r = WebsuiteAssetController.uploadImage('x.png', b64, null);
        Test.stopTest();
        System.assertNotEquals(null, r.assetId, 'Works with no site link');
    }

    @isTest
    static void getAssetsListsSiteImagesNewestFirst() {
        Website_Site__c site = new Website_Site__c(Name = 'S', Config__c = '{}');
        insert site;
        String b64 = EncodingUtil.base64Encode(Blob.valueOf('bytes'));
        WebsuiteAssetController.uploadImage('first.png', b64, site.Id);
        WebsuiteAssetController.uploadImage('second.png', b64, site.Id);

        Test.startTest();
        List<WebsuiteAssetController.AssetItem> items = WebsuiteAssetController.getAssets(site.Id);
        Test.stopTest();

        System.assertEquals(2, items.size(), 'Both uploads listed');
        for (WebsuiteAssetController.AssetItem item : items) {
            System.assertNotEquals(null, item.assetId, 'assetId present');
            System.assert(item.url.startsWith('/sfc/servlet.shepherd/version/download/'), 'Servable URL');
        }
    }

    @isTest
    static void getAssetsWithNoSiteOrNoFilesReturnsEmpty() {
        System.assertEquals(0, WebsuiteAssetController.getAssets(null).size(), 'Null site -> empty');
        Website_Site__c site = new Website_Site__c(Name = 'Empty', Config__c = '{}');
        insert site;
        System.assertEquals(0, WebsuiteAssetController.getAssets(site.Id).size(), 'No files -> empty');
    }

    @isTest
    static void uploadImageRejectsBlankData() {
        Boolean threw = false;
        try {
            WebsuiteAssetController.uploadImage('x', '   ', null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assertEquals(true, threw, 'Blank data rejected');
    }

    @isTest
    static void uploadVideoStoresFileAndReturnsUrl() {
        Website_Site__c site = new Website_Site__c(Name = 'S', Config__c = '{}');
        insert site;
        String b64 = EncodingUtil.base64Encode(Blob.valueOf('fake-video-bytes'));

        Test.startTest();
        WebsuiteAssetController.AssetResult r = WebsuiteAssetController.uploadVideo('clip.mp4', b64, site.Id);
        Test.stopTest();

        System.assertNotEquals(null, r.assetId, 'ContentDocumentId returned');
        System.assert(
            r.url != null && r.url.startsWith('/sfc/servlet.shepherd/version/download/'),
            'Download URL built: ' + r.url
        );
        System.assertEquals(
            1,
            [SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId = :site.Id],
            'Linked to the site'
        );
    }

    @isTest
    static void uploadVideoRejectsBlankData() {
        Boolean threw = false;
        try {
            WebsuiteAssetController.uploadVideo('x', '', null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assertEquals(true, threw, 'Blank data rejected');
    }

    @isTest
    static void getAssetsReturnsFileType() {
        Website_Site__c site = new Website_Site__c(Name = 'S', Config__c = '{}');
        insert site;
        String b64 = EncodingUtil.base64Encode(Blob.valueOf('bytes'));
        WebsuiteAssetController.uploadImage('photo.png', b64, site.Id);
        WebsuiteAssetController.uploadVideo('clip.mp4', b64, site.Id);

        Test.startTest();
        List<WebsuiteAssetController.AssetItem> items = WebsuiteAssetController.getAssets(site.Id);
        Test.stopTest();

        System.assertEquals(2, items.size(), 'Both uploads listed');
        for (WebsuiteAssetController.AssetItem item : items) {
            System.assertNotEquals(null, item.fileType, 'fileType populated: ' + item.title);
        }
    }
}