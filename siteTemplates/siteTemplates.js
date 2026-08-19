/**
 * siteTemplates — turns setup-wizard answers into a complete, valid SiteConfig
 * draft (brief §4.5). This is the template-driven generator that replaces the
 * old AI "generateSiteDraft" seam: no AI, just hand-authored page recipes plus
 * the section registry's category-aware default content.
 *
 * Each requested page maps to an ordered list of section types; each section is
 * seeded via the registry for the site category, then lightly personalised with
 * the business name and description. Reusable for a future "regenerate" action.
 *
 * Leaf-ish module: depends only on other leaf modules (registry, themePresets).
 */
import { defaultSection, uuid } from 'c/sectionRegistry';
import { personality as getPersonality } from 'c/themePresets';

// Page name -> ordered section types. Home always leads.
const PAGE_RECIPES = {
    Home: ['navHeader', 'hero', 'features', 'testimonials', 'contact', 'footer'],
    About: ['navHeader', 'textBlock', 'imageText', 'footer'],
    Services: ['navHeader', 'features', 'pricing', 'footer'],
    Menu: ['navHeader', 'textBlock', 'features', 'footer'],
    Gallery: ['navHeader', 'gallery', 'footer'],
    Pricing: ['navHeader', 'pricing', 'footer'],
    Contact: ['navHeader', 'contact', 'footer'],
    Team: ['navHeader', 'features', 'footer'],
    Shop: ['navHeader', 'gallery', 'pricing', 'footer']
};

const FALLBACK_RECIPE = ['navHeader', 'textBlock', 'footer'];

// Per-page templates for the editor's "add a page" picker. Each seeds a page's
// sections from the registry (category-aware), reusing the same defaultSection
// call buildDraft uses — no new content authoring. 'blank' starts empty.
const PAGE_TEMPLATES = [
    { id: 'blank', label: 'Blank', thumb: '📄', sections: [] },
    { id: 'about', label: 'About', thumb: '👋', sections: ['navHeader', 'textBlock', 'imageText', 'footer'] },
    { id: 'services', label: 'Services', thumb: '🛠️', sections: ['navHeader', 'features', 'pricing', 'footer'] },
    { id: 'gallery', label: 'Gallery', thumb: '🖼️', sections: ['navHeader', 'gallery', 'footer'] },
    { id: 'pricing', label: 'Pricing', thumb: '💲', sections: ['navHeader', 'pricing', 'faq', 'footer'] },
    { id: 'team', label: 'Team', thumb: '🧑‍🤝‍🧑', sections: ['navHeader', 'team', 'footer'] },
    { id: 'faq', label: 'FAQ', thumb: '❓', sections: ['navHeader', 'faq', 'cta', 'footer'] },
    { id: 'contact', label: 'Contact', thumb: '✉️', sections: ['navHeader', 'contact', 'footer'] },
    { id: 'landing', label: 'Landing', thumb: '🚀', sections: ['navHeader', 'hero', 'features', 'cta', 'footer'] }
];

function slugify(title) {
    return (
        (title || 'page')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'page'
    );
}

// Personalise a registry-seeded section with the business's own details.
function personalise(section, ctx) {
    const c = section.content || {};
    switch (section.type) {
        case 'navHeader':
            if (ctx.businessName) {
                c.brand = ctx.businessName;
            }
            break;
        case 'hero':
            // Keep the category-strong headline; use the description as the sub.
            if (ctx.about) {
                c.subheading = ctx.about;
            }
            break;
        case 'textBlock':
            if (ctx.about) {
                c.body = ctx.about;
            }
            break;
        case 'contact':
            if (ctx.businessName) {
                c.heading = `Get in touch with ${ctx.businessName}`;
            }
            break;
        case 'footer':
            if (ctx.businessName) {
                c.text = `© ${ctx.businessName}`;
            }
            break;
        default:
            break;
    }
    return section;
}

/**
 * The theme block for a SiteConfig, from a personality preset id. Falls back to
 * professional-ish defaults for any field the preset doesn't set. Shared by
 * buildDraft and buildBlankDraft so every generated site themes identically.
 */
function buildTheme(personalityId = 'professional') {
    const preset = getPersonality(personalityId) || {};
    return {
        personality: personalityId,
        palette: {
            ...(preset.palette || {
                primary: '#1F3D5C',
                secondary: '#FF5B04',
                accent: '#FF5B04',
                surface: '#FFFFFF',
                text: '#0A0A0A'
            })
        },
        fontPair: preset.fontPair || 'sans-modern',
        radius: preset.radius || 'soft',
        spacing: preset.spacing || 'comfortable',
        motion: preset.motion || 'subtle',
        button: preset.button ? { ...preset.button } : { color: 'secondary', variant: 'solid' },
        link: preset.link ? { ...preset.link } : { color: 'inherit', underline: 'none' },
        form: preset.form ? { ...preset.form } : { accent: 'secondary' },
        heading: preset.heading ? { ...preset.heading } : { weight: 'default', color: 'inherit' }
    };
}

/** The page templates for the "add a page" picker (id + label + thumb only). */
export function pageTemplates() {
    return PAGE_TEMPLATES.map(({ id, label, thumb }) => ({ id, label, thumb }));
}

/**
 * Seed the section list for a page template, category-aware. Unknown ids fall
 * back to 'blank' (no sections). Fresh ids on every call via defaultSection.
 */
export function buildPageSections(templateId, ctx = {}) {
    const tpl = PAGE_TEMPLATES.find((t) => t.id === templateId) || PAGE_TEMPLATES[0];
    const category = ctx.category || 'default';
    return tpl.sections.map((type) => defaultSection(type, category));
}

/**
 * Build a full SiteConfig from wizard answers.
 * answers: { category, goal, personality, businessName, about, pages[] }
 */
export function buildDraft(answers = {}) {
    const category = answers.category || 'default';
    const goal = answers.goal || 'leads';
    const businessName = answers.businessName || 'My business';
    const about = answers.about || '';
    const personalityId = answers.personality || 'professional';
    const theme = buildTheme(personalityId);

    // Home is always first; keep the user's other page choices after it.
    const requested = Array.isArray(answers.pages) ? answers.pages : [];
    const pageNames = ['Home', ...requested.filter((p) => p && p !== 'Home')];

    const ctx = { businessName, about };
    const pages = pageNames.map((name, index) => {
        const recipe = PAGE_RECIPES[name] || FALLBACK_RECIPE;
        const sections = recipe.map((type) => personalise(defaultSection(type, category), ctx));
        return {
            pageId: uuid(),
            title: name,
            slug: slugify(name),
            isHome: index === 0,
            inNav: true,
            purpose: '',
            sections
        };
    });

    return {
        siteId: uuid(),
        meta: {
            businessName,
            tagline: '',
            category,
            goal,
            description: about,
            contact: { email: '', phone: '', address: '', hours: '' },
            social: { instagram: '', facebook: '', linkedin: '' },
            logoAssetId: null
        },
        theme,
        pages,
        history: { savedAt: null, version: 0 }
    };
}

/**
 * Build a minimal, valid SiteConfig with a single EMPTY Home page — the "skip
 * the questionnaire, start from a blank canvas" path. No sections are seeded, so
 * the editor opens on an empty page and the user builds it up from nothing.
 * Shares the meta/theme shape with buildDraft so both drafts load and save
 * through exactly the same code. Accepts optional answers for future reuse.
 */
export function buildBlankDraft(answers = {}) {
    return {
        siteId: uuid(),
        meta: {
            businessName: answers.businessName || 'My website',
            tagline: '',
            category: answers.category || 'default',
            goal: answers.goal || 'leads',
            description: '',
            contact: { email: '', phone: '', address: '', hours: '' },
            social: { instagram: '', facebook: '', linkedin: '' },
            logoAssetId: null
        },
        theme: buildTheme(answers.personality || 'professional'),
        pages: [
            {
                pageId: uuid(),
                title: 'Home',
                slug: 'home',
                isHome: true,
                inNav: true,
                parentId: null,
                purpose: '',
                sections: []
            }
        ],
        history: { savedAt: null, version: 0 }
    };
}