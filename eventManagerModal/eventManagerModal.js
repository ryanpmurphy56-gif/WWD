/**
 * eventManagerModal — CRUD UI for a site's events (F8b CMS). Same shape as
 * blogManagerModal/productManagerModal: talks to WebsuiteEventController
 * directly rather than through siteStateService, since events aren't part
 * of SiteConfig and don't belong on the undo stack or autosave path.
 *
 * eventDate round-trips through a native datetime-local input, which reads
 * and writes local wall-clock time with no timezone suffix — converted to/
 * from the ISO string Apex's DateTime parameter expects.
 */
import { LightningElement, api, track } from 'lwc';
import getEvents from '@salesforce/apex/WebsuiteEventController.getEvents';
import saveEvent from '@salesforce/apex/WebsuiteEventController.saveEvent';
import deleteEvent from '@salesforce/apex/WebsuiteEventController.deleteEvent';

const BLANK_DRAFT = {
    id: null,
    title: '',
    description: '',
    eventDate: null,
    location: '',
    imageAssetId: null,
    imageUrl: null,
    registrationUrl: '',
    isActive: true
};

function toDatetimeLocal(isoString) {
    if (!isoString) {
        return '';
    }
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) {
        return '';
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value) {
    if (!value) {
        return null;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default class EventManagerModal extends LightningElement {
    @api siteId;

    @track events = [];
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
            const rows = await getEvents({ siteId: this.siteId });
            this.events = rows.map((e) => ({ ...e, statusLabel: e.isActive ? 'Active' : 'Inactive' }));
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not load events.';
        } finally {
            this.loading = false;
        }
    }

    get isEditing() {
        return !!this.draft;
    }
    get hasEvents() {
        return this.events.length > 0;
    }
    get formTitle() {
        return this.draft && this.draft.id ? 'Edit event' : 'New event';
    }
    get eventDateLocal() {
        return this.draft ? toDatetimeLocal(this.draft.eventDate) : '';
    }

    handleNewEvent() {
        this.draft = { ...BLANK_DRAFT };
    }

    handleEditEvent(event) {
        const id = event.currentTarget.dataset.id;
        const found = this.events.find((e) => e.id === id);
        if (found) {
            this.draft = { ...found };
        }
    }

    async handleDeleteEvent(event) {
        const id = event.currentTarget.dataset.id;
        // eslint-disable-next-line no-alert
        if (!window.confirm('Delete this event? This cannot be undone.')) {
            return;
        }
        try {
            await deleteEvent({ eventId: id });
            this.events = this.events.filter((e) => e.id !== id);
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not delete that event.';
        }
    }

    handleCancelEdit() {
        this.draft = null;
        this.errorText = '';
    }

    handleTitleChange(event) {
        this.draft = { ...this.draft, title: event.target.value };
    }
    handleDescriptionChange(event) {
        this.draft = { ...this.draft, description: event.target.value };
    }
    handleEventDateChange(event) {
        this.draft = { ...this.draft, eventDate: fromDatetimeLocal(event.target.value) };
    }
    handleLocationChange(event) {
        this.draft = { ...this.draft, location: event.target.value };
    }
    handleRegistrationUrlChange(event) {
        this.draft = { ...this.draft, registrationUrl: event.target.value };
    }
    handleActiveChange(event) {
        this.draft = { ...this.draft, isActive: event.target.checked };
    }
    handleImageUploaded(event) {
        const { assetId, url } = event.detail;
        this.draft = { ...this.draft, imageAssetId: assetId, imageUrl: url };
    }
    handleImageRemove() {
        this.draft = { ...this.draft, imageAssetId: null, imageUrl: null };
    }

    get saveDisabled() {
        return this.saving || !this.draft || !this.draft.title.trim();
    }
    get saveLabel() {
        return this.saving ? 'Saving…' : 'Save';
    }

    async handleSaveDraft() {
        this.saving = true;
        this.errorText = '';
        try {
            const id = await saveEvent({
                siteId: this.siteId,
                eventId: this.draft.id,
                title: this.draft.title,
                description: this.draft.description,
                eventDate: this.draft.eventDate,
                location: this.draft.location,
                imageAssetId: this.draft.imageAssetId,
                imageUrl: this.draft.imageUrl,
                registrationUrl: this.draft.registrationUrl,
                isActive: this.draft.isActive
            });
            this.draft = { ...this.draft, id };
            await this.load();
            this.draft = null;
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not save that event.';
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