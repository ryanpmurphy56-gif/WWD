@isTest
private class WebsuiteDemoDataTest {
    @isTest
    static void createsThreeParseableDemoSites() {
        Test.startTest();
        List<Id> ids = WebsuiteDemoData.createDemoSites();
        Test.stopTest();

        System.assertEquals(3, ids.size(), 'Three demo sites created');

        List<Website_Site__c> sites = [SELECT Name, Config__c FROM Website_Site__c WHERE Id IN :ids];
        for (Website_Site__c s : sites) {
            System.assert(s.Name.endsWith('(demo)'), 'Named as a demo: ' + s.Name);
            Map<String, Object> cfg = (Map<String, Object>) JSON.deserializeUntyped(s.Config__c);
            System.assertNotEquals(null, cfg.get('meta'), 'Has meta');
            System.assertNotEquals(null, cfg.get('theme'), 'Has theme');
            List<Object> pages = (List<Object>) cfg.get('pages');
            System.assert(pages.size() >= 1, 'Has at least one page');
            Map<String, Object> firstPage = (Map<String, Object>) pages[0];
            List<Object> sections = (List<Object>) firstPage.get('sections');
            System.assert(sections.size() >= 3, 'Home page has several sections');
        }
    }

    @isTest
    static void reRunStaysAtThree() {
        WebsuiteDemoData.createDemoSites();
        Test.startTest();
        WebsuiteDemoData.createDemoSites(); // clears + reinserts
        Test.stopTest();
        System.assertEquals(3, [SELECT COUNT() FROM Website_Site__c WHERE Name LIKE '%(demo)'], 'Idempotent — still three');
    }
}