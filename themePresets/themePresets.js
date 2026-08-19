/**
 * themePresets — curated design-system options for the theme panel (brief §4.3).
 *
 * A personality preset is a bundle: palette direction (now incl. a 4th
 * `accent` swatch) + font pairing + corner radius + spacing scale + motion +
 * button/link/form/heading styling. Applying one restyles the whole site at
 * once. The panel also offers curated palette swatches, font-pair presets,
 * and the radius/spacing/motion/button/link/form/heading options as
 * individual controls, plus a custom palette override.
 *
 * Leaf module (imports nothing) so the store can depend on it without a
 * cycle. Font pairs use system/web-safe stacks — no font hosting in the
 * skeleton.
 */

export const PERSONALITIES = [
    {
        id: 'professional',
        label: 'Professional',
        palette: { primary: '#1F3D5C', secondary: '#2E6B4F', accent: '#2E6B4F', surface: '#FFFFFF', text: '#0A0A0A' },
        fontPair: 'sans-modern',
        radius: 'soft',
        spacing: 'comfortable',
        motion: 'subtle'
    },
    {
        id: 'playful',
        label: 'Playful',
        palette: { primary: '#7A3FF2', secondary: '#FF5B04', accent: '#FF5B04', surface: '#FFFDF7', text: '#1A1030' },
        fontPair: 'rounded',
        radius: 'round',
        spacing: 'spacious',
        motion: 'energetic'
    },
    {
        id: 'bold',
        label: 'Bold',
        palette: { primary: '#0A0A0A', secondary: '#FF5B04', accent: '#FF5B04', surface: '#FFFFFF', text: '#0A0A0A' },
        fontPair: 'grotesk',
        radius: 'sharp',
        spacing: 'comfortable',
        motion: 'energetic'
    },
    {
        id: 'minimal',
        label: 'Minimal',
        palette: { primary: '#111827', secondary: '#6B7280', accent: '#6B7280', surface: '#FFFFFF', text: '#111827' },
        fontPair: 'sans-modern',
        radius: 'sharp',
        spacing: 'spacious',
        motion: 'none'
    },
    {
        id: 'warm',
        label: 'Warm',
        palette: { primary: '#B5451B', secondary: '#E0A458', accent: '#E0A458', surface: '#FBF6EF', text: '#2A1A12' },
        fontPair: 'serif-classic',
        radius: 'soft',
        spacing: 'comfortable',
        motion: 'subtle'
    },
    {
        id: 'dark',
        label: 'Dark',
        palette: { primary: '#0E1116', secondary: '#5B8DEF', accent: '#5B8DEF', surface: '#151A21', text: '#F5F7FA' },
        fontPair: 'grotesk',
        radius: 'soft',
        spacing: 'comfortable',
        motion: 'subtle'
    },
    // ---- named theme kits (build-map F6) ---------------------------------
    // These five are fuller bundles: on top of palette/font/radius/spacing/
    // motion, they also set button/link/form/heading so picking a kit gives a
    // genuinely distinct look, not just a different colour. The six presets
    // above deliberately omit those fields (falls through to the neutral
    // button/link/form/heading defaults below) so applying any of them keeps
    // rendering byte-identical to before this package existed.
    {
        id: 'startup',
        label: 'Startup',
        palette: { primary: '#3730A3', secondary: '#10B981', accent: '#8B5CF6', surface: '#FFFFFF', text: '#0F172A' },
        fontPair: 'grotesk',
        radius: 'round',
        spacing: 'comfortable',
        motion: 'energetic',
        button: { color: 'primary', variant: 'solid' },
        link: { color: 'primary', underline: 'none' },
        form: { accent: 'primary' },
        heading: { weight: '800', color: 'inherit' }
    },
    {
        id: 'corporate',
        label: 'Corporate',
        palette: { primary: '#1E3A5F', secondary: '#4A6FA5', accent: '#64748B', surface: '#FFFFFF', text: '#111827' },
        fontPair: 'sans-modern',
        radius: 'sharp',
        spacing: 'comfortable',
        motion: 'subtle',
        button: { color: 'primary', variant: 'outline' },
        link: { color: 'primary', underline: 'always' },
        form: { accent: 'primary' },
        heading: { weight: '700', color: 'primary' }
    },
    {
        id: 'luxury',
        label: 'Luxury',
        palette: { primary: '#1A1A1A', secondary: '#B8974A', accent: '#E4C98A', surface: '#FAF9F6', text: '#1A1A1A' },
        fontPair: 'serif-elegant',
        radius: 'sharp',
        spacing: 'spacious',
        motion: 'subtle',
        button: { color: 'secondary', variant: 'outline' },
        link: { color: 'accent', underline: 'hover' },
        form: { accent: 'secondary' },
        heading: { weight: '700', color: 'inherit' }
    },
    {
        id: 'creative',
        label: 'Creative',
        palette: { primary: '#7C3AED', secondary: '#F43F5E', accent: '#FACC15', surface: '#FFFDF7', text: '#1E1030' },
        fontPair: 'rounded',
        radius: 'round',
        spacing: 'spacious',
        motion: 'energetic',
        button: { color: 'secondary', variant: 'solid' },
        link: { color: 'accent', underline: 'hover' },
        form: { accent: 'secondary' },
        heading: { weight: '800', color: 'accent' }
    },
    {
        id: 'restaurant',
        label: 'Restaurant',
        palette: { primary: '#A6412A', secondary: '#C98A2C', accent: '#E8D9B5', surface: '#FBF3E7', text: '#2A1810' },
        fontPair: 'serif-classic',
        radius: 'round',
        spacing: 'comfortable',
        motion: 'subtle',
        button: { color: 'secondary', variant: 'solid' },
        link: { color: 'primary', underline: 'none' },
        form: { accent: 'secondary' },
        heading: { weight: '700', color: 'primary' }
    }
];

export const PALETTES = [
    { id: 'harbour', primary: '#1F3D5C', secondary: '#2E6B4F', accent: '#D4A24C', surface: '#FFFFFF', text: '#0A0A0A' },
    { id: 'ember', primary: '#0A0A0A', secondary: '#FF5B04', accent: '#FFC145', surface: '#FFFFFF', text: '#0A0A0A' },
    { id: 'sand', primary: '#B5451B', secondary: '#E0A458', accent: '#7C8A56', surface: '#FBF6EF', text: '#2A1A12' },
    { id: 'orchid', primary: '#7A3FF2', secondary: '#FF5B04', accent: '#2FB8A6', surface: '#FFFDF7', text: '#1A1030' },
    { id: 'gold', primary: '#1A1A1A', secondary: '#B8974A', accent: '#E4C87A', surface: '#FAF9F6', text: '#1A1A1A' },
    { id: 'midnight', primary: '#0E1116', secondary: '#5B8DEF', accent: '#37D6C4', surface: '#151A21', text: '#F5F7FA' }
];

export const FONT_PAIRS = [
    {
        id: 'sans-modern',
        label: 'Modern Sans',
        heading: '"Segoe UI", system-ui, -apple-system, sans-serif',
        body: 'system-ui, -apple-system, sans-serif'
    },
    {
        id: 'grotesk',
        label: 'Grotesk',
        heading: '"Arial Black", "Helvetica Neue", Arial, sans-serif',
        body: '"Helvetica Neue", Arial, sans-serif'
    },
    {
        id: 'rounded',
        label: 'Rounded',
        heading: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
        body: '"Trebuchet MS", system-ui, sans-serif'
    },
    {
        id: 'serif-classic',
        label: 'Classic Serif',
        heading: 'Georgia, "Times New Roman", serif',
        body: 'Georgia, serif'
    },
    {
        id: 'serif-elegant',
        label: 'Elegant Serif',
        heading: '"Palatino Linotype", Palatino, Georgia, serif',
        body: 'Georgia, "Times New Roman", serif'
    }
];

export const RADII = [
    { id: 'sharp', label: 'Sharp' },
    { id: 'soft', label: 'Soft' },
    { id: 'round', label: 'Round' }
];
export const SPACINGS = [
    { id: 'compact', label: 'Compact' },
    { id: 'comfortable', label: 'Comfortable' },
    { id: 'spacious', label: 'Spacious' }
];
export const MOTIONS = [
    { id: 'none', label: 'None' },
    { id: 'subtle', label: 'Subtle' },
    { id: 'energetic', label: 'Energetic' }
];

// ---- design-system: buttons / links / forms / headings --------------------
// A shared "which palette colour" picker for button/form controls (link adds
// its own 'inherit' option on top of these three, since a link's natural
// default is to inherit the surrounding text colour rather than pick a role).
export const COLOR_ROLES = [
    { id: 'primary', label: 'Primary' },
    { id: 'secondary', label: 'Secondary' },
    { id: 'accent', label: 'Accent' }
];
export const LINK_COLORS = [{ id: 'inherit', label: 'Inherit' }, ...COLOR_ROLES];
export const BUTTON_VARIANTS = [
    { id: 'solid', label: 'Solid' },
    { id: 'outline', label: 'Outline' },
    { id: 'ghost', label: 'Ghost' }
];
export const LINK_UNDERLINES = [
    { id: 'none', label: 'None' },
    { id: 'hover', label: 'On hover' },
    { id: 'always', label: 'Always' }
];
export const HEADING_WEIGHTS = [
    { id: 'default', label: 'Default' },
    { id: '600', label: 'Medium' },
    { id: '700', label: 'Semibold' },
    { id: '800', label: 'Bold' },
    { id: '900', label: 'Black' }
];
export const HEADING_COLORS = [{ id: 'inherit', label: 'Inherit' }, ...COLOR_ROLES];

export function personality(id) {
    return PERSONALITIES.find((p) => p.id === id) || null;
}

export function fontPair(id) {
    return FONT_PAIRS.find((f) => f.id === id) || FONT_PAIRS[0];
}

export function radiusValue(id) {
    return { sharp: '2px', soft: '10px', round: '20px' }[id] || '10px';
}

export function spacingScale(id) {
    return { compact: 0.8, comfortable: 1, spacious: 1.3 }[id] || 1;
}

/** Resolve a palette role ('primary'|'secondary'|'accent') to a hex value. */
export function roleColor(palette, role) {
    const p = palette || {};
    if (role === 'primary') {
        return p.primary || '#1f3d5c';
    }
    if (role === 'accent') {
        return p.accent || p.secondary || '#ff5b04';
    }
    return p.secondary || '#ff5b04';
}

/**
 * Resolve `theme.button` ({color, variant}) into the three CSS values every
 * site-wide button/CTA consumes. Unset fields default to today's look (solid
 * secondary-coloured button, white label) so a theme saved before this
 * package existed renders unchanged.
 */
export function buttonVars(theme) {
    const btn = (theme && theme.button) || {};
    const variant = btn.variant || 'solid';
    const base = roleColor(theme && theme.palette, btn.color || 'secondary');
    if (variant === 'outline') {
        return { bg: 'transparent', color: base, border: `2px solid ${base}` };
    }
    if (variant === 'ghost') {
        return { bg: 'transparent', color: base, border: '0 solid transparent' };
    }
    return { bg: base, color: '#ffffff', border: '0 solid transparent' };
}

const UNDERLINE_CSS = { none: 'none', hover: 'none', always: 'underline' };
const UNDERLINE_HOVER_CSS = { none: 'none', hover: 'underline', always: 'underline' };

/** Resolve `theme.link` ({color, underline}) into CSS values. Defaults match
 * today's plain nav-link look (inherit colour, no underline). */
export function linkVars(theme) {
    const link = (theme && theme.link) || {};
    const colorId = link.color || 'inherit';
    const color = colorId === 'inherit' ? 'inherit' : roleColor(theme && theme.palette, colorId);
    const underline = link.underline || 'none';
    return {
        color,
        decoration: UNDERLINE_CSS[underline] || 'none',
        hoverDecoration: UNDERLINE_HOVER_CSS[underline] || 'none'
    };
}

/** Resolve `theme.form` ({accent}) into the focus-ring colour form fields use. */
export function formVars(theme) {
    const form = (theme && theme.form) || {};
    return { focus: roleColor(theme && theme.palette, form.accent || 'secondary') };
}

/**
 * Resolve `theme.heading` ({weight, color}) into the optional extra CSS-var
 * tier every section heading falls back through. Both come back `undefined`
 * at their 'default'/'inherit' id so the caller can skip emitting the
 * property entirely — each section keeps its own individual literal weight
 * (800 for a hero, 700 for a FAQ question, etc.) rather than every heading
 * sitewide snapping to one number the moment this theme block exists.
 */
export function headingVars(theme) {
    const heading = (theme && theme.heading) || {};
    const weight = heading.weight && heading.weight !== 'default' ? heading.weight : undefined;
    const color =
        heading.color && heading.color !== 'inherit' ? roleColor(theme && theme.palette, heading.color) : undefined;
    return { weight, color };
}