import { LightningElement, api, wire } from 'lwc';
import { loadWebsuiteStyles, revealOnScroll } from 'c/websuiteStyles';
import getVisibleClients from '@salesforce/apex/WebsuiteClientController.getVisibleClients';

const CASES = [
    {
        client: 'Bendigo Health Foundation',
        tag: 'Not for profit',
        artStyle: 'background:#F2EDE8;color:#0A0A0A',
        title: 'A donation portal that runs itself',
        statNumber: '+62%',
        statLabel: 'Online donations, first six months',
        copy: 'A custom donation portal with a seamless payment gateway and a user-led admin — so the team stops asking us to change things and just changes them.'
    },
    {
        client: 'buxton bendigo',
        tag: 'Real estate',
        artStyle: 'background:#000;color:#fff',
        title: 'Listings that publish themselves',
        statNumber: '0 min',
        statLabel: 'Spent manually updating listings',
        copy: 'Integrated with Remsuite so agents publish and update properties in real time. Instant lead notifications, document management built in.'
    },
    {
        client: 'LADD + ASSOCIATES',
        tag: 'Consulting',
        artStyle: 'background:#0E1533;color:#7FE3F0',
        title: 'A consultancy that looks like one',
        statNumber: '3×',
        statLabel: 'Qualified enquiries per month',
        copy: 'Government and not-for-profit expertise, front and centre. Their Technology One and Salesforce capability finally visible to the people buying it.'
    }
];

// Match a company name to an authored story regardless of case/punctuation
// (e.g. "Ladd + Associates" ↔ "LADD + ASSOCIATES").
function normName(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export default class WebsuiteCaseStudies extends LightningElement {
    @api eyebrow = 'Our work';
    @api heading = 'What it did, not just what it looked like.';
    @api lead = "A website isn't a brochure. Here's what changed for three businesses after we shipped.";

    stylesLoaded = false;
    revealed = false;
    ordered;

    @wire(getVisibleClients)
    wiredClients({ data }) {
        // Always assign so the reactive change re-renders and the reveal runs
        // against the final, reordered set of stories.
        this.ordered = data && data.length ? data : [];
    }

    // Curated stories, reordered to follow the Command Center company order with
    // the hero company's story leading. Companies with no authored story simply
    // don't appear — case studies stay editorial. Falls back to the original
    // order before live data arrives or when nothing matches.
    get cases() {
        if (!this.ordered || !this.ordered.length) {
            return CASES;
        }
        const byName = new Map(CASES.map((c) => [normName(c.client), c]));
        const heroes = this.ordered.filter((c) => c.isHero);
        const rest = this.ordered.filter((c) => !c.isHero);
        const result = [];
        [...heroes, ...rest].forEach((co) => {
            const match = byName.get(normName(co.name));
            if (match && !result.includes(match)) {
                result.push(match);
            }
        });
        return result.length ? result : CASES;
    }

    renderedCallback() {
        if (!this.stylesLoaded) {
            this.stylesLoaded = true;
            loadWebsuiteStyles(this).catch((error) => {

                console.error('websuiteCaseStudies: failed to load shared styles', error);
            });
        }
        // Reveal once, after the wire has settled the final order.
        if (this.ordered !== undefined && !this.revealed) {
            this.revealed = true;
            revealOnScroll(this, '.ws-sec-head, .ws-case', { stagger: 0.12 });
        }
    }

    handleReadStory(event) {
        // Placeholder links in the concept — stop '#' from hijacking the LWR router.
        event.preventDefault();
    }
}