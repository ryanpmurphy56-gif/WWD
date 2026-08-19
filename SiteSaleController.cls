/**
 * Site sales (sitewide or product-scoped percent discounts).
 * Managed from the PnP Command Center dashboard; consumed by CheckoutController
 * to discount live pricing while a sale is active.
 */
public without sharing class SiteSaleController {

    /* ───────────────── Dashboard management ───────────────── */

    @AuraEnabled(cacheable=false)
    public static List<SaleWrapper> getSales() {
        Map<Id, SaleWrapper> bySale = new Map<Id, SaleWrapper>();

        for (Site_Sale__c s : [
            SELECT Id, Name, Discount_Percent__c, Scope__c, Active__c,
                   Start_Date__c, End_Date__c, Image_URL__c, Description__c
            FROM Site_Sale__c
            ORDER BY Active__c DESC, LastModifiedDate DESC
            LIMIT 100
        ]) {
            SaleWrapper w = new SaleWrapper();
            w.saleId = s.Id;
            w.name = s.Name;
            w.discountPercent = s.Discount_Percent__c;
            w.scope = s.Scope__c;
            w.active = s.Active__c;
            w.startDate = s.Start_Date__c;
            w.endDate = s.End_Date__c;
            w.imageUrl = s.Image_URL__c;
            w.description = s.Description__c;
            w.isLive = isLive(s);
            w.products = new List<SaleProductWrapper>();
            bySale.put(s.Id, w);
        }

        for (Site_Sale_Product__c sp : [
            SELECT Id, Sale__c, Product__c, Product__r.Name, Product__r.Price__c
            FROM Site_Sale_Product__c
            WHERE Sale__c IN :bySale.keySet()
            ORDER BY Product__r.Name
        ]) {
            SaleProductWrapper pw = new SaleProductWrapper();
            pw.saleProductId = sp.Id;
            pw.productId = sp.Product__c;
            pw.productName = sp.Product__r.Name;
            pw.price = sp.Product__r.Price__c;
            bySale.get(sp.Sale__c).products.add(pw);
        }

        return bySale.values();
    }

    @AuraEnabled
    public static Id saveSale(
        Id saleId, String name, Decimal discountPercent, String scope,
        Boolean active, String startDate, String endDate,
        String imageUrl, String description
    ) {
        if (String.isBlank(name)) {
            throw new AuraHandledException('Please give the sale a name.');
        }
        if (discountPercent == null || discountPercent <= 0 || discountPercent >= 100) {
            throw new AuraHandledException('Discount must be between 1 and 99 percent.');
        }

        Site_Sale__c s = new Site_Sale__c(
            Name = name.trim(),
            Discount_Percent__c = discountPercent,
            Scope__c = String.isBlank(scope) ? 'Sitewide' : scope,
            Active__c = active == true,
            Start_Date__c = String.isBlank(startDate) ? null : Date.valueOf(startDate),
            End_Date__c = String.isBlank(endDate) ? null : Date.valueOf(endDate),
            Image_URL__c = String.isBlank(imageUrl) ? null : imageUrl.trim(),
            Description__c = description
        );
        if (s.Start_Date__c != null && s.End_Date__c != null && s.End_Date__c < s.Start_Date__c) {
            throw new AuraHandledException('End date cannot be before the start date.');
        }
        if (saleId != null) s.Id = saleId;
        upsert s;
        return s.Id;
    }

    @AuraEnabled
    public static void deleteSale(Id saleId) {
        delete [SELECT Id FROM Site_Sale_Product__c WHERE Sale__c = :saleId];
        delete [SELECT Id FROM Site_Sale__c WHERE Id = :saleId];
    }

    @AuraEnabled
    public static void addProductToSale(Id saleId, Id productId) {
        List<Site_Sale_Product__c> existing = [
            SELECT Id FROM Site_Sale_Product__c
            WHERE Sale__c = :saleId AND Product__c = :productId
            LIMIT 1
        ];
        if (!existing.isEmpty()) return;
        insert new Site_Sale_Product__c(Sale__c = saleId, Product__c = productId);
    }

    @AuraEnabled
    public static void removeSaleProduct(Id saleProductId) {
        delete [SELECT Id FROM Site_Sale_Product__c WHERE Id = :saleProductId];
    }

    @AuraEnabled(cacheable=true)
    public static List<ProductOption> searchProducts(String term) {
        if (String.isBlank(term) || term.trim().length() < 2) return new List<ProductOption>();
        String likeTerm = '%' + String.escapeSingleQuotes(term.trim()) + '%';
        List<ProductOption> options = new List<ProductOption>();
        for (Product2 p : [
            SELECT Id, Name, Price__c
            FROM Product2
            WHERE IsActive = true AND Name LIKE :likeTerm
            ORDER BY Name
            LIMIT 10
        ]) {
            ProductOption o = new ProductOption();
            o.productId = p.Id;
            o.name = p.Name;
            o.price = p.Price__c;
            options.add(o);
        }
        return options;
    }

    /* ───────────────── Pricing lookup (used by CheckoutController) ───────────────── */

    public static SaleDiscounts getActiveDiscounts(Set<Id> productIds) {
        SaleDiscounts d = new SaleDiscounts();
        Date today = Date.today();

        List<Site_Sale__c> sales = [
            SELECT Id, Discount_Percent__c, Scope__c
            FROM Site_Sale__c
            WHERE Active__c = true
              AND (Start_Date__c = null OR Start_Date__c <= :today)
              AND (End_Date__c = null OR End_Date__c >= :today)
        ];
        if (sales.isEmpty()) return d;

        Map<Id, Decimal> scopedSalePct = new Map<Id, Decimal>();
        for (Site_Sale__c s : sales) {
            Decimal pct = s.Discount_Percent__c == null ? 0 : s.Discount_Percent__c;
            if (pct <= 0) continue;
            if (s.Scope__c == 'Sitewide') {
                if (pct > d.sitewidePct) d.sitewidePct = pct;
            } else {
                scopedSalePct.put(s.Id, pct);
            }
        }

        if (!scopedSalePct.isEmpty() && productIds != null && !productIds.isEmpty()) {
            for (Site_Sale_Product__c sp : [
                SELECT Sale__c, Product__c
                FROM Site_Sale_Product__c
                WHERE Sale__c IN :scopedSalePct.keySet()
                  AND Product__c IN :productIds
            ]) {
                Decimal pct = scopedSalePct.get(sp.Sale__c);
                Decimal current = d.productPct.containsKey(sp.Product__c) ? d.productPct.get(sp.Product__c) : 0;
                if (pct > current) d.productPct.put(sp.Product__c, pct);
            }
        }
        return d;
    }

    private static Boolean isLive(Site_Sale__c s) {
        if (!s.Active__c) return false;
        Date today = Date.today();
        if (s.Start_Date__c != null && s.Start_Date__c > today) return false;
        if (s.End_Date__c != null && s.End_Date__c < today) return false;
        return true;
    }

    /* ───────────────── Wrappers ───────────────── */

    public class SaleDiscounts {
        public Decimal sitewidePct = 0;
        public Map<Id, Decimal> productPct = new Map<Id, Decimal>();
    }

    public class SaleWrapper {
        @AuraEnabled public Id saleId;
        @AuraEnabled public String name;
        @AuraEnabled public Decimal discountPercent;
        @AuraEnabled public String scope;
        @AuraEnabled public Boolean active;
        @AuraEnabled public Boolean isLive;
        @AuraEnabled public Date startDate;
        @AuraEnabled public Date endDate;
        @AuraEnabled public String imageUrl;
        @AuraEnabled public String description;
        @AuraEnabled public List<SaleProductWrapper> products;
    }

    public class SaleProductWrapper {
        @AuraEnabled public Id saleProductId;
        @AuraEnabled public Id productId;
        @AuraEnabled public String productName;
        @AuraEnabled public Decimal price;
    }

    public class ProductOption {
        @AuraEnabled public Id productId;
        @AuraEnabled public String name;
        @AuraEnabled public Decimal price;
    }
}