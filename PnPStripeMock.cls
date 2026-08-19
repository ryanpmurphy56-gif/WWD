/**
 * HttpCalloutMock for Stripe (payment intents, refunds) and AusPost PAC.
 * Configure the static fields per test before Test.setMock.
 */
@isTest
public class PnPStripeMock implements HttpCalloutMock {

    public static Integer intentAmountCents = 0;      // amount the "retrieved" intent reports
    public static Integer deliveryFeeCents = 0;       // metadata stamped on the intent
    public static String intentStatus = 'succeeded';
    public static Boolean failRefund = false;

    public HttpResponse respond(HttpRequest req) {
        HttpResponse res = new HttpResponse();
        res.setHeader('Content-Type', 'application/json');
        res.setStatusCode(200);
        String endpoint = req.getEndpoint();

        if (endpoint.contains('auspost')) {
            res.setBody('{"postage_result":{"service":"Parcel Post","total_cost":"12.50"}}');
            return res;
        }
        if (endpoint.contains('/v1/refunds')) {
            if (failRefund) {
                res.setStatusCode(402);
                res.setBody('{"error":{"message":"refund failed"}}');
            } else {
                res.setBody('{"id":"re_test_1","status":"succeeded"}');
            }
            return res;
        }
        if (endpoint.contains('/v1/payment_intents') && req.getMethod() == 'POST') {
            res.setBody('{"id":"pi_test","client_secret":"cs_test_secret"}');
            return res;
        }
        if (endpoint.contains('/v1/payment_intents') && req.getMethod() == 'GET') {
            res.setBody('{"id":"pi_test","status":"' + intentStatus + '","amount":' + intentAmountCents
                + ',"metadata":{"delivery_fee_cents":"' + deliveryFeeCents + '"}}');
            return res;
        }
        res.setStatusCode(404);
        res.setBody('{"error":{"message":"unexpected endpoint"}}');
        return res;
    }
}