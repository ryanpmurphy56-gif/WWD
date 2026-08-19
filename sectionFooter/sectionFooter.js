import { LightningElement, api } from 'lwc';
import { sectionRootClass, sectionRootStyle, blockStyle, commitField, fieldStyle } from 'c/sectionCommon';

export default class SectionFooter extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'simple';
    @api layout = {};
    @api mode = 'live';

    get isEdit() {
        return this.mode === 'edit';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    get rootClass() {
        return sectionRootClass('sec_footer', {
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
    get textFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'text');
    }

    get text() {
        return this.content?.text || '';
    }

    handleKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        }
    }
    handleEdit(event) {
        commitField(this, event, this.content);
    }
}