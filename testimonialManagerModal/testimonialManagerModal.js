/**
 * testimonialManagerModal — CRUD UI for a site's testimonials (F8b CMS).
 * Same shape as blogManagerModal/productManagerModal: talks to
 * WebsuiteTestimonialController directly rather than through
 * siteStateService, since testimonials aren't part of SiteConfig and don't
 * belong on the undo stack or autosave path.
 */
import { LightningElement, api, track } from 'lwc';
import getTestimonials from '@salesforce/apex/WebsuiteTestimonialController.getTestimonials';
import saveTestimonial from '@salesforce/apex/WebsuiteTestimonialController.saveTestimonial';
import deleteTestimonial from '@salesforce/apex/WebsuiteTestimonialController.deleteTestimonial';

const BLANK_DRAFT = {
    id: null,
    authorName: '',
    quote: '',
    roleCompany: '',
    photoAssetId: null,
    photoUrl: null,
    isActive: true
};

export default class TestimonialManagerModal extends LightningElement {
    @api siteId;

    @track testimonials = [];
    @track draft = null;
    loading = true;
    saving = false;
    errorText = '';

    connectedCallback() {
        this.load();
    }

    async load() {
        this.loading = true;
        try {
            const rows = await getTestimonials({ siteId: this.siteId });
            this.testimonials = rows.map((t) => ({ ...t, statusLabel: t.isActive ? 'Active' : 'Inactive' }));
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not load testimonials.';
        } finally {
            this.loading = false;
        }
    }

    get isEditing() {
        return !!this.draft;
    }
    get hasTestimonials() {
        return this.testimonials.length > 0;
    }
    get formTitle() {
        return this.draft && this.draft.id ? 'Edit testimonial' : 'New testimonial';
    }

    handleNewTestimonial() {
        this.draft = { ...BLANK_DRAFT };
    }

    handleEditTestimonial(event) {
        const id = event.currentTarget.dataset.id;
        const testimonial = this.testimonials.find((t) => t.id === id);
        if (testimonial) {
            this.draft = { ...testimonial };
        }
    }

    async handleDeleteTestimonial(event) {
        const id = event.currentTarget.dataset.id;
        // eslint-disable-next-line no-alert
        if (!window.confirm('Delete this testimonial? This cannot be undone.')) {
            return;
        }
        try {
            await deleteTestimonial({ testimonialId: id });
            this.testimonials = this.testimonials.filter((t) => t.id !== id);
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not delete that testimonial.';
        }
    }

    handleCancelEdit() {
        this.draft = null;
        this.errorText = '';
    }

    handleAuthorNameChange(event) {
        this.draft = { ...this.draft, authorName: event.target.value };
    }
    handleQuoteChange(event) {
        this.draft = { ...this.draft, quote: event.target.value };
    }
    handleRoleCompanyChange(event) {
        this.draft = { ...this.draft, roleCompany: event.target.value };
    }
    handleActiveChange(event) {
        this.draft = { ...this.draft, isActive: event.target.checked };
    }
    handlePhotoUploaded(event) {
        const { assetId, url } = event.detail;
        this.draft = { ...this.draft, photoAssetId: assetId, photoUrl: url };
    }
    handlePhotoRemove() {
        this.draft = { ...this.draft, photoAssetId: null, photoUrl: null };
    }

    get saveDisabled() {
        return this.saving || !this.draft || !this.draft.authorName.trim() || !this.draft.quote.trim();
    }
    get saveLabel() {
        return this.saving ? 'Saving…' : 'Save';
    }

    async handleSaveDraft() {
        this.saving = true;
        this.errorText = '';
        try {
            const id = await saveTestimonial({
                siteId: this.siteId,
                testimonialId: this.draft.id,
                authorName: this.draft.authorName,
                quote: this.draft.quote,
                roleCompany: this.draft.roleCompany,
                photoAssetId: this.draft.photoAssetId,
                photoUrl: this.draft.photoUrl,
                isActive: this.draft.isActive
            });
            this.draft = { ...this.draft, id };
            await this.load();
            this.draft = null;
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not save that testimonial.';
        } finally {
            this.saving = false;
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