/**
 * elementPanel — the small popover opened from the canvas's "+" FAB (edit
 * mode only). Lists the granular element kinds (Layout/Text/Image/Button/
 * Spacer) a user can drop into a freeform section. Picking one just reports
 * the kind; pageCanvas owns creating the freeform section/element via the
 * store.
 */
import { LightningElement } from 'lwc';
import { elementKinds } from 'c/sectionRegistry';

export default class ElementPanel extends LightningElement {
    get kinds() {
        return elementKinds();
    }

    handlePick(event) {
        this.dispatchEvent(new CustomEvent('pick', { detail: { kind: event.currentTarget.dataset.kind } }));
    }
}