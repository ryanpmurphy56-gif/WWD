/**
 * CheckoutController
 * Handles checkout summary, Stripe PaymentIntent creation, order placement,
 * customer cancellation/refund, and the order confirmation email.
 *
 * Payment integrity: the PaymentIntent is created from a SERVER-computed total
 * (items + server-side delivery quote − discounts). placeOrder re-verifies that
 * the intent's amount matches a fresh server computation before any order is
 * written, so a tampered client can never pay less than the real total.
 *
 * Discount stacking policy (see DiscountCodeService): member pricing and site
 * sales always apply per item; then the customer gets the LARGER of the 15%
 * first-order member discount and any discount code — never both. Delivery is
 * never discounted.
 */
public without sharing class CheckoutController {

    private static final Decimal FLAT_DELIVERY_FEE = 9.95;

    @AuraEnabled(cacheable=true)
    public static String getStripePublishableKey() {
        List<Stripe_Settings__mdt> settings = [
            SELECT Publishable_Key__c
            FROM Stripe_Settings__mdt
            WHERE DeveloperName = 'Default'
            LIMIT 1
        ];

        if (settings.isEmpty()) {
            throw new AuraHandledException('Stripe configuration not found. Please set up Stripe_Settings__mdt.');
        }

        return settings[0].Publishable_Key__c;
    }

    @AuraEnabled(cacheable=false)
    public static CheckoutSummary getCheckoutSummaryForUid(String uid) {
        Cart__c cart = getActiveCart(uid);
        if (cart == null) {
            return null;
        }

        Boolean memberStatus = PnPUserContext.isMember();

        List<Cart_Item__c> items = queryCartItems(cart.Id);

        CheckoutSummary summary = new CheckoutSummary();
        summary.cartId = cart.Id;
        summary.isMember = memberStatus;
        summary.items = new List<CheckoutItemWrapper>();

        Decimal subtotal = 0;
        Decimal memberSavings = 0;
        Decimal saleSavings = 0;

        Set<Id> productIds = new Set<Id>();
        for (Cart_Item__c item : items) {
            productIds.add(item.Product__c);
        }
        SiteSaleController.SaleDiscounts saleDiscounts = SiteSaleController.getActiveDiscounts(productIds);

        for (Cart_Item__c item : items) {
            CheckoutItemWrapper w = new CheckoutItemWrapper();
            w.cartItemId = item.Id;
            w.productId = item.Product__c;
            w.productName = item.Product__r.Name;
            w.productImage = item.Product__r.Product_Image_Field__c;
            w.quantity = item.Quantity__c;
            w.regularPrice = item.Product__r.Price__c;
            w.memberPrice = memberStatus ? item.Product__r.Members_Price_Individual__c : null;

            Decimal baseLine = computeLineTotal(item, memberStatus);
            w.lineTotal = applySaleDiscount(baseLine, item.Product__c, saleDiscounts);
            if (baseLine > w.lineTotal) {
                saleSavings += baseLine - w.lineTotal;
            }

            if (memberStatus) {
                Decimal nonMemberTotal = computeLineTotal(item, false);
                if (nonMemberTotal > baseLine) {
                    memberSavings += nonMemberTotal - baseLine;
                }
            }

            subtotal += w.lineTotal;
            summary.items.add(w);
        }
        summary.saleSavings = saleSavings;

        summary.subtotal = subtotal;
        summary.memberSavings = memberSavings;

        // "Sign up and save 15% on your first order" — members with no prior
        // orders get 15% off the items subtotal (delivery is never discounted)
        Decimal firstOrderDiscount = (subtotal * firstOrderDiscountRate(memberStatus))
            .setScale(2, RoundingMode.HALF_UP);
        summary.firstOrderDiscount = firstOrderDiscount;
        summary.total = subtotal - firstOrderDiscount;

        // Saved delivery address for prefill (standard Account shipping address)
        Id acctId = PnPUserContext.resolveMemberAccountId();
        if (acctId != null) {
            List<Account> accts = [
                SELECT ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode
                FROM Account WHERE Id = :acctId LIMIT 1
            ];
            if (!accts.isEmpty()) {
                summary.savedStreet   = accts[0].ShippingStreet;
                summary.savedSuburb   = accts[0].ShippingCity;
                summary.savedState    = accts[0].ShippingState;
                summary.savedPostcode = accts[0].ShippingPostalCode;
            }
        }

        return summary;
    }

    /**
     * Server-side charge computation — the ONLY place a checkout total is derived.
     * Both intent creation and order placement call this so they can never disagree.
     */
    private static ChargePlan computeCharge(String uid, String fulfilmentType, String toPostcode, String discountCode) {
        Cart__c cart = getActiveCart(uid);
        if (cart == null) {
            throw new AuraHandledException('No active cart found.');
        }
        List<Cart_Item__c> items = queryCartItems(cart.Id);
        if (items.isEmpty()) {
            throw new AuraHandledException('Your cart is empty.');
        }

        Boolean memberStatus = PnPUserContext.isMember();

        Set<Id> productIds = new Set<Id>();
        for (Cart_Item__c item : items) {
            productIds.add(item.Product__c);
        }
        SiteSaleController.SaleDiscounts saleDiscounts = SiteSaleController.getActiveDiscounts(productIds);

        Decimal itemsTotal = 0;
        for (Cart_Item__c item : items) {
            itemsTotal += applySaleDiscount(computeLineTotal(item, memberStatus), item.Product__c, saleDiscounts);
        }

        // First-order discount vs discount code: customer gets the larger, never both
        Decimal firstOrderDiscount = (itemsTotal * firstOrderDiscountRate(memberStatus))
            .setScale(2, RoundingMode.HALF_UP);

        Decimal codeDiscount = 0;
        Id codeId = null;
        String appliedCode = null;
        if (String.isNotBlank(discountCode)) {
            DiscountCodeService.CodeResult codeResult =
                DiscountCodeService.evaluate(discountCode, itemsTotal, memberStatus);
            if (!codeResult.valid) {
                throw new AuraHandledException(codeResult.message);
            }
            codeDiscount = codeResult.discountAmount;
            codeId = codeResult.codeId;
            appliedCode = codeResult.code;
        }

        ChargePlan plan = new ChargePlan();
        plan.cart = cart;
        plan.items = items;
        plan.productIds = productIds;
        plan.saleDiscounts = saleDiscounts;
        plan.memberStatus = memberStatus;
        plan.itemsTotal = itemsTotal;

        if (codeDiscount >= firstOrderDiscount && codeDiscount > 0) {
            plan.codeDiscount = codeDiscount;
            plan.codeId = codeId;
            plan.appliedCode = appliedCode;
            plan.firstOrderDiscount = 0;
        } else {
            plan.firstOrderDiscount = firstOrderDiscount;
        }

        plan.deliveryFee = 0;
        if (fulfilmentType == 'Delivery') {
            plan.deliveryFee = FLAT_DELIVERY_FEE;
            if (String.isNotBlank(toPostcode)) {
                try {
                    ShippingController.DeliveryQuote quote =
                        ShippingController.getDeliveryQuote(uid, toPostcode);
                    if (quote != null && quote.cost != null && quote.cost >= 0) {
                        plan.deliveryFee = quote.cost;
                    }
                } catch (Exception e) {
                    // AusPost unavailable — keep the flat fallback fee
                }
            }
        }

        plan.total = plan.itemsTotal - plan.firstOrderDiscount - plan.codeDiscount + plan.deliveryFee;
        if (plan.total < 0) plan.total = 0;
        plan.amountCents = (plan.total * 100).setScale(0, RoundingMode.HALF_UP).intValue();

        return plan;
    }

    /**
     * Creates a PaymentIntent from the server-computed total. The delivery fee
     * and discount context are stored in the intent's metadata so placeOrder can
     * verify the final amount without trusting the client for anything.
     */
    @AuraEnabled
    public static PaymentIntentResult createPaymentIntentForCart(
        String uid, String fulfilmentType, String toPostcode, String discountCode
    ) {
        ChargePlan plan = computeCharge(uid, fulfilmentType, toPostcode, discountCode);
        if (plan.amountCents <= 0) {
            throw new AuraHandledException('Invalid payment amount.');
        }

        String body =
            'amount=' + plan.amountCents +
            '&currency=aud' +
            '&automatic_payment_methods[enabled]=true' +
            '&automatic_payment_methods[allow_redirects]=never' +
            '&metadata[delivery_fee_cents]=' + (plan.deliveryFee * 100).setScale(0, RoundingMode.HALF_UP).intValue() +
            '&metadata[fulfilment_type]=' + EncodingUtil.urlEncode(fulfilmentType == null ? '' : fulfilmentType, 'UTF-8');
        if (String.isNotBlank(plan.appliedCode)) {
            body += '&metadata[discount_code]=' + EncodingUtil.urlEncode(plan.appliedCode, 'UTF-8');
        }

        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Stripe_API/v1/payment_intents');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        req.setBody(body);

        HttpResponse res = new Http().send(req);

        if (res.getStatusCode() != 200) {
            Map<String, Object> errBody = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            Map<String, Object> err = (Map<String, Object>) errBody.get('error');
            String msg = err != null ? (String) err.get('message') : 'Stripe error.';
            throw new AuraHandledException('Payment setup failed: ' + msg);
        }

        Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());

        PaymentIntentResult intentResult = new PaymentIntentResult();
        intentResult.clientSecret = (String) result.get('client_secret');
        intentResult.amountCents = plan.amountCents;
        intentResult.itemsTotal = plan.itemsTotal;
        intentResult.deliveryFee = plan.deliveryFee;
        intentResult.firstOrderDiscount = plan.firstOrderDiscount;
        intentResult.codeDiscount = plan.codeDiscount;
        intentResult.appliedCode = plan.appliedCode;
        return intentResult;
    }

    @AuraEnabled
    public static PlaceOrderResult placeOrderForUid(
        String paymentIntentId,
        String fulfilmentType,
        String deliveryStreet,
        String deliverySuburb,
        String deliveryState,
        String deliveryPostcode,
        String deliveryNotes,
        String uid,
        String discountCode,
        Boolean saveAddress
    ) {
        // 1. Verify the payment succeeded and read back the trusted metadata
        VerifiedIntent intent = verifyPaymentIntent(paymentIntentId);

        // 2. Recompute the charge server-side. The delivery fee is taken from the
        //    intent metadata (it was server-quoted at intent creation) so a quote
        //    change between then and now can't fail an honest order.
        ChargePlan plan = computeCharge(uid, fulfilmentType, null, discountCode);
        plan.deliveryFee = intent.deliveryFeeCents / 100.0;
        plan.total = plan.itemsTotal - plan.firstOrderDiscount - plan.codeDiscount + plan.deliveryFee;
        if (plan.total < 0) plan.total = 0;
        plan.amountCents = (plan.total * 100).setScale(0, RoundingMode.HALF_UP).intValue();

        // 3. The customer must have paid exactly the server-computed total
        if (intent.amountCents != plan.amountCents) {
            throw new AuraHandledException(
                'Payment amount does not match the order total. Please contact support — your card has not been charged for this order.');
        }

        // 4. Lock product rows and confirm stock so an order can never exceed quantity on hand
        Map<Id, Product2> productsById = new Map<Id, Product2>([
            SELECT Id, Name, Quantity_on_Hand__c, Total_Sold__c
            FROM Product2
            WHERE Id IN :plan.productIds
            FOR UPDATE
        ]);
        Map<Id, Decimal> requestedByProduct = new Map<Id, Decimal>();
        for (Cart_Item__c item : plan.items) {
            Decimal runningQty = requestedByProduct.containsKey(item.Product__c)
                ? requestedByProduct.get(item.Product__c) : 0;
            requestedByProduct.put(item.Product__c, runningQty + item.Quantity__c);
        }
        List<String> stockProblems = new List<String>();
        for (Id productId : requestedByProduct.keySet()) {
            Product2 p = productsById.get(productId);
            if (p != null && p.Quantity_on_Hand__c != null && requestedByProduct.get(productId) > p.Quantity_on_Hand__c) {
                stockProblems.add(p.Name + ' (only ' + Integer.valueOf(p.Quantity_on_Hand__c) + ' available)');
            }
        }
        if (!stockProblems.isEmpty()) {
            throw new AuraHandledException(
                'Not enough stock for: ' + String.join(stockProblems, ', ') + '. Please adjust your cart.'
            );
        }

        Order order = new Order(
            AccountId = resolveOrderAccountId(),
            EffectiveDate = Date.today(),
            Status = 'Draft',
            Status__c = 'Confirmed',
            Fulfilment_Type__c = fulfilmentType,
            Order_Total__c = plan.total,
            First_Order_Discount__c = plan.firstOrderDiscount,
            Discount_Code__c = plan.codeId,
            Discount_Code_Amount__c = plan.codeDiscount > 0 ? plan.codeDiscount : null,
            Delivery_Fee__c = plan.deliveryFee,
            Stripe_Payment_Intent_Id__c = paymentIntentId,
            Age_Verification__c = true
        );

        if (fulfilmentType == 'Delivery') {
            order.Delivery_Street__c = deliveryStreet;
            order.Delivery_Suburb__c = deliverySuburb;
            order.Delivery_State__c = deliveryState;
            order.Delivery_Postcode__c = deliveryPostcode;
            order.Delivery_Notes__c = deliveryNotes;
        }

        try {
            insert order;

            List<Order_Item__c> orderItems = new List<Order_Item__c>();

            for (Cart_Item__c item : plan.items) {
                Decimal lineTotal = applySaleDiscount(
                    computeLineTotal(item, plan.memberStatus), item.Product__c, plan.saleDiscounts);
                // With pack conversion the effective unit price may not match any
                // list price, so derive it from the line total
                Decimal unitPrice = (item.Quantity__c != null && item.Quantity__c > 0)
                    ? (lineTotal / item.Quantity__c).setScale(2, RoundingMode.HALF_UP)
                    : 0;

                orderItems.add(new Order_Item__c(
                    Order__c = order.Id,
                    Product__c = item.Product__c,
                    Product_Name__c = item.Product__r.Name,
                    Quantity__c = item.Quantity__c,
                    Unit_Price__c = unitPrice,
                    Line_Total__c = lineTotal
                ));
            }

            insert orderItems;

            // Decrement inventory and increment lifetime units sold, in-transaction.
            // Keyed by Id so a product on multiple cart lines is updated once.
            Map<Id, Product2> stockUpdates = new Map<Id, Product2>();
            for (Cart_Item__c item : plan.items) {
                Product2 p = productsById.get(item.Product__c);
                if (p == null) continue;
                if (p.Quantity_on_Hand__c != null) {
                    p.Quantity_on_Hand__c -= item.Quantity__c;
                }
                p.Total_Sold__c = (p.Total_Sold__c == null ? 0 : p.Total_Sold__c) + item.Quantity__c;
                stockUpdates.put(p.Id, p);
            }
            if (!stockUpdates.isEmpty()) {
                update stockUpdates.values();
            }

            if (plan.codeId != null) {
                DiscountCodeService.redeem(plan.codeId);
            }

            plan.cart.Status__c = 'Ordered';
            update plan.cart;

            if (saveAddress == true && fulfilmentType == 'Delivery') {
                saveDefaultAddress(deliveryStreet, deliverySuburb, deliveryState, deliveryPostcode);
            }

            // Funnel tracking: one Purchase event per order line
            String sessionId = String.isNotBlank(uid) ? uid : 'order-' + order.Id;
            FunnelTracker.recordPurchaseEvents(order.Id, orderItems, sessionId);

            Order placed = [SELECT Id, OrderNumber FROM Order WHERE Id = :order.Id LIMIT 1];

            sendConfirmationEmail(placed, orderItems, plan, fulfilmentType,
                deliveryStreet, deliverySuburb, deliveryState, deliveryPostcode);

            PlaceOrderResult result = new PlaceOrderResult();
            result.orderId = placed.Id;
            result.orderNumber = placed.OrderNumber;
            return result;

        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Failed to place order: ' + e.getMessage());
        }
    }

    /**
     * Customer self-service cancellation with automatic Stripe refund.
     * Allowed while the order still belongs to the caller and hasn't shipped /
     * been collected. Restocks the items and reverses Total_Sold.
     */
    @AuraEnabled
    public static String cancelOrder(Id orderId) {
        if (orderId == null) {
            throw new AuraHandledException('Missing order.');
        }

        Id accountId = PnPUserContext.resolveMemberAccountId();
        if (accountId == null) {
            throw new AuraHandledException('You must be signed in to cancel an order.');
        }

        List<Order> orders = [
            SELECT Id, AccountId, Status__c, Stripe_Payment_Intent_Id__c, Order_Total__c
            FROM Order
            WHERE Id = :orderId AND AccountId = :accountId
            LIMIT 1
        ];
        if (orders.isEmpty()) {
            throw new AuraHandledException('Order not found.');
        }
        Order order = orders[0];

        Set<String> cancellable = new Set<String>{ 'Pending', 'Confirmed', 'Picked' };
        if (!cancellable.contains(order.Status__c)) {
            throw new AuraHandledException(
                'This order can no longer be cancelled (status: ' + order.Status__c + '). Please contact us.');
        }

        // Refund via Stripe first — if this fails, nothing is changed locally
        String refundId = null;
        if (String.isNotBlank(order.Stripe_Payment_Intent_Id__c)) {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:Stripe_API/v1/refunds');
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
            req.setBody('payment_intent=' + EncodingUtil.urlEncode(order.Stripe_Payment_Intent_Id__c, 'UTF-8'));

            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() != 200) {
                throw new AuraHandledException('Refund could not be processed. Please contact support.');
            }
            Map<String, Object> refund = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            refundId = (String) refund.get('id');
        }

        // Restock and reverse units sold
        List<Order_Item__c> lines = [
            SELECT Product__c, Quantity__c FROM Order_Item__c WHERE Order__c = :order.Id
        ];
        Set<Id> productIds = new Set<Id>();
        for (Order_Item__c line : lines) {
            if (line.Product__c != null) productIds.add(line.Product__c);
        }
        if (!productIds.isEmpty()) {
            Map<Id, Product2> products = new Map<Id, Product2>([
                SELECT Id, Quantity_on_Hand__c, Total_Sold__c FROM Product2
                WHERE Id IN :productIds FOR UPDATE
            ]);
            for (Order_Item__c line : lines) {
                Product2 p = products.get(line.Product__c);
                if (p == null || line.Quantity__c == null) continue;
                if (p.Quantity_on_Hand__c != null) p.Quantity_on_Hand__c += line.Quantity__c;
                if (p.Total_Sold__c != null) {
                    p.Total_Sold__c = Math.max(0, p.Total_Sold__c - line.Quantity__c);
                }
            }
            update products.values();
        }

        order.Status__c = refundId != null ? 'Refunded' : 'Cancelled';
        order.Cancelled_Date__c = Datetime.now();
        order.Stripe_Refund_Id__c = refundId;
        update order;

        return refundId != null
            ? 'Order cancelled and refunded. Your refund should appear within 5–10 business days.'
            : 'Order cancelled.';
    }

    /* ─────────────────────────── Private helpers ─────────────────────────── */

    private static List<Cart_Item__c> queryCartItems(Id cartId) {
        return [
            SELECT Id,
                   Product__c,
                   Product__r.Name,
                   Product__r.Family,
                   Product__r.Price__c,
                   Product__r.Members_Price_Individual__c,
                   Product__r.Price_6_Pack_New__c,
                   Product__r.Price_Slab_of_24_new__c,
                   Product__r.Members_Price_6_Pack__c,
                   Product__r.Members_Price_Slab_of_24__c,
                   Product__r.Product_Image_Field__c,
                   Quantity__c,
                   Selected_Format__c,
                   Line_Total__c
            FROM Cart_Item__c
            WHERE Cart__c = :cartId
            ORDER BY CreatedDate ASC
        ];
    }

    // 0.15 for a member's first order, otherwise 0
    private static Decimal firstOrderDiscountRate(Boolean memberStatus) {
        if (!memberStatus) return 0;
        Id accountId = PnPUserContext.resolveMemberAccountId();
        if (accountId == null) return 0;
        Integer priorOrders = [SELECT COUNT() FROM Order WHERE AccountId = :accountId];
        return priorOrders == 0 ? 0.15 : 0;
    }

    private class VerifiedIntent {
        Integer amountCents;
        Integer deliveryFeeCents;
    }

    private static VerifiedIntent verifyPaymentIntent(String paymentIntentId) {
        if (String.isBlank(paymentIntentId)) {
            throw new AuraHandledException('Missing payment reference.');
        }

        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Stripe_API/v1/payment_intents/' + paymentIntentId);
        req.setMethod('GET');

        HttpResponse res = new Http().send(req);

        if (res.getStatusCode() != 200) {
            throw new AuraHandledException('Could not verify payment. Please contact support.');
        }

        Map<String, Object> intent = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        String status = (String) intent.get('status');

        if (status != 'succeeded') {
            throw new AuraHandledException('Payment has not been completed. Status: ' + status);
        }

        VerifiedIntent verified = new VerifiedIntent();
        verified.amountCents = Integer.valueOf(intent.get('amount'));
        verified.deliveryFeeCents = 0;
        Map<String, Object> metadata = (Map<String, Object>) intent.get('metadata');
        if (metadata != null && metadata.get('delivery_fee_cents') != null) {
            verified.deliveryFeeCents = Integer.valueOf((String) metadata.get('delivery_fee_cents'));
        }
        return verified;
    }

    private static Cart__c getActiveCart(String uid) {
        List<Cart__c> carts;

        if (String.isNotBlank(uid)) {
            carts = [
                SELECT Id
                FROM Cart__c
                WHERE Status__c = 'Active'
                AND (
                    OwnerId = :UserInfo.getUserId()
                    OR Temporary_OwnerId__c = :uid
                )
                LIMIT 1
            ];
        } else {
            carts = [
                SELECT Id
                FROM Cart__c
                WHERE OwnerId = :UserInfo.getUserId()
                AND Status__c = 'Active'
                LIMIT 1
            ];
        }

        return carts.isEmpty() ? null : carts[0];
    }

    // Standard Order requires an Account. Community members carry one on their
    // User record; anyone else (admin testing, guest sessions) falls back to a
    // shared walk-in account, created on first use.
    private static Id resolveOrderAccountId() {
        Id accountId = PnPUserContext.resolveMemberAccountId();
        if (accountId != null) return accountId;

        List<Account> fallback = [
            SELECT Id
            FROM Account
            WHERE Name = 'Point & Pour Online Customer'
            LIMIT 1
        ];
        if (!fallback.isEmpty()) {
            return fallback[0].Id;
        }

        // Account doubles as the member record here, so its required member
        // fields need placeholder values for this shared non-member account
        Account walkIn = new Account(
            Name = 'Point & Pour Online Customer',
            Email__c = 'online-orders@pointandpour.invalid',
            Phone_Number__c = '0000000000',
            Birthdate__c = Date.newInstance(1970, 1, 1),
            Join_Date__c = Date.today()
        );
        insert walkIn;
        return walkIn.Id;
    }

    private static void saveDefaultAddress(String street, String suburb, String state, String postcode) {
        try {
            Id accountId = PnPUserContext.resolveMemberAccountId();
            if (accountId == null) return;
            update new Account(
                Id = accountId,
                ShippingStreet = street,
                ShippingCity = suburb,
                ShippingState = state,
                ShippingPostalCode = postcode
            );
        } catch (Exception e) {
            // Saving the address is a convenience — never fail the order over it
            System.debug(LoggingLevel.WARN, 'saveDefaultAddress failed: ' + e.getMessage());
        }
    }

    private static void sendConfirmationEmail(
        Order placed, List<Order_Item__c> orderItems, ChargePlan plan,
        String fulfilmentType, String street, String suburb, String state, String postcode
    ) {
        try {
            String toAddress = UserInfo.getUserEmail();
            if (String.isBlank(toAddress) || UserInfo.getUserType() == 'Guest') {
                return; // guests have no reachable email — skip silently
            }

            String html = '<div style="font-family:Segoe UI,Arial,sans-serif;color:#222;max-width:560px">'
                + '<h2 style="color:#3e0f44">Thanks for your order!</h2>'
                + '<p>Order <strong>' + placed.OrderNumber + '</strong> is confirmed.</p>'
                + '<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">'
                + '<tr style="background:#3e0f44;color:#fff;text-align:left">'
                + '<th style="padding:8px 12px">Item</th>'
                + '<th style="padding:8px 12px;text-align:right">Qty</th>'
                + '<th style="padding:8px 12px;text-align:right">Total</th></tr>';

            Integer i = 0;
            for (Order_Item__c line : orderItems) {
                String bg = Math.mod(i, 2) == 0 ? '#faf5fb' : '#ffffff';
                html += '<tr style="background:' + bg + '">'
                    + '<td style="padding:8px 12px;border-bottom:1px solid #eee">' + line.Product_Name__c.escapeHtml4() + '</td>'
                    + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">' + line.Quantity__c.intValue() + '</td>'
                    + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">$' + line.Line_Total__c.setScale(2) + '</td></tr>';
                i++;
            }

            html += '<tr><td colspan="2" style="padding:8px 12px;text-align:right">Items</td>'
                + '<td style="padding:8px 12px;text-align:right">$' + plan.itemsTotal.setScale(2) + '</td></tr>';
            if (plan.firstOrderDiscount > 0) {
                html += '<tr><td colspan="2" style="padding:8px 12px;text-align:right;color:#0a7d32">First order discount</td>'
                    + '<td style="padding:8px 12px;text-align:right;color:#0a7d32">−$' + plan.firstOrderDiscount.setScale(2) + '</td></tr>';
            }
            if (plan.codeDiscount > 0) {
                html += '<tr><td colspan="2" style="padding:8px 12px;text-align:right;color:#0a7d32">Code ' + plan.appliedCode + '</td>'
                    + '<td style="padding:8px 12px;text-align:right;color:#0a7d32">−$' + plan.codeDiscount.setScale(2) + '</td></tr>';
            }
            if (plan.deliveryFee > 0) {
                html += '<tr><td colspan="2" style="padding:8px 12px;text-align:right">Delivery</td>'
                    + '<td style="padding:8px 12px;text-align:right">$' + plan.deliveryFee.setScale(2) + '</td></tr>';
            }
            html += '<tr><td colspan="2" style="padding:8px 12px;text-align:right;font-weight:bold">Total paid</td>'
                + '<td style="padding:8px 12px;text-align:right;font-weight:bold">$' + plan.total.setScale(2) + '</td></tr>'
                + '</table>';

            if (fulfilmentType == 'Delivery') {
                html += '<p><strong>Delivering to:</strong><br/>'
                    + (street == null ? '' : street.escapeHtml4()) + '<br/>'
                    + (suburb == null ? '' : suburb.escapeHtml4()) + ' '
                    + (state == null ? '' : state.escapeHtml4()) + ' '
                    + (postcode == null ? '' : postcode.escapeHtml4()) + '</p>';
            } else {
                html += '<p><strong>Collection:</strong> we\'ll let you know as soon as your order is ready to pick up.</p>';
            }

            html += '<p style="color:#777;font-size:12px;margin-top:16px">Point &amp; Pour — please drink responsibly.</p></div>';

            Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
            mail.setToAddresses(new String[] { toAddress });
            mail.setSubject('Point & Pour order ' + placed.OrderNumber + ' confirmed');
            mail.setHtmlBody(html);
            Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{ mail });
        } catch (Exception e) {
            // The order is already committed — never fail it because email did
            System.debug(LoggingLevel.WARN, 'Confirmation email failed: ' + e.getMessage());
        }
    }

    // Best active sale wins per product: the larger of the sitewide percent
    // and any product-scoped percent
    private static Decimal applySaleDiscount(Decimal lineTotal, Id productId, SiteSaleController.SaleDiscounts d) {
        if (d == null || lineTotal == null || lineTotal <= 0) return lineTotal;
        Decimal pct = d.sitewidePct;
        if (d.productPct.containsKey(productId) && d.productPct.get(productId) > pct) {
            pct = d.productPct.get(productId);
        }
        if (pct <= 0) return lineTotal;
        return (lineTotal * (1 - pct / 100)).setScale(2, RoundingMode.HALF_UP);
    }

    private static Decimal getActiveUnitPrice(Decimal regularPrice, Decimal memberPrice, Boolean memberStatus) {
        if (memberStatus && memberPrice != null && memberPrice > 0) {
            return memberPrice;
        }

        return regularPrice == null ? 0 : regularPrice;
    }

    private static Decimal getPackPrice(Decimal regularPack, Decimal memberPack, Boolean memberStatus) {
        if (memberStatus && memberPack != null && memberPack > 0) {
            return memberPack;
        }
        return (regularPack != null && regularPack > 0) ? regularPack : null;
    }

    /**
     * Line total with format-aware and pack-converted pricing, matching the
     * cart UI (cart.js computeLineTotal):
     *  - 'six'/'slab' format items are charged the pack price per unit
     *  - 'single' beers are automatically bundled into slabs of 24 and
     *    6-packs whenever that is cheaper (e.g. qty 6 → one 6-pack price,
     *    qty 24 → one slab price)
     */
    private static Decimal computeLineTotal(Cart_Item__c item, Boolean memberStatus) {
        Decimal qty = item.Quantity__c == null ? 0 : item.Quantity__c;
        Decimal unit = getActiveUnitPrice(
            item.Product__r.Price__c,
            item.Product__r.Members_Price_Individual__c,
            memberStatus
        );
        Decimal straight = unit * qty;

        String family = item.Product__r.Family == null ? '' : item.Product__r.Family.toLowerCase();
        String fmt = String.isBlank(item.Selected_Format__c) ? 'single' : item.Selected_Format__c.toLowerCase();
        if (family != 'beer') {
            return straight;
        }

        Decimal sixPrice = getPackPrice(
            item.Product__r.Price_6_Pack_New__c,
            item.Product__r.Members_Price_6_Pack__c,
            memberStatus
        );
        Decimal slabPrice = getPackPrice(
            item.Product__r.Price_Slab_of_24_new__c,
            item.Product__r.Members_Price_Slab_of_24__c,
            memberStatus
        );

        if (fmt.contains('slab') && slabPrice != null) {
            return slabPrice * qty;
        }
        if ((fmt.contains('six') || fmt.contains('6') || fmt.contains('pack')) && sixPrice != null) {
            return sixPrice * qty;
        }
        if (fmt != 'single') {
            return straight;
        }

        // Singles: convert to pack pricing where cheaper
        Integer remaining = qty.intValue();
        Decimal total = 0;
        if (slabPrice != null && slabPrice < unit * 24) {
            total += (remaining / 24) * slabPrice;
            remaining = Math.mod(remaining, 24);
        }
        if (sixPrice != null && sixPrice < unit * 6) {
            total += (remaining / 6) * sixPrice;
            remaining = Math.mod(remaining, 6);
        }
        total += remaining * unit;

        return total < straight ? total : straight;
    }

    /* ─────────────────────────── Wrappers ─────────────────────────── */

    private class ChargePlan {
        Cart__c cart;
        List<Cart_Item__c> items;
        Set<Id> productIds;
        SiteSaleController.SaleDiscounts saleDiscounts;
        Boolean memberStatus;
        Decimal itemsTotal = 0;
        Decimal firstOrderDiscount = 0;
        Decimal codeDiscount = 0;
        Id codeId;
        String appliedCode;
        Decimal deliveryFee = 0;
        Decimal total = 0;
        Integer amountCents = 0;
    }

    public class PaymentIntentResult {
        @AuraEnabled public String clientSecret;
        @AuraEnabled public Integer amountCents;
        @AuraEnabled public Decimal itemsTotal;
        @AuraEnabled public Decimal deliveryFee;
        @AuraEnabled public Decimal firstOrderDiscount;
        @AuraEnabled public Decimal codeDiscount;
        @AuraEnabled public String appliedCode;
    }

    public class PlaceOrderResult {
        @AuraEnabled public String orderId;
        @AuraEnabled public String orderNumber;
    }

    public class CheckoutSummary {
        @AuraEnabled public String cartId;
        @AuraEnabled public Boolean isMember;
        @AuraEnabled public List<CheckoutItemWrapper> items;
        @AuraEnabled public Decimal subtotal;
        @AuraEnabled public Decimal memberSavings;
        @AuraEnabled public Decimal saleSavings;
        @AuraEnabled public Decimal firstOrderDiscount;
        @AuraEnabled public Decimal total;
        @AuraEnabled public String savedStreet;
        @AuraEnabled public String savedSuburb;
        @AuraEnabled public String savedState;
        @AuraEnabled public String savedPostcode;
    }

    public class CheckoutItemWrapper {
        @AuraEnabled public String cartItemId;
        @AuraEnabled public String productId;
        @AuraEnabled public String productName;
        @AuraEnabled public String productImage;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public Decimal regularPrice;
        @AuraEnabled public Decimal memberPrice;
        @AuraEnabled public Decimal lineTotal;
    }
}