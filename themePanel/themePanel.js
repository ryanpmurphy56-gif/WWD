/**
 * themePanel — the design-system controls (brief §4.3). Personality preset
 * picker, curated + custom palette, font pairing, and radius/spacing/motion
 * scales. Every change writes to the shared store, so the whole site restyles
 * live. Reads current theme from a prop; holds no state of its own.
 */
import { LightningElement, api } from 'lwc';
import store from 'c/siteStateService';
import {
    PERSONALITIES,
    PALETTES,
    FONT_PAIRS,
    RADII,
    SPACINGS,
    MOTIONS,
    COLOR_ROLES,
    LINK_COLORS,
    BUTTON_VARIANTS,
    LINK_UNDERLINES,
    HEADING_WEIGHTS,
    HEADING_COLORS
} from 'c/themePresets';

export default class ThemePanel extends LightningElement {
    @api theme = {};

    get palette() {
        return this.theme?.palette || {};
    }

    get personalities() {
        const current = this.theme?.personality;
        return PERSONALITIES.map((p) => ({
            id: p.id,
            label: p.label,
            cssClass: p.id === current ? 'chip chip_on' : 'chip'
        }));
    }

    get palettes() {
        const p = this.palette;
        return PALETTES.map((pal) => ({
            ...pal,
            selected:
                pal.primary === p.primary &&
                pal.secondary === p.secondary &&
                pal.surface === p.surface &&
                pal.text === p.text
        }));
    }

    get fontPairs() {
        const current = this.theme?.fontPair;
        return FONT_PAIRS.map((f) => ({ ...f, selected: f.id === current }));
    }

    get radii() {
        return this.mapScale(RADII, this.theme?.radius);
    }
    get spacings() {
        return this.mapScale(SPACINGS, this.theme?.spacing);
    }
    get motions() {
        return this.mapScale(MOTIONS, this.theme?.motion);
    }

    mapScale(list, current) {
        return list.map((o) => ({
            id: o.id,
            label: o.label,
            cssClass: o.id === current ? 'seg seg_on' : 'seg'
        }));
    }

    // Custom palette current values
    get primary() {
        return this.palette.primary || '#1f3d5c';
    }
    get secondary() {
        return this.palette.secondary || '#ff5b04';
    }
    get accent() {
        return this.palette.accent || this.palette.secondary || '#ff5b04';
    }
    get surface() {
        return this.palette.surface || '#ffffff';
    }
    get textColor() {
        return this.palette.text || '#0a0a0a';
    }

    // ---- buttons / links / forms / headings ------------------------------
    get button() {
        return this.theme?.button || {};
    }
    get link() {
        return this.theme?.link || {};
    }
    get form() {
        return this.theme?.form || {};
    }
    get heading() {
        return this.theme?.heading || {};
    }

    get buttonColorRoles() {
        return this.mapScale(COLOR_ROLES, this.button.color || 'secondary');
    }
    get buttonVariants() {
        return this.mapScale(BUTTON_VARIANTS, this.button.variant || 'solid');
    }
    get linkColors() {
        return this.mapScale(LINK_COLORS, this.link.color || 'inherit');
    }
    get linkUnderlines() {
        return this.mapScale(LINK_UNDERLINES, this.link.underline || 'none');
    }
    get formAccents() {
        return this.mapScale(COLOR_ROLES, this.form.accent || 'secondary');
    }
    get headingWeights() {
        return this.mapScale(HEADING_WEIGHTS, this.heading.weight || 'default');
    }
    get headingColors() {
        return this.mapScale(HEADING_COLORS, this.heading.color || 'inherit');
    }

    // ---- writes ----------------------------------------------------------
    handlePersonality(event) {
        store.applyPersonality(event.currentTarget.dataset.id);
    }

    handlePaletteSelect(event) {
        const pal = PALETTES.find((p) => p.id === event.detail.id);
        if (pal) {
            store.updatePalette({
                primary: pal.primary,
                secondary: pal.secondary,
                surface: pal.surface,
                text: pal.text
            });
        }
    }

    handleColor(event) {
        store.updatePalette({ [event.currentTarget.dataset.key]: event.target.value });
    }

    handleFont(event) {
        store.updateTheme({ fontPair: event.detail.id });
    }

    handleRadius(event) {
        store.updateTheme({ radius: event.currentTarget.dataset.id });
    }

    handleSpacing(event) {
        store.updateTheme({ spacing: event.currentTarget.dataset.id });
    }

    handleMotion(event) {
        store.updateTheme({ motion: event.currentTarget.dataset.id });
    }

    handleButtonColor(event) {
        store.updateThemeGroup('button', { color: event.currentTarget.dataset.id });
    }
    handleButtonVariant(event) {
        store.updateThemeGroup('button', { variant: event.currentTarget.dataset.id });
    }
    handleLinkColor(event) {
        store.updateThemeGroup('link', { color: event.currentTarget.dataset.id });
    }
    handleLinkUnderline(event) {
        store.updateThemeGroup('link', { underline: event.currentTarget.dataset.id });
    }
    handleFormAccent(event) {
        store.updateThemeGroup('form', { accent: event.currentTarget.dataset.id });
    }
    handleHeadingWeight(event) {
        store.updateThemeGroup('heading', { weight: event.currentTarget.dataset.id });
    }
    handleHeadingColor(event) {
        store.updateThemeGroup('heading', { color: event.currentTarget.dataset.id });
    }
}