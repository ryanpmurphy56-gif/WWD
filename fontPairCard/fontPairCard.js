/**
 * fontPairCard — one heading/body font pairing preset (brief §4.3).
 * Presentational; emits `select` with the pair id when clicked.
 */
import { LightningElement, api } from 'lwc';

export default class FontPairCard extends LightningElement {
    @api pair = {};
    @api selected = false;

    get cssClass() {
        return this.selected ? 'card card_on' : 'card';
    }

    get headingStyle() {
        return `font-family:${this.pair.heading}`;
    }

    get bodyStyle() {
        return `font-family:${this.pair.body}`;
    }

    handleClick() {
        this.dispatchEvent(new CustomEvent('select', { detail: { id: this.pair.id } }));
    }
}