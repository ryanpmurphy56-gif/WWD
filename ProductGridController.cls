public with sharing class ProductGridController {

    @AuraEnabled(cacheable=true)
    public static List<Product2> getProductsByFamily(String family, String subFamily, String searchKey) {
        String query =
            'SELECT Id, Name, Family, Product_Sub_Family__c, Price__c, ' +
            'Members_Price_Individual__c, Price_6_Pack_New__c, Price_Slab_of_24_new__c, ' +
            'Members_Price_6_Pack__c, Members_Price_Slab_of_24__c, ' +
            'Product_Image_Field__c, QuantityUnitOfMeasure, ' +
            'Quantity_on_Hand__c, CreatedDate ' +
            'FROM Product2 WHERE IsActive = true';
        List<String> filters = new List<String>();
        if (String.isNotBlank(family)) {
            if (family.equalsIgnoreCase('offers')) {
                filters.add('Members_Price_Individual__c < Price__c');
            } else if (!family.equalsIgnoreCase('all')) {
                filters.add('Family = \'' + String.escapeSingleQuotes(family) + '\'');
            }
        }
        if (String.isNotBlank(subFamily)) {
            filters.add('Product_Sub_Family__c = \'' + String.escapeSingleQuotes(subFamily) + '\'');
        }
        if (String.isNotBlank(searchKey)) {
            filters.add('Name LIKE \'%' + String.escapeSingleQuotes(searchKey) + '%\'');
        }
        if (!filters.isEmpty()) query += ' AND ' + String.join(filters, ' AND ');
        query += ' ORDER BY Name';
        return Database.query(query);
    }

    @AuraEnabled(cacheable=true)
    public static Product2 getProductById(Id productId) {
        List<Product2> products = [
            SELECT Id, Name, Family, Product_Sub_Family__c,
                   Price__c, Members_Price_Individual__c,
                   Price_6_Pack_New__c, Price_Slab_of_24_new__c,
                   Members_Price_6_Pack__c, Members_Price_Slab_of_24__c,
                   Product_Image_Field__c, Description,
                   Alcohol_By_Volume__c, Volume_ml__c,
                   Origin_Country__c, Quantity_on_Hand__c,
                   Tasting_Notes__c, QuantityUnitOfMeasure
            FROM Product2 WHERE Id = :productId LIMIT 1
        ];
        return products.isEmpty() ? null : products[0];
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, Integer> getSiteStats() {
        Map<String, Integer> stats = new Map<String, Integer>();
        stats.put('productCount', [SELECT COUNT() FROM Product2 WHERE IsActive = true]);
        stats.put('memberCount',  [SELECT COUNT() FROM Members_Card__c
                                   WHERE Expiry_Date__c = null OR Expiry_Date__c >= TODAY]);
        return stats;
    }

    @AuraEnabled(cacheable=true)
    public static List<Product2> getRelatedProducts(String family, String excludeId) {
        return [
            SELECT Id, Name, Family, Price__c, Members_Price_Individual__c,
                   Price_6_Pack_New__c, Price_Slab_of_24_new__c,
                   Members_Price_6_Pack__c, Members_Price_Slab_of_24__c,
                   Product_Image_Field__c, Product_Sub_Family__c, QuantityUnitOfMeasure
            FROM Product2
            WHERE Family = :family AND Id != :excludeId AND IsActive = true
            ORDER BY Name LIMIT 6
        ];
    }

    @AuraEnabled(cacheable=true)
    public static List<RecommendedProduct> getRecommendations(Id productId) {
        List<Product_Recommendation__c> recs = [
            SELECT Product_A__c, Product_B__c, Co_Occurrence_Count__c,
                   Product_A__r.Id, Product_A__r.Name, Product_A__r.Family,
                   Product_A__r.Price__c, Product_A__r.Members_Price_Individual__c,
                   Product_A__r.Product_Image_Field__c, Product_A__r.IsActive,
                   Product_B__r.Id, Product_B__r.Name, Product_B__r.Family,
                   Product_B__r.Price__c, Product_B__r.Members_Price_Individual__c,
                   Product_B__r.Product_Image_Field__c, Product_B__r.IsActive
            FROM Product_Recommendation__c
            WHERE (Product_A__c = :productId OR Product_B__c = :productId)
              AND Product_A__r.IsActive = true
              AND Product_B__r.IsActive = true
            ORDER BY Co_Occurrence_Count__c DESC
            LIMIT 4
        ];

        List<RecommendedProduct> results = new List<RecommendedProduct>();
        for (Product_Recommendation__c rec : recs) {
            // Return whichever product is not the one we're currently viewing
            Boolean useB = (rec.Product_A__c == productId);
            RecommendedProduct rp = new RecommendedProduct();
            rp.Id           = useB ? rec.Product_B__c            : rec.Product_A__c;
            rp.Name         = useB ? rec.Product_B__r.Name       : rec.Product_A__r.Name;
            rp.Family       = useB ? rec.Product_B__r.Family     : rec.Product_A__r.Family;
            rp.Price        = useB ? rec.Product_B__r.Price__c   : rec.Product_A__r.Price__c;
            rp.MemberPrice  = useB ? rec.Product_B__r.Members_Price_Individual__c
                                   : rec.Product_A__r.Members_Price_Individual__c;
            rp.Image        = useB ? rec.Product_B__r.Product_Image_Field__c
                                   : rec.Product_A__r.Product_Image_Field__c;
            rp.Score        = rec.Co_Occurrence_Count__c;
            results.add(rp);
        }
        return results;
    }

    public class RecommendedProduct {
        @AuraEnabled public Id      Id;
        @AuraEnabled public String  Name;
        @AuraEnabled public String  Family;
        @AuraEnabled public Decimal Price;
        @AuraEnabled public Decimal MemberPrice;
        @AuraEnabled public String  Image;
        @AuraEnabled public Decimal Score;
    }
}