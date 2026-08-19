import { LightningElement, api } from 'lwc';
import { sectionRootClass, sectionRootStyle, blockStyle, commitField, focalPosition, fieldStyle } from 'c/sectionCommon';

export default class SectionImageText extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'image-left';
    @api layout = {};
    @api mode = 'live';

    get isEdit() {
        return this.mode === 'edit';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    get rootClass() {
        return sectionRootClass('sec_imgtext', {
            variant: this.variant,
            style: this.sectionStyle,
            layout: this.layout,
            mode: this.mode
        });
    }
    get rootStyle() {
        return sectionRootStyle(this.sectionStyle, {
            imageUrl: this.content?.imageUrl,
            focal: this.content?.focal
        });
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
    get imageUrl() {
        return this.content?.imageUrl || '';
    }
    get hasImage() {
        return !!this.imageUrl;
    }
    // Alt text comes from its own field; the heading is the fallback so the
    // image is never silently unlabeled.
    get imageAlt() {
        return this.content?.imageAlt || this.heading;
    }
    // The focal point keeps the subject in frame however the image is cropped.
    get imgStyle() {
        return `object-position:${focalPosition(this.content?.focal)};`;
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