import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { loadWebsuiteStyles, OPEN_WIZARD_EVENT } from 'c/websuiteStyles';
import { buildDraft, buildBlankDraft } from 'c/siteTemplates';

const TOTAL_STEPS = 6;

// This wizard is the one and only "determine the site" flow — the editor's
// own onboarding wizard was removed in favour of this one. The editor picks
// the draft built here up from sessionStorage (see openEditor below).
const PENDING_DRAFT_KEY = 'websuitePendingSiteDraft';

// Map this wizard's marketing-friendly answers onto siteTemplates.buildDraft's
// contract (category/goal/personality from the registry + theme presets).
const CATEGORY_BY_PURPOSE = {
    'Local business': 'services',
    'Professional services': 'services',
    'Online store': 'retail',
    Portfolio: 'portfolio',
    'Not for profit': 'default',
    'Something else': 'default'
};

const GOAL_BY_LABEL = {
    'Get enquiries': 'leads',
    'Take bookings': 'bookings',
    'Sell products': 'sell',
    'Look credible': 'leads',
    'Collect donations': 'leads',
    'Grow a list': 'leads'
};

const PERSONALITY_BY_STYLE = {
    Bold: 'bold',
    Warm: 'warm',
    Clean: 'minimal',
    Editorial: 'luxury',
    Industrial: 'dark',
    Bright: 'playful'
};

const PURPOSE_OPTIONS = [
    { value: 'Local business', title: 'Local business', desc: 'Trades, cafés, clinics, salons' },
    { value: 'Professional services', title: 'Professional services', desc: 'Legal, finance, consulting' },
    { value: 'Online store', title: 'Online store', desc: 'Products, carts, checkout' },
    { value: 'Portfolio', title: 'Portfolio', desc: 'Show the work, get hired' },
    { value: 'Not for profit', title: 'Not for profit', desc: 'Donations, volunteers, impact' },
    { value: 'Something else', title: 'Something else', desc: 'Start from a blank page' }
];

const GOAL_OPTIONS = [
    { value: 'Get enquiries', title: 'Get enquiries', desc: 'Forms and calls, straight to your pipeline' },
    { value: 'Take bookings', title: 'Take bookings', desc: 'Calendar, availability, deposits' },
    { value: 'Sell products', title: 'Sell products', desc: 'Catalogue, cart, checkout' },
    { value: 'Look credible', title: 'Look credible', desc: 'Be findable and be trusted' },
    { value: 'Collect donations', title: 'Collect donations', desc: 'One-off and recurring giving' },
    { value: 'Grow a list', title: 'Grow a list', desc: 'Signups, newsletters, offers' }
];

const PAGE_OPTIONS = ['Home', 'About', 'Services', 'Contact', 'Gallery', 'Pricing', 'Team', 'Blog', 'Shop']
    .map((page) => ({ value: page, title: page }));

const STYLE_OPTIONS = [
    { value: 'Bold', title: 'Bold', desc: 'Heavy type, high contrast', artStyle: 'background:#0A0A0A;color:#FF5B04' },
    { value: 'Warm', title: 'Warm', desc: 'Soft, human, unhurried', artStyle: 'background:#EFE7DC;color:#7A5C3E' },
    { value: 'Clean', title: 'Clean', desc: 'Calm, spacious, corporate', artStyle: 'background:#F4F6F8;color:#1F3D5C' },
    { value: 'Editorial', title: 'Editorial', desc: 'Serif, considered, magazine', artStyle: 'background:#fff;color:#0A0A0A;border-bottom:1px solid #E6E6E6;font-family:Georgia,serif' },
    { value: 'Industrial', title: 'Industrial', desc: 'Solid, technical, built', artStyle: 'background:#2B2F33;color:#C9CDD2' },
    { value: 'Bright', title: 'Bright', desc: 'Loud, confident, playful', artStyle: 'background:#FF5B04;color:#fff' }
];

function initialData() {
    return {
        purpose: '',
        goal: [],
        pages: ['Home', 'About', 'Services', 'Contact'],
        style: '',
        name: '',
        loc: '',
        about: ''
    };
}

export default class WebsuiteWizard extends NavigationMixin(LightningElement) {
    // Builds a real SiteConfig from this wizard's answers, hands it to the
    // editor page via sessionStorage (a full navigation is a fresh JS context,
    // so the in-memory store can't carry it directly), then opens the editor.
    openEditor() {
        const draft = buildDraft({
            category: CATEGORY_BY_PURPOSE[this.data.purpose] || 'default',
            goal: GOAL_BY_LABEL[this.data.goal[0]] || 'leads',
            personality: PERSONALITY_BY_STYLE[this.data.style] || 'professional',
            businessName: this.data.name.trim(),
            about: this.data.about.trim(),
            pages: this.data.pages.filter((p) => p !== 'Home')
        });
        window.sessionStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify(draft));
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/editor' }
        });
    }

    // Skip the questionnaire entirely: hand the editor a blank-canvas draft (one
    // empty Home page) via the same sessionStorage handoff openEditor uses, then
    // open the editor. The user builds everything from scratch.
    startBlank() {
        window.sessionStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify(buildBlankDraft()));
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/editor' }
        });
    }

    // Present so the component has at least one Builder-editable property;
    // the wizard is otherwise driven entirely by the open event + its own state.
    @api railFootnote = 'Every answer lands in Salesforce as a qualified lead — whether they buy or not.';

    stylesLoaded = false;
    isOpen = false;
    step = 0;
    data = initialData();

    purposeOptions = PURPOSE_OPTIONS;
    goalOptions = GOAL_OPTIONS;
    pageOptions = PAGE_OPTIONS;
    styleOptions = STYLE_OPTIONS;

    connectedCallback() {
        this.boundOpen = () => this.open();
        window.addEventListener(OPEN_WIZARD_EVENT, this.boundOpen);
    }

    disconnectedCallback() {
        window.removeEventListener(OPEN_WIZARD_EVENT, this.boundOpen);
    }

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteWizard: failed to load shared styles', error);
        });
    }

    open() {
        this.isOpen = true;
        this.step = 0;
        this.data = initialData();
    }

    handleClose() {
        this.isOpen = false;
    }

    /* ---- step routing ---- */

    get ticks() {
        return Array.from({ length: TOTAL_STEPS }, (_, i) => ({
            key: `tick-${i}`,
            cssClass: i < this.step ? 'ws-tick ws-tick_done' : i === this.step ? 'ws-tick ws-tick_now' : 'ws-tick'
        }));
    }

    get isStep0() { return this.step === 0; }
    get isStep1() { return this.step === 1; }
    get isStep2() { return this.step === 2; }
    get isStep3() { return this.step === 3; }
    get isStep4() { return this.step === 4; }
    get isStep5() { return this.step === 5; }

    handleNext() {
        if (this.step < TOTAL_STEPS - 1) {
            this.step += 1;
            this.scrollTop();
        }
    }

    handlePrev() {
        if (this.step > 0) {
            this.step -= 1;
            this.scrollTop();
        }
    }

    scrollTop() {
        const wizard = this.template.querySelector('.ws-wizard');
        if (wizard) {
            wizard.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    /* ---- gating ---- */

    get purposeMissing() { return !this.data.purpose; }
    get goalMissing() { return this.data.goal.length === 0; }
    get pagesMissing() { return this.data.pages.length === 0; }
    get styleMissing() { return !this.data.style; }

    /* ---- selection handlers ---- */

    handlePurpose(event) {
        this.data = { ...this.data, purpose: event.detail.value };
    }

    handleGoal(event) {
        this.data = { ...this.data, goal: this.toggle(this.data.goal, event.detail.value) };
    }

    handlePages(event) {
        this.data = { ...this.data, pages: this.toggle(this.data.pages, event.detail.value) };
    }

    handleStyle(event) {
        this.data = { ...this.data, style: event.detail.value };
    }

    handleInput(event) {
        const field = event.target.dataset.field;
        this.data = { ...this.data, [field]: event.target.value };
    }

    toggle(list, value) {
        return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    }

    handleBuild() {
        this.step = 5;
        this.scrollTop();
    }

    /* ---- step 6 preview ---- */

    get doneHeading() {
        return `Here's ${this.data.name || 'your site'}.`;
    }

    get previewHeading() {
        return `${this.data.name || 'Your business'}.`;
    }

    get previewSub() {
        return this.data.about || 'Your one-liner goes here.';
    }

    get previewUrl() {
        const slug = (this.data.name || 'yourbusiness')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '')
            .slice(0, 22);
        return `${slug}.com.au`;
    }
}