import { LightningElement, api } from 'lwc';
import store from 'c/siteStateService';
import { uploadFile } from 'c/assetUpload';
import {
    sectionRootClass,
    sectionRootStyle,
    blockStyle,
    commitListItem,
    addListItem,
    removeListItem,
    moveListItem
} from 'c/sectionCommon';

export default class SectionGallery extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'grid';
    @api layout = {};
    @api mode = 'live';

    uploadingIndex = -1;
    _pendingIndex = -1;

    get isEdit() {
        return this.mode === 'edit';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    get rootClass() {
        return sectionRootClass('sec_gallery', {
            variant: this.variant,
            style: this.sectionStyle,
            layout: this.layout,
            mode: this.mode
        });
    }
    get rootStyle() {
        return sectionRootStyle(this.sectionStyle, { imageUrl: this.content?.imageUrl });
    }
    get blockStyle() {
        return blockStyle(this.layout);
    }
    get items() {
        const items = this.content?.items || [];
        return items.map((it, index) => ({
            ...it,
            index,
            hasImage: !!it.imageUrl,
            uploading: index === this.uploadingIndex,
            isFirst: index === 0,
            isLast: index === items.length - 1
        }));
    }

    handleKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        }
    }
    handleItemEdit(event) {
        commitListItem(this, event, this.content?.items);
    }
    handleAdd() {
        addListItem(this, this.content?.items, { caption: 'New image' });
    }
    handleRemove(event) {
        removeListItem(this, this.content?.items, event.currentTarget.dataset.index);
    }
    handleMoveUp(event) {
        moveListItem(this, this.content?.items, event.currentTarget.dataset.index, -1);
    }
    handleMoveDown(event) {
        moveListItem(this, this.content?.items, event.currentTarget.dataset.index, 1);
    }

    // ---- inline per-tile image upload -----------------------------------
    handleTileClick(event) {
        if (!this.isEdit) {
            return;
        }
        this._pendingIndex = Number(event.currentTarget.dataset.index);
        const input = this.template.querySelector('input.gallery__file');
        if (input) {
            input.click();
        }
    }

    handleFile(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        const idx = this._pendingIndex;
        if (!file || idx < 0) {
            return;
        }
        this.uploadingIndex = idx;
        uploadFile(file, store.getRecordId())
            .then((res) => {
                store.touchRecentAsset(res.assetId);
                const next = (this.content?.items || []).map((x) => ({ ...x }));
                if (next[idx]) {
                    next[idx].imageUrl = res.url;
                    next[idx].imageAssetId = res.assetId;
                    this.dispatchEvent(new CustomEvent('contentchange', { detail: { patch: { items: next } } }));
                }
            })
            .catch(() => {
                /* surfaced elsewhere; keep placeholder on failure */
            })
            .finally(() => {
                this.uploadingIndex = -1;
            });
    }
}