/**
 * humanRequestModal — the shared "request help from a human" flow (brief §2.1).
 * Captures a note, snapshots the current SiteConfig and the saved site Id, and
 * creates a stub Website_Help_Request__c record. Reused by both exit ramps: the
 * persistent editor-chrome button (source "editor") and the preview-mode polish
 * CTA (source "preview").
 */
import { LightningElement, api } from 'lwc';
import store from 'c/siteStateService';
import requestHelp from '@salesforce/apex/WebsuiteHelpRequestController.requestHelp';

export default class HumanRequestModal extends LightningElement {
    @api source = 'editor';

    note = '';
    submitting = false;
    submitted = false;
    errorText = '';

    get isPreview() {
        return this.source === 'preview';
    }

    get title() {
        return this.isPreview ? 'Request a polish pass' : 'Request help from a human';
    }

    get lead() {
        return this.isPreview
            ? 'Happy with the direction but want it finished to a professional standard? Send it to our team with a note.'
            : 'Stuck, or want a hand? Leave a note and we’ll pick it up with a full copy of your site in front of us.';
    }

    get placeholder() {
        return this.isPreview
            ? 'e.g. Love it — please tighten the copy and pick better photos.'
            : 'Tell us what you’d like help with…';
    }

    get submitDisabled() {
        return this.submitting;
    }

    get submitLabel() {
        return this.submitting ? 'Sending…' : 'Send request';
    }

    handleNote(event) {
        this.note = event.target.value;
    }

    async handleSubmit() {
        this.submitting = true;
        this.errorText = '';
        try {
            await requestHelp({
                siteId: store.getRecordId(),
                note: this.note,
                snapshot: JSON.stringify(store.getState()),
                source: this.source
            });
            this.submitted = true;
        } catch (e) {
            this.errorText = (e && (e.body?.message || e.message)) || 'Something went wrong. Please try again.';
        } finally {
            this.submitting = false;
        }
    }

    close() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleBackdrop() {
        this.close();
    }

    stop(event) {
        event.stopPropagation();
    }
}