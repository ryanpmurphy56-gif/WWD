import { LightningElement, api } from 'lwc';
import { loadWebsuiteStyles, openWizard, revealOnScroll } from 'c/websuiteStyles';

const TIERS = [
    {
        name: 'Solo',
        kicker: 'Do it yourself',
        price: '$29',
        priceSuffix: '/mo',
        setup: 'No setup fee. Cancel any time.',
        bullets: [
            'Full editor, every tool',
            'All 24 templates',
            'Domain, SSL, AU hosting',
            'Forms, SEO, analytics',
            'Email support'
        ],
        cta: 'Start building',
        pick: false,
        btnClass: 'btn btn-ghost'
    },
    {
        name: 'Built',
        kicker: 'Most people pick this',
        price: '$49',
        priceSuffix: '/mo',
        setup: "+ $990 once, and it's live this week.",
        bullets: [
            'Everything in Solo',
            'We build it for you',
            'Your copy, your photos, done properly',
            'Request button — we make changes',
            'Leads land in your CRM',
            '4-hour support response'
        ],
        cta: 'Get it built',
        pick: true,
        btnClass: 'btn btn-orange'
    },
    {
        name: 'Custom',
        kicker: 'Bring in a designer',
        price: 'Quoted',
        priceSuffix: '',
        setup: "For when off-the-shelf won't do it.",
        bullets: [
            'Everything in Built',
            'Designed from scratch',
            'Custom integrations',
            'Ecommerce, portals, bookings',
            'Named account manager'
        ],
        cta: 'Talk to us',
        pick: false,
        btnClass: 'btn btn-ghost'
    }
];

export default class WebsuitePricing extends LightningElement {
    @api eyebrow = 'Pricing';
    @api heading = 'One price. Everything in it.';
    @api lead =
        'No feature gates. No transaction fees on your sales. Monthly or yearly — yearly saves you two months.';
    @api domainHeading = 'Start with the name.';
    @api domainSub = 'Free for the first year on any yearly plan.';

    stylesLoaded = false;
    dnsChecked = false;
    dnsName = '';

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuitePricing: failed to load shared styles', error);
        });
        revealOnScroll(this, '.ws-sec-head, .ws-tier, .ws-domain', { stagger: 0.1 });
    }

    get tiers() {
        return TIERS.map((tier) => ({
            ...tier,
            cardClass: tier.pick ? 'ws-tier ws-tier_pick' : 'ws-tier',
            monoClass: tier.pick ? 'mono ws-kicker ws-kicker_pick' : 'mono ws-kicker'
        }));
    }

    handleTierCta() {
        openWizard();
    }

    handleDomainKey(event) {
        if (event.key === 'Enter') {
            this.handleDomainCheck();
        }
    }

    handleDomainCheck() {
        const input = this.template.querySelector('input');
        const value = (input.value || '').trim();
        this.dnsChecked = true;
        // Concept-only availability check — always "available", like the mock.
        this.dnsName = value ? value.replace(/\.(com|com\.au|au|net|org)$/, '') : '';
    }
}