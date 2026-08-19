/**
 * siteCommentsModal — F10 collaboration basics: a site-level note/comment
 * thread (client feedback, teammate handoffs). Talks to
 * WebsuiteCommentController directly — comments aren't part of SiteConfig.
 */
import { LightningElement, api, track } from 'lwc';
import getComments from '@salesforce/apex/WebsuiteCommentController.getComments';
import addComment from '@salesforce/apex/WebsuiteCommentController.addComment';
import setResolved from '@salesforce/apex/WebsuiteCommentController.setResolved';
import deleteComment from '@salesforce/apex/WebsuiteCommentController.deleteComment';

export default class SiteCommentsModal extends LightningElement {
    @api siteId;

    @track comments = [];
    loading = true;
    posting = false;
    errorText = '';
    draftBody = '';

    connectedCallback() {
        this.load();
    }

    async load() {
        this.loading = true;
        try {
            const rows = await getComments({ siteId: this.siteId });
            this.comments = rows.map((c) => ({ ...c, dateLabel: this.formatDate(c.createdAt) }));
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not load comments.';
        } finally {
            this.loading = false;
        }
    }

    formatDate(iso) {
        if (!iso) {
            return '';
        }
        try {
            return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        } catch {
            return '';
        }
    }

    get hasComments() {
        return this.comments.length > 0;
    }
    get rows() {
        return this.comments.map((c) => ({
            ...c,
            rowClass: c.resolved ? 'comment comment_resolved' : 'comment',
            toggleLabel: c.resolved ? 'Reopen' : 'Mark resolved'
        }));
    }
    get postDisabled() {
        return this.posting || !this.draftBody.trim();
    }

    handleDraftChange(event) {
        this.draftBody = event.target.value;
    }

    async handlePost() {
        this.posting = true;
        this.errorText = '';
        try {
            await addComment({ siteId: this.siteId, body: this.draftBody });
            this.draftBody = '';
            await this.load();
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not post that comment.';
        } finally {
            this.posting = false;
        }
    }

    async handleToggleResolved(event) {
        const id = event.currentTarget.dataset.id;
        const comment = this.comments.find((c) => c.id === id);
        if (!comment) {
            return;
        }
        try {
            await setResolved({ commentId: id, resolved: !comment.resolved });
            await this.load();
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not update that comment.';
        }
    }

    async handleDelete(event) {
        const id = event.currentTarget.dataset.id;
        try {
            await deleteComment({ commentId: id });
            this.comments = this.comments.filter((c) => c.id !== id);
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not delete that comment.';
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