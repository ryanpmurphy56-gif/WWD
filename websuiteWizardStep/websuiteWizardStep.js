import { LightningElement, api } from 'lwc';

/**
 * Generic wizard step: renders a heading and a grid of selectable options.
 * Dumb by design — the wizard owns all state; this just renders and emits.
 *
 * mode: 'single' | 'multi' | 'swatch' (swatch is single-select with art tiles)
 */
export default class WebsuiteWizardStep extends LightningElement {
    @api stepLabel = '';
    @api stepTitle = '';
    @api hint = '';
    @api mode = 'single';
    @api columns = 3;
    @api options = [];
    @api selected = [];

    get isSwatch() {
        return this.mode === 'swatch';
    }

    get gridClass() {
        return Number(this.columns) === 2 ? 'ws-grid ws-g2' : 'ws-grid ws-g3';
    }

    get selectedValues() {
        return Array.isArray(this.selected) ? this.selected : [this.selected];
    }

    get decoratedOptions() {
        const base = this.isSwatch ? 'ws-swatch' : 'ws-opt';
        return this.options.map((opt) => {
            const isSelected = this.selectedValues.includes(opt.value);
            return {
                ...opt,
                cssClass: isSelected ? `${base} ${base}_sel` : base
            };
        });
    }

    handleSelect(event) {
        this.dispatchEvent(
            new CustomEvent('optionselect', {
                detail: { value: event.currentTarget.dataset.value }
            })
        );
    }
}