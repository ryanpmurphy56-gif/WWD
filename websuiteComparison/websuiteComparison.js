import { LightningElement, api } from 'lwc';
import { loadWebsuiteStyles, revealOnScroll } from 'c/websuiteStyles';

// no: greyed-out cell in the mock ("your problem", "add-on", etc.)
const ROWS = [
    { label: 'Build it yourself', us: 'Yes', squarespace: 'Yes', wix: 'Yes', webflow: 'Yes' },
    { label: 'We build it for you', us: 'Included tier', squarespace: 'Hire a freelancer', wix: 'Hire a freelancer', webflow: 'Hire an agency', no: ['sq', 'wix', 'wf'] },
    { label: 'Ask a human to change something', us: 'Any time', squarespace: 'No', wix: 'No', webflow: 'No', no: ['sq', 'wix', 'wf'] },
    { label: 'Leads land in a CRM', us: 'Built in', squarespace: 'Add-on', wix: 'Add-on', webflow: 'Integration', no: ['sq', 'wix', 'wf'] },
    { label: 'Australian hosting & data', us: 'Yes', squarespace: 'No', wix: 'No', webflow: 'No', no: ['sq', 'wix', 'wf'] },
    { label: 'Accessible (WCAG 2.2) by default', us: 'Every template', squarespace: 'Your problem', wix: 'Your problem', webflow: 'Your problem', no: ['sq', 'wix', 'wf'] },
    { label: 'You own and can export your site', us: 'Always', squarespace: 'Limited', wix: 'Limited', webflow: 'Yes', no: ['sq', 'wix'] },
    { label: 'Support that answers', us: 'Real person, 4 hrs', squarespace: 'Email / chat', wix: '24/7 chat', webflow: 'Email' }
];

export default class WebsuiteComparison extends LightningElement {
    @api eyebrow = 'Straight comparison';
    @api heading = 'The others hand you a builder and leave.';
    @api lead =
        "We're not pretending to out-feature a company with four thousand engineers. We're pointing at the gap they all have.";
    @api fairNote =
        "Being fair about it: they're excellent products. Squarespace has better templates than we do today. Webflow gives designers more rope. If you want to do it entirely alone and never speak to anyone, use them — we'd say the same thing to a mate.";

    stylesLoaded = false;

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteComparison: failed to load shared styles', error);
        });
        revealOnScroll(this, '.ws-sec-head, .ws-cmp tbody tr', { x: -28, y: 0, duration: 0.6, stagger: 0.06 });
    }

    get rows() {
        return ROWS.map((row) => {
            const no = row.no || [];
            return {
                ...row,
                sqClass: no.includes('sq') ? 'ws-no' : '',
                wixClass: no.includes('wix') ? 'ws-no' : '',
                wfClass: no.includes('wf') ? 'ws-no' : ''
            };
        });
    }
}