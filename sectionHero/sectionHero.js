/**
 * sectionHero — the first real section component and the template every other
 * section type will follow (brief §4.4). Same contract for all sections:
 *   @api content      — typed content object from SiteConfig
 *   @api sectionStyle — the allowed per-section overrides (background/tone/padding).
 *                       Named sectionStyle, not `style`, which LWC reserves.
 *   @api mode         — 'edit' or 'live'
 *
 * It renders identically in both modes (build once, render twice); edit mode
 * only adds inline click-to-edit affordances. It never mutates state directly —
 * edits are emitted as a `contentchange` event carrying a content patch, which
 * pageCanvas routes to the store. All colours, fonts and radius come from CSS
 * custom properties, so the section never hard-codes theme.
 */
import { LightningElement, api } from 'lwc';
import { sanitizeInlineHtml } from 'c/sectionRegistry';
import { sectionRootStyle, blockStyle, bpValue, fieldStyle } from 'c/sectionCommon';

export default class SectionHero extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'centered';
    @api layout = {};
    @api mode = 'live';

    // heading/subheading render via lwc:dom="manual" so bold/italic/underline
    // marks from the rich-text toolbar survive — LWC's own {binding} would
    // escape them back to plain text on every re-render.
    renderedCallback() {
        this._syncManual('.hero__heading', this.heading);
        this._syncManual('.hero__sub', this.subheading);
    }

    _syncManual(selector, value) {
        const el = this.template.querySelector(selector);
        if (!el || this.template.activeElement === el) {
            return; // never clobber content the user is actively editing
        }
        const html = value || '';
        /* eslint-disable @lwc/lwc/no-inner-html -- lwc:dom="manual" rich-text sync;
           `value` only ever holds output of sanitizeInlineHtml */
        if (el.innerHTML !== html) {
            el.innerHTML = html;
        }
        /* eslint-enable @lwc/lwc/no-inner-html */
    }

    get isEdit() {
        return this.mode === 'edit';
    }

    // Enumerated attribute: bind the string, not a boolean, so LWC renders
    // contenteditable="false" (locked) rather than removing the attribute.
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }

    get heading() {
        return this.content?.heading || '';
    }

    get subheading() {
        return this.content?.subheading || '';
    }

    get ctaLabel() {
        return this.content?.ctaLabel || '';
    }

    get ctaHref() {
        // Skeleton: external URLs link out; internal page targets are wired up
        // with the page rail in M2, so for now they resolve to no-op anchors.
        const target = this.content?.ctaTarget || '';
        return /^https?:\/\//.test(target) ? target : '#';
    }

    get hasCta() {
        return this.isEdit || !!this.ctaLabel;
    }

    get rootClass() {
        const variant = this.variant || 'centered';
        const tone = bpValue(this.sectionStyle?.tone) || 'light';
        const valign = this.layout?.valign || 'center';
        // Background and padding are no longer classes: they resolve per device
        // in rootStyle below, alongside radius/border/shadow/hover.
        const classes = ['hero', `hero_${variant}`, `hero_tone-${tone}`, `hero_valign-${valign}`];
        if (this.isEdit) {
            classes.push('hero_edit');
        }
        return classes.join(' ');
    }

    // Content sits on a 12-column grid; the placement picker sets these.
    get blockStyle() {
        return blockStyle(this.layout);
    }

    // The whole style shell (padding/background/radius/border/shadow/hover),
    // resolved for the current device. Background 'image' -- including the
    // uploaded imageUrl and its legibility scrim -- is handled in there too,
    // which is what the old --hero-image var used to do on its own.
    get rootStyle() {
        return sectionRootStyle(this.sectionStyle, {
            imageUrl: this.content?.imageUrl,
            focal: this.content?.focal
        });
    }

    // Per-field typography overrides (font size/weight/line-height/letter
    // spacing/text-shadow) — independent of the section-wide style shell above,
    // since heading/subheading/CTA label each need their own size.
    get headingFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'heading');
    }
    get subheadingFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'subheading');
    }
    get ctaLabelFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'ctaLabel');
    }

    // ---- background video --------------------------------------------------
    // A background image is pure CSS (a --sec-bg custom property); a video
    // can't be expressed that way, so when background is 'video' this renders
    // a real <video>/<iframe> layer behind .hero__grid instead. Upload and
    // embed (YouTube/Vimeo) are mutually exclusive on the content, matching
    // how settingsPanel writes them — an upload always clears any embed and
    // vice versa, so at most one of these two getters is ever true.
    get bgIsVideo() {
        return (bpValue(this.sectionStyle?.background) || 'surface') === 'video';
    }
    get showBgVideoFile() {
        return this.bgIsVideo && !!this.content?.bgVideoUrl;
    }
    get showBgVideoEmbed() {
        return this.bgIsVideo && !this.content?.bgVideoUrl && !!this.content?.bgVideoEmbed?.embedUrl;
    }
    get bgVideoUrl() {
        return this.content?.bgVideoUrl || '';
    }
    // Background use wants autoplay/muted/looping with no player chrome —
    // different from how a freeform video element embeds the same kind of
    // link (interactive, with controls) — so the extra query params are
    // added here rather than baked into parseVideoEmbed's shared embedUrl.
    get bgVideoEmbedUrl() {
        const embed = this.content?.bgVideoEmbed;
        if (!embed?.embedUrl) {
            return '';
        }
        if (embed.provider === 'youtube') {
            const id = embed.embedUrl.split('/').pop();
            return `${embed.embedUrl}?autoplay=1&mute=1&loop=1&controls=0&playsinline=1&modestbranding=1&playlist=${id}`;
        }
        if (embed.provider === 'vimeo') {
            return `${embed.embedUrl}?autoplay=1&muted=1&loop=1&background=1`;
        }
        return embed.embedUrl;
    }

    // Inline edits commit on blur (not per keystroke) so typing never triggers a
    // re-render mid-edit, and unchanged fields never push a history entry.
    handleHeadingBlur(event) {
        // eslint-disable-next-line @lwc/lwc/no-inner-html -- read-only; sanitized in _emitIfChangedHtml
        this._emitIfChangedHtml('heading', event.target.innerHTML);
    }

    handleSubheadingBlur(event) {
        // eslint-disable-next-line @lwc/lwc/no-inner-html -- read-only; sanitized in _emitIfChangedHtml
        this._emitIfChangedHtml('subheading', event.target.innerHTML);
    }

    handleCtaLabelBlur(event) {
        this._emitIfChanged('ctaLabel', event.target.textContent);
    }

    // Keep contenteditable to a single line for heading/CTA — Enter commits.
    handleKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        }
    }

    // A CTA in edit mode is an editable label, not a link — don't navigate.
    handleCtaClick(event) {
        if (this.isEdit) {
            event.preventDefault();
        }
    }

    _emitIfChanged(field, rawValue) {
        const value = (rawValue || '').trim();
        if (value === (this.content?.[field] || '')) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('contentchange', {
                detail: { patch: { [field]: value } }
            })
        );
    }

    // Same as _emitIfChanged but for rich-text fields: sanitize the edited
    // innerHTML down to the safe inline-formatting allowlist before it ever
    // reaches the store (and, eventually, the published site).
    _emitIfChangedHtml(field, rawHtml) {
        const value = sanitizeInlineHtml(rawHtml);
        if (value === (this.content?.[field] || '')) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('contentchange', {
                detail: { patch: { [field]: value } }
            })
        );
    }
}