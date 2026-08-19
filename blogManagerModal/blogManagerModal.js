/**
 * blogManagerModal — CRUD UI for a site's blog posts (F8 CMS). Talks to
 * WebsuiteBlogController directly rather than through siteStateService: posts
 * are Websuite_Blog_Post__c records, not part of SiteConfig, so they don't
 * belong on the undo stack or the autosave path — each save/delete here is
 * its own immediate, independent transaction.
 */
import { LightningElement, api, track } from 'lwc';
import getPosts from '@salesforce/apex/WebsuiteBlogController.getPosts';
import savePost from '@salesforce/apex/WebsuiteBlogController.savePost';
import deletePost from '@salesforce/apex/WebsuiteBlogController.deletePost';

const BLANK_DRAFT = {
    id: null,
    title: '',
    slug: '',
    excerpt: '',
    body: '',
    coverImageAssetId: null,
    coverImageUrl: null,
    isPublished: false
};

export default class BlogManagerModal extends LightningElement {
    @api siteId;

    @track posts = [];
    @track draft = null; // non-null = editing (new or existing)
    loading = true;
    saving = false;
    errorText = '';
    _slugTouched = false;

    connectedCallback() {
        this.load();
    }

    async load() {
        this.loading = true;
        try {
            const rows = await getPosts({ siteId: this.siteId });
            this.posts = rows.map((p) => ({ ...p, statusLabel: p.isPublished ? 'Published' : 'Draft' }));
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not load posts.';
        } finally {
            this.loading = false;
        }
    }

    get isEditing() {
        return !!this.draft;
    }
    get hasPosts() {
        return this.posts.length > 0;
    }
    get formTitle() {
        return this.draft && this.draft.id ? 'Edit post' : 'New post';
    }

    handleNewPost() {
        this._slugTouched = false;
        this.draft = { ...BLANK_DRAFT };
    }

    handleEditPost(event) {
        const id = event.currentTarget.dataset.id;
        const post = this.posts.find((p) => p.id === id);
        if (post) {
            this._slugTouched = true; // editing an existing post: never auto-derive its slug
            this.draft = { ...post };
        }
    }

    async handleDeletePost(event) {
        const id = event.currentTarget.dataset.id;
        // eslint-disable-next-line no-alert
        if (!window.confirm('Delete this post? This cannot be undone.')) {
            return;
        }
        try {
            await deletePost({ postId: id });
            this.posts = this.posts.filter((p) => p.id !== id);
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not delete that post.';
        }
    }

    handleCancelEdit() {
        this.draft = null;
        this.errorText = '';
    }

    _slugify(title) {
        return (title || '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    handleTitleChange(event) {
        const title = event.target.value;
        this.draft = { ...this.draft, title, slug: this._slugTouched ? this.draft.slug : this._slugify(title) };
    }
    handleSlugChange(event) {
        this._slugTouched = true;
        this.draft = { ...this.draft, slug: this._slugify(event.target.value) };
    }
    handleExcerptChange(event) {
        this.draft = { ...this.draft, excerpt: event.target.value };
    }
    handleBodyChange(event) {
        this.draft = { ...this.draft, body: event.target.value };
    }
    handlePublishedChange(event) {
        this.draft = { ...this.draft, isPublished: event.target.checked };
    }
    handleCoverUploaded(event) {
        const { assetId, url } = event.detail;
        this.draft = { ...this.draft, coverImageAssetId: assetId, coverImageUrl: url };
    }
    handleCoverRemove() {
        this.draft = { ...this.draft, coverImageAssetId: null, coverImageUrl: null };
    }

    get saveDisabled() {
        return this.saving || !this.draft || !this.draft.title.trim() || !this.draft.slug.trim();
    }
    get saveLabel() {
        return this.saving ? 'Saving…' : 'Save';
    }

    async handleSaveDraft() {
        this.saving = true;
        this.errorText = '';
        try {
            const id = await savePost({
                siteId: this.siteId,
                postId: this.draft.id,
                title: this.draft.title,
                slug: this.draft.slug,
                excerpt: this.draft.excerpt,
                body: this.draft.body,
                coverAssetId: this.draft.coverImageAssetId,
                coverUrl: this.draft.coverImageUrl,
                isPublished: this.draft.isPublished
            });
            this.draft = { ...this.draft, id };
            await this.load();
            this.draft = null;
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not save that post.';
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