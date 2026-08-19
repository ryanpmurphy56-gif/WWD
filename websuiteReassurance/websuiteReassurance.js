import { LightningElement, api } from 'lwc';
import { loadWebsuiteStyles, revealOnScroll } from 'c/websuiteStyles';

const ITEMS = [
    {
        title: 'Support that answers',
        copy: 'Four-hour response, business hours, from a person in Victoria. Not a bot, not a queue, not a "we\'ve received your ticket."'
    },
    {
        title: 'Moving from Wix or Squarespace?',
        copy: "We'll move you. Content, pages, domain, redirects. Free, and you don't go offline for a second."
    },
    {
        title: 'If you leave, you leave with it',
        copy: 'Your site, your content, your domain, your leads. Exported and handed over. No hostage-taking. Nobody else says this out loud.'
    },
    {
        title: 'Accessible by default',
        copy: "Every template ships WCAG 2.2 AA. If you're a health service, a council, or a not-for-profit, this isn't a nice-to-have — it's the tender."
    },
    {
        title: 'Safe and up',
        copy: 'SSL, daily backups, 99.9% uptime, Australian data hosting. Restore any version, any day, one click.'
    },
    {
        title: 'Learn it in an afternoon',
        copy: "Short video walkthroughs, a real help centre, and a live onboarding call if you'd rather someone show you."
    }
];

export default class WebsuiteReassurance extends LightningElement {
    @api eyebrow = 'The boring, important stuff';
    @api heading = 'No surprises. Ever.';

    stylesLoaded = false;
    items = ITEMS;

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteReassurance: failed to load shared styles', error);
        });
        revealOnScroll(this, '.ws-sec-head, .ws-re');
    }
}