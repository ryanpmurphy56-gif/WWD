/**
 * siteHomeHub — the persistent landing screen inside siteEditorShell, shown
 * before the full editor (Tier 1 of the "Squarespace-style overview" build:
 * site summary, pages, styles, a domain stub, and Contacts as the first real
 * Tier 2 module). Purely presentational — reads only what's handed down via
 * props/events, same architecture rule as every other editor child: only
 * siteEditorShell owns store state.
 */
import { LightningElement, api } from 'lwc';
import getSubmissions from '@salesforce/apex/WebsuiteFormController.getSubmissions';
import getDomain from '@salesforce/apex/WebsuiteDomainController.getDomain';
import addDomain from '@salesforce/apex/WebsuiteDomainController.addDomain';
import removeDomain from '@salesforce/apex/WebsuiteDomainController.removeDomain';
import verifyDomain from '@salesforce/apex/WebsuiteDomainController.verifyDomain';
import { personality } from 'c/themePresets';

export default class SiteHomeHub extends LightningElement {
    @api siteName = 'Untitled site';
    @api isPublished = false;
    @api publishedAt;
    @api pages = [];
    @api theme = {};

    submissions = [];
    submissionsLoading = false;
    submissionsError = false;

    // ---- domain (G1c) ----------------------------------------------------
    domain = null;
    domainLoading = false;
    domainError = '';
    domainInput = '';
    domainSubmitting = false;
    domainRemoving = false;
    domainVerifying = false; // G1d

    _recordId;
    @api
    get recordId() {
        return this._recordId;
    }
    set recordId(value) {
        const changed = value !== this._recordId;
        this._recordId = value;
        if (changed) {
            this.loadSubmissions();
            this.loadDomain();
        }
    }

    connectedCallback() {
        this.loadSubmissions();
        this.loadDomain();
    }

    async loadSubmissions() {
        if (!this._recordId) {
            this.submissions = [];
            this.submissionsError = false;
            return;
        }
        this.submissionsLoading = true;
        this.submissionsError = false;
        try {
            const rows = await getSubmissions({ siteId: this._recordId });
            this.submissions = (rows || []).map((row) => ({
                id: row.Id,
                formName: row.Form_Name__c || 'Form',
                createdDate: row.CreatedDate,
                preview: this.previewOf(row.Payload__c)
            }));
        } catch (e) {
            this.submissionsError = true;
            this.submissions = [];
        } finally {
            this.submissionsLoading = false;
        }
    }

    // Best-effort one-line summary of an opaque per-form JSON payload — just
    // enough to recognise a submission at a glance, not a full parse.
    previewOf(payloadJson) {
        try {
            const answers = JSON.parse(payloadJson || '{}');
            const parts = Object.keys(answers)
                .slice(0, 2)
                .map((key) => `${key}: ${this.stringifyAnswer(answers[key])}`);
            return parts.join(' · ') || 'No details';
        } catch (e) {
            return 'No details';
        }
    }

    stringifyAnswer(value) {
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        return value === null || value === undefined ? '' : String(value);
    }

    // ---- domain (G1c) ------------------------------------------------------
    async loadDomain() {
        if (!this._recordId) {
            this.domain = null;
            this.domainError = '';
            return;
        }
        this.domainLoading = true;
        this.domainError = '';
        try {
            this.domain = await getDomain({ siteId: this._recordId });
        } catch (e) {
            this.domainError = 'Could not load domain.';
            this.domain = null;
        } finally {
            this.domainLoading = false;
        }
    }

    get hasDomain() {
        return !!this.domain;
    }

    get domainStatusLabel() {
        return this.domain ? this.domain.status : '';
    }

    get domainStatusClass() {
        if (!this.domain) {
            return 'badge';
        }
        if (this.domain.status === 'Verified') {
            return 'badge badge_verified';
        }
        if (this.domain.status === 'Failed') {
            return 'badge badge_failed';
        }
        return 'badge badge_pending';
    }

    get domainAddDisabled() {
        return this.domainSubmitting || !this.domainInput.trim();
    }

    // ---- domain go-live (G1d) -----------------------------------------------
    get domainIsVerified() {
        return !!this.domain && this.domain.status === 'Verified';
    }

    get domainIsFailed() {
        return !!this.domain && this.domain.status === 'Failed';
    }

    get domainStatusHint() {
        if (!this.domain) {
            return '';
        }
        if (this.domain.status === 'Verified') {
            return 'Ownership confirmed. Traffic still needs the Setup steps below before this domain actually serves the site.';
        }
        if (this.domain.status === 'Failed') {
            return "The TXT record wasn't found, or didn't match. Double-check it with your DNS host, then verify again — DNS changes can take a while to spread.";
        }
        return "Add the TXT record below, then verify — DNS changes can take a few minutes to a few hours to spread.";
    }

    get domainLastCheckedLabel() {
        return this.domain && this.domain.lastCheckedAt && this.domain.status !== 'Pending Verification'
            ? `Last checked ${new Date(this.domain.lastCheckedAt).toLocaleString()}`
            : '';
    }

    get domainVerifyDisabled() {
        return this.domainVerifying;
    }

    get domainVerifyLabel() {
        return this.domainVerifying ? 'Checking…' : 'Verify';
    }

    async handleVerifyDomain() {
        if (!this._recordId) {
            return;
        }
        this.domainVerifying = true;
        this.domainError = '';
        try {
            this.domain = await verifyDomain({ siteId: this._recordId });
        } catch (e) {
            this.domainError = (e && e.body && e.body.message) || 'Could not check DNS right now — try again in a moment.';
        } finally {
            this.domainVerifying = false;
        }
    }

    handleDomainInputChange(event) {
        this.domainInput = event.target.value;
    }

    async handleAddDomain() {
        const value = this.domainInput.trim();
        if (!value || !this._recordId) {
            return;
        }
        this.domainSubmitting = true;
        this.domainError = '';
        try {
            this.domain = await addDomain({ siteId: this._recordId, domain: value });
            this.domainInput = '';
        } catch (e) {
            this.domainError = (e && e.body && e.body.message) || 'Could not add that domain.';
        } finally {
            this.domainSubmitting = false;
        }
    }

    async handleRemoveDomain() {
        if (!this._recordId) {
            return;
        }
        this.domainRemoving = true;
        this.domainError = '';
        try {
            await removeDomain({ siteId: this._recordId });
            this.domain = null;
        } catch (e) {
            this.domainError = (e && e.body && e.body.message) || 'Could not remove that domain.';
        } finally {
            this.domainRemoving = false;
        }
    }

    // ---- site summary ------------------------------------------------------
    get publishStatusLabel() {
        if (this.isPublished && this.publishedAt) {
            return `Live · published ${new Date(this.publishedAt).toLocaleString()}`;
        }
        return 'Not published';
    }

    get publishStatusClass() {
        return this.isPublished ? 'status status_live' : 'status';
    }

    // ---- pages ---------------------------------------------------------------
    get pageRows() {
        return (this.pages || []).map((p) => ({
            pageId: p.pageId,
            title: p.title,
            isHome: p.isHome
        }));
    }

    get hasPages() {
        return this.pageRows.length > 0;
    }

    // ---- styles ---------------------------------------------------------------
    get palette() {
        return this.theme?.palette || {};
    }

    get personalityLabel() {
        const preset = personality(this.theme?.personality);
        return preset ? preset.label : 'Custom';
    }

    // ---- contacts (Tier 2, first module) --------------------------------------
    get hasRecord() {
        return !!this._recordId;
    }

    get hasSubmissions() {
        return this.submissions.length > 0;
    }

    get submissionRows() {
        return this.submissions.map((s) => ({
            ...s,
            createdLabel: s.createdDate ? new Date(s.createdDate).toLocaleString() : ''
        }));
    }

    // ---- events ---------------------------------------------------------------
    handleOpenEditor() {
        this.dispatchEvent(new CustomEvent('gotoeditor'));
    }

    handleEditPage(event) {
        const pageId = event.currentTarget.dataset.pageId;
        this.dispatchEvent(new CustomEvent('gotoeditor', { detail: { pageId } }));
    }

    handleEditStyles() {
        this.dispatchEvent(new CustomEvent('gotostyles'));
    }
}
