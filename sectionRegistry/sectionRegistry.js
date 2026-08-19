/**
 * sectionRegistry — the single source of truth for section types (brief §5).
 *
 * For each section type it declares: display name, thumbnail, the editable
 * content fields (which the settingsPanel renders as a form), available
 * variants, a default grid placement, and category-aware default content (so a
 * freshly added section on a restaurant site reads "Book a table tonight", not
 * lorem ipsum). This is a hand-authored content library — no AI is involved.
 * sectionLibrary, settingsPanel and pageCanvas all drive off this map, so adding
 * a new section type is one registry entry plus one LWC — nothing else changes.
 *
 * This is a leaf module: it owns uuid() and imports nothing from the store, so
 * the store can depend on it without a cycle.
 */

// Formatting marks allowed in rich-text fields (heading/subheading/etc).
// Everything else is unwrapped (text kept, tag dropped) so pasted content never
// carries styles, classes or event handlers through to the saved SiteConfig.
// Links survive but only with a safe-scheme href (see below); lists survive as
// bare UL/OL/LI.
const ALLOWED_INLINE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'A', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3']);

// The only href shapes a saved link may carry. Anything else — javascript:,
// data:, vbscript:, protocol-relative tricks — drops the whole tag.
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

/**
 * Strip a contenteditable field's innerHTML down to a small safe allowlist.
 * Disallowed elements are unwrapped (children kept, hoisted into the parent);
 * allowed elements keep their tag but lose all attributes — except A, which
 * keeps exactly one vetted href (plus rel=noopener). This is the only place
 * rich-text HTML is trusted to leave the DOM and enter the SiteConfig, and
 * pasted clipboard HTML routes through here too.
 */
/* eslint-disable @lwc/lwc/no-inner-html -- this IS the sanitizer: raw HTML goes
   into a detached div, gets stripped to the allowlist, and only the cleaned
   innerHTML leaves. Every other innerHTML in the codebase routes through here. */
export function sanitizeInlineHtml(html) {
    const container = document.createElement('div');
    container.innerHTML = html || '';

    const unwrap = (node, child) => {
        while (child.firstChild) {
            node.insertBefore(child.firstChild, child);
        }
        node.removeChild(child);
    };

    const clean = (node) => {
        [...node.childNodes].forEach((child) => {
            if (child.nodeType === Node.ELEMENT_NODE) {
                clean(child);
                if (!ALLOWED_INLINE_TAGS.has(child.tagName)) {
                    unwrap(node, child);
                    return;
                }
                const href = child.tagName === 'A' ? (child.getAttribute('href') || '').trim() : null;
                [...child.attributes].forEach((a) => child.removeAttribute(a.name));
                if (child.tagName === 'A') {
                    if (href && SAFE_HREF.test(href)) {
                        child.setAttribute('href', href);
                        child.setAttribute('rel', 'noopener');
                    } else {
                        unwrap(node, child); // a link that can't be trusted is just text
                    }
                }
            } else if (child.nodeType !== Node.TEXT_NODE) {
                node.removeChild(child);
            }
        });
    };
    clean(container);
    return container.innerHTML.trim();
}
/* eslint-enable @lwc/lwc/no-inner-html */

/** True when a user-entered link URL is one the sanitizer would keep. */
export function isSafeHref(url) {
    return SAFE_HREF.test((url || '').trim());
}

/** RFC4122-ish id; crypto.randomUUID where available, cheap fallback otherwise. */
export function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

// Field types the settingsPanel knows how to render.
// 'text' | 'textarea' | 'url' | 'list'  (list fields hold an array of item objects)

const REGISTRY = {
    hero: {
        label: 'Hero',
        thumb: '🎯',
        hasRenderer: true, // sectionHero exists; others render a placeholder until M4
        variants: ['centered', 'split', 'full-bleed'],
        fields: [
            { key: 'heading', label: 'Heading', type: 'text' },
            { key: 'subheading', label: 'Subheading', type: 'textarea' },
            { key: 'ctaLabel', label: 'Button label', type: 'text' },
            { key: 'ctaTarget', label: 'Button link', type: 'url' }
        ],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'L' },
        defaultLayout: { colStart: 3, colSpan: 8, valign: 'center' },
        content: {
            restaurant: {
                heading: 'Book a table tonight',
                subheading:
                    'Seasonal plates, natural wine, and a room that hums. Walk-ins welcome, bookings safer.',
                ctaLabel: 'Reserve a table',
                ctaTarget: ''
            },
            services: {
                heading: 'Trusted trades, done properly',
                subheading:
                    'Licensed, insured, and on time. Get a straight quote with no call-centre runaround.',
                ctaLabel: 'Get a quote',
                ctaTarget: ''
            },
            portfolio: {
                heading: 'Selected work',
                subheading: 'Design and art direction for people who care about the details.',
                ctaLabel: 'View projects',
                ctaTarget: ''
            },
            default: {
                heading: 'Your business, online in minutes',
                subheading: 'A real website that works as hard as you do. No code, no call, no contract.',
                ctaLabel: 'Get started',
                ctaTarget: ''
            }
        }
    },
    navHeader: {
        label: 'Header / Nav',
        thumb: '🧭',
        variants: ['left', 'centered'],
        fields: [
            { key: 'brand', label: 'Brand name', type: 'text' },
            { key: 'ctaLabel', label: 'Button label', type: 'text' }
        ],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'S' },
        content: { default: { brand: 'Your brand', ctaLabel: 'Get in touch' } }
    },
    textBlock: {
        label: 'Text',
        thumb: '📝',
        variants: ['centered', 'left'],
        fields: [
            { key: 'heading', label: 'Heading', type: 'text' },
            { key: 'body', label: 'Body', type: 'textarea' }
        ],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: {
            default: {
                heading: 'A little about us',
                body: 'Tell your story here — who you are, what you do, and why it matters to the people you serve.'
            }
        }
    },
    imageText: {
        label: 'Image + Text',
        thumb: '🖼️',
        variants: ['image-left', 'image-right'],
        fields: [
            { key: 'heading', label: 'Heading', type: 'text' },
            { key: 'body', label: 'Body', type: 'textarea' },
            { key: 'imageAlt', label: 'Image alt text', type: 'text' }
        ],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: {
            default: {
                heading: 'Made with care',
                body: 'Pair a strong image with a short, specific paragraph that earns the reader’s attention.'
            }
        }
    },
    features: {
        label: 'Features / Pillars',
        thumb: '🧱',
        variants: ['three-up', 'four-up'],
        fields: [{ key: 'items', label: 'Pillars', type: 'list', itemLabel: 'Pillar' }],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: {
            default: {
                items: [
                    { title: 'Fast', body: 'Live in minutes, not months.' },
                    { title: 'Yours', body: 'No lock-in, no surprises.' },
                    { title: 'Supported', body: 'Real people when you need them.' }
                ]
            }
        }
    },
    gallery: {
        label: 'Gallery',
        thumb: '🖻',
        variants: ['grid', 'masonry'],
        fields: [{ key: 'items', label: 'Images', type: 'list', itemLabel: 'Image' }],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: { default: { items: [{ caption: 'Add your first image' }] } }
    },
    testimonials: {
        label: 'Testimonials',
        thumb: '💬',
        variants: ['single', 'carousel'],
        fields: [{ key: 'items', label: 'Quotes', type: 'list', itemLabel: 'Quote' }],
        defaultStyle: { background: 'primary', tone: 'light', padding: 'M' },
        content: {
            default: {
                items: [{ quote: 'Genuinely the easiest thing we’ve done all year.', author: 'A happy customer' }]
            }
        }
    },
    contact: {
        label: 'Contact',
        thumb: '✉️',
        variants: ['form', 'details'],
        fields: [
            { key: 'heading', label: 'Heading', type: 'text' },
            { key: 'body', label: 'Intro', type: 'textarea' },
            { key: 'successMessage', label: 'Thank-you message', type: 'text' },
            { key: 'fields', label: 'Form fields', type: 'list', itemLabel: 'Field' }
        ],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: {
            default: {
                heading: 'Get in touch',
                body: 'We’d love to hear from you.',
                successMessage: 'Thanks — your message is on its way. We usually reply within one business day.',
                fields: [
                    { label: 'Your name', type: 'text', required: true },
                    { label: 'Your email', type: 'email', required: true },
                    { label: 'Your message', type: 'textarea', required: true }
                ]
            }
        }
    },
    pricing: {
        label: 'Pricing',
        thumb: '💳',
        variants: ['tiers'],
        fields: [{ key: 'items', label: 'Tiers', type: 'list', itemLabel: 'Tier' }],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: {
            default: {
                items: [
                    { name: 'Starter', price: '$0', body: 'Everything to get going.' },
                    { name: 'Pro', price: '$29', body: 'For growing businesses.' }
                ]
            }
        }
    },
    // Dynamic CMS content: renders live from Websuite_Blog_Post__c records
    // (see sectionBlogList / WebsuiteBlogController), not from `content` —
    // no fixed fields of its own, same reasoning as `freeform`. `heading` is
    // its one editable field, kept in content since it's just static text.
    blogList: {
        label: 'Blog',
        thumb: '📰',
        variants: ['grid', 'list'],
        fields: [{ key: 'heading', label: 'Heading', type: 'text' }],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: { default: { heading: 'From the blog' } }
    },
    // Dynamic CMS content: renders live from Websuite_Product__c records (see
    // sectionShop / WebsuiteProductController), same pattern as blogList.
    // "Buy" is an external link the site owner supplies — see the object's
    // description for why there's no cart/checkout here yet.
    shop: {
        label: 'Shop',
        thumb: '🛍️',
        variants: ['grid', 'list'],
        fields: [{ key: 'heading', label: 'Heading', type: 'text' }],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: { default: { heading: 'Shop' } }
    },
    // Dynamic CMS content: renders live from Websuite_Team_Member__c records
    // (see sectionTeamList / WebsuiteTeamController), same pattern as
    // blogList. Distinct from the existing static `team` section type above,
    // whose people live as a plain content.items array.
    teamList: {
        label: 'Team (CMS)',
        thumb: '🧑‍🤝‍🧑',
        variants: ['grid'],
        fields: [{ key: 'heading', label: 'Heading', type: 'text' }],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: { default: { heading: 'The people behind it' } }
    },
    // Dynamic CMS content: renders live from Websuite_Portfolio_Item__c
    // records (see sectionPortfolioList / WebsuitePortfolioController), same
    // pattern as blogList.
    portfolioList: {
        label: 'Portfolio (CMS)',
        thumb: '🖼️',
        variants: ['grid', 'list'],
        fields: [{ key: 'heading', label: 'Heading', type: 'text' }],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: { default: { heading: 'Our work' } }
    },
    // Dynamic CMS content: renders live from Websuite_Testimonial__c records
    // (see sectionTestimonialList / WebsuiteTestimonialController), same
    // pattern as blogList. Distinct from the existing static `testimonials`
    // section type above, whose quotes live as a plain content.items array.
    testimonialList: {
        label: 'Testimonials (CMS)',
        thumb: '💬',
        variants: ['grid'],
        fields: [{ key: 'heading', label: 'Heading', type: 'text' }],
        defaultStyle: { background: 'primary', tone: 'light', padding: 'M' },
        content: { default: { heading: 'What people say' } }
    },
    // Dynamic CMS content: renders live from Websuite_Event__c records (see
    // sectionEventList / WebsuiteEventController), same pattern as blogList
    // — ordered chronologically (soonest first), not newest-first.
    eventList: {
        label: 'Events',
        thumb: '📅',
        variants: ['grid', 'list'],
        fields: [{ key: 'heading', label: 'Heading', type: 'text' }],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: { default: { heading: 'Upcoming events' } }
    },
    // Dynamic, and a write path (not just a read like the CMS list types
    // above): passwordless email-code login/signup against
    // Websuite_Site_Member__c (see sectionMemberLogin /
    // WebsuiteMemberAuthController). Because it performs real writes, its own
    // component skips the live network calls entirely in edit mode and
    // renders a static preview instead — see sectionMemberLogin.isEdit.
    memberLogin: {
        label: 'Member Login',
        thumb: '🔐',
        variants: ['card'],
        fields: [
            { key: 'heading', label: 'Heading', type: 'text' },
            { key: 'subheading', label: 'Subheading', type: 'textarea' },
            { key: 'welcomeText', label: 'Welcome message', type: 'text' }
        ],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: {
            default: {
                heading: 'Member Login',
                subheading: 'Enter your email to sign in — no password needed.',
                welcomeText: 'Welcome back'
            }
        }
    },
    embed: {
        label: 'Custom Embed',
        thumb: '{ }',
        // Sandboxed iframe (allow-scripts + allow-forms + allow-popups, no
        // allow-same-origin) — the raw HTML/JS an author pastes here can run,
        // but it can't reach the editor's session, cookies or DOM. See
        // sectionEmbed for the render side of this.
        variants: ['default'],
        fields: [{ key: 'html', label: 'Embed code', type: 'textarea' }],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: { default: { html: '' } }
    },
    footer: {
        label: 'Footer',
        thumb: '⬇️',
        variants: ['simple'],
        fields: [{ key: 'text', label: 'Footer text', type: 'text' }],
        defaultStyle: { background: 'primary', tone: 'light', padding: 'M' },
        content: { default: { text: '© Your business. All rights reserved.' } }
    },
    faq: {
        label: 'FAQ',
        thumb: '❓',
        variants: ['list', 'two-col'],
        fields: [
            { key: 'heading', label: 'Heading', type: 'text' },
            { key: 'items', label: 'Questions', type: 'list', itemLabel: 'Question' }
        ],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: {
            restaurant: {
                heading: 'Good to know',
                items: [
                    {
                        q: 'Do you take walk-ins?',
                        a: 'Always — though Friday and Saturday nights book out, so a reservation is safer.'
                    },
                    { q: 'Can you cater for allergies?', a: 'Yes. Tell us when you book and the kitchen will look after you.' },
                    { q: 'Is there parking nearby?', a: 'Street parking out front and a public lot around the corner.' }
                ]
            },
            services: {
                heading: 'Common questions',
                items: [
                    { q: 'Are you licensed and insured?', a: 'Fully — happy to show the paperwork before we start.' },
                    { q: 'Do you charge for quotes?', a: 'Never. Quotes are free and hold their price.' },
                    { q: 'How soon can you come out?', a: 'Usually within a couple of days; urgent jobs same-day where we can.' }
                ]
            },
            default: {
                heading: 'Frequently asked questions',
                items: [
                    { q: 'How long does it take?', a: 'Most projects are live within days, not weeks.' },
                    { q: 'What does it cost?', a: 'Straight pricing, agreed up front — no surprises.' }
                ]
            }
        }
    },
    cta: {
        label: 'Call to action',
        thumb: '📣',
        variants: ['banner', 'card'],
        fields: [
            { key: 'heading', label: 'Heading', type: 'text' },
            { key: 'body', label: 'Body', type: 'textarea' },
            { key: 'ctaLabel', label: 'Button label', type: 'text' },
            { key: 'ctaTarget', label: 'Button link', type: 'url' }
        ],
        defaultStyle: { background: 'primary', tone: 'light', padding: 'L' },
        content: {
            restaurant: {
                heading: 'Hungry yet?',
                body: 'Tables go fast on weekends — lock yours in now.',
                ctaLabel: 'Book a table',
                ctaTarget: ''
            },
            services: {
                heading: 'Ready when you are',
                body: 'Tell us what needs doing and we’ll send a straight quote.',
                ctaLabel: 'Get a quote',
                ctaTarget: ''
            },
            default: {
                heading: 'Ready to get started?',
                body: 'It takes minutes, and you can change anything later.',
                ctaLabel: 'Get started',
                ctaTarget: ''
            }
        }
    },
    stats: {
        label: 'Stats / Numbers',
        thumb: '📊',
        variants: ['three-up', 'four-up'],
        fields: [{ key: 'items', label: 'Stats', type: 'list', itemLabel: 'Stat' }],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: {
            restaurant: {
                items: [
                    { value: '12', label: 'Years on this corner' },
                    { value: '40+', label: 'Wines by the glass' },
                    { value: '4.8★', label: 'Average review' }
                ]
            },
            default: {
                items: [
                    { value: '10+', label: 'Years in business' },
                    { value: '500+', label: 'Happy customers' },
                    { value: '4.9★', label: 'Average rating' }
                ]
            }
        }
    },
    team: {
        label: 'Team',
        thumb: '👥',
        variants: ['grid'],
        fields: [
            { key: 'heading', label: 'Heading', type: 'text' },
            { key: 'items', label: 'People', type: 'list', itemLabel: 'Person' }
        ],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: {
            default: {
                heading: 'The people behind it',
                items: [
                    { name: 'Alex Morgan', role: 'Founder', bio: 'Started this to do things properly.' },
                    { name: 'Sam Riley', role: 'Operations', bio: 'Keeps every job on time and on budget.' },
                    { name: 'Jordan Lee', role: 'Customer care', bio: 'The voice on the other end of the phone.' }
                ]
            }
        }
    },
    logoStrip: {
        label: 'Logo strip',
        thumb: '🏛️',
        variants: ['row'],
        fields: [
            { key: 'heading', label: 'Heading', type: 'text' },
            { key: 'items', label: 'Names', type: 'list', itemLabel: 'Name' }
        ],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'S' },
        content: {
            default: {
                heading: 'Trusted by',
                items: [{ name: 'Acme Co' }, { name: 'Northwind' }, { name: 'Globex' }, { name: 'Initech' }]
            }
        }
    },
    // Built one element at a time from the Element Panel (Layout/Text/Image/
    // Button/Spacer), not picked whole from the section library — so it has no
    // fixed `fields` of its own and is left out of LIBRARY_ORDER below.
    freeform: {
        label: 'Freeform',
        thumb: '🧩',
        variants: ['default'],
        fields: [],
        defaultStyle: { background: 'surface', tone: 'light', padding: 'M' },
        content: { default: { elements: [] } }
    },
    // The layout container: holds child sections in columns, to any depth.
    // Its columns are seeded in defaultSection (not here) because each needs a
    // freshly minted colId -- this content block is deep-cloned as a template,
    // so ids written here would be shared by every row on the site.
    // Background defaults to 'none': a container that paints over its own
    // children's backgrounds is a trap, not a default.
    row: {
        label: 'Columns',
        thumb: '▥',
        variants: ['default'],
        fields: [],
        defaultStyle: { background: 'none', tone: 'light', padding: 'S', gap: 'M' },
        content: { default: { columns: [] } }
    }
};

// Element kinds offered by the Element Panel, in display order.
const ELEMENT_KINDS = [
    { kind: 'layout', label: 'Layout', thumb: '▦' },
    { kind: 'text', label: 'Text', thumb: 'T' },
    { kind: 'image', label: 'Image', thumb: '🖼️' },
    { kind: 'video', label: 'Video', thumb: '▶' },
    { kind: 'button', label: 'Button', thumb: '⬭' },
    { kind: 'spacer', label: 'Spacer', thumb: '↕' }
];

export function elementKinds() {
    return ELEMENT_KINDS.map((k) => ({ ...k }));
}

// Default width (% of the freeform canvas) per kind — height is always
// content-driven (or the spacer's own `height` scale), never stored here.
const DEFAULT_WIDTH = { text: 50, button: 22, image: 50, video: 50, spacer: 100, layout: 100 };

/**
 * A fresh, valid element of `kind` for a freeform section's content.elements[].
 * x/y are the element's CENTER point as a percentage of the canvas (so 50/50
 * is dead center regardless of the element's own size); width is a percentage
 * of the canvas width. There is one position, not one per breakpoint — it
 * scales proportionally rather than adapting per device.
 */
export function defaultElement(kind) {
    const elementId = uuid();
    const base = { elementId, kind, x: 50, y: 50, width: DEFAULT_WIDTH[kind] || 40 };
    switch (kind) {
        case 'text':
            return { ...base, text: 'Add some text' };
        case 'button':
            return { ...base, label: 'Click me', href: '' };
        case 'image':
            return { ...base, imageUrl: '', imageAssetId: null };
        case 'video':
            // videoEmbed ({provider, embedUrl}) and videoUrl/videoAssetId are
            // mutually exclusive, same convention as a hero's bgVideo* fields.
            return { ...base, videoUrl: '', videoAssetId: null, videoEmbed: null };
        case 'spacer':
            return { ...base, height: 'M' };
        case 'layout':
            return { ...base, columns: 2 };
        default:
            return base;
    }
}

// Order sections appear in the library. Hero/header first, footer last.
// 'row' sits with the content blocks: it's picked like any other section, then
// filled from its own "＋ Add here" buttons.
const LIBRARY_ORDER = [
    'hero',
    'navHeader',
    'row',
    'textBlock',
    'imageText',
    'features',
    'stats',
    'gallery',
    'team',
    'testimonials',
    'logoStrip',
    'faq',
    'pricing',
    'cta',
    'contact',
    'blogList',
    'shop',
    'teamList',
    'portfolioList',
    'testimonialList',
    'eventList',
    'memberLogin',
    'embed',
    'footer'
];

export function getType(type) {
    return REGISTRY[type] || null;
}

export function typeLabel(type) {
    return REGISTRY[type] ? REGISTRY[type].label : type;
}

export function hasRenderer(type) {
    return !!(REGISTRY[type] && REGISTRY[type].hasRenderer);
}

/** Metadata for the section library grid, in display order. */
export function libraryTypes() {
    return LIBRARY_ORDER.filter((t) => REGISTRY[t]).map((type) => ({
        type,
        label: REGISTRY[type].label,
        thumb: REGISTRY[type].thumb
    }));
}

/** Editable content fields for a type (drives settingsPanel forms). */
export function contentFields(type) {
    return REGISTRY[type] ? REGISTRY[type].fields : [];
}

export function variantsFor(type) {
    return REGISTRY[type] ? REGISTRY[type].variants : [];
}

function defaultContent(type, category) {
    const def = REGISTRY[type];
    if (!def) {
        return {};
    }
    const byCat = def.content || {};
    return JSON.parse(JSON.stringify(byCat[category] || byCat.default || {}));
}

/**
 * A complete, valid section object of the given type seeded for the category —
 * ready to drop straight into a page's sections[].
 */
export function defaultSection(type, category = 'default') {
    const def = REGISTRY[type] || {};
    // Content sits on a 12-column grid; the placement picker edits colStart/colSpan.
    const layout = def.defaultLayout || { colStart: 1, colSpan: 12, valign: 'center' };
    const section = {
        sectionId: uuid(),
        type,
        variant: (def.variants && def.variants[0]) || 'default',
        content: defaultContent(type, category),
        style: JSON.parse(JSON.stringify(def.defaultStyle || { background: 'surface', tone: 'light', padding: 'M' })),
        layout: { ...layout }
    };
    // Rows start as two equal columns. Minted here rather than in the registry
    // because each colId must be unique per row -- defaultContent clones a
    // shared template, so ids declared there would repeat across every row.
    if (type === 'row') {
        section.content = {
            columns: [
                { colId: uuid(), span: 6, children: [] },
                { colId: uuid(), span: 6, children: [] }
            ]
        };
    }
    return section;
}

/* ---- prebuilt layouts ----------------------------------------------------
 * Ready-made row compositions for the section library's Layouts group: a row
 * with its columns already spanned and seeded with category-aware sections.
 * Declared as data (spans + types); buildPrebuilt assembles fresh nodes with
 * fresh ids on every call, so inserting one twice never collides.
 */
const PREBUILTS = [
    { id: 'twoColText', label: 'Two columns of text', thumb: '◫', spans: [6, 6], types: ['textBlock', 'textBlock'] },
    { id: 'textSidebarCta', label: 'Text + call-to-action', thumb: '⊞', spans: [8, 4], types: ['textBlock', 'cta'] },
    { id: 'threeCards', label: 'Three cards', thumb: '⫴', spans: [4, 4, 4], types: ['textBlock', 'textBlock', 'textBlock'] },
    { id: 'statsCta', label: 'Stats + call to action', thumb: '⊟', spans: [7, 5], types: ['stats', 'cta'] }
];

/** Metadata for the library's Layouts group, in display order. */
export function prebuiltLayouts() {
    return PREBUILTS.map(({ id, label, thumb }) => ({ id, label, thumb }));
}

/** A complete row node for a prebuilt layout, seeded for the category. */
export function buildPrebuilt(id, category = 'default') {
    const def = PREBUILTS.find((p) => p.id === id);
    if (!def) {
        return null;
    }
    const row = defaultSection('row', category);
    row.content = {
        columns: def.spans.map((span, i) => ({
            colId: uuid(),
            span,
            children: [defaultSection(def.types[i], category)]
        }))
    };
    return row;
}