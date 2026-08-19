public with sharing class ExperienceProductController {

    @AuraEnabled(cacheable=true)
    public static List<Product2> getProducts(
        String productFamily
    ) {
        return [
            SELECT Id,
                   Name,
                   ProductCode,
                   Family,
                   Quantity_on_Hand__c,
                   Price__c,
                   Members_Price_Individual__c,
                   Product_Image__c,
                   Saving_Display__c
            FROM Product2
            WHERE IsActive = true
            AND Family = :productFamily
            ORDER BY Name
            LIMIT 24
        ];
    }
}