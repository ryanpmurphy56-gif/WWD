import { LightningElement, api } from 'lwc';
import { loadWebsuiteStyles, openWizard } from 'c/websuiteStyles';

// Link columns. Hrefs default to in-page anchors so the footer navigates the
// marketing page; every href/label is overridable from Experience Builder.
const COLUMNS = [
    {
        title: 'Use Cases',
        links: [
            { id: 'nfp', label: 'Not For Profit', href: '#not-for-profit' },
            { id: 'smb', label: 'Small Business', href: '#small-business' },
            { id: 'ent', label: 'Enterprise', href: '#enterprise' }
        ]
    },
    {
        title: 'Company',
        links: [
            { id: 'about', label: 'Who We Are', href: '#about' },
            { id: 'contact', label: 'Contact Us', href: '#contact' }
        ]
    }
];

export default class WebsuiteFooter extends LightningElement {
    @api logoText = 'WebSuite';
    @api pillTagline = 'Scroll With Style';
    @api headline = 'Bendigo Built.';
    @api addressLine1 = '93–95 Williamson Street,';
    @api addressLine2 = 'Bendigo VIC 3550';
    @api description =
        'Websuite is a web design and development studio based in Bendigo, Victoria, Australia. ' +
        'The company builds functional, high-performance websites for not-for-profit organisations, ' +
        'small businesses, and enterprise-level entities. Websuite is affiliated with Ladd + Associates, ' +
        'a Bendigo-based business consultancy providing cross-industry expertise spanning healthcare, ' +
        'local government, retail, and professional services. Tagline: “Scroll With Style.”';
    @api contactEmail = 'hello@laddandassociates.com';
    @api copyrightText = '© 2026 Websuite. All rights reserved.';
    @api privacyLabel = 'Privacy Policy';
    @api privacyHref = '#privacy';
    @api ctaLabel = 'Contact Us';
    @api facebookUrl = '#';
    @api instagramUrl = '#';
    @api linkedinUrl = '#';

    stylesLoaded = false;
    columns = COLUMNS;

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteFooter: failed to load shared styles', error);
        });
    }

    get mailtoHref() {
        return `mailto:${this.contactEmail}`;
    }

    // The primary conversion action, same as the header CTA — opens the wizard.
    handleContact() {
        openWizard();
    }
}