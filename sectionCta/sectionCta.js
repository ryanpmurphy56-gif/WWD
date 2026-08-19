import { LightningElement, api } from 'lwc';
import { sectionRootClass, sectionRootStyle, blockStyle, commitField, fieldStyle } from 'c/sectionCommon';

export default class SectionCta extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'banner';
    @api layout = {};
    @api mode = 'live';

    get isEdit() {
        return this.mode === 'edit';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    get rootClass() {
        return sectionRootClass('sec_cta', {
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
    get bodyFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'body');
    }
    get ctaLabelFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'ctaLabel');
    }
    get href() {
        return this.content?.ctaTarget || '#';
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
    // In edit mode the button is a text field, not a link.
    handleCtaClick(event) {
        if (this.isEdit) {
            event.preventDefault();
        }
    }
}