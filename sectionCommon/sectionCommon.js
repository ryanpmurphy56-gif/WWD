/**
 * sectionCommon — shared helpers for every section renderer (brief §4.4).
 *
 * All section components implement the same contract (@api content,
 * sectionStyle, variant, layout, mode) and share the same chrome: a
 * background/tone/padding shell, a 12-column placement grid, inline edit
 * affordances, and a `contentchange` event carrying a content patch. These
 * helpers keep that behaviour identical across the set so a new section type is
 * mostly its own markup — the plumbing lives here.
 *
 * Leaf module: imports nothing, so any section can depend on it freely.
 */

/* ---- responsive style values ------------------------------------------
 *
 * Any style field may hold either a plain scalar ("M") or a breakpoint map
 * ({ __bp:true, base:'M', mobile:'S' }). The `__bp` marker is what makes the
 * two tellable apart -- without it a composite value like `border` (itself an
 * object) would be indistinguishable from a breakpoint map. Scalars apply at
 * every device, so every config written before this existed keeps working
 * untouched and nothing needs migrating.
 *
 * Devices resolve widest-first: mobile falls back to tablet, tablet to base.
 * `base` is therefore "applies everywhere unless overridden", which matches how
 * the editor is used -- design on desktop, tweak the narrow cases after.
 */

export const BREAKPOINTS = ['base', 'tablet', 'mobile'];

const DEVICE_TO_BP = { desktop: 'base', base: 'base', tablet: 'tablet', mobile: 'mobile' };
const CASCADE = { base: ['base'], tablet: ['tablet', 'base'], mobile: ['mobile', 'tablet', 'base'] };

export function isBpMap(value) {
    return !!value && typeof value === 'object' && value.__bp === true;
}

/** Resolve a (possibly breakpoint-mapped) style value for one device. */
export function bpValue(value, device = 'base') {
    if (!isBpMap(value)) {
        return value; // a scalar applies at every breakpoint
    }
    const chain = CASCADE[DEVICE_TO_BP[device] || 'base'] || CASCADE.base;
    for (let i = 0; i < chain.length; i += 1) {
        const found = value[chain[i]];
        if (found !== undefined && found !== null && found !== '') {
            return found;
        }
    }
    return undefined;
}

/**
 * Write `next` at one device, returning the new value. Editing `base` on a
 * value that has no overrides keeps it a plain scalar, so configs only grow a
 * breakpoint map once someone actually overrides a narrower device.
 */
export function setBpValue(current, device, next) {
    const bp = DEVICE_TO_BP[device] || 'base';
    if (bp === 'base' && !isBpMap(current)) {
        return next;
    }
    const map = isBpMap(current) ? { ...current } : { __bp: true, base: current };
    map.__bp = true;
    map[bp] = next;
    return map;
}

/**
 * Drop the override at one device. Once nothing overrides base any more the
 * value collapses back to a plain scalar, so a set-then-reset round trip leaves
 * the config exactly as it started rather than accumulating dead maps.
 */
export function clearBpValue(current, device) {
    const bp = DEVICE_TO_BP[device] || 'base';
    if (bp === 'base' || !isBpMap(current)) {
        return current; // base is the value itself, not an override
    }
    const map = { ...current };
    delete map[bp];
    const remaining = Object.keys(map).filter((k) => k !== '__bp');
    return remaining.length === 1 && remaining[0] === 'base' ? map.base : map;
}

/** Which style fields carry an explicit override at `device`. */
export function overriddenAt(style, device) {
    const bp = DEVICE_TO_BP[device] || 'base';
    if (bp === 'base') {
        return [];
    }
    return Object.keys(style || {}).filter((k) => isBpMap(style[k]) && style[k][bp] !== undefined);
}

/* ---- style scales ------------------------------------------------------ */

// Padding multiplies by the theme spacing scale, so a section's own padding
// choice still tracks the site-wide compact/comfortable/spacious setting.
const PAD_SCALE = { none: '0rem', XS: '1rem', S: '2.5rem', M: '4rem', L: '6rem', XL: '8rem' };
// Gap between a row's columns. Same scale shape as padding but tighter -- a
// 4rem gutter between two columns reads as a broken layout, not a spacious one.
const GAP_SCALE = { none: '0rem', XS: '0.5rem', S: '1rem', M: '1.5rem', L: '2.5rem', XL: '4rem' };
const RADIUS_SCALE = { none: '0', sm: '4px', md: '10px', lg: '18px', xl: '28px', pill: '999px' };
const SHADOW_SCALE = {
    none: 'none',
    sm: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.10)',
    md: '0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.10)',
    lg: '0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10)',
    xl: '0 20px 25px -5px rgba(0,0,0,0.12), 0 8px 10px -6px rgba(0,0,0,0.10)'
};
// Margin, same shape as padding but its own scale -- a section's outer
// spacing from its neighbors reads differently than its own inner padding.
const MARGIN_SCALE = { none: '0rem', S: '1rem', M: '2rem', L: '4rem' };
// Presets, not a raw text-shadow input, matching how shadow/radius/gap are
// already curated scales rather than free-form CSS everywhere else here.
const TEXT_SHADOW_SCALE = {
    none: 'none',
    soft: '0 1px 2px rgba(0,0,0,0.15)',
    hard: '0 2px 0 rgba(0,0,0,0.25)'
};
// Media filter presets (background/foreground images and video), same
// curated-scale convention as TEXT_SHADOW_SCALE above rather than a raw CSS
// filter input.
export const FILTER_SCALE = {
    none: 'none',
    warm: 'sepia(0.25) saturate(1.25) brightness(1.03)',
    cool: 'saturate(1.1) hue-rotate(-6deg) brightness(1.02) contrast(1.03)',
    bw: 'grayscale(1) contrast(1.05)',
    vivid: 'saturate(1.4) contrast(1.08)',
    muted: 'saturate(0.55) brightness(0.98)'
};

/** CSS background-position for a stored focal point ({x,y} in %), or center. */
export function focalPosition(focal) {
    if (!focal || focal.x == null || focal.y == null) {
        return 'center';
    }
    const clamp = (v) => Math.min(Math.max(Number(v) || 0, 0), 100);
    return `${clamp(focal.x)}% ${clamp(focal.y)}%`;
}

/**
 * Turn a pasted YouTube/Vimeo watch/share URL into {provider, embedUrl}, or
 * null if it doesn't match either. YouTube resolves to the -nocookie embed
 * host (no viewer-tracking cookie until the visitor actually presses play);
 * Vimeo's player host is embed-only by design already.
 */
export function parseVideoEmbed(url) {
    const trimmed = (url || '').trim();
    if (!trimmed) {
        return null;
    }
    const yt = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
    if (yt) {
        return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
    }
    const vim = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vim) {
        return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vim[1]}` };
    }
    return null;
}

function backgroundCss(bg, style, device, imageUrl, focal) {
    switch (bg) {
        case 'none':
            return 'transparent';
        case 'primary':
            return 'var(--ws-primary, #1f3d5c)';
        case 'secondary':
            return 'var(--ws-secondary, #ff5b04)';
        case 'gradient': {
            const g = bpValue(style.gradient, device) || {};
            const angle = g.angle === undefined ? 135 : g.angle;
            return `linear-gradient(${angle}deg, ${g.from || '#1f3d5c'}, ${g.to || '#ff5b04'})`;
        }
        case 'image':
            // No image chosen yet -> fall back to a flat colour rather than
            // emitting an invalid url() that would blank the whole background.
            if (!imageUrl) {
                return 'var(--ws-primary, #1f3d5c)';
            }
            // Scrim keeps overlaid text legible on top of any photo. The colour
            // must sit in the final layer for `background` shorthand to accept it.
            // The focal point (chosen in the settings panel) becomes the
            // background-position, so cover-cropping keeps the subject visible.
            return (
                `linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.45)), ` +
                `url("${String(imageUrl).replace(/"/g, '\\"')}") ${focalPosition(focal)} / cover no-repeat, ` +
                `var(--ws-primary, #1f3d5c)`
            );
        // The video itself is a real <video>/<iframe> element layered behind
        // the content (CSS `background` can't express a video the way it can
        // an image) — this just supplies the same legibility scrim plus a
        // flat-colour fallback for before a video is chosen / while it loads.
        case 'video':
            return 'linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.45)), var(--ws-primary, #1f3d5c)';
        case 'surface':
        default:
            return 'var(--ws-surface, #ffffff)';
    }
}

/**
 * Text colour for the shell. The old CSS hardcoded `color:#fff` inside the
 * .sec_bg-primary rule rather than deriving it from tone, so a section saved as
 * {background:'primary', tone:'light'} still rendered white text. Keep that
 * coupling here: any dark background forces light text regardless of tone, and
 * tone only decides the outcome on a neutral surface.
 */
function textColorCss(bg, tone) {
    if (bg === 'primary' || bg === 'secondary' || bg === 'image' || bg === 'gradient' || bg === 'video') {
        return '#ffffff';
    }
    return tone === 'dark' ? '#ffffff' : 'var(--ws-text, #0a0a0a)';
}

function hoverCss(style, device) {
    const effect = (bpValue(style.hover, device) || {}).effect || 'none';
    if (effect === 'lift') {
        return { transform: 'translateY(-4px)', shadow: SHADOW_SCALE.lg };
    }
    if (effect === 'scale') {
        return { transform: 'scale(1.02)', shadow: '' };
    }
    if (effect === 'glow') {
        return { transform: 'none', shadow: '0 0 0 4px color-mix(in srgb, var(--ws-primary, #1f3d5c) 30%, transparent)' };
    }
    return { transform: 'none', shadow: '' };
}

/** The shell properties, fully resolved for one breakpoint. */
function shellVars(s, device, imageUrl, focal) {
    const pad = bpValue(s.padding, device) || 'M';
    const radius = bpValue(s.radius, device) || 'inherit';
    const shadow = bpValue(s.shadow, device) || 'none';
    const bg = bpValue(s.background, device) || 'surface';
    const tone = bpValue(s.tone, device) || 'light';
    const border = bpValue(s.border, device) || {};
    const width = Number(border.width || 0);
    const gap = bpValue(s.gap, device) || 'M';
    const margin = bpValue(s.margin, device) || 'none';
    const opacityRaw = bpValue(s.opacity, device);
    const opacity = opacityRaw === undefined || opacityRaw === null || opacityRaw === ''
        ? 1
        : Math.max(0, Math.min(1, Number(opacityRaw)));
    return {
        pad: `calc(${PAD_SCALE[pad] || PAD_SCALE.M} * var(--ws-space, 1))`,
        bg: backgroundCss(bg, s, device, imageUrl, focal),
        color: textColorCss(bg, tone),
        radius: radius === 'inherit' ? 'var(--ws-radius, 10px)' : RADIUS_SCALE[radius] || '0',
        border: width > 0 ? `${width}px ${border.style || 'solid'} ${border.color || '#e5e7eb'}` : '0 solid transparent',
        shadow: SHADOW_SCALE[shadow] || 'none',
        // Only sectionRow consumes --sec-gap; emitting it everywhere costs one
        // declaration and keeps every section on one shell contract.
        gap: `calc(${GAP_SCALE[gap] || GAP_SCALE.M} * var(--ws-space, 1))`,
        margin: `calc(${MARGIN_SCALE[margin] || MARGIN_SCALE.none} * var(--ws-space, 1))`,
        opacity
    };
}

// Fields whose value can carry a breakpoint map; if none of them does, the
// section renders identically at every width and the -t/-m vars are skipped.
const SHELL_SOURCES = ['padding', 'radius', 'shadow', 'background', 'tone', 'border', 'gradient', 'gap', 'margin'];

/**
 * The inline custom properties driving a section's style shell.
 *
 * Two things are deliberate here. First, these are custom properties rather
 * than real declarations: an inline `box-shadow` would outrank any `:hover`
 * rule, so hover could never override it. Second, the per-breakpoint values are
 * emitted as *data* (`--sec-pad-t`, `--sec-pad-m`) for CSS container queries to
 * choose between, rather than resolved here against the editor's device toggle.
 * The canvas frame is a max-width div, not a real viewport -- a phone-width
 * preview does not narrow the browser -- so resolving in JS would work in the
 * editor and then silently stop working on a published page, where nothing sets
 * the toggle. Container queries read the frame's real width and so behave the
 * same in both places.
 */
export function sectionRootStyle(style, { imageUrl = '', focal = null } = {}) {
    const s = style || {};
    const base = shellVars(s, 'base', imageUrl, focal);
    const decls = Object.keys(base).map((k) => `--sec-${k}:${base[k]}`);

    // Only pay for the override vars when something is actually overridden.
    if (SHELL_SOURCES.some((k) => isBpMap(s[k]))) {
        const tablet = shellVars(s, 'tablet', imageUrl, focal);
        const mobile = shellVars(s, 'mobile', imageUrl, focal);
        Object.keys(base).forEach((k) => decls.push(`--sec-${k}-t:${tablet[k]}`));
        Object.keys(base).forEach((k) => decls.push(`--sec-${k}-m:${mobile[k]}`));
    }

    // Hover is pointer-only, so it has no per-breakpoint form.
    const hover = hoverCss(s, 'base');
    decls.push(`--sec-hover-transform:${hover.transform}`);
    if (hover.shadow) {
        decls.push(`--sec-hover-shadow:${hover.shadow}`);
    }
    // Pushed manually (not through shellVars' generic per-key loop) so these
    // stay lowercase-hyphenated (--sec-min-w) like --sec-hover-transform,
    // instead of picking up a camelCase key name from Object.keys(base).
    // Not part of SHELL_SOURCES -- base-only, no per-breakpoint override.
    const minW = s.minWidth != null && s.minWidth !== '' ? `${s.minWidth}rem` : '0';
    const maxW = s.maxWidth != null && s.maxWidth !== '' ? `${s.maxWidth}rem` : 'none';
    const minH = s.minHeight != null && s.minHeight !== '' ? `${s.minHeight}rem` : '0';
    const maxH = s.maxHeight != null && s.maxHeight !== '' ? `${s.maxHeight}rem` : 'none';
    decls.push(`--sec-min-w:${minW}`, `--sec-max-w:${maxW}`, `--sec-min-h:${minH}`, `--sec-max-h:${maxH}`);
    // Media filter (background video layer + foreground images) — base-only,
    // like opacity/min/max above. Deliberately NOT applied to the section root
    // itself (that would blur/desaturate text too); each section's CSS opts
    // whichever element is the actual media layer into var(--sec-media-filter).
    decls.push(`--sec-media-filter:${FILTER_SCALE[s.mediaFilter] || FILTER_SCALE.none}`);
    // Parallax (F9b) — background-attachment:fixed is the standard CSS trick,
    // only meaningful on an image background. Checked once here (not a media
    // query duplicated into every section's CSS) so touch devices — where
    // fixed attachment is unreliable/unsupported (notably iOS Safari) — never
    // get it at all, rather than shipping a broken effect there.
    const coarsePointer = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(pointer: coarse)').matches
        : false;
    const parallax = s.background === 'image' && s.parallax && !coarsePointer;
    decls.push(`--sec-bg-attachment:${parallax ? 'fixed' : 'scroll'}`);
    return `${decls.join(';')};`;
}

/**
 * The per-FIELD equivalent of sectionRootStyle above -- one section can have
 * several independently-styled text fields (a hero's heading vs. subheading),
 * which the section-wide --sec-* shell has no way to address. Called once per
 * styleable field by the section component, e.g. fieldStyle(sectionStyle.fields,
 * 'heading'). Only emits a declaration for a property actually set; everything
 * else falls through to that field's own var(--fld-x-y, <original>) fallback in
 * its .css, so an untouched field renders identically to before this existed.
 * Base-only, like opacity/min/max above -- no per-breakpoint override.
 */
export function fieldStyle(styleFields, fieldKey) {
    const f = (styleFields || {})[fieldKey];
    if (!f) {
        return '';
    }
    const decls = [];
    if (f.fontSize != null && f.fontSize !== '') {
        decls.push(`--fld-${fieldKey}-size:${f.fontSize}rem`);
    }
    if (f.fontWeight) {
        decls.push(`--fld-${fieldKey}-weight:${f.fontWeight}`);
    }
    if (f.lineHeight != null && f.lineHeight !== '') {
        decls.push(`--fld-${fieldKey}-lh:${f.lineHeight}`);
    }
    if (f.letterSpacing != null && f.letterSpacing !== '') {
        decls.push(`--fld-${fieldKey}-ls:${f.letterSpacing}em`);
    }
    if (f.textShadow && f.textShadow !== 'none') {
        decls.push(`--fld-${fieldKey}-shadow:${TEXT_SHADOW_SCALE[f.textShadow] || TEXT_SHADOW_SCALE.none}`);
    }
    return decls.length ? `${decls.join(';')};` : '';
}

/**
 * The section shell classes. `base` is the per-type class (e.g. "sec_features").
 * Background and padding are no longer classes -- they resolve per breakpoint in
 * sectionRootStyle above, since gradients and custom border colours can't be
 * expressed as a fixed set of class names. Tone stays a class only as a legacy
 * hook; the text colour it used to drive now comes from --sec-color, which is
 * per-breakpoint. Hence base tone here, not a per-device one.
 */
export function sectionRootClass(base, { variant, style, layout, mode } = {}) {
    const tone = bpValue(style && style.tone) || 'light';
    const valign = (layout && layout.valign) || 'center';
    const classes = ['sec', base, `sec_${variant || 'default'}`, `sec_tone-${tone}`, `sec_valign-${valign}`];
    if (mode === 'edit') {
        classes.push('sec_edit');
    }
    return classes.join(' ');
}

/**
 * Placement of the content block on the 12-column grid, as custom properties.
 * Emitted as vars rather than a literal `grid-column` so the container query in
 * each section's CSS can collapse the block to full width on narrow screens --
 * an inline grid-column would outrank that rule and never stack.
 */
export function blockStyle(layout) {
    const start = (layout && layout.colStart) || 1;
    const span = (layout && layout.colSpan) || 12;
    return `--sec-col-start:${start};--sec-col-span:${span};`;
}

/** Dispatch a content patch from a section component. */
export function emitChange(cmp, patch) {
    cmp.dispatchEvent(new CustomEvent('contentchange', { detail: { patch } }));
}

/**
 * For a scalar (non-list) inline edit: read data-field + text off the target and
 * emit a patch, but only when the value actually changed. Returns true if it did.
 */
export function commitField(cmp, event, content) {
    const field = event.target.dataset.field;
    if (!field) {
        return false;
    }
    const value = (event.target.textContent || '').trim();
    if (value === ((content && content[field]) || '')) {
        return false;
    }
    emitChange(cmp, { [field]: value });
    return true;
}

/**
 * For a list-type field: read data-index + data-key off the target and emit the
 * whole updated `items` array (the store merges it as a content patch). Only
 * emits on a real change.
 */
export function commitListItem(cmp, event, items) {
    const i = Number(event.target.dataset.index);
    const key = event.target.dataset.key;
    const list = items || [];
    if (!list[i] || !key) {
        return;
    }
    const value = (event.target.textContent || '').trim();
    if (list[i][key] === value) {
        return;
    }
    const next = list.map((item) => ({ ...item }));
    next[i][key] = value;
    emitChange(cmp, { items: next });
}

/** Append a new item to a list field and emit the updated array. */
export function addListItem(cmp, items, template) {
    const next = (items || []).map((item) => ({ ...item }));
    next.push({ ...template });
    emitChange(cmp, { items: next });
}

/** Remove the item at `index` from a list field and emit the updated array. */
export function removeListItem(cmp, items, index) {
    const next = (items || []).filter((_, i) => i !== Number(index));
    emitChange(cmp, { items: next });
}

/** Swap the item at `index` with its neighbour (`delta` of -1 or 1) and emit
 * the updated array. A no-op past either end of the list. */
export function moveListItem(cmp, items, index, delta) {
    const list = items || [];
    const i = Number(index);
    const target = i + delta;
    if (target < 0 || target >= list.length) {
        return;
    }
    const next = list.map((item) => ({ ...item }));
    const [moved] = next.splice(i, 1);
    next.splice(target, 0, moved);
    emitChange(cmp, { items: next });
}