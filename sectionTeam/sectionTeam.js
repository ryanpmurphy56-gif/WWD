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

export default class SectionTeam extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'grid';
    @api layout = {};
    @api mode = 'live';

    get isEdit() {
        return this.mode === 'edit';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    get rootClass() {
        return sectionRootClass('sec_team', {
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
        return (this.content?.items || []).map((it, index) => ({
            ...it,
            index,
            // Initials avatar: first letter of the first two words of the name.
            initials:
                (it.name || '?')
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w.charAt(0).toUpperCase())
                    .join('') || '?'
        }));
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
        addListItem(this, this.content?.items, { name: 'New teammate', role: 'Role', bio: 'A line about them.' });
    }
    handleRemove(event) {
        removeListItem(this, this.content?.items, event.currentTarget.dataset.index);
    }
}