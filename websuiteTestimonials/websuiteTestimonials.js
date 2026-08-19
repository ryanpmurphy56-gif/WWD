import { LightningElement, api } from 'lwc';
import { loadWebsuiteStyles, revealOnScroll } from 'c/websuiteStyles';

const QUOTES = [
    {
        initials: 'SG',
        name: 'Sam Goode',
        role: 'Goode Eco Designs',
        text: '"We\'d been quoted twelve grand and four months. This was live in nine days and I can change the opening hours myself."'
    },
    {
        initials: 'HW',
        name: 'Mr Huw Williams',
        role: 'Orthopaedic surgeon, Bendigo',
        text: '"The bit that sold me was being able to just ask them to fix something. I don\'t want to learn a website. I want a website."'
    },
    {
        initials: 'BH',
        name: 'Bendigo Health Foundation',
        role: 'Not for profit',
        text: '"Our donation page used to lose people at the payment step. It doesn\'t now. That\'s the whole review, really."'
    }
];

export default class WebsuiteTestimonials extends LightningElement {
    @api eyebrow = "From people who've done it";
    @api heading = 'Ask them, not us.';

    stylesLoaded = false;
    quotes = QUOTES;

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteTestimonials: failed to load shared styles', error);
        });
        revealOnScroll(this, '.ws-sec-head, .ws-q');
    }
}