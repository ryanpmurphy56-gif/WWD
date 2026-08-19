/**
 * teamManagerModal — CRUD UI for a site's team members (F8b CMS). Same shape
 * as blogManagerModal/productManagerModal: talks to WebsuiteTeamController
 * directly rather than through siteStateService, since members aren't part
 * of SiteConfig and don't belong on the undo stack or autosave path.
 */
import { LightningElement, api, track } from 'lwc';
import getTeamMembers from '@salesforce/apex/WebsuiteTeamController.getTeamMembers';
import saveTeamMember from '@salesforce/apex/WebsuiteTeamController.saveTeamMember';
import deleteTeamMember from '@salesforce/apex/WebsuiteTeamController.deleteTeamMember';

const BLANK_DRAFT = {
    id: null,
    name: '',
    role: '',
    bio: '',
    photoAssetId: null,
    photoUrl: null,
    linkedinUrl: '',
    isActive: true
};

export default class TeamManagerModal extends LightningElement {
    @api siteId;

    @track members = [];
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
            const rows = await getTeamMembers({ siteId: this.siteId });
            this.members = rows.map((m) => ({ ...m, statusLabel: m.isActive ? 'Active' : 'Inactive' }));
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not load team members.';
        } finally {
            this.loading = false;
        }
    }

    get isEditing() {
        return !!this.draft;
    }
    get hasMembers() {
        return this.members.length > 0;
    }
    get formTitle() {
        return this.draft && this.draft.id ? 'Edit team member' : 'New team member';
    }

    handleNewMember() {
        this.draft = { ...BLANK_DRAFT };
    }

    handleEditMember(event) {
        const id = event.currentTarget.dataset.id;
        const member = this.members.find((m) => m.id === id);
        if (member) {
            this.draft = { ...member };
        }
    }

    async handleDeleteMember(event) {
        const id = event.currentTarget.dataset.id;
        // eslint-disable-next-line no-alert
        if (!window.confirm('Delete this team member? This cannot be undone.')) {
            return;
        }
        try {
            await deleteTeamMember({ memberId: id });
            this.members = this.members.filter((m) => m.id !== id);
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not delete that team member.';
        }
    }

    handleCancelEdit() {
        this.draft = null;
        this.errorText = '';
    }

    handleNameChange(event) {
        this.draft = { ...this.draft, name: event.target.value };
    }
    handleRoleChange(event) {
        this.draft = { ...this.draft, role: event.target.value };
    }
    handleBioChange(event) {
        this.draft = { ...this.draft, bio: event.target.value };
    }
    handleLinkedinChange(event) {
        this.draft = { ...this.draft, linkedinUrl: event.target.value };
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
        return this.saving || !this.draft || !this.draft.name.trim();
    }
    get saveLabel() {
        return this.saving ? 'Saving…' : 'Save';
    }

    async handleSaveDraft() {
        this.saving = true;
        this.errorText = '';
        try {
            const id = await saveTeamMember({
                siteId: this.siteId,
                memberId: this.draft.id,
                name: this.draft.name,
                role: this.draft.role,
                bio: this.draft.bio,
                photoAssetId: this.draft.photoAssetId,
                photoUrl: this.draft.photoUrl,
                linkedinUrl: this.draft.linkedinUrl,
                isActive: this.draft.isActive
            });
            this.draft = { ...this.draft, id };
            await this.load();
            this.draft = null;
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not save that team member.';
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