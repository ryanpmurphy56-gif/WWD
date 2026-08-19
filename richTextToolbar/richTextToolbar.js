/**
 * richTextToolbar — the floating inline-formatting toolbar shown above a
 * focused rich-text field (currently the hero heading/subheading). Purely
 * presentational: pageCanvas positions it and executes the format command via
 * document.execCommand on whatever contenteditable currently has focus.
 *
 * Buttons use onmousedown + preventDefault rather than relying on click alone,
 * so the browser never shifts focus (and collapses the text selection) away
 * from the field being formatted before the command runs.
 */
import { LightningElement, api } from 'lwc';

export default class RichTextToolbar extends LightningElement {
    @api top = 0;
    @api left = 0;

    get hostStyle() {
        return `top:${this.top}px; left:${this.left}px;`;
    }

    stopDefault(event) {
        event.preventDefault();
    }

    fire(event) {
        const { cmd, value } = event.currentTarget.dataset;
        this.dispatchEvent(new CustomEvent('format', { detail: { command: cmd, value: value || null } }));
    }
}