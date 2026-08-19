/**
 * themeProvider — injects the site theme as CSS custom properties at the canvas
 * root (brief §4.3). Whatever it wraps (the editor preview here, the published
 * render later) inherits the vars, so sections never hard-code colour, font or
 * radius. This replaces the shell's earlier inline themeStyle stand-in.
 *
 * CSS custom properties inherit through the slot, so setting them on the wrapper
 * cascades into the slotted canvas.
 */
import { LightningElement, api } from 'lwc';
import { fontPair, radiusValue, spacingScale, buttonVars, linkVars, formVars, headingVars } from 'c/themePresets';

export default class ThemeProvider extends LightningElement {
    @api theme = {};

    get styleString() {
        const t = this.theme || {};
        const p = t.palette || {};
        const pair = fontPair(t.fontPair);
        const btn = buttonVars(t);
        const link = linkVars(t);
        const form = formVars(t);
        const heading = headingVars(t);
        const decls = [
            `--ws-primary:${p.primary || '#1f3d5c'}`,
            `--ws-secondary:${p.secondary || '#ff5b04'}`,
            `--ws-accent:${p.accent || p.secondary || '#ff5b04'}`,
            `--ws-surface:${p.surface || '#ffffff'}`,
            `--ws-text:${p.text || '#0a0a0a'}`,
            `--ws-radius:${radiusValue(t.radius)}`,
            `--ws-space:${spacingScale(t.spacing)}`,
            `--ws-font-heading:${pair.heading}`,
            `--ws-font-body:${pair.body}`,
            `--ws-motion:${t.motion || 'subtle'}`,
            `--ws-btn-bg:${btn.bg}`,
            `--ws-btn-color:${btn.color}`,
            `--ws-btn-border:${btn.border}`,
            `--ws-link-color:${link.color}`,
            `--ws-link-decoration:${link.decoration}`,
            `--ws-link-hover-decoration:${link.hoverDecoration}`,
            `--ws-form-focus:${form.focus}`
        ];
        // Heading weight/colour only emitted when the theme actually sets
        // them -- see headingVars' doc comment for why "unset" must mean "no
        // declaration" rather than a resolved default value.
        if (heading.weight) {
            decls.push(`--ws-heading-weight:${heading.weight}`);
        }
        if (heading.color) {
            decls.push(`--ws-heading-color:${heading.color}`);
        }
        return decls.join(';');
    }
}