/**
 * pageTemplatePicker — the "add a page" picker. A modal grid of page templates
 * (Blank, About, Services, …) from c/siteTemplates. Picking one emits `pick`
 * with the template id and a suggested title; the page rail creates the page via
 * the store. Rendered as a modal, mirroring c/sectionLibrary.
 */
import { LightningElement } from 'lwc';
import { pageTemplates } from 'c/siteTemplates';

export default class PageTemplatePicker extends LightningElement {
    get templates() {
        return pageTemplates();
    }

    handlePick(event) {
        const { id, label } = event.currentTarget.dataset;
        // 'Blank' is a generic starting point, so give it a neutral page name;
        // every other template names the page after itself.
        const title = id === 'blank' ? 'New page' : label;
        this.dispatchEvent(new CustomEvent('pick', { detail: { templateId: id, title } }));
    }

    close() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleBackdrop() {
        this.close();
    }

    stop(event) {
        event.stopPropagation();
    }
}