import { LightningElement, api } from 'lwc';
import { loadWebsuiteStyles, revealOnScroll } from 'c/websuiteStyles';

const FEATURES = [
    {
        num: '01',
        title: 'Drag-and-drop editor',
        copy: 'Move text, images, whole sections. Design separately for desktop, tablet and mobile, or let it just work.'
    },
    {
        num: '02',
        title: 'Domains & hosting',
        copy: 'Buy the domain, we point it. SSL, backups, and Australian hosting. Nothing to configure.'
    },
    {
        num: '03',
        title: 'Ecommerce',
        copy: 'Catalogue, inventory, cart, checkout, payments. Physical, digital, bookings, donations.'
    },
    {
        num: '04',
        title: 'SEO tools',
        copy: "Titles, descriptions, alt text, sitemaps, schema. Prompts you when something's missing."
    },
    {
        num: '05',
        title: 'Forms & lead capture',
        copy: 'Every enquiry becomes a record, not an email. Follow it up, or let it chase itself.'
    },
    {
        num: '06',
        title: 'Analytics',
        copy: 'Who came, what they read, what they clicked, and which page made the phone ring.'
    },
    {
        num: '07',
        title: 'Asset library',
        copy: 'Logos, photos, videos, PDFs, stock. One place, auto-compressed, reusable everywhere.'
    },
    {
        num: '08',
        title: 'A human, on request',
        copy: 'The one nobody else offers. Stuck at 11pm? Press Request. We do it.'
    }
];

export default class WebsuiteFeatureGrid extends LightningElement {
    @api eyebrow = 'Everything, included';
    @api heading = "You won't hit a wall.";
    @api lead = 'No feature gates, no "upgrade to unlock." If your business needs it, it\'s in there.';

    stylesLoaded = false;
    features = FEATURES;

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteFeatureGrid: failed to load shared styles', error);
        });
        revealOnScroll(this, '.ws-sec-head, .ws-feat');
    }
}