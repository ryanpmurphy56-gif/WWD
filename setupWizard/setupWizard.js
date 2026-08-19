/**
 * setupWizard — the editor's onboarding flow (brief §4.5). Collects category +
 * goal, business details, personality, and pages, then forks: build it now
 * (template-driven draft) or hand it to an expert. On build it shows the
 * generationLoader, assembles a real SiteConfig via siteTemplates, commits it to
 * the store as a new unsaved site, and emits `complete` — landing the user in
 * the editor with a full draft. No AI: the draft is hand-authored templates.
 *
 * The individual steps (personality/pages/design/lane) the brief lists as
 * separate components are kept here as one cohesive stepper for the skeleton.
 */
import { LightningElement } from 'lwc';
import store from 'c/siteStateService';
import { buildDraft } from 'c/siteTemplates';
import { PERSONALITIES } from 'c/themePresets';

const CATEGORIES = [
    { id: 'restaurant', label: 'Restaurant / café', emoji: '🍽️' },
    { id: 'services', label: 'Trades / services', emoji: '🔧' },
    { id: 'portfolio', label: 'Portfolio', emoji: '🎨' },
    { id: 'retail', label: 'Shop / retail', emoji: '🛍️' },
    { id: 'default', label: 'Something else', emoji: '✨' }
];
const GOALS = [
    { id: 'leads', label: 'Get enquiries' },
    { id: 'bookings', label: 'Take bookings' },
    { id: 'sell', label: 'Sell products' },
    { id: 'showcase', label: 'Show my work' }
];
const PAGE_CHOICES = ['About', 'Services', 'Menu', 'Gallery', 'Pricing', 'Contact'];
const TOTAL_STEPS = 5;

export default class SetupWizard extends LightningElement {
    step = 0;
    generating = false;
    requestExpert = false;

    category = '';
    goal = '';
    personalityId = 'professional';
    businessName = '';
    about = '';
    pages = [];

    // ---- step flags ------------------------------------------------------
    get isStep0() {
        return this.step === 0;
    }
    get isStep1() {
        return this.step === 1;
    }
    get isStep2() {
        return this.step === 2;
    }
    get isStep3() {
        return this.step === 3;
    }
    get isStep4() {
        return this.step === 4;
    }
    get progressLabel() {
        return `Step ${this.step + 1} of ${TOTAL_STEPS}`;
    }
    get progressStyle() {
        return `width:${((this.step + 1) / TOTAL_STEPS) * 100}%`;
    }
    get showBack() {
        return this.step > 0 && !this.generating;
    }
    get showContinue() {
        return !this.isStep4;
    }

    // ---- options with selected state ------------------------------------
    get categories() {
        return CATEGORIES.map((c) => ({ ...c, cssClass: c.id === this.category ? 'opt opt_on' : 'opt' }));
    }
    get goals() {
        return GOALS.map((g) => ({ ...g, cssClass: g.id === this.goal ? 'pill pill_on' : 'pill' }));
    }
    get personalities() {
        return PERSONALITIES.map((p) => ({
            id: p.id,
            label: p.label,
            cssClass: p.id === this.personalityId ? 'pill pill_on' : 'pill'
        }));
    }
    get pageChoices() {
        return PAGE_CHOICES.map((name) => ({
            name,
            cssClass: this.pages.includes(name) ? 'pill pill_on' : 'pill'
        }));
    }

    // ---- validity --------------------------------------------------------
    get nextDisabled() {
        if (this.isStep0) {
            return !(this.category && this.goal);
        }
        if (this.isStep1) {
            return !this.businessName.trim();
        }
        if (this.isStep2) {
            return !this.personalityId;
        }
        return false;
    }

    // ---- selection handlers ---------------------------------------------
    pickCategory(event) {
        this.category = event.currentTarget.dataset.id;
    }
    pickGoal(event) {
        this.goal = event.currentTarget.dataset.id;
    }
    pickPersonality(event) {
        this.personalityId = event.currentTarget.dataset.id;
    }
    handleName(event) {
        this.businessName = event.target.value;
    }
    handleAbout(event) {
        this.about = event.target.value;
    }
    togglePage(event) {
        const name = event.currentTarget.dataset.name;
        this.pages = this.pages.includes(name)
            ? this.pages.filter((p) => p !== name)
            : [...this.pages, name];
    }

    // ---- navigation ------------------------------------------------------
    next() {
        if (this.step < TOTAL_STEPS - 1) {
            this.step += 1;
        }
    }
    back() {
        if (this.step > 0) {
            this.step -= 1;
        }
    }

    // ---- lane fork -------------------------------------------------------
    chooseBuild() {
        this.requestExpert = false;
        this.generating = true;
    }
    chooseExpert() {
        this.requestExpert = true;
        this.generating = true;
    }

    // ---- generation ------------------------------------------------------
    get personalityLabel() {
        const p = PERSONALITIES.find((x) => x.id === this.personalityId);
        return p ? p.label : '';
    }
    get categoryLabel() {
        const c = CATEGORIES.find((x) => x.id === this.category);
        return c ? c.label.toLowerCase() : 'website';
    }
    get draftPageNames() {
        return ['Home', ...this.pages];
    }

    handleGenerated() {
        const config = buildDraft({
            category: this.category,
            goal: this.goal,
            personality: this.personalityId,
            businessName: this.businessName.trim(),
            about: this.about.trim(),
            pages: this.pages
        });
        store.startFromDraft(config);
        this.dispatchEvent(new CustomEvent('complete', { detail: { requestExpert: this.requestExpert } }));
    }
}