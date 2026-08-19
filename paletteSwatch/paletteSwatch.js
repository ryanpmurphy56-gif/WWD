/**
 * paletteSwatch — one curated palette shown as its colour bands (brief §4.3).
 * Presentational; emits `select` with the palette id when clicked.
 */
import { LightningElement, api } from 'lwc';

export default class PaletteSwatch extends LightningElement {
    @api palette = {};
    @api selected = false;

    get cssClass() {
        return this.selected ? 'swatch swatch_on' : 'swatch';
    }

    get bands() {
        const p = this.palette;
        return [
            { key: 'primary', style: `background:${p.primary}` },
            { key: 'secondary', style: `background:${p.secondary}` },
            { key: 'accent', style: `background:${p.accent || p.secondary}` },
            { key: 'surface', style: `background:${p.surface}` },
            { key: 'text', style: `background:${p.text}` }
        ];
    }

    handleClick() {
        this.dispatchEvent(new CustomEvent('select', { detail: { id: this.palette.id } }));
    }
}