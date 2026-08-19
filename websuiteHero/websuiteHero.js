import { LightningElement, api } from 'lwc';
import { loadWebsuiteStyles, openWizard, loadGsap, prefersReducedMotion } from 'c/websuiteStyles';

export default class WebsuiteHero extends LightningElement {
    @api eyebrow = 'No call. No quote. No contract.';
    @api headline = 'Describe your business.';
    @api headlineEmphasis = 'See your site.';
    @api subCopy =
        "Answer six questions. We'll build you a real, working website in about sixty seconds — then you decide who finishes it. You, us, or both.";
    @api primaryCtaLabel = 'See your site';
    @api secondaryCtaLabel = 'Browse templates';
    @api fineprint = 'Free to build. Free to look at. You only pay when you go live.';
    @api briefTitle = 'Your brief';

    stylesLoaded = false;

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteHero: failed to load shared styles', error);
        });
        this.playEntrance();
    }

    playEntrance() {
        if (prefersReducedMotion()) {
            return;
        }
        loadGsap(this)
            .then((gsap) => {
                if (!gsap) {
                    return;
                }
                const q = (sel) => this.template.querySelector(sel);
                gsap.timeline({ defaults: { ease: 'power3.out' } })
                    .from(q('.eyebrow'), { y: 20, opacity: 0, duration: 0.5 })
                    .from(q('.ws-h1'), { y: 44, opacity: 0, duration: 0.75 }, '-=0.25')
                    .from(q('.ws-sub'), { y: 26, opacity: 0, duration: 0.6 }, '-=0.45')
                    .from(q('.ws-hero-cta'), { y: 20, opacity: 0, duration: 0.5 }, '-=0.35')
                    .from(q('.ws-fineprint'), { opacity: 0, duration: 0.4 }, '-=0.2')
                    .from(q('c-websuite-brief-card'), { x: 70, opacity: 0, duration: 0.85 }, '-=0.7');
            })
            .catch(() => {
                /* animation is decoration — content is already visible */
            });
    }

    // The wizard owns live brief state; the hero always shows the
    // pre-wizard, all-dashes brief — matching the mock's initial view.
    get emptyBrief() {
        return { purpose: '', goal: [], pages: [], style: '', name: '', about: '' };
    }

    handlePrimaryCta() {
        openWizard();
    }
}