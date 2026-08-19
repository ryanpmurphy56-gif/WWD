import { LightningElement, api } from 'lwc';
import { loadWebsuiteStyles, openWizard, revealOnScroll } from 'c/websuiteStyles';

export default class WebsuiteFinalCta extends LightningElement {
    @api headline = 'Six questions.';
    @api headlineEmphasis = 'Sixty seconds.';
    @api subCopy =
        "Then you'll know exactly what we'd build you — before you've paid a cent or spoken to anyone.";
    @api ctaLabel = 'See your site';

    stylesLoaded = false;

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteFinalCta: failed to load shared styles', error);
        });
        revealOnScroll(this, '.ws-final h2, .ws-final p, .ws-final .btn', { y: 30, stagger: 0.12 });
    }

    handleCta() {
        openWizard();
    }
}