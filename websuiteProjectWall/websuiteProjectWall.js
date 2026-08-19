import { LightningElement, api, wire } from 'lwc';
import { loadWebsuiteStyles, loadGsap } from 'c/websuiteStyles';
import getVisibleClients from '@salesforce/apex/WebsuiteClientController.getVisibleClients';

// Concept fallback — used only when the Websuite_Client__c object has no visible
// rows (or a guest user can't read it). The Companies manager writes the real set.
const PROJECTS = [
    { cat: 'Not for profit', name: 'Bendigo Health Foundation', bg: '#F2EDE8', fg: '#0A0A0A', size: 20 },
    { cat: 'Small business', name: 'Goode Eco Designs', bg: '#2A2622', fg: '#EFE7DC', size: 22 },
    { cat: 'Building', name: 'Collective Standards', bg: '#F4F5F8', fg: '#161B4A', size: 21 },
    { cat: 'Consulting', name: 'Ladd + Associates', bg: '#0E1533', fg: '#7FE3F0', size: 22 },
    { cat: 'Real estate', name: 'buxton bendigo', bg: '#000000', fg: '#FFFFFF', size: 23 },
    { cat: 'Health care', name: 'Mr Huw Williams', bg: '#E4EFE4', fg: '#1A1A1A', size: 21, serif: true }
];

const GHOSTS = [
    'Cafe', 'Trades', 'Hospitality', 'Legal', 'Construction', 'Fitness', 'Retail', 'Education',
    'Automotive', 'Agriculture', 'Tourism', 'Beauty', 'Events', 'Finance', 'Your site'
];

// Two intertwined helixes 180° apart: the primary spiral and its inverse on the
// opposite side, so cards fill both halves of the viewport instead of one.
const RADIUS_X = 660;
const RADIUS_Y = 300;
const ANGLE_STEP = 46; // degrees between consecutive cards along a strand
const GAP = 300; // z-depth between consecutive cards
const DEG = Math.PI / 180;

function helixPos(i) {
    const strand = i % 2; // 0 = primary spiral, 1 = inverse spiral (opposite side)
    const angle = (i * ANGLE_STEP + strand * 180) * DEG;
    return {
        x: Math.round(Math.cos(angle) * RADIUS_X),
        y: Math.round(Math.sin(angle) * RADIUS_Y),
        z: -(i * GAP)
    };
}

// Deterministic dark tile + light ink from a company name, so live cards without
// an uploaded logo still get a stable, on-brand colour.
function brandColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) {
        h = (h * 31 + name.charCodeAt(i)) >>> 0;
    }
    const hue = h % 360;
    return { bg: `hsl(${hue}, 44%, 16%)`, fg: `hsl(${hue}, 70%, 82%)` };
}

// Interleaves ghost placeholders between the real cards for the "your site
// could be here" effect, then appends any leftover real cards.
function buildCardOrder(reals) {
    const order = [];
    let ri = 0;
    GHOSTS.forEach((ghost, i) => {
        if (i % 2 === 0 && reals[ri]) {
            order.push({ type: 'real', data: reals[ri++] });
        }
        order.push({ type: 'ghost', data: ghost });
    });
    while (reals[ri]) {
        order.push({ type: 'real', data: reals[ri++] });
    }
    return order;
}

export default class WebsuiteProjectWall extends LightningElement {
    @api eyebrow = 'Bendigo · Victoria';
    @api headline = 'Built with';
    @api headlineEmphasis = 'Websuite.';
    @api subCopy = 'Every one of these is a real business we put online.';
    // Escape hatch for LWR's scroll container fighting position:sticky —
    // flip this in Experience Builder to force the flat-grid fallback.
    @api flatLayout = false;

    clients;
    wireReturned = false;
    stylesLoaded = false;
    gsapStarted = false;
    gsapFailed = false;
    scrollTriggers = [];

    @wire(getVisibleClients)
    wiredClients({ data }) {
        // Always assign (empty array on miss) so the reactive change re-renders
        // and lets renderedCallback start GSAP against the final card set.
        this.wireReturned = true;
        this.clients = data && data.length ? data : [];
    }

    get isFlat() {
        if (this.flatLayout || this.gsapFailed) {
            return true;
        }
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // Companies in Command Center order, hero(es) hoisted to the front. Only the
    // first hero becomes the enlarged feature card at the mouth of the wall.
    get realProjects() {
        if (this.clients && this.clients.length) {
            const heroes = this.clients.filter((c) => c.isHero);
            const rest = this.clients.filter((c) => !c.isHero);
            const featureName = heroes.length ? heroes[0].name : null;
            return [...heroes, ...rest].map((c) => {
                const col = brandColor(c.name);
                return {
                    name: c.name,
                    cat: c.tagline || 'Websuite',
                    hasLogo: !!(c.hasLogo && c.logoUrl),
                    logoUrl: c.logoUrl,
                    isFeature: c.name === featureName,
                    bg: col.bg,
                    fg: col.fg
                };
            });
        }
        // No live data — show the concept set with the first one featured.
        return PROJECTS.map((p, i) => ({ ...p, hasLogo: false, logoUrl: null, isFeature: i === 0 }));
    }

    get cards() {
        const reals = this.realProjects;
        const feature = reals.find((r) => r.isFeature);
        const rest = reals.filter((r) => !r.isFeature);
        const order = buildCardOrder(rest);
        const out = [];
        if (feature) {
            out.push(this.featureCard(feature));
        }
        const base = feature ? 1 : 0;
        order.forEach((item, idx) => out.push(this.helixCard(item, base + idx)));
        return out;
    }

    featureCard(p) {
        // Centre of the wall, a little ahead of the spiral, no tilt — the first
        // card you reach as the intro title fades. Enlarged via ws-card3_hero.
        const transform = `transform: translate3d(0px, 0px, ${-Math.round(GAP * 0.8)}px)`;
        return this.realCard(p, 'card-hero', transform, true);
    }

    helixCard(item, i) {
        const p = helixPos(i);
        const ry = p.x > 40 ? -13 : p.x < -40 ? 13 : 0;
        const rx = p.y > 40 ? 9 : p.y < -40 ? -9 : 0;
        const transform =
            `transform: translate3d(${p.x}px, ${p.y}px, ${p.z}px)` +
            ` rotateY(${ry}deg) rotateX(${rx}deg)`;
        if (item.type === 'real') {
            return this.realCard(item.data, `card-${i}`, transform, false);
        }
        return {
            key: `card-${i}`,
            isReal: false,
            cardClass: 'ws-card3 ws-ghost',
            flatClass: 'ws-card3 ws-card3_flat ws-ghost',
            cat: item.data,
            transform
        };
    }

    realCard(p, key, transform, isFeature) {
        const isLogo = p.hasLogo;
        const size = isFeature ? 32 : p.size ? p.size : 22;
        const serif = p.serif ? 'font-family:Georgia,serif;font-weight:400;' : '';
        const shotStyle = isLogo
            ? 'background:#F5F3EF;'
            : `background:${p.bg};color:${p.fg};font-size:${size}px;${serif}`;
        return {
            key,
            isReal: true,
            isFeature,
            hasLogo: isLogo,
            logoUrl: p.logoUrl,
            cat: p.cat,
            name: p.name,
            shotStyle,
            cardClass: isFeature ? 'ws-card3 ws-card3_hero' : 'ws-card3',
            flatClass: isFeature ? 'ws-card3 ws-card3_flat ws-card3_flatHero' : 'ws-card3 ws-card3_flat',
            transform
        };
    }

    renderedCallback() {
        if (!this.stylesLoaded) {
            this.stylesLoaded = true;
            loadWebsuiteStyles(this).catch((error) => {

                console.error('websuiteProjectWall: failed to load shared styles', error);
            });
        }
        // Wait for the wire so the scene is built against the final card count.
        if (this.wireReturned && !this.isFlat && !this.gsapStarted) {
            this.gsapStarted = true;
            this.initWall();
        }
    }

    disconnectedCallback() {
        this.scrollTriggers.forEach((st) => st.kill());
        this.scrollTriggers = [];
    }

    initWall() {
        loadGsap(this)
            .then((gsap) => {
                if (!gsap || !window.ScrollTrigger) {
                    throw new Error('GSAP or ScrollTrigger missing after load');
                }
                const wall = this.refs.wall;
                const scene = this.refs.scene;
                const core = this.refs.core;
                const scrollHint = this.refs.scrollHint;
                const totalCards = this.cards.length;

                const fly = gsap.to(scene, {
                    z: totalCards * GAP,
                    ease: 'none',
                    scrollTrigger: { trigger: wall, start: 'top top', end: 'bottom bottom', scrub: 1 }
                });
                const fade = gsap
                    .timeline({
                        scrollTrigger: { trigger: wall, start: 'top top', end: '25% bottom', scrub: 1 }
                    })
                    .to(core, { scale: 1.5, opacity: 0, ease: 'power2.in' })
                    .to(scrollHint, { opacity: 0, duration: 0.3 }, 0);

                this.scrollTriggers = [fly.scrollTrigger, fade.scrollTrigger].filter(Boolean);
            })
            .catch((error) => {

                console.error('websuiteProjectWall: GSAP init failed, using flat fallback', error);
                this.gsapFailed = true;
            });
    }
}