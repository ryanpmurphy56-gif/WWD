import { LightningElement, api } from 'lwc';
import { loadWebsuiteStyles, revealOnScroll } from 'c/websuiteStyles';

const TEMPLATES = [
    { name: 'Foundry', category: 'Trades', features: ['Leads'], bg: '#22262A', fg: '#E8A33D' },
    { name: 'Counter', category: 'Hospitality', features: ['Bookings', 'Shop'], bg: '#F3EEE6', fg: '#8A3B1E' },
    { name: 'Practice', category: 'Health', features: ['Bookings'], bg: '#E4EFE4', fg: '#1F4032' },
    { name: 'Ledger', category: 'Professional', features: ['Leads'], bg: '#0E1533', fg: '#7FE3F0' },
    { name: 'Frame', category: 'Portfolio', features: ['Gallery'], bg: '#FFFFFF', fg: '#0A0A0A' },
    { name: 'Bench', category: 'Small business', features: ['Shop', 'Gallery'], bg: '#2A2622', fg: '#EFE7DC' },
    { name: 'Give', category: 'Not for profit', features: ['Donations'], bg: '#F2EDE8', fg: '#C0392B' },
    { name: 'Site', category: 'Construction', features: ['Leads', 'Gallery'], bg: '#F4F5F8', fg: '#161B4A' },
    { name: 'Listing', category: 'Real estate', features: ['Leads', 'Gallery'], bg: '#000000', fg: '#FFFFFF' }
];

const CATEGORIES = [
    'All', 'Trades', 'Hospitality', 'Health', 'Professional', 'Portfolio',
    'Small business', 'Not for profit', 'Construction', 'Real estate'
];

export default class WebsuiteTemplateGallery extends LightningElement {
    @api eyebrow = 'Templates';
    @api heading = 'Start from something that already works.';
    @api lead =
        "Every template here is built from a site we've actually shipped. Not a mood board — a business that's out there right now, getting enquiries.";
    @api footCtaLabel = 'See all 24 templates';
    @api footNote = 'Every template is free on every plan. Switch whenever you like.';

    stylesLoaded = false;
    activeCategory = 'All';

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteTemplateGallery: failed to load shared styles', error);
        });
        revealOnScroll(this, '.ws-sec-head, .ws-tpl', { stagger: 0.07 });
    }

    get categories() {
        return CATEGORIES.map((name) => ({
            name,
            cssClass: name === this.activeCategory ? 'ws-chip ws-chip_on' : 'ws-chip'
        }));
    }

    get visibleTemplates() {
        return TEMPLATES.filter(
            (tpl) => this.activeCategory === 'All' || tpl.category === this.activeCategory
        ).map((tpl) => ({
            ...tpl,
            thumbStyle: `background:${tpl.bg};color:${tpl.fg}`,
            featureList: tpl.features.join(' · ')
        }));
    }

    get hasTemplates() {
        return this.visibleTemplates.length > 0;
    }

    handleFilter(event) {
        this.activeCategory = event.currentTarget.dataset.cat;
    }
}