import { LightningElement, api } from 'lwc';
import { sectionRootClass, sectionRootStyle, blockStyle, commitField, fieldStyle } from 'c/sectionCommon';

export default class SectionNavHeader extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'left';
    @api layout = {};
    @api mode = 'live';
    // The site menu ({ items, mobileMenuStyle }) from c/navModel, threaded down
    // from the shell. Absent (e.g. a bare unit test) => an empty menu.
    @api navMenu;

    // Mobile hamburger state — local UI, never part of the config.
    menuOpen = false;

    get isEdit() {
        return this.mode === 'edit';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    get rootClass() {
        return sectionRootClass('sec_nav', {
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
    get brandFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'brand');
    }
    get ctaLabelFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'ctaLabel');
    }
    get brand() {
        return this.content?.brand || '';
    }
    get ctaLabel() {
        return this.content?.ctaLabel || '';
    }

    /**
     * The menu items, decorated for the template: `isLink` splits custom links
     * from pages, and links carry the target/rel that honour "open in new tab".
     */
    get menuItems() {
        const items = (this.navMenu && this.navMenu.items) || [];
        return items.map((it) => ({
            ...it,
            isLink: it.type === 'link',
            target: it.newTab ? '_blank' : '_self',
            rel: it.newTab ? 'noopener noreferrer' : null
        }));
    }

    get hasMenu() {
        return this.menuItems.length > 0;
    }

    get mobilePanelClass() {
        const style = (this.navMenu && this.navMenu.mobileMenuStyle) || 'dropdown';
        return `navm navm_${style}`;
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
    handleCtaClick(event) {
        event.preventDefault();
    }

    toggleMenu() {
        this.menuOpen = !this.menuOpen;
    }

    /**
     * A menu item was clicked. While editing, the header is inert (the section
     * exists to edit brand/CTA, and there is no other page to browse to). In
     * preview/live, a page item emits `navigate` so the shell switches pages;
     * custom links are real anchors and navigate on their own.
     */
    handleNavClick(event) {
        if (this.isEdit) {
            event.preventDefault();
            return;
        }
        const { type, pageId } = event.currentTarget.dataset;
        if (type === 'link') {
            return; // let the <a> navigate normally
        }
        event.preventDefault();
        this.menuOpen = false;
        this.dispatchEvent(
            new CustomEvent('navigate', { detail: { pageId }, bubbles: true, composed: true })
        );
    }
}