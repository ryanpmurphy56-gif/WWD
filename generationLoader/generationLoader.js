/**
 * generationLoader — the honest loading screen (brief §4.5). Cycles through
 * truthful progress states built from the draft ("Applying your warm style…",
 * "Laying out Home, Menu…", "Building your restaurant site…"), then emits `done`.
 * Purely presentational timing — the draft itself builds instantly; this gives
 * the generation a considered feel. Reusable for later "regenerate" actions.
 */
import { LightningElement, api } from 'lwc';

const STEP_MS = 700;
const FINISH_MS = 500;

// Playful fillers sprinkled between the truthful progress states. Two are
// drawn at random each run, so back-to-back generations don't read identically.
const FUN_POOL = [
    'Teaching the buttons to be clickable…',
    'Polishing pixels until they squeak…',
    'Convincing the footer to stay at the bottom…',
    'Asking the colors to play nicely…',
    'Giving the headlines a pep talk…',
    'Ironing the wrinkles out of the whitespace…',
    'Herding stray commas into the copy…',
    'Plumping the padding…'
];

export default class GenerationLoader extends LightningElement {
    @api personalityLabel = '';
    @api categoryLabel = 'website';
    @api pageNames = [];

    index = 0;
    messages = [];
    _timer;

    connectedCallback() {
        const pages = (this.pageNames || []).join(', ') || 'your pages';
        const fun = [...FUN_POOL].sort(() => Math.random() - 0.5).slice(0, 2);
        this.messages = [
            `Warming up your ${this.personalityLabel || 'chosen'} style…`,
            `Sketching ${pages} on a napkin…`,
            fun[0],
            fun[1],
            `Rolling out the welcome mat for your ${this.categoryLabel || 'website'}…`
        ];
        this.tick();
    }

    disconnectedCallback() {
        window.clearTimeout(this._timer);
    }

    tick() {
        // eslint-disable-next-line @lwc/lwc/no-async-operation -- timed progress screen; cleared in disconnectedCallback
        this._timer = window.setTimeout(() => {
            if (this.index < this.messages.length - 1) {
                this.index += 1;
                this.tick();
            } else {
                // eslint-disable-next-line @lwc/lwc/no-async-operation -- final beat before emitting done
                this._timer = window.setTimeout(
                    () => this.dispatchEvent(new CustomEvent('done')),
                    FINISH_MS
                );
            }
        }, STEP_MS);
    }

    get message() {
        return this.messages[this.index] || '';
    }

    get progressStyle() {
        const pct = ((this.index + 1) / (this.messages.length || 1)) * 100;
        return `width:${pct}%`;
    }
}