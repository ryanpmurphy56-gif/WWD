/**
 * Stock reordering from the Command Center Stock tab.
 * "Order" queues a Reorder_Request__c per product; pending requests are grouped
 * by supplier and emailed as order sheets — automatically every Monday
 * (WeeklyReorderScheduler) or on demand via sendOrderSheets().
 */
public without sharing class ReorderController {

    @AuraEnabled
    public static void createReorder(Id productId, Integer quantity) {
        if (productId == null) {
            throw new AuraHandledException('Missing product.');
        }
        if (quantity == null || quantity <= 0) {
            throw new AuraHandledException('Please enter a quantity of at least 1.');
        }

        List<Product2> products = [SELECT Id, Supplier__c FROM Product2 WHERE Id = :productId LIMIT 1];
        if (products.isEmpty()) {
            throw new AuraHandledException('Product not found.');
        }

        // One pending request per product — re-ordering updates the quantity
        List<Reorder_Request__c> existing = [
            SELECT Id, Quantity__c FROM Reorder_Request__c
            WHERE Product__c = :productId AND Status__c = 'Pending'
            LIMIT 1
        ];
        if (!existing.isEmpty()) {
            existing[0].Quantity__c = quantity;
            existing[0].Supplier__c = products[0].Supplier__c;
            update existing[0];
            return;
        }

        insert new Reorder_Request__c(
            Product__c = productId,
            Supplier__c = products[0].Supplier__c,
            Quantity__c = quantity,
            Status__c = 'Pending'
        );
    }

    @AuraEnabled
    public static void cancelReorder(Id reorderId) {
        delete [SELECT Id FROM Reorder_Request__c WHERE Id = :reorderId AND Status__c = 'Pending'];
    }

    /**
     * Marks a Sent reorder as Received and adds the ordered quantity to the
     * product's live stock (Quantity_on_Hand__c) — closing the reorder loop.
     */
    @AuraEnabled
    public static void markReceived(Id reorderId) {
        List<Reorder_Request__c> requests = [
            SELECT Id, Status__c, Quantity__c, Product__c
            FROM Reorder_Request__c
            WHERE Id = :reorderId
            LIMIT 1
        ];
        if (requests.isEmpty()) {
            throw new AuraHandledException('Reorder not found.');
        }
        Reorder_Request__c request = requests[0];
        if (request.Status__c == 'Received') {
            throw new AuraHandledException('This reorder has already been received.');
        }
        if (request.Product__c == null) {
            throw new AuraHandledException('The product on this reorder no longer exists.');
        }

        List<Product2> products = [
            SELECT Id, Quantity_on_Hand__c FROM Product2
            WHERE Id = :request.Product__c FOR UPDATE
        ];
        if (!products.isEmpty()) {
            Product2 p = products[0];
            p.Quantity_on_Hand__c = (p.Quantity_on_Hand__c == null ? 0 : p.Quantity_on_Hand__c)
                + (request.Quantity__c == null ? 0 : request.Quantity__c);
            update p;
        }

        request.Status__c = 'Received';
        request.Received_Date__c = Datetime.now();
        update request;
    }

    @AuraEnabled(cacheable=false)
    public static List<ReorderRow> getPendingReorders() {
        List<ReorderRow> rows = new List<ReorderRow>();
        for (Reorder_Request__c r : [
            SELECT Id, Product__r.Name, Quantity__c, CreatedDate, Status__c, Sent_Date__c,
                   Supplier__c, Supplier__r.Name
            FROM Reorder_Request__c
            WHERE Status__c IN ('Pending', 'Sent')
            ORDER BY Status__c DESC, Supplier__r.Name NULLS LAST, Product__r.Name
        ]) {
            ReorderRow row = new ReorderRow();
            row.reorderId = r.Id;
            row.productName = r.Product__r != null ? r.Product__r.Name : '(deleted product)';
            row.quantity = r.Quantity__c;
            row.supplierName = r.Supplier__c != null ? r.Supplier__r.Name : null;
            row.createdDate = r.CreatedDate;
            row.status = r.Status__c;
            row.sentDate = r.Sent_Date__c;
            rows.add(row);
        }
        return rows;
    }

    /** Sends one order-sheet email per supplier and marks the requests Sent.
        Returns a human-readable summary for the dashboard. */
    @AuraEnabled
    public static String sendOrderSheets() {
        List<Reorder_Request__c> pending = [
            SELECT Id, Quantity__c, Product__r.Name,
                   Supplier__c, Supplier__r.Name, Supplier__r.Email__c
            FROM Reorder_Request__c
            WHERE Status__c = 'Pending'
            ORDER BY Product__r.Name
        ];
        if (pending.isEmpty()) {
            return 'No pending reorders to send.';
        }

        // Group requests by supplier (null supplier bucket goes to the store inbox)
        Map<Id, List<Reorder_Request__c>> bySupplier = new Map<Id, List<Reorder_Request__c>>();
        List<Reorder_Request__c> noSupplier = new List<Reorder_Request__c>();
        for (Reorder_Request__c r : pending) {
            if (r.Supplier__c == null) {
                noSupplier.add(r);
            } else {
                if (!bySupplier.containsKey(r.Supplier__c)) {
                    bySupplier.put(r.Supplier__c, new List<Reorder_Request__c>());
                }
                bySupplier.get(r.Supplier__c).add(r);
            }
        }

        // Supplier account Email__c, falling back to their first contact with an email
        Map<Id, String> supplierEmail = new Map<Id, String>();
        for (Id supplierId : bySupplier.keySet()) {
            String acctEmail = bySupplier.get(supplierId)[0].Supplier__r.Email__c;
            if (String.isNotBlank(acctEmail)) supplierEmail.put(supplierId, acctEmail);
        }
        for (Contact c : [
            SELECT AccountId, Email FROM Contact
            WHERE AccountId IN :bySupplier.keySet() AND Email != null
            ORDER BY CreatedDate ASC
        ]) {
            if (!supplierEmail.containsKey(c.AccountId)) {
                supplierEmail.put(c.AccountId, c.Email);
            }
        }

        String storeEmail = UserInfo.getUserEmail();
        String dateLabel = Date.today().format();
        List<Messaging.SingleEmailMessage> mails = new List<Messaging.SingleEmailMessage>();
        Integer sheetsSent = 0;

        for (Id supplierId : bySupplier.keySet()) {
            List<Reorder_Request__c> supplierReqs = bySupplier.get(supplierId);
            String supplierName = supplierReqs[0].Supplier__r.Name;
            String toAddress = supplierEmail.containsKey(supplierId) ? supplierEmail.get(supplierId) : storeEmail;
            Boolean fellBack = !supplierEmail.containsKey(supplierId);

            Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
            mail.setToAddresses(new String[] { toAddress });
            mail.setCcAddresses(new String[] { storeEmail });
            mail.setSubject('Point & Pour Order Sheet — ' + supplierName + ' — ' + dateLabel);
            mail.setHtmlBody(buildSheetHtml(supplierName, supplierReqs, fellBack));
            mails.add(mail);
            sheetsSent++;
        }

        if (!noSupplier.isEmpty()) {
            Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
            mail.setToAddresses(new String[] { storeEmail });
            mail.setSubject('Point & Pour Order Sheet — NO SUPPLIER SET — ' + dateLabel);
            mail.setHtmlBody(buildSheetHtml('No supplier on file', noSupplier, false));
            mails.add(mail);
            sheetsSent++;
        }

        Messaging.sendEmail(mails);

        for (Reorder_Request__c r : pending) {
            r.Status__c = 'Sent';
            r.Sent_Date__c = Datetime.now();
        }
        update pending;

        return sheetsSent + ' order sheet(s) sent covering ' + pending.size() + ' product(s).';
    }

    private static String buildSheetHtml(String supplierName, List<Reorder_Request__c> requests, Boolean fellBack) {
        String html = '<div style="font-family:Segoe UI,Arial,sans-serif;color:#222">'
            + '<h2 style="color:#3e0f44">Point &amp; Pour — Weekly Order Sheet</h2>'
            + '<p><strong>Supplier:</strong> ' + supplierName.escapeHtml4() + '<br/>'
            + '<strong>Date:</strong> ' + Date.today().format() + '</p>';
        if (fellBack) {
            html += '<p style="color:#a32020"><em>No email on the supplier account — please forward manually.</em></p>';
        }
        html += '<table border="0" cellpadding="8" cellspacing="0" style="border-collapse:collapse;min-width:420px">'
            + '<tr style="background:#3e0f44;color:#fff;text-align:left">'
            + '<th style="padding:8px 12px">Product</th><th style="padding:8px 12px;text-align:right">Quantity</th></tr>';
        Integer i = 0;
        Decimal totalUnits = 0;
        for (Reorder_Request__c r : requests) {
            String bg = Math.mod(i, 2) == 0 ? '#faf5fb' : '#ffffff';
            String productName = r.Product__r != null ? r.Product__r.Name : '(deleted product)';
            html += '<tr style="background:' + bg + '">'
                + '<td style="padding:8px 12px;border-bottom:1px solid #eee">' + productName.escapeHtml4() + '</td>'
                + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">' + r.Quantity__c.intValue() + '</td></tr>';
            totalUnits += r.Quantity__c;
            i++;
        }
        html += '<tr><td style="padding:8px 12px;font-weight:bold">Total units</td>'
            + '<td style="padding:8px 12px;text-align:right;font-weight:bold">' + totalUnits.intValue() + '</td></tr>'
            + '</table>'
            + '<p style="color:#777;font-size:12px;margin-top:16px">Sent automatically from the Point &amp; Pour Command Center.</p>'
            + '</div>';
        return html;
    }

    public class ReorderRow {
        @AuraEnabled public Id reorderId;
        @AuraEnabled public String productName;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public String supplierName;
        @AuraEnabled public Datetime createdDate;
        @AuraEnabled public String status;
        @AuraEnabled public Datetime sentDate;
    }
}