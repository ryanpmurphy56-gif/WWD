import { LightningElement, wire, track } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { loadWebsuiteStyles } from 'c/websuiteStyles';
import getClients from '@salesforce/apex/WebsuiteClientController.getClients';
import saveClients from '@salesforce/apex/WebsuiteClientController.saveClients';
import createClient from '@salesforce/apex/WebsuiteClientController.createClient';
import ensureLogoDistribution from '@salesforce/apex/WebsuiteClientController.ensureLogoDistribution';
import getPendingReview from '@salesforce/apex/WebsuiteReviewController.getPendingReview';
import getSiteForReview from '@salesforce/apex/WebsuiteReviewController.getSiteForReview';
import approveSite from '@salesforce/apex/WebsuiteReviewController.approveSite';
import rejectSite from '@salesforce/apex/WebsuiteReviewController.rejectSite';
import { buildNav } from 'c/navModel';

const TABS = [
    { id: 'overview', label: 'Overview', icon: 'utility:home', ready: true },
    { id: 'companies', label: 'Companies', icon: 'utility:company', ready: true },
    { id: 'review', label: 'For Review', icon: 'utility:approval', ready: true },
    { id: 'templates', label: 'Templates', icon: 'utility:layers', ready: false },
    { id: 'funnel', label: 'Funnel', icon: 'utility:filter', ready: false },
    { id: 'sessions', label: 'Live Sessions', icon: 'utility:live_message', ready: false }
];

const CHECKLIST_DEFS = [
    { key: 'noProhibited', label: 'No prohibited or offensive content' },
    { key: 'brandingCorrect', label: 'Branding and logo are correct' },
    { key: 'linksWork', label: 'Links resolve, no broken pages' },
    { key: 'mobileOk', label: 'Mobile layout looks OK' },
    { key: 'contactAccurate', label: 'Contact/legal info is accurate' }
];

export default class WebsuiteCommandCenter extends LightningElement {
    activeTab = 'overview';
    @track draft = [];
    dirty = false;
    saving = false;

    @track newCompany = { name: '', tagline: '', websiteUrl: '' };
    showAdd = false;
    creating = false;

    @track reviewQueue = [];
    selectedReviewSiteId = null;
    @track reviewDetail = null;
    reviewLoading = false;
    approving = false;
    rejecting = false;
    domainInput = '';
    notesInput = '';
    @track checklist = {};

    _wired;
    _reviewWired;
    _stylesLoaded = false;

    renderedCallback() {
        if (this._stylesLoaded) {
            return;
        }
        this._stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteCommandCenter: failed to load shared styles', error);
        });
    }

    @wire(getClients)
    wiredClients(result) {
        this._wired = result;
        if (result.data) {
            // Keep unsaved edits if the user is mid-change (e.g. just added a
            // company); otherwise sync the grid to the server's state.
            if (!this.dirty) {
                this.draft = result.data.map((c, i) => this.toDraftRow(c, i));
            }
        } else if (result.error) {
            this.showError('Could not load companies', result.error);
        }
    }

    @wire(getPendingReview)
    wiredReview(result) {
        this._reviewWired = result;
        if (result.data) {
            this.reviewQueue = result.data;
        } else if (result.error) {
            this.showError('Could not load the review queue', result.error);
        }
    }

    toDraftRow(c, i) {
        return {
            id: c.id,
            name: c.name,
            tagline: c.tagline || '',
            websiteUrl: c.websiteUrl || '',
            visible: c.visible,
            isHero: c.isHero,
            logoUrl: c.logoUrl,
            hasLogo: c.hasLogo,
            order: c.sortOrder || i + 1
        };
    }

    // ---- Navigation ------------------------------------------------------

    get navItems() {
        return TABS.map((t) => ({
            ...t,
            cssClass: t.id === this.activeTab ? 'nav-item is-active' : 'nav-item',
            iconVariant: t.id === this.activeTab ? 'inverse' : ''
        }));
    }

    handleNav(event) {
        this.activeTab = event.currentTarget.dataset.id;
    }

    get pageTitle() {
        const t = TABS.find((x) => x.id === this.activeTab);
        return t ? t.label : '';
    }

    get pageSubtitle() {
        const map = {
            overview: 'Websuite health at a glance — last 30 days',
            companies: 'Choose which companies appear across the site, and in what order',
            review: 'Check a submitted site over before it goes live'
        };
        return map[this.activeTab] || 'This section is on the roadmap';
    }

    get isOverview() {
        return this.activeTab === 'overview';
    }
    get isCompanies() {
        return this.activeTab === 'companies';
    }
    get isReview() {
        return this.activeTab === 'review';
    }
    get isStub() {
        return !this.isOverview && !this.isCompanies && !this.isReview;
    }

    // ---- Overview KPIs (sample figures except live company count) ---------

    get visibleClients() {
        return this.draft.filter((c) => c.visible);
    }

    get visibleCount() {
        return this.visibleClients.length;
    }

    get companyPreview() {
        return this.visibleClients.map((c) => c.name).join('  ·  ');
    }

    get kpis() {
        return [
            { key: 'leads', label: 'Leads (30 days)', value: '34', sub: '6 qualified' },
            { key: 'brief', label: 'Avg. brief score', value: '72', sub: 'out of 100' },
            { key: 'sites', label: 'Live sites', value: '11', sub: 'across regional VIC' },
            {
                key: 'companies',
                label: 'Companies shown',
                value: String(this.visibleCount),
                sub: `${this.draft.length} total`
            },
            { key: 'conv', label: 'View → brief', value: '4.1%', sub: 'funnel conversion' },
            { key: 'today', label: 'Submitted today', value: '2', sub: '2 briefs · 0 builds' }
        ];
    }

    recentLeads = [
        { id: 'l1', ref: '#WS-2041', name: 'Buxton Bendigo', path: 'We build it', when: '3 Jul' },
        { id: 'l2', ref: '#WS-2040', name: 'Ladd + Associates', path: 'DIY', when: '3 Jul' },
        { id: 'l3', ref: '#WS-2038', name: 'Goode Eco Designs', path: 'Fully custom', when: '2 Jul' },
        { id: 'l4', ref: '#WS-2035', name: 'Collective Standards', path: 'We build it', when: '1 Jul' }
    ];

    // ---- Companies manager ----------------------------------------------

    get acceptedLogoFormats() {
        return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    }

    handleToggle(event) {
        const id = event.currentTarget.dataset.id;
        this.draft = this.draft.map((c) => (c.id === id ? { ...c, visible: event.target.checked } : c));
        this.dirty = true;
    }

    handleHeroToggle(event) {
        const id = event.currentTarget.dataset.id;
        const checked = event.target.checked;
        // Hero is an independent flag per company.
        this.draft = this.draft.map((c) => (c.id === id ? { ...c, isHero: checked } : c));
        this.dirty = true;
    }

    handleLinkChange(event) {
        const id = event.currentTarget.dataset.id;
        const value = event.target.value;
        this.draft = this.draft.map((c) => (c.id === id ? { ...c, websiteUrl: value } : c));
        this.dirty = true;
    }

    // ---- Add company -----------------------------------------------------

    handleShowAdd() {
        this.showAdd = true;
    }

    handleCancelAdd() {
        this.showAdd = false;
        this.newCompany = { name: '', tagline: '', websiteUrl: '' };
    }

    handleNewInput(event) {
        const field = event.currentTarget.dataset.field;
        this.newCompany = { ...this.newCompany, [field]: event.target.value };
    }

    get createDisabled() {
        return this.creating || !this.newCompany.name || !this.newCompany.name.trim();
    }

    async handleCreate() {
        this.creating = true;
        const { name, tagline, websiteUrl } = this.newCompany;
        try {
            const newId = await createClient({ name, tagline, websiteUrl });
            // Show it straight away — appending survives even if there are other
            // unsaved edits, since the record is already persisted server-side.
            this.draft = [
                ...this.draft,
                {
                    id: newId,
                    name: name.trim(),
                    tagline: (tagline || '').trim(),
                    websiteUrl: (websiteUrl || '').trim(),
                    visible: true,
                    isHero: false,
                    logoUrl: null,
                    hasLogo: false,
                    order: this.draft.length + 1
                }
            ];
            await refreshApex(this._wired);
            this.showAdd = false;
            this.newCompany = { name: '', tagline: '', websiteUrl: '' };
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Company added',
                    message: `${name.trim()} is on the list. Add a logo and save when you're ready.`,
                    variant: 'success'
                })
            );
        } catch (error) {
            this.showError('Could not add company', error);
        } finally {
            this.creating = false;
        }
    }

    async handleLogoUpload(event) {
        // Files attach straight to the record, so the new logo is live immediately.
        const uploaded = event.detail.files || [];
        if (!uploaded.length) {
            return;
        }
        const clientId = event.currentTarget.dataset.id;
        try {
            // Guest site visitors commonly can't read ContentDocument/ContentVersion
            // directly — a public ContentDistribution URL works without that access.
            await ensureLogoDistribution({ clientId });
        } catch (error) {
            // The old shepherd-URL fallback in logoUrlsByClient still works for
            // authenticated views, so a distribution failure isn't fatal here.
            console.error('websuiteCommandCenter: failed to create a public logo URL', error);
        }
        await refreshApex(this._wired);
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Logo updated',
                message: 'The new logo is attached and will show on the next refresh.',
                variant: 'success'
            })
        );
    }

    handleMoveUp(event) {
        this.move(event.currentTarget.dataset.id, -1);
    }

    handleMoveDown(event) {
        this.move(event.currentTarget.dataset.id, 1);
    }

    move(id, delta) {
        const index = this.draft.findIndex((c) => c.id === id);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= this.draft.length) {
            return;
        }
        const next = [...this.draft];
        [next[index], next[target]] = [next[target], next[index]];
        this.draft = next.map((c, i) => ({ ...c, order: i + 1 }));
        this.dirty = true;
    }

    get rows() {
        return this.draft.map((c, i) => ({
            ...c,
            position: i + 1,
            cardClass: this.cardClass(c),
            disableUp: i === 0,
            disableDown: i === this.draft.length - 1
        }));
    }

    cardClass(c) {
        let cls = 'co-card';
        if (!c.visible) {
            cls += ' is-hidden';
        }
        if (c.isHero) {
            cls += ' is-hero';
        }
        return cls;
    }

    get saveDisabled() {
        return !this.dirty || this.saving;
    }

    async handleSave() {
        this.saving = true;
        const records = this.draft.map((c) => ({
            Id: c.id,
            Visible__c: c.visible,
            Sort_Order__c: c.order,
            Is_Hero__c: c.isHero,
            Website_Url__c: c.websiteUrl ? c.websiteUrl : null
        }));
        try {
            await saveClients({ clients: records });
            await refreshApex(this._wired);
            this.dirty = false;
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Saved',
                    message: 'Company visibility and order updated across the site.',
                    variant: 'success'
                })
            );
        } catch (error) {
            this.showError('Could not save changes', error);
        } finally {
            this.saving = false;
        }
    }

    handleReset() {
        if (this._wired && this._wired.data) {
            this.draft = this._wired.data.map((c, i) => this.toDraftRow(c, i));
            this.dirty = false;
        }
    }

    // ---- For Review queue --------------------------------------------------

    get reviewRows() {
        return this.reviewQueue.map((s) => ({
            ...s,
            displayName: s.companyName || s.contactName || s.name,
            submittedLabel: s.submittedAt ? new Date(s.submittedAt).toLocaleString() : ''
        }));
    }

    get hasReviewRows() {
        return this.reviewRows.length > 0;
    }

    handleOpenReview(event) {
        this.openReview(event.currentTarget.dataset.id);
    }

    async openReview(siteId) {
        this.selectedReviewSiteId = siteId;
        this.reviewDetail = null;
        this.reviewLoading = true;
        this.checklist = CHECKLIST_DEFS.reduce((acc, d) => ({ ...acc, [d.key]: false }), {});
        this.notesInput = '';
        try {
            const view = await getSiteForReview({ siteId });
            this.reviewDetail = { ...view, parsedConfig: JSON.parse(view.config) };
            this.domainInput = view.domain || '';
        } catch (error) {
            this.showError('Could not load this site', error);
            this.selectedReviewSiteId = null;
        } finally {
            this.reviewLoading = false;
        }
    }

    handleCloseReview() {
        this.selectedReviewSiteId = null;
        this.reviewDetail = null;
    }

    get checklistItems() {
        return CHECKLIST_DEFS.map((d) => ({ ...d, checked: !!this.checklist[d.key] }));
    }

    handleChecklistToggle(event) {
        const key = event.currentTarget.dataset.key;
        this.checklist = { ...this.checklist, [key]: event.target.checked };
    }

    get allChecked() {
        return CHECKLIST_DEFS.every((d) => this.checklist[d.key]);
    }

    handleDomainInput(event) {
        this.domainInput = event.target.value;
    }

    handleNotesInput(event) {
        this.notesInput = event.target.value;
    }

    get approveDisabled() {
        return this.approving || this.rejecting || !this.allChecked || !this.domainInput || !this.domainInput.trim();
    }

    get rejectDisabled() {
        return this.approving || this.rejecting;
    }

    // Reuses pageCanvas exactly as the public /preview route and the editor
    // itself do (see sitePublicRenderer.js) — same theme/nav derivation, just
    // fed from the unpublished draft config so the reviewer sees what the
    // customer actually submitted.
    get reviewPages() {
        return (this.reviewDetail && this.reviewDetail.parsedConfig && this.reviewDetail.parsedConfig.pages) || [];
    }

    get reviewActivePage() {
        return this.reviewPages.find((p) => p.isHome) || this.reviewPages[0] || null;
    }

    get reviewTheme() {
        return (this.reviewDetail && this.reviewDetail.parsedConfig && this.reviewDetail.parsedConfig.theme) || {};
    }

    get reviewGlobals() {
        return (this.reviewDetail && this.reviewDetail.parsedConfig && this.reviewDetail.parsedConfig.globals) || {};
    }

    get reviewNavMenu() {
        return this.reviewDetail ? buildNav(this.reviewDetail.parsedConfig) : [];
    }

    async handleApprove() {
        this.approving = true;
        try {
            await approveSite({
                siteId: this.selectedReviewSiteId,
                domain: this.domainInput.trim(),
                notes: this.notesInput
            });
            await refreshApex(this._reviewWired);
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Published',
                    message: 'The site is now live.',
                    variant: 'success'
                })
            );
            this.handleCloseReview();
        } catch (error) {
            this.showError('Could not approve this site', error);
        } finally {
            this.approving = false;
        }
    }

    async handleReject() {
        this.rejecting = true;
        try {
            await rejectSite({ siteId: this.selectedReviewSiteId, notes: this.notesInput });
            await refreshApex(this._reviewWired);
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Sent back',
                    message: 'The site was returned to draft for changes.',
                    variant: 'success'
                })
            );
            this.handleCloseReview();
        } catch (error) {
            this.showError('Could not send this site back', error);
        } finally {
            this.rejecting = false;
        }
    }

    showError(title, error) {
        const message =
            (error && error.body && error.body.message) || (error && error.message) || 'Unknown error';
        this.dispatchEvent(new ShowToastEvent({ title, message, variant: 'error' }));
    }
}