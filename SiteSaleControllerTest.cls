@isTest
private class SiteSaleControllerTest {

    @TestSetup
    static void setup() {
        insert PnPTestFactory.makeProduct('Sale Wine', 30, 10);
    }

    @isTest
    static void saveSaleValidatesAndUpserts() {
        Id saleId = SiteSaleController.saveSale(null, 'EOFY', 20, 'Sitewide', true, '', '', '', 'big sale');
        System.assertNotEquals(null, saleId);

        // update via same method
        SiteSaleController.saveSale(saleId, 'EOFY 2', 25, 'Sitewide', true, '', '', '', '');
        List<SiteSaleController.SaleWrapper> sales = SiteSaleController.getSales();
        System.assertEquals(1, sales.size());
        System.assertEquals('EOFY 2', sales[0].name);
        System.assertEquals(true, sales[0].isLive);

        Boolean threw = false;
        try { SiteSaleController.saveSale(null, '', 20, 'Sitewide', true, '', '', '', ''); }
        catch (AuraHandledException e) { threw = true; }
        System.assert(threw, 'blank name rejected');

        threw = false;
        try { SiteSaleController.saveSale(null, 'Bad', 120, 'Sitewide', true, '', '', '', ''); }
        catch (AuraHandledException e) { threw = true; }
        System.assert(threw, 'percent over 99 rejected');
    }

    @isTest
    static void scopedSaleDiscountsOnlyItsProducts() {
        Product2 p = [SELECT Id FROM Product2 WHERE Name = 'Sale Wine'];
        Id saleId = SiteSaleController.saveSale(null, 'Wine Sale', 50, 'Selected Products', true, '', '', '', '');
        SiteSaleController.addProductToSale(saleId, p.Id);
        SiteSaleController.addProductToSale(saleId, p.Id); // duplicate is a no-op

        SiteSaleController.SaleDiscounts d = SiteSaleController.getActiveDiscounts(new Set<Id>{ p.Id });
        System.assertEquals(0, d.sitewidePct);
        System.assertEquals(50, d.productPct.get(p.Id));
        System.assertEquals(1, [SELECT COUNT() FROM Site_Sale_Product__c WHERE Sale__c = :saleId]);
    }

    @isTest
    static void sitewideSaleAppliesToEverything() {
        SiteSaleController.saveSale(null, 'Everything', 10, 'Sitewide', true, '', '', '', '');
        SiteSaleController.SaleDiscounts d = SiteSaleController.getActiveDiscounts(new Set<Id>());
        System.assertEquals(10, d.sitewidePct);
    }

    @isTest
    static void inactiveOrOutOfWindowSalesDoNotApply() {
        SiteSaleController.saveSale(null, 'Past', 10, 'Sitewide', true,
            String.valueOf(Date.today().addDays(-20)), String.valueOf(Date.today().addDays(-10)), '', '');
        SiteSaleController.SaleDiscounts d = SiteSaleController.getActiveDiscounts(new Set<Id>());
        System.assertEquals(0, d.sitewidePct, 'ended sale must not discount');
    }

    @isTest
    static void deleteSaleRemovesJunction() {
        Product2 p = [SELECT Id FROM Product2 WHERE Name = 'Sale Wine'];
        Id saleId = SiteSaleController.saveSale(null, 'Doomed', 15, 'Selected Products', true, '', '', '', '');
        SiteSaleController.addProductToSale(saleId, p.Id);
        SiteSaleController.deleteSale(saleId);
        System.assertEquals(0, [SELECT COUNT() FROM Site_Sale__c]);
        System.assertEquals(0, [SELECT COUNT() FROM Site_Sale_Product__c]);
    }

    @isTest
    static void searchProductsMatchesByName() {
        System.assertEquals(1, SiteSaleController.searchProducts('Sale Wi').size());
        System.assertEquals(0, SiteSaleController.searchProducts('x').size(), 'short terms return nothing');
    }
}