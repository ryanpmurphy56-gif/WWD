/**
 * sectionSlot — renders ONE section node: its edit-mode frame plus the right
 * section component for its `type`.
 *
 * This is the single place the per-type branch list lives. It used to sit in
 * pageCanvas, which was fine while sections were a flat list; now that a `row`
 * can contain other sections, the same switch is needed at every depth. So the
 * switch (and the frame chrome around it) moved here, and both pageCanvas and
 * sectionRow render slots.
 *
 * Recursion: sectionSlot's template renders <c-section-row>, and sectionRow's
 * template renders <c-section-slot> back. LWC compiles that circular pair
 * happily (verified against the org). Depth terminates on the data — a node
 * only recurses while it actually has children.
 *
 * Dynamic components (`lwc:component` + `lwc:is`) would collapse this branch
 * list to a lookup, but they error LWC1188 on this org: "dynamic components
 * have been enabled" is an org setting that is off. Enabling it is the only
 * thing standing between this file and ~60 fewer lines.
 */
import { LightningElement, api } from 'lwc';
import store from 'c/siteStateService';
import { typeLabel } from 'c/sectionRegistry';

export default class SectionSlot extends LightningElement {
    @api node;
    @api pageId;
    @api mode = 'edit';

    // ALL currently selected section ids (multi-select). The shell owns the
    // array; it always contains the primary selection, so "am I selected" is
    // one membership test at every depth.
    @api selectedSectionIds;
    @api isFirst = false;
    @api isLast = false;

    // Where this slot sits, expressed in relocateSection's target terms: its
    // index within the owning list, and — when nested — the row/column that
    // owns that list. A drop "before/after me" is then just index arithmetic.
    @api index = 0;
    @api parentRowId;
    @api parentColId;

    // Ids of every section currently being dragged (threaded down from
    // pageCanvas the same way selectedSectionIds is). More than one when the
    // grabbed section was part of a multi-selection — the whole group rides.
    @api draggingSectionIds;

    // config.globals, threaded down from the shell. A {type:'globalRef'} node
    // renders its shared definition from here — same chrome, live-synced body.
    @api globals;

    // The derived site menu, threaded down for the nav-header branch (and passed
    // through rows so a nav header nested in a column still gets it).
    @api navMenu;

    // The site's record id, threaded down for the blogList branch (dynamic CMS
    // content queries by site, not by anything in SiteConfig) — same
    // pass-through-rows pattern as navMenu above.
    @api siteId;

    // 'before' | 'after' while an active drag hovers this frame; drives the
    // orange insertion line.
    dropPosition = null;

    get isEdit() {
        return this.mode === 'edit';
    }
    get sectionId() {
        return this.node && this.node.sectionId;
    }

    // Flags are per-instance (never resolved through a global's shared
    // definition — see setSectionFlags' doc comment), so these read `node`
    // directly, same as sectionId above, not `resolvedNode`.
    get locked() {
        return !!(this.node && this.node.flags && this.node.flags.locked);
    }
    get hidden() {
        return !!(this.node && this.node.flags && this.node.flags.hidden);
    }
    get isDraggable() {
        return this.isEdit && !this.locked;
    }
    // A locked section still renders in edit mode (so its lock/hide toggles
    // stay reachable) but its content switches to 'live' so nothing inside it
    // is directly editable — the same mode every leaf section already reads
    // to decide contenteditable.
    get childMode() {
        return this.locked ? 'live' : this.mode;
    }
    get lockClass() {
        return this.locked ? 'frame__btn frame__btn_on' : 'frame__btn';
    }
    get lockTitle() {
        return this.locked ? 'Unlock' : 'Lock';
    }
    get hideClass() {
        return this.hidden ? 'frame__btn frame__btn_on' : 'frame__btn';
    }
    get hideTitle() {
        return this.hidden ? 'Unhide' : 'Hide';
    }

    // A global instance renders its shared definition; everything below reads
    // from the resolved node so the branch list and renderers never know the
    // difference. Selection and structural ops keep using the INSTANCE id.
    get isRef() {
        return !!this.node && this.node.type === 'globalRef';
    }
    get resolvedNode() {
        if (!this.isRef) {
            return this.node;
        }
        return (this.globals || {})[this.node.globalId] || null;
    }
    get type() {
        return this.resolvedNode && this.resolvedNode.type;
    }
    get label() {
        return this.isRef ? `${typeLabel(this.type)} • global` : typeLabel(this.type);
    }
    get content() {
        return this.resolvedNode && this.resolvedNode.content;
    }
    get sectionStyle() {
        return this.resolvedNode && this.resolvedNode.style;
    }

    // ---- entrance animation (F9) -------------------------------------------
    // Plays only outside edit mode (Preview and, eventually, the live site) —
    // an author editing content doesn't want their section fading in and out
    // every render. Re-arms every time this slot transitions into a non-edit
    // mode, so re-entering Preview replays it.
    _animIn = false;
    _animArmed = false;
    _animObserver = null;

    get animationConfig() {
        return (this.sectionStyle && this.sectionStyle.animation) || {};
    }
    get animationType() {
        return this.animationConfig.type || 'none';
    }
    get hasAnimation() {
        return !this.isEdit && this.animationType !== 'none';
    }
    get bodyClass() {
        if (!this.hasAnimation) {
            return 'frame__body';
        }
        return `frame__body ws-anim ws-anim_${this.animationType}${this._animIn ? ' ws-anim-in' : ''}`;
    }
    get bodyStyle() {
        if (!this.hasAnimation) {
            return '';
        }
        const DUR = { S: 350, M: 600, L: 950 };
        const DELAY = { none: 0, short: 150, long: 400 };
        const dur = DUR[this.animationConfig.duration] || DUR.M;
        const delay = DELAY[this.animationConfig.delay] || 0;
        return `--ws-anim-dur:${dur}ms;--ws-anim-delay:${delay}ms;`;
    }
    // ---- sticky (F9b) -------------------------------------------------------
    // One section at a time; no z-index handling needed since normal DOM paint
    // order already puts later sections above a pinned earlier one. Mode-gated
    // the same way entrance animation is — an author editing content doesn't
    // want the canvas fighting them with a pinned section while they scroll.
    get isSticky() {
        return !this.isEdit && !!(this.sectionStyle && this.sectionStyle.sticky);
    }

    get variant() {
        return this.resolvedNode && this.resolvedNode.variant;
    }
    get layout() {
        return this.resolvedNode && this.resolvedNode.layout;
    }

    get isSelected() {
        return (this.selectedSectionIds || []).includes(this.sectionId);
    }

    get frameClass() {
        const classes = ['frame'];
        if (this.isSelected) {
            classes.push('frame_selected');
        }
        if (this.isRef) {
            classes.push('frame_global');
        }
        if (this.hidden) {
            classes.push('frame_hidden');
        }
        if (this.isDragSource) {
            classes.push('frame_dragging');
        } else if (this.dragActive && this.dropPosition) {
            classes.push(`frame_drop-${this.dropPosition}`);
        }
        if (this.isSticky) {
            classes.push('frame_sticky');
        }
        return classes.join(' ');
    }

    get dragActive() {
        return !!(this.draggingSectionIds && this.draggingSectionIds.length);
    }
    get isDragSource() {
        return this.dragActive && this.draggingSectionIds.includes(this.sectionId);
    }

    get isHero() {
        return this.type === 'hero';
    }
    get isNavHeader() {
        return this.type === 'navHeader';
    }
    get isTextBlock() {
        return this.type === 'textBlock';
    }
    get isImageText() {
        return this.type === 'imageText';
    }
    get isFeatures() {
        return this.type === 'features';
    }
    get isGallery() {
        return this.type === 'gallery';
    }
    get isTestimonials() {
        return this.type === 'testimonials';
    }
    get isContact() {
        return this.type === 'contact';
    }
    get isPricing() {
        return this.type === 'pricing';
    }
    get isFooter() {
        return this.type === 'footer';
    }
    get isFreeform() {
        return this.type === 'freeform';
    }
    get isRow() {
        return this.type === 'row';
    }
    get isFaq() {
        return this.type === 'faq';
    }
    get isCta() {
        return this.type === 'cta';
    }
    get isStats() {
        return this.type === 'stats';
    }
    get isTeam() {
        return this.type === 'team';
    }
    get isLogoStrip() {
        return this.type === 'logoStrip';
    }
    get isEmbed() {
        return this.type === 'embed';
    }
    get isBlogList() {
        return this.type === 'blogList';
    }
    get isShop() {
        return this.type === 'shop';
    }
    get isTeamList() {
        return this.type === 'teamList';
    }
    get isPortfolioList() {
        return this.type === 'portfolioList';
    }
    get isTestimonialList() {
        return this.type === 'testimonialList';
    }
    get isEventList() {
        return this.type === 'eventList';
    }
    get isMemberLogin() {
        return this.type === 'memberLogin';
    }

    // Selection belongs to the shell. Stop propagation so clicking a nested
    // child selects the child, not every row above it on the way out.
    // Ctrl/Cmd/Shift-click asks the shell to TOGGLE membership instead of
    // replacing the selection — that's the whole multi-select gesture.
    handleSelect(event) {
        if (!this.isEdit) {
            return;
        }
        if (this.locked) {
            return;
        }
        event.stopPropagation();
        this.dispatchEvent(
            new CustomEvent('sectionselect', {
                detail: {
                    sectionId: this.sectionId,
                    additive: event.ctrlKey || event.metaKey || event.shiftKey
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleContentChange(event) {
        event.stopPropagation();
        store.updateSectionContent(this.pageId, this.sectionId, event.detail.patch);
    }

    // ---- drag and drop -----------------------------------------------------
    // Protocol: the grip announces a drag (pageCanvas coordinates it); while a
    // drag is live, the INNERMOST slot under the pointer claims the drop target
    // by stopping the raw pointermove and emitting `sectiondragover`. Ancestor
    // slots/columns hear that emission bubbling through them and clear their own
    // stale indicators — so exactly one insertion line shows at a time.

    handleGripDown(event) {
        if (this.locked) {
            return;
        }
        event.preventDefault();
        // Touch implicitly captures the pointer on pointerdown; release it so
        // pointermove keeps firing on whatever the finger is actually over
        // (drop targets hit-test via event propagation, not coordinates).
        if (event.target.hasPointerCapture && event.target.hasPointerCapture(event.pointerId)) {
            event.target.releasePointerCapture(event.pointerId);
        }
        this.dispatchEvent(
            new CustomEvent('sectiondragstart', {
                detail: { sectionId: this.sectionId, label: this.label, x: event.clientX, y: event.clientY },
                bubbles: true,
                composed: true
            })
        );
    }

    handleDragMove(event) {
        if (!this.dragActive) {
            return;
        }
        event.stopPropagation(); // innermost slot claims; ancestors stay out
        if (this.isDragSource) {
            // Hovering the thing being dragged is not a drop target.
            this.dropPosition = null;
            this._emitTarget(null);
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        if (position !== this.dropPosition) {
            this.dropPosition = position;
            this._emitTarget({
                rowId: this.parentRowId,
                colId: this.parentColId,
                index: this.index + (position === 'after' ? 1 : 0)
            });
        }
    }

    handleDragLeave() {
        if (this.dropPosition) {
            this.dropPosition = null;
        }
    }

    // A descendant slot/column emitted a target: its event bubbles through this
    // root on the way to pageCanvas, which is our cue that the pointer is in
    // nested territory and any indicator of ours is stale.
    handleChildDragOver() {
        if (this.dropPosition) {
            this.dropPosition = null;
        }
    }

    _emitTarget(target) {
        this.dispatchEvent(
            new CustomEvent('sectiondragover', {
                detail: { target },
                bubbles: true,
                composed: true
            })
        );
    }

    // Rows can't be global: their nested children live outside page.sections,
    // where the store's tree walk (and therefore editing) couldn't reach them.
    get canMakeGlobal() {
        return !this.isRef && this.node?.type !== 'row';
    }

    handleCopy() {
        store.copySection(this.pageId, this.sectionId);
    }

    handleMakeGlobal() {
        store.makeSectionGlobal(this.pageId, this.sectionId);
    }

    handleDetach() {
        store.detachGlobal(this.pageId, this.sectionId);
    }

    // Snapshot this section (children and all) into the site's preset library,
    // so it can be re-inserted from the section library's "Your presets" group.
    handleSavePreset() {
        // eslint-disable-next-line no-alert
        const name = window.prompt('Save as preset — give it a name:', this.label);
        if (name === null) {
            return;
        }
        store.saveSectionPreset(this.pageId, this.sectionId, name);
    }

    handleMoveUp() {
        store.moveSection(this.pageId, this.sectionId, -1);
    }
    handleMoveDown() {
        store.moveSection(this.pageId, this.sectionId, 1);
    }
    handleToggleLocked() {
        store.setSectionFlags(this.pageId, this.sectionId, { locked: !this.locked });
    }
    handleToggleHidden() {
        store.setSectionFlags(this.pageId, this.sectionId, { hidden: !this.hidden });
    }
    handleDuplicate() {
        store.duplicateSection(this.pageId, this.sectionId);
    }
    handleDelete() {
        // eslint-disable-next-line no-alert
        if (window.confirm('Delete this section? This cannot be undone except via Undo.')) {
            store.deleteSection(this.pageId, this.sectionId);
        }
    }

    renderedCallback() {
        this._syncAnimation();
    }

    disconnectedCallback() {
        this._teardownAnimObserver();
    }

    _syncAnimation() {
        if (!this.hasAnimation) {
            this._teardownAnimObserver();
            this._animArmed = false;
            this._animIn = false;
            return;
        }
        if (this._animArmed) {
            return;
        }
        this._animArmed = true;
        const trigger = this.animationConfig.trigger || 'onScroll';
        if (trigger === 'onLoad') {
            // rAF puts a paint boundary between the initial (hidden) state and
            // the 'in' class, so the transition actually has something to animate
            // from — flipping the class in the same tick it first renders would
            // let the browser coalesce both states into one paint.
            // eslint-disable-next-line @lwc/lwc/no-async-operation -- one-shot entrance trigger
            requestAnimationFrame(() => {
                this._animIn = true;
            });
            return;
        }
        const el = this.template.querySelector('.frame__body');
        if (!el || typeof IntersectionObserver === 'undefined') {
            this._animIn = true; // no observer support -> just show it
            return;
        }
        this._animObserver = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    this._animIn = true;
                    this._teardownAnimObserver();
                }
            },
            { threshold: 0.15 }
        );
        this._animObserver.observe(el);
    }

    _teardownAnimObserver() {
        if (this._animObserver) {
            this._animObserver.disconnect();
            this._animObserver = null;
        }
    }
}