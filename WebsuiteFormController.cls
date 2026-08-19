/**
 * WebsuiteFormController — stores a visitor's contact-form submission
 * (form builder, sectionContact). Answers arrive as JSON keyed by field label,
 * so the form's shape can change freely without schema changes. Spam
 * protection is a client-side honeypot; submissions that trip it never reach
 * this class. An optional notifyEmail (set on the section via settingsPanel)
 * triggers a best-effort email on each submission — it never blocks or fails
 * the submission itself.
 */
public with sharing class WebsuiteFormController {
    private static final Integer MAX_PAYLOAD = 32000;
    private static final Pattern EMAIL_PATTERN = Pattern.compile('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');

    // Backs the site-owner home dashboard's Contacts card — recent
    // submissions for one site, newest first. Read-only, so it's safe to be
    // cacheable; empty siteId (an unsaved wizard draft with no record yet)
    // returns an empty list rather than querying.
    @AuraEnabled(cacheable=true)
    public static List<Website_Form_Submission__c> getSubmissions(Id siteId) {
        if (siteId == null || !Schema.sObjectType.Website_Form_Submission__c.isAccessible()) {
            return new List<Website_Form_Submission__c>();
        }
        return [
            SELECT Id, Form_Name__c, Payload__c, CreatedDate
            FROM Website_Form_Submission__c
            WHERE Site__c = :siteId
            ORDER BY CreatedDate DESC, Id DESC
            LIMIT 20
        ];
    }

    @AuraEnabled
    public static Id submitForm(Id siteId, String formName, String payloadJson, String notifyEmail) {
        if (String.isBlank(payloadJson)) {
            throw new AuraHandledException('The form was empty.');
        }
        if (payloadJson.length() > MAX_PAYLOAD) {
            throw new AuraHandledException('The message is too long.');
        }
        if (!Schema.sObjectType.Website_Form_Submission__c.isCreateable()) {
            throw new AuraHandledException('You do not have permission to submit this form.');
        }
        Website_Form_Submission__c sub = new Website_Form_Submission__c(
            Site__c = siteId,
            Form_Name__c = String.isBlank(formName) ? null : formName.left(255),
            Payload__c = payloadJson
        );
        try {
            insert sub;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getMessage());
        }
        notifySubmission(formName, payloadJson, notifyEmail);
        return sub.Id;
    }

    private static void notifySubmission(String formName, String payloadJson, String notifyEmail) {
        if (String.isBlank(notifyEmail)) {
            return;
        }
        List<String> recipients = new List<String>();
        for (String raw : notifyEmail.split(',')) {
            String addr = raw.trim();
            if (String.isNotBlank(addr) && EMAIL_PATTERN.matcher(addr).matches()) {
                recipients.add(addr);
            }
        }
        if (recipients.isEmpty()) {
            return;
        }
        try {
            Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
            email.setToAddresses(recipients);
            email.setSubject('New form submission' + (String.isBlank(formName) ? '' : ' — ' + formName));
            email.setPlainTextBody(formatPayload(payloadJson));
            email.setSaveAsActivity(false);
            Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{ email });
        } catch (Exception e) {
            // Best-effort — a missing Send Email permission or deliverability
            // block must never fail the visitor's submission.
        }
    }

    private static String formatPayload(String payloadJson) {
        try {
            Map<String, Object> answers = (Map<String, Object>) JSON.deserializeUntyped(payloadJson);
            List<String> lines = new List<String>();
            for (String key : answers.keySet()) {
                lines.add(key + ': ' + formatAnswer(answers.get(key)));
            }
            return String.join(lines, '\n');
        } catch (Exception e) {
            return payloadJson;
        }
    }

    private static String formatAnswer(Object value) {
        if (value instanceof List<Object>) {
            List<String> parts = new List<String>();
            for (Object item : (List<Object>) value) {
                parts.add(item == null ? '' : String.valueOf(item));
            }
            return String.join(parts, ', ');
        }
        return value == null ? '' : String.valueOf(value);
    }
}