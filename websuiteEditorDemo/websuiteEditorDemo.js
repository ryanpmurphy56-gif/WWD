import { LightningElement, api } from 'lwc';
import { loadWebsuiteStyles, revealOnScroll } from 'c/websuiteStyles';

const OK = 'ok'; // green value styling

const PANELS = {
    layout: {
        title: 'Layout',
        subtitle: 'Section: Hero',
        rows: [
            { label: 'Width', value: 'Full bleed' },
            { label: 'Padding', value: 'Large' },
            { label: 'Alignment', value: 'Centre' },
            { label: 'Order', value: 'Drag to move' }
        ],
        note: "Sections snap to a grid built by our designers. You can't accidentally break it."
    },
    text: {
        title: 'Text',
        subtitle: 'Heading',
        rows: [
            { label: 'Typeface', value: 'Archivo' },
            { label: 'Weight', value: 'Black 900' }
        ],
        note: 'Type scales are locked to the template so your site stays readable at every size.'
    },
    colour: {
        title: 'Colour',
        subtitle: 'Brand accent',
        rows: [],
        note: 'We check every colour against WCAG as you pick it. If it fails, we tell you.'
    },
    images: {
        title: 'Images',
        subtitle: 'Asset library',
        rows: [
            { label: 'Your uploads', value: '0 files' },
            { label: 'Logos', value: '1 file' },
            { label: 'Stock photos', value: 'Unlimited' },
            { label: 'Auto-compression', value: 'On', tone: OK }
        ],
        note: "Drop a 12MB photo in. We'll serve it as 90KB. Nothing to think about."
    },
    forms: {
        title: 'Forms & leads',
        subtitle: 'Contact form',
        rows: [
            { label: 'Fields', value: '4' },
            { label: 'Spam filter', value: 'On', tone: OK },
            { label: 'Notify', value: 'Email + SMS' },
            { label: 'Leads go to', value: 'Your CRM', tone: 'orange', rowTone: 'orange' }
        ],
        note: "Enquiries don't land in an inbox to be lost. They land in a pipeline."
    },
    shop: {
        title: 'Shop',
        subtitle: 'Not switched on',
        rows: [
            { label: 'Products', value: '—' },
            { label: 'Inventory', value: '—' },
            { label: 'Checkout', value: '—' }
        ],
        note: 'Catalogue, cart, checkout, payments. Add it the day you need it, not before.'
    },
    seo: {
        title: 'SEO',
        subtitle: 'Home page',
        rows: [
            { label: 'Page title', value: '52 / 60' },
            { label: 'Description', value: '138 / 160' },
            { label: 'Alt text', value: '3 / 3 done', tone: OK },
            { label: 'Speed score', value: '98', tone: OK }
        ],
        note: 'Google reads your site the way we build it: clean, fast, and in the right order.'
    }
};

const TOOLS = [
    { name: 'layout', label: 'Layout' },
    { name: 'text', label: 'Text' },
    { name: 'colour', label: 'Colour' },
    { name: 'images', label: 'Images' },
    { name: 'forms', label: 'Forms' },
    { name: 'shop', label: 'Shop' },
    { name: 'seo', label: 'SEO' }
];

const SWATCH_COLORS = ['#FF5B04', '#0A0A0A', '#1F3D5C', '#2E6B4F', '#7A5C3E', '#8B2C4F'];

export default class WebsuiteEditorDemo extends LightningElement {
    @api eyebrow = 'The editor — try it right here';
    @api heading = 'Every tool. No code. No ceiling.';
    @api lead =
        "This is the actual editor, not a screenshot. Click a tool. Change a colour. Flip to mobile. You'll be doing this for real in about a minute.";

    stylesLoaded = false;
    activeTool = 'layout';
    activeDevice = 'desktop';
    accentColor = '#FF5B04';
    headingSize = 24;
    swatchPicked = false;

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteEditorDemo: failed to load shared styles', error);
        });
        revealOnScroll(this, '.ws-sec-head', {});
        revealOnScroll(this, '.ws-ed', { y: 70, scale: 0.97, duration: 1, stagger: 0 });
    }

    get tools() {
        return TOOLS.map((tool) => ({
            ...tool,
            cssClass: tool.name === this.activeTool ? 'ws-tool ws-tool_on' : 'ws-tool'
        }));
    }

    get devices() {
        return ['desktop', 'tablet', 'mobile'].map((name) => ({
            name,
            cssClass: name === this.activeDevice ? 'ws-dev ws-dev_on' : 'ws-dev'
        }));
    }

    get swatches() {
        return SWATCH_COLORS.map((color) => ({
            color,
            style: `background:${color}`,
            cssClass: color === this.accentColor ? 'ws-sw ws-sw_on' : 'ws-sw'
        }));
    }

    get activePanel() {
        const panel = PANELS[this.activeTool];
        return {
            ...panel,
            rows: panel.rows.map((row) => ({
                ...row,
                rowClass: row.rowTone === 'orange' ? 'ws-row ws-row_orange' : 'ws-row',
                valueClass:
                    row.tone === OK ? 'ws-ok' : row.tone === 'orange' ? 'ws-val-orange' : 'ws-val'
            }))
        };
    }

    get isTextTool() {
        return this.activeTool === 'text';
    }

    get isColourTool() {
        return this.activeTool === 'colour';
    }

    get isShopTool() {
        return this.activeTool === 'shop';
    }

    get frameClass() {
        return `ws-frame ws-frame_${this.activeDevice}`;
    }

    get frameHeadingStyle() {
        const size = `font-size:${this.headingSize}px`;
        return this.swatchPicked ? `${size};color:${this.accentColor}` : size;
    }

    get frameCtaStyle() {
        return `background:${this.accentColor}`;
    }

    handleTool(event) {
        this.activeTool = event.currentTarget.dataset.tool;
    }

    handleDevice(event) {
        this.activeDevice = event.currentTarget.dataset.dev;
    }

    handleSwatch(event) {
        this.accentColor = event.currentTarget.dataset.c;
        this.swatchPicked = true;
    }

    handleSize(event) {
        this.headingSize = event.target.value;
    }
}