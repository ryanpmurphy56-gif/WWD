import { LightningElement, api } from 'lwc';
import { sectionRootClass, sectionRootStyle, blockStyle, commitField, fieldStyle } from 'c/sectionCommon';

export default class SectionTextBlock extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'centered';
    @api layout = {};
    @api mode = 'live';

    get isEdit() {
        return this.mode === 'edit';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    get rootClass() {
        return sectionRootClass('sec_text', {
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
    // Per-field typography overrides (font size/weight/line-height/letter
    // spacing/text-shadow) — independent of the section-wide style shell above.
    get headingFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'heading');
    }
    get bodyFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'body');
    }
    get heading() {
        return this.content?.heading || '';
    }
    get body() {
        return this.content?.body || '';
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