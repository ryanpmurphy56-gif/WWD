import { LightningElement, api } from 'lwc';
import {
    sectionRootClass,
    sectionRootStyle,
    blockStyle,
    commitField,
    addListItem,
    removeListItem,
    fieldStyle,
    emitChange
} from 'c/sectionCommon';

export default class SectionFaq extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'list';
    @api layout = {};
    @api mode = 'live';

    editingIndex = null;

    get isEdit() {
        return this.mode === 'edit';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    get rootClass() {
        return sectionRootClass('sec_faq', {
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

    // Per-field typography override — independent of the section-wide style shell above.
    get headingFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'heading');
    }

    get items() {
        return (this.content?.items || []).map((it, index) => ({ ...it, index }));
    }

    get editingItem() {
        return this.editingIndex === null ? null : this.items[this.editingIndex] || null;
    }

    handleKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        }
    }
    handleFieldEdit(event) {
        commitField(this, event, this.content);
    }
    handleItemClick(event) {
        // Opening the popup replaces inline editing — stop the click from also
        // bubbling into sectionSlot's canvas-select handler.
        event.stopPropagation();
        this.editingIndex = Number(event.currentTarget.dataset.index);
    }
    handleAdd() {
        addListItem(this, this.content?.items, { q: 'A new question?', a: 'And a helpful answer.' });
    }
    handleRemove(event) {
        event.stopPropagation();
        removeListItem(this, this.content?.items, event.currentTarget.dataset.index);
    }
    handleEditorSave(event) {
        const list = this.content?.items || [];
        const next = list.map((item, i) => (i === this.editingIndex ? { ...item, ...event.detail } : { ...item }));
        emitChange(this, { items: next });
        this.editingIndex = null;
    }
    handleEditorClose() {
        this.editingIndex = null;
    }
}