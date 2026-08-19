/**
 * sectionEmbed — F14 power tool: an author-pasted HTML/JS snippet (booking
 * widgets, maps, third-party embeds), rendered in a SANDBOXED iframe.
 *
 * sandbox="allow-scripts allow-forms allow-popups" deliberately omits
 * allow-same-origin: the pasted code can run, but it cannot reach the
 * editor's own document, cookies, sessionStorage or the SiteConfig in
 * memory. This is the same trust boundary Webflow/Squarespace use for their
 * embed blocks — it's why this is safe to ship as a raw-HTML block when
 * injecting arbitrary script into the shell's own document (see
 * siteMarketing/siteSeoTools) would not be.
 */
import { LightningElement, api } from 'lwc';
import { sectionRootClass, sectionRootStyle } from 'c/sectionCommon';

export default class SectionEmbed extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'default';
    @api layout = {};
    @api mode = 'live';

    get isEdit() {
        return this.mode === 'edit';
    }
    get rootClass() {
        return sectionRootClass('sec_embed', {
            variant: this.variant,
            style: this.sectionStyle,
            layout: this.layout,
            mode: this.mode
        });
    }
    get rootStyle() {
        return sectionRootStyle(this.sectionStyle);
    }

    get html() {
        return this.content?.html || '';
    }
    get hasHtml() {
        return !!this.html.trim();
    }
    // LWC's template compiler rejects a declarative srcdoc binding on <iframe>
    // outright (LWC1048) — it's a security-sensitive attribute the compiler
    // won't let a template author wire up sight-unseen. Setting it
    // imperatively via the DOM property is the sanctioned way around that; the
    // real security boundary is the sandbox attribute above, set declaratively
    // with no such restriction.
    _lastHtml;
    renderedCallback() {
        if (this.html === this._lastHtml) {
            return;
        }
        const frame = this.template.querySelector('.embed__frame');
        if (frame) {
            frame.srcdoc = this.html;
            this._lastHtml = this.html;
        }
    }
}