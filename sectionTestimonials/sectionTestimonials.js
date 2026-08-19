import { LightningElement, api } from 'lwc';
import { sectionRootClass, sectionRootStyle, blockStyle, commitListItem, addListItem, removeListItem } from 'c/sectionCommon';

export default class SectionTestimonials extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'single';
    @api layout = {};
    @api mode = 'live';

    get isEdit() {
        return this.mode === 'edit';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    get rootClass() {
        return sectionRootClass('sec_quotes', {
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
        return (this.content?.items || []).map((it, index) => ({ ...it, index }));
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
        addListItem(this, this.content?.items, { quote: 'They were brilliant.', author: 'A customer' });
    }
    handleRemove(event) {
        removeListItem(this, this.content?.items, event.currentTarget.dataset.index);
    }
}