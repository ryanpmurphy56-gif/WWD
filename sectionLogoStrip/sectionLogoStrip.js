import { LightningElement, api } from 'lwc';
import {
    sectionRootClass,
    sectionRootStyle,
    blockStyle,
    commitField,
    commitListItem,
    addListItem,
    removeListItem,
    fieldStyle
} from 'c/sectionCommon';

export default class SectionLogoStrip extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'row';
    @api layout = {};
    @api mode = 'live';

    get isEdit() {
        return this.mode === 'edit';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    get rootClass() {
        return sectionRootClass('sec_logostrip', {
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
    get headingFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'heading');
    }
    get items() {
        return (this.content?.items || []).map((it, index) => ({ ...it, index }));
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
    handleItemEdit(event) {
        commitListItem(this, event, this.content?.items);
    }
    handleAdd() {
        addListItem(this, this.content?.items, { name: 'New name' });
    }
    handleRemove(event) {
        removeListItem(this, this.content?.items, event.currentTarget.dataset.index);
    }
}