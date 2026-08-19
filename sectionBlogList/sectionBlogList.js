/**
 * sectionBlogList — F8 CMS: renders live from Websuite_Blog_Post__c records
 * (getPublishedPosts), not from `content` — the actual "dynamic content"
 * distinction from every other section type, which is pure SiteConfig JSON.
 * Posts themselves are managed from the Properties panel's "Manage posts"
 * button (see blogManagerModal), not inline here.
 *
 * There's no per-post detail page/routing yet (pages are still static,
 * slug-based entries in SiteConfig) — this renders a summary grid only.
 */
import { LightningElement, api } from 'lwc';
import getPublishedPosts from '@salesforce/apex/WebsuiteBlogController.getPublishedPosts';
import { sectionRootClass, sectionRootStyle, fieldStyle, commitField } from 'c/sectionCommon';

export default class SectionBlogList extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'grid';
    @api layout = {};
    @api mode = 'live';
    @api siteId;

    posts = [];
    loading = false;
    _loadedFor;

    get isEdit() {
        return this.mode === 'edit';
    }
    get rootClass() {
        return sectionRootClass('sec_blog', {
            variant: this.variant,
            style: this.sectionStyle,
            layout: this.layout,
            mode: this.mode
        });
    }
    get rootStyle() {
        return sectionRootStyle(this.sectionStyle);
    }
    get headingFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'heading');
    }
    get heading() {
        return this.content?.heading || '';
    }
    get gridClass() {
        return this.variant === 'list' ? 'blog__grid blog__grid_list' : 'blog__grid';
    }

    get hasPosts() {
        return this.posts.length > 0;
    }
    get hasSite() {
        return !!this.siteId;
    }
    get showEmptyNoSite() {
        return this.isEdit && !this.hasSite;
    }
    get showEmptyNoPosts() {
        return this.isEdit && this.hasSite && !this.loading && !this.hasPosts;
    }

    renderedCallback() {
        if (!this.siteId || this.siteId === this._loadedFor) {
            return;
        }
        this._loadedFor = this.siteId;
        this.loading = true;
        getPublishedPosts({ siteId: this.siteId })
            .then((rows) => {
                this.posts = (rows || []).map((p) => ({
                    id: p.id,
                    title: p.title,
                    excerpt: p.excerpt,
                    hasCover: !!p.coverImageUrl,
                    coverStyle: p.coverImageUrl ? `background-image:url('${p.coverImageUrl}')` : '',
                    dateLabel: this.formatDate(p.publishedAt)
                }));
            })
            .catch(() => {
                this.posts = [];
            })
            .finally(() => {
                this.loading = false;
            });
    }

    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    handleKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        }
    }
    handleHeadingEdit(event) {
        commitField(this, event, this.content);
    }

    formatDate(iso) {
        if (!iso) {
            return '';
        }
        try {
            return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
        } catch {
            return '';
        }
    }
}