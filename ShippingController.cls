/**
 * ShippingController
 * Live delivery quotes from the Australia Post Postage Assessment Calculator (PAC).
 * Returns retail Parcel Post rates; the checkout falls back to the flat fee
 * client-side if the API is unavailable.
 */
public without sharing class ShippingController {

    private static final String  PAC_ENDPOINT      = 'https://digitalapi.auspost.com.au/postage/parcel/domestic/calculate.json';
    private static final String  SERVICE_CODE      = 'AUS_PARCEL_REGULAR';
    private static final Decimal KG_PER_LITRE      = 1.6;  // liquid plus glass/packaging
    private static final Decimal FALLBACK_ITEM_KG  = 1.0;  // products with no volume recorded
    private static final Decimal MIN_WEIGHT_KG     = 0.5;
    private static final Decimal MAX_WEIGHT_KG     = 22;   // AusPost domestic parcel maximum
    private static final String  BOX_DIMS_CM       = '&length=40&width=30&height=25';

    @AuraEnabled
    public static DeliveryQuote getDeliveryQuote(String uid, String toPostcode) {
        String destination = toPostcode == null ? '' : toPostcode.trim();
        if (!Pattern.matches('\\d{4}', destination)) {
            throw new AuraHandledException('Please enter a valid 4-digit postcode.');
        }

        AusPost_Settings__mdt settings = AusPost_Settings__mdt.getInstance('Default');
        if (settings == null || String.isBlank(settings.API_Key__c)) {
            throw new AuraHandledException('Australia Post API key not configured.');
        }
        String fromPostcode = String.isBlank(settings.From_Postcode__c) ? '3000' : settings.From_Postcode__c;

        Decimal weightKg = estimateCartWeightKg(uid);

        HttpRequest req = new HttpRequest();
        req.setEndpoint(PAC_ENDPOINT
            + '?from_postcode=' + EncodingUtil.urlEncode(fromPostcode, 'UTF-8')
            + '&to_postcode='   + EncodingUtil.urlEncode(destination, 'UTF-8')
            + BOX_DIMS_CM
            + '&weight='        + String.valueOf(weightKg)
            + '&service_code='  + SERVICE_CODE);
        req.setMethod('GET');
        req.setHeader('AUTH-KEY', settings.API_Key__c);
        req.setTimeout(10000);

        HttpResponse res = new Http().send(req);
        if (res.getStatusCode() != 200) {
            String msg = 'Could not calculate postage.';
            try {
                Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                Map<String, Object> err  = (Map<String, Object>) body.get('error');
                if (err != null && err.get('errorMessage') != null) {
                    msg = (String) err.get('errorMessage');
                }
            } catch (Exception ignored) {}
            throw new AuraHandledException(msg);
        }

        Map<String, Object> result  = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        Map<String, Object> postage = (Map<String, Object>) result.get('postage_result');
        if (postage == null || postage.get('total_cost') == null) {
            throw new AuraHandledException('Could not calculate postage for that postcode.');
        }

        DeliveryQuote quote = new DeliveryQuote();
        quote.cost        = Decimal.valueOf(String.valueOf(postage.get('total_cost')));
        quote.serviceName = String.valueOf(postage.get('service'));
        quote.weightKg    = weightKg;
        return quote;
    }

    // Estimate parcel weight from bottle volume; beer formats multiply the
    // per-bottle volume (six-pack = 6 bottles, slab = 24).
    private static Decimal estimateCartWeightKg(String uid) {
        List<Cart__c> carts = [
            SELECT Id FROM Cart__c
            WHERE (OwnerId = :UserInfo.getUserId() OR Temporary_OwnerId__c = :uid)
              AND Status__c = 'Active'
            LIMIT 1
        ];
        Decimal weight = 0;
        if (!carts.isEmpty()) {
            for (Cart_Item__c item : [
                SELECT Quantity__c, Selected_Format__c, Product__r.Volume_ml__c
                FROM Cart_Item__c WHERE Cart__c = :carts[0].Id
            ]) {
                Decimal qty   = item.Quantity__c == null ? 0 : item.Quantity__c;
                Decimal units = unitsPerFormat(item.Selected_Format__c);
                Decimal vol   = item.Product__r.Volume_ml__c;
                Decimal each  = (vol != null && vol > 0) ? (vol / 1000) * KG_PER_LITRE : FALLBACK_ITEM_KG;
                weight += each * units * qty;
            }
        }
        if (weight < MIN_WEIGHT_KG) weight = MIN_WEIGHT_KG;
        if (weight > MAX_WEIGHT_KG) weight = MAX_WEIGHT_KG; // quote as one max-weight parcel
        return weight.setScale(2);
    }

    private static Decimal unitsPerFormat(String selectedFormat) {
        String fmt = selectedFormat == null ? '' : selectedFormat.toLowerCase();
        if (fmt.contains('slab')) return 24;
        if (fmt.contains('six') || fmt.contains('6')) return 6;
        return 1;
    }

    public class DeliveryQuote {
        @AuraEnabled public Decimal cost;
        @AuraEnabled public String  serviceName;
        @AuraEnabled public Decimal weightKg;
    }
}