/**
 * sectionFreeform — a free-position canvas built from the Element Panel
 * (Layout / Text / Image / Button / Spacer), one element at a time. Same
 * contract as the other section components (content / sectionStyle / variant
 * / layout / mode + a `contentchange` event), but its content shape is
 * `elements[]` with each element carrying its own x/y/width (percentages of
 * the canvas, x/y being the element's CENTER) rather than document order.
 *
 * Dragging is local-only until release: the store is only patched once, in
 * onDragEnd, so a whole drag is a single undo step — the same "commit once"
 * pattern settingsPanel uses for its 12-column placement bar. Position is a
 * single set of percentages, not one per breakpoint, so it scales
 * proportionally across Desktop/Tablet/Mobile rather than adapting per device.
 * Resize (drag-to-width) and rotate (drag-to-angle) follow the identical
 * preview-then-commit-once shape. Rotation and width are likewise single
 * scalars, not per-breakpoint.
 *
 * Elements also carry optional `locked`/`hidden` flags (flat, absent=false —
 * elements are already a flat field bag, unlike a section's `flags:{}`).
 * Locked blocks drag/resize/rotate and every content-mutating control
 * (contenteditable, href input, uploader, spacer cycle, layout columns) but
 * NOT move/z-order/delete or click-to-select — selection stays reachable on
 * purpose, since (unlike locked sections, which can still be reached via the
 * Layers tab) there is no separate list a locked element could otherwise be
 * recovered from. Hidden elements dim in edit mode and are filtered out of
 * the `elements` getter entirely in preview/live mode.
 */
import { LightningElement, api } from 'lwc';
import store from 'c/siteStateService';
import { sanitizeInlineHtml } from 'c/sectionRegistry';
import { sectionRootStyle, bpValue } from 'c/sectionCommon';

const SPACER_SIZES = ['S', 'M', 'L'];
const SPACER_HEIGHTS = { S: '1.5rem', M: '3rem', L: '5rem' };
const SNAP_PX = 8; // drag distance within which a position snaps to a guide
const WIDTH_MIN = 5;
const WIDTH_MAX = 100;
const ROTATE_SNAP_DEG = 15;
const ROTATE_SNAP_THRESHOLD_DEG = 5;

// A Freeform element's background is a plain colour or image (no theme roles/
// gradients like a section's background — this is a decorative box, not a
// themed shell), so it's composed directly rather than routed through
// sectionCommon's section-level backgroundCss(), which expects a fixed set of
// role strings ('primary'/'secondary'/...) a raw hex colour doesn't fit.
function elementBackgroundStyle(bg) {
    if (bg.type === 'color' && bg.color) {
        return `background:${bg.color};padding:0.5rem;border-radius:6px;`;
    }
    if (bg.type === 'image' && bg.imageUrl) {
        const url = String(bg.imageUrl).replace(/"/g, '\\"');
        return `background-image:url("${url}");background-size:cover;background-position:center;padding:0.5rem;border-radius:6px;`;
    }
    return '';
}

export default class SectionFreeform extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'default';
    @api layout = {};
    @api mode = 'live';

    // Local drag state — never written to the store until release.
    previewPositions = {};
    previewWidths = {};
    previewRotations = {};
    guideV = null; // canvas-% position of the vertical guide line, or null
    guideH = null;
    guideVType = null; // 'center' | 'element'
    guideHType = null;

    // Multi-selection of elements, local to this section (elements never span
    // sections). Drives the selected outline, group drag, and the
    // align/distribute bar.
    selectedElementIds = [];

    // Which single element's background popover is open, if any.
    bgOpenElementId = null;

    _dragElementId = null; // the grabbed element — the snap/guide leader
    _dragIds = []; // everything moving: the leader plus any co-selected elements
    _dragOrigins = {}; // id -> {x, y} at grab time
    _dragStartX = 0;
    _dragStartY = 0;
    _dragOriginX = 50;
    _dragOriginY = 50;
    _containerRect = null;

    // Resize drag state — single-element only (see class doc).
    _resizeElementId = null;
    _resizeOriginWidth = 40;
    _resizeStartX = 0;
    _resizeStartY = 0;
    _resizeRotationDeg = 0;
    _resizeContainerRect = null;

    // Rotate drag state — single-element only.
    _rotateElementId = null;
    _rotateCenter = null; // screen-px {x, y}, the item's own center
    _rotateOrigin = 0;
    _rotateStartAngle = 0;

    constructor() {
        super();
        this._onDragMove = this.onDragMove.bind(this);
        this._onDragEnd = this.onDragEnd.bind(this);
        this._onResizeMove = this.onResizeMove.bind(this);
        this._onResizeEnd = this.onResizeEnd.bind(this);
        this._onRotateMove = this.onRotateMove.bind(this);
        this._onRotateEnd = this.onRotateEnd.bind(this);
    }

    disconnectedCallback() {
        this._detachDrag();
        this._detachResize();
        this._detachRotate();
    }

    get isEdit() {
        return this.mode === 'edit';
    }

    get uploadSiteId() {
        return store.getRecordId();
    }

    get hasNoElements() {
        return !(this.content?.elements || []).length;
    }

    get rootClass() {
        const tone = bpValue(this.sectionStyle?.tone) || 'light';
        // Background and padding resolve per device in rootStyle below.
        const classes = ['ff', `ff_tone-${tone}`];
        if (this.isEdit) {
            classes.push('ff_edit');
        }
        return classes.join(' ');
    }
    get rootStyle() {
        return sectionRootStyle(this.sectionStyle, {
            imageUrl: this.content?.imageUrl,
            focal: this.content?.focal
        });
    }

    get elements() {
        const list = this.content?.elements || [];
        // Hidden elements stay visible (dimmed, badged) in edit mode so they can
        // be found and un-hidden; Preview/live drops them entirely — same rule
        // shipped for sections. isFirst/isLast are computed against whichever
        // list actually renders, matching what z-order buttons can reach.
        const visible = this.isEdit ? list : list.filter((e) => !e.hidden);
        return visible.map((el, index) => {
            const preview = this.previewPositions[el.elementId];
            const x = preview ? preview.x : el.x != null ? el.x : 50;
            const y = preview ? preview.y : el.y != null ? el.y : 50;
            const width = this.previewWidths[el.elementId] != null
                ? this.previewWidths[el.elementId]
                : el.width != null ? el.width : 40;
            const rotation = this.previewRotations[el.elementId] != null ? this.previewRotations[el.elementId] : el.rotation || 0;
            const locked = !!el.locked;
            const hidden = !!el.hidden;
            const canEditItem = this.isEdit && !locked;
            const bg = el.background || { type: 'none' };
            const bgStyle = elementBackgroundStyle(bg);
            const classes = ['ff__item'];
            if (this.selectedElementIds.includes(el.elementId)) {
                classes.push('ff__item_selected');
            }
            if (hidden) {
                classes.push('ff__item_hidden');
            }
            return {
                ...el,
                key: el.elementId,
                itemClass: classes.join(' '),
                isText: el.kind === 'text',
                isButton: el.kind === 'button',
                isImage: el.kind === 'image',
                isVideo: el.kind === 'video',
                videoEmbedUrl: el.videoEmbed?.embedUrl || '',
                isSpacer: el.kind === 'spacer',
                isLayout: el.kind === 'layout',
                isFirst: index === 0,
                isLast: index === visible.length - 1,
                itemStyle: `left:${x}%; top:${y}%; width:${width}%; --ff-rot:${rotation}deg;${bgStyle}`,
                spacerStyle: el.kind === 'spacer' ? `height:${SPACER_HEIGHTS[el.height] || SPACER_HEIGHTS.M}` : '',
                columnList: el.kind === 'layout' ? Array.from({ length: el.columns || 2 }, (_, i) => ({ key: i })) : [],
                locked,
                hidden,
                canEditItem,
                itemEditableAttr: canEditItem ? 'true' : 'false',
                showResizeHandle: canEditItem && el.kind !== 'spacer',
                lockClass: locked ? 'ff__btn ff__btn_on' : 'ff__btn',
                lockTitle: locked ? 'Unlock' : 'Lock',
                hideClass: hidden ? 'ff__btn ff__btn_on' : 'ff__btn',
                hideTitle: hidden ? 'Unhide' : 'Hide',
                bgClass: bg.type && bg.type !== 'none' ? 'ff__btn ff__btn_on' : 'ff__btn',
                isBgOpen: this.bgOpenElementId === el.elementId,
                bgIsNone: !bg.type || bg.type === 'none',
                bgIsColor: bg.type === 'color',
                bgIsImage: bg.type === 'image',
                bgColorValue: bg.color || '#ffffff',
                bgImageUrl: bg.imageUrl || ''
            };
        });
    }

    get showGuideV() {
        return this.guideV != null;
    }
    get showGuideH() {
        return this.guideH != null;
    }
    get guideVStyle() {
        return `left:${this.guideV}%`;
    }
    get guideHStyle() {
        return `top:${this.guideH}%`;
    }
    get guideVClass() {
        return this.guideVType === 'center' ? 'ff__guide ff__guide_v ff__guide_center' : 'ff__guide ff__guide_v ff__guide_element';
    }
    get guideHClass() {
        return this.guideHType === 'center' ? 'ff__guide ff__guide_h ff__guide_center' : 'ff__guide ff__guide_h ff__guide_element';
    }

    renderedCallback() {
        (this.content?.elements || []).forEach((el) => {
            if (el.kind === 'text') {
                this._syncManual(el.elementId, el.text);
            }
        });
    }

    _syncManual(elementId, value) {
        const el = this.template.querySelector(`[data-text-id="${elementId}"]`);
        if (!el || this.template.activeElement === el) {
            return;
        }
        const html = value || '';
        /* eslint-disable @lwc/lwc/no-inner-html -- lwc:dom="manual" rich-text sync;
           `value` only ever holds output of sanitizeInlineHtml */
        if (el.innerHTML !== html) {
            el.innerHTML = html;
        }
        /* eslint-enable @lwc/lwc/no-inner-html */
    }

    // Every mutator rebuilds the elements array and emits it as one patch, so
    // the store's existing updateSectionContent (content = {...content, ...patch})
    // handles freeform sections with no changes on its side.
    _patchElements(mutator) {
        const list = (this.content?.elements || []).map((e) => ({ ...e }));
        const next = mutator(list);
        this.dispatchEvent(new CustomEvent('contentchange', { detail: { patch: { elements: next } } }));
    }

    // ---- element multi-selection --------------------------------------------
    get selectedCount() {
        return this.selectedElementIds.length;
    }

    get showElementBar() {
        return this.isEdit && this.selectedCount >= 2;
    }

    // Distributing means spacing the boxes BETWEEN the two extremes — with
    // fewer than three there is nothing to space.
    get cannotDistribute() {
        return this.selectedCount < 3;
    }

    /**
     * Click on an element selects it; Ctrl/Cmd/Shift-click toggles it in the
     * multi-selection. Clicks that land on the element's working controls
     * (buttons, inputs, links, the uploader, editable text) are left alone —
     * selecting out from under an edit-in-progress would be hostile.
     */
    handleItemClick(event) {
        if (!this.isEdit) {
            return;
        }
        // Even an ignored click must not fall through to the canvas, where it
        // would read as "clicked empty space" and clear the selection.
        event.stopPropagation();
        const t = event.target;
        const interactive =
            t.isContentEditable || (t.closest && t.closest('button, input, a, c-image-uploader, c-video-uploader'));
        if (interactive) {
            return;
        }
        const { elementId } = event.currentTarget.dataset;
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
            const ids = [...this.selectedElementIds];
            const at = ids.indexOf(elementId);
            if (at === -1) {
                ids.push(elementId);
            } else {
                ids.splice(at, 1);
            }
            this.selectedElementIds = ids;
        } else {
            this.selectedElementIds = [elementId];
        }
        // Real DOM focus (script-only — tabindex="-1") so keydown events for
        // nudge/delete actually land somewhere; selection elsewhere in this
        // app is a pure state concept with no focus, but arrow-key nudging
        // needs a real event target to bind to.
        this._focusCanvas();
    }

    _focusCanvas() {
        const canvas = this.template.querySelector('.ff__canvas');
        if (canvas) {
            canvas.focus();
        }
    }

    handleCanvasClick() {
        if (this.isEdit && this.selectedElementIds.length) {
            this.selectedElementIds = [];
        }
    }

    /**
     * Arrow keys nudge the whole selection in lockstep (0.5% per press, 2%
     * with Shift); Delete/Backspace removes it. Bound directly on .ff__canvas
     * (a normal bubbling listener, not a window listener) so it only ever
     * fires while focus genuinely sits inside this canvas — clicking a normal
     * section elsewhere blurs it via the browser's own focus handling, so
     * there's no coordination needed with pageCanvas's separate section-level
     * keyboard handling. Guards out contenteditable/interactive targets so
     * editing text or a button/input never gets intercepted as a nudge.
     */
    handleCanvasKeydown(event) {
        if (!this.isEdit || !this.selectedElementIds.length) {
            return;
        }
        const t = event.target;
        if (t.isContentEditable || (t.closest && t.closest('button, input, a, c-image-uploader, c-video-uploader'))) {
            return;
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            this.handleElementsDelete();
            return;
        }
        const deltas = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        const delta = deltas[event.key];
        if (!delta) {
            return;
        }
        event.preventDefault();
        const step = event.shiftKey ? 2 : 0.5;
        const [dx, dy] = delta;
        const ids = this.selectedElementIds;
        this._patchElements((list) =>
            list.map((e) => {
                if (!ids.includes(e.elementId)) {
                    return e;
                }
                const x = Math.min(Math.max((e.x != null ? e.x : 50) + dx * step, 0), 100);
                const y = Math.min(Math.max((e.y != null ? e.y : 50) + dy * step, 0), 100);
                return { ...e, x, y };
            })
        );
    }

    // The bar floats inside the canvas; without this, clicking Align would
    // bubble to the canvas and read as "clicked empty space → clear selection".
    handleBarClick(event) {
        event.stopPropagation();
    }

    handleElementsClear() {
        this.selectedElementIds = [];
    }

    handleElementsDelete() {
        const doomed = new Set(this.selectedElementIds);
        this.selectedElementIds = [];
        this._patchElements((list) => list.filter((e) => !doomed.has(e.elementId)));
    }

    // ---- per-element lock / hide --------------------------------------------
    handleToggleElementLocked(event) {
        const { elementId } = event.currentTarget.dataset;
        this._patchElements((list) =>
            list.map((e) => (e.elementId === elementId ? { ...e, locked: !e.locked } : e))
        );
    }

    handleToggleElementHidden(event) {
        const { elementId } = event.currentTarget.dataset;
        this._patchElements((list) =>
            list.map((e) => (e.elementId === elementId ? { ...e, hidden: !e.hidden } : e))
        );
    }

    // True only if EVERY selected element already has the flag — the bulk
    // button then sets the whole selection to the opposite, same convention
    // as most design tools use for a mixed-state bulk toggle.
    get selectedAllLocked() {
        const ids = this.selectedElementIds;
        if (!ids.length) {
            return false;
        }
        const list = this.content?.elements || [];
        return ids.every((id) => list.find((e) => e.elementId === id)?.locked);
    }

    get selectedAllHidden() {
        const ids = this.selectedElementIds;
        if (!ids.length) {
            return false;
        }
        const list = this.content?.elements || [];
        return ids.every((id) => list.find((e) => e.elementId === id)?.hidden);
    }

    get bulkLockClass() {
        return this.selectedAllLocked ? 'ff__mbtn ff__mbtn_on' : 'ff__mbtn';
    }

    get bulkHideClass() {
        return this.selectedAllHidden ? 'ff__mbtn ff__mbtn_on' : 'ff__mbtn';
    }

    handleElementsToggleLock() {
        const ids = new Set(this.selectedElementIds);
        const next = !this.selectedAllLocked;
        this._patchElements((list) => list.map((e) => (ids.has(e.elementId) ? { ...e, locked: next } : e)));
    }

    handleElementsToggleHide() {
        const ids = new Set(this.selectedElementIds);
        const next = !this.selectedAllHidden;
        this._patchElements((list) => list.map((e) => (ids.has(e.elementId) ? { ...e, hidden: next } : e)));
    }

    // ---- align / distribute --------------------------------------------------
    // Positions are stored as center-% but alignment works on EDGES, and element
    // heights are content-driven (never stored), so both operations measure the
    // rendered boxes and convert back to canvas percentages.

    /** Measured canvas rect plus a rect per selected element that still exists. */
    _measureSelection() {
        const canvas = this.template.querySelector('.ff__canvas');
        if (!canvas) {
            return null;
        }
        const cRect = canvas.getBoundingClientRect();
        const rects = {};
        this.selectedElementIds.forEach((id) => {
            const item = this.template.querySelector(`.ff__item[data-element-id="${id}"]`);
            if (item) {
                rects[id] = item.getBoundingClientRect();
            }
        });
        return { cRect, rects };
    }

    _applyPositions(patchById) {
        this._patchElements((list) =>
            list.map((e) => (patchById[e.elementId] ? { ...e, ...patchById[e.elementId] } : e))
        );
    }

    handleElementsAlign(event) {
        const dir = event.currentTarget.dataset.align; // left|center|right|top|middle|bottom
        const measured = this._measureSelection();
        const ids = measured ? Object.keys(measured.rects) : [];
        if (ids.length < 2) {
            return;
        }
        const { cRect, rects } = measured;
        const toPctX = (px) => Math.min(Math.max(((px - cRect.left) / cRect.width) * 100, 0), 100);
        const toPctY = (px) => Math.min(Math.max(((px - cRect.top) / cRect.height) * 100, 0), 100);
        const minLeft = Math.min(...ids.map((id) => rects[id].left));
        const maxRight = Math.max(...ids.map((id) => rects[id].right));
        const minTop = Math.min(...ids.map((id) => rects[id].top));
        const maxBottom = Math.max(...ids.map((id) => rects[id].bottom));

        const patch = {};
        ids.forEach((id) => {
            const r = rects[id];
            if (dir === 'left') {
                patch[id] = { x: toPctX(minLeft + r.width / 2) };
            } else if (dir === 'right') {
                patch[id] = { x: toPctX(maxRight - r.width / 2) };
            } else if (dir === 'center') {
                patch[id] = { x: toPctX((minLeft + maxRight) / 2) };
            } else if (dir === 'top') {
                patch[id] = { y: toPctY(minTop + r.height / 2) };
            } else if (dir === 'bottom') {
                patch[id] = { y: toPctY(maxBottom - r.height / 2) };
            } else if (dir === 'middle') {
                patch[id] = { y: toPctY((minTop + maxBottom) / 2) };
            }
        });
        this._applyPositions(patch);
    }

    handleElementsDistribute(event) {
        const axis = event.currentTarget.dataset.axis; // 'h' | 'v'
        const measured = this._measureSelection();
        const ids = measured ? Object.keys(measured.rects) : [];
        if (ids.length < 3) {
            return;
        }
        const { cRect, rects } = measured;
        const horizontal = axis === 'h';
        const start = (r) => (horizontal ? r.left : r.top);
        const size = (r) => (horizontal ? r.width : r.height);

        const sorted = [...ids].sort((a, b) => start(rects[a]) + size(rects[a]) / 2 - (start(rects[b]) + size(rects[b]) / 2));
        const first = rects[sorted[0]];
        const last = rects[sorted[sorted.length - 1]];
        const span = start(last) + size(last) - start(first);
        const sum = sorted.reduce((acc, id) => acc + size(rects[id]), 0);
        const gap = (span - sum) / (sorted.length - 1);

        const patch = {};
        let cursor = start(first);
        sorted.forEach((id) => {
            const centerPx = cursor + size(rects[id]) / 2;
            const pct = horizontal
                ? Math.min(Math.max(((centerPx - cRect.left) / cRect.width) * 100, 0), 100)
                : Math.min(Math.max(((centerPx - cRect.top) / cRect.height) * 100, 0), 100);
            patch[id] = horizontal ? { x: pct } : { y: pct };
            cursor += size(rects[id]) + gap;
        });
        this._applyPositions(patch);
    }

    // ---- drag to reposition ------------------------------------------------
    handleDragStart(event) {
        event.preventDefault();
        const { elementId } = event.currentTarget.dataset;
        const el = (this.content?.elements || []).find((e) => e.elementId === elementId);
        const container = this.template.querySelector('.ff__canvas');
        if (!el || el.locked || !container) {
            return;
        }
        this._containerRect = container.getBoundingClientRect();
        this._dragElementId = elementId;
        this._dragStartX = event.clientX;
        this._dragStartY = event.clientY;
        this._dragOriginX = el.x != null ? el.x : 50;
        this._dragOriginY = el.y != null ? el.y : 50;

        // Grabbing a member of the multi-selection moves the whole group in
        // lockstep; grabbing anything else collapses the selection to it.
        const list = this.content?.elements || [];
        if (this.selectedElementIds.includes(elementId) && this.selectedElementIds.length > 1) {
            this._dragIds = this.selectedElementIds.filter((id) => list.some((e) => e.elementId === id));
        } else {
            this._dragIds = [elementId];
            this.selectedElementIds = [elementId];
        }
        this._dragOrigins = {};
        const preview = { ...this.previewPositions };
        this._dragIds.forEach((id) => {
            const node = list.find((e) => e.elementId === id);
            this._dragOrigins[id] = { x: node.x != null ? node.x : 50, y: node.y != null ? node.y : 50 };
            preview[id] = { ...this._dragOrigins[id] };
        });
        this.previewPositions = preview;
        window.addEventListener('pointermove', this._onDragMove);
        window.addEventListener('pointerup', this._onDragEnd);
    }

    onDragMove(event) {
        if (!this._dragElementId || !this._containerRect) {
            return;
        }
        const deltaXPct = ((event.clientX - this._dragStartX) / this._containerRect.width) * 100;
        const deltaYPct = ((event.clientY - this._dragStartY) / this._containerRect.height) * 100;
        let x = this._dragOriginX + deltaXPct;
        let y = this._dragOriginY + deltaYPct;

        const thresholdX = (SNAP_PX / this._containerRect.width) * 100;
        const thresholdY = (SNAP_PX / this._containerRect.height) * 100;
        // The grabbed element is the snap leader; co-dragged elements neither
        // snap themselves nor act as snap candidates (they're moving too).
        const others = (this.content?.elements || []).filter((e) => !this._dragIds.includes(e.elementId));

        const [snappedX, guideV, guideVType] = this._snap(x, this._xCandidates(others), thresholdX);
        const [snappedY, guideH, guideHType] = this._snap(y, this._yCandidates(others), thresholdY);

        x = Math.min(Math.max(snappedX, 0), 100);
        y = Math.min(Math.max(snappedY, 0), 100);

        // Whatever the leader actually moved (post-snap, post-clamp) is the
        // delta the rest of the group follows, so lockstep survives snapping.
        const dx = x - this._dragOriginX;
        const dy = y - this._dragOriginY;
        const preview = { ...this.previewPositions };
        this._dragIds.forEach((id) => {
            const origin = this._dragOrigins[id];
            preview[id] = {
                x: Math.min(Math.max(origin.x + dx, 0), 100),
                y: Math.min(Math.max(origin.y + dy, 0), 100)
            };
        });
        this.previewPositions = preview;
        this.guideV = guideV;
        this.guideH = guideH;
        this.guideVType = guideVType;
        this.guideHType = guideHType;
    }

    /**
     * Snaps `value` (the dragged element's CENTER on one axis) to the nearest
     * candidate within `threshold`. Each candidate is {value, guide, type}:
     * `value` is what the dragged center moves to, `guide` is where the guide
     * LINE renders — the same number for a center-to-center snap, but
     * different for an edge-to-edge snap, where the line belongs at the
     * actual shared edge, not at the dragged element's new (offset) center.
     * Candidates are checked in order and the first match wins, so callers
     * put canvas-center first to preserve its original tie-break priority.
     */
    _snap(value, candidates, threshold) {
        for (const c of candidates) {
            if (Math.abs(value - c.value) <= threshold) {
                return [c.value, c.guide, c.type];
            }
        }
        return [value, null, null];
    }

    // X candidates: canvas center, other elements' centers, other elements'
    // left/right edges (computable from stored `width`), and the canvas's own
    // left/right edges. Edge candidates are expressed as the dragged leader's
    // equivalent CENTER position for that edge to land flush.
    _xCandidates(others) {
        const leader = (this.content?.elements || []).find((e) => e.elementId === this._dragElementId);
        const halfW = (leader?.width != null ? leader.width : 40) / 2;
        const candidates = [{ value: 50, guide: 50, type: 'center' }];
        others.forEach((e) => {
            const ex = e.x != null ? e.x : 50;
            const ew = e.width != null ? e.width : 40;
            const left = ex - ew / 2;
            const right = ex + ew / 2;
            candidates.push(
                { value: ex, guide: ex, type: 'element' },
                { value: left + halfW, guide: left, type: 'element' },
                { value: right + halfW, guide: right, type: 'element' },
                { value: left - halfW, guide: left, type: 'element' },
                { value: right - halfW, guide: right, type: 'element' }
            );
        });
        candidates.push({ value: halfW, guide: 0, type: 'element' }, { value: 100 - halfW, guide: 100, type: 'element' });
        return candidates;
    }

    // Y candidates: canvas center, other elements' centers, and the canvas's
    // own top/bottom (as plain center-to-edge, not flush — height is
    // intrinsic/content-driven and never stored, so a true flush top/bottom
    // edge snap isn't computable here; deliberately out of scope, see plan).
    _yCandidates(others) {
        const candidates = [{ value: 50, guide: 50, type: 'center' }];
        others.forEach((e) => {
            const ey = e.y != null ? e.y : 50;
            candidates.push({ value: ey, guide: ey, type: 'element' });
        });
        candidates.push({ value: 0, guide: 0, type: 'element' }, { value: 100, guide: 100, type: 'element' });
        return candidates;
    }

    onDragEnd() {
        const dragIds = this._dragIds;
        const finals = {};
        dragIds.forEach((id) => {
            if (this.previewPositions[id]) {
                finals[id] = this.previewPositions[id];
            }
        });
        this._detachDrag();
        this._dragElementId = null;
        this._dragIds = [];
        this._dragOrigins = {};
        this._containerRect = null;
        this.guideV = null;
        this.guideH = null;
        this.guideVType = null;
        this.guideHType = null;
        if (dragIds.length) {
            const preview = { ...this.previewPositions };
            dragIds.forEach((id) => delete preview[id]);
            this.previewPositions = preview;
        }
        if (Object.keys(finals).length) {
            // One patch for the whole group = one undo step for the whole drag.
            this._patchElements((list) =>
                list.map((e) => (finals[e.elementId] ? { ...e, x: finals[e.elementId].x, y: finals[e.elementId].y } : e))
            );
        }
    }

    _detachDrag() {
        window.removeEventListener('pointermove', this._onDragMove);
        window.removeEventListener('pointerup', this._onDragEnd);
    }

    // ---- drag to resize -----------------------------------------------------
    // Same "preview locally, commit once on release" shape as position drag.
    // Single-element only — resize/rotate aren't part of the multi-select
    // group operations align/distribute already cover.
    handleResizeStart(event) {
        event.preventDefault();
        event.stopPropagation();
        const { elementId } = event.currentTarget.dataset;
        const el = (this.content?.elements || []).find((e) => e.elementId === elementId);
        const container = this.template.querySelector('.ff__canvas');
        if (!el || el.locked || !container) {
            return;
        }
        this._resizeContainerRect = container.getBoundingClientRect();
        this._resizeElementId = elementId;
        this._resizeStartX = event.clientX;
        this._resizeStartY = event.clientY;
        this._resizeOriginWidth = el.width != null ? el.width : 40;
        this._resizeRotationDeg =
            this.previewRotations[elementId] != null ? this.previewRotations[elementId] : el.rotation || 0;
        this.selectedElementIds = [elementId];
        window.addEventListener('pointermove', this._onResizeMove);
        window.addEventListener('pointerup', this._onResizeEnd);
    }

    // The item is center-anchored, so growing the right edge by deltaXPct
    // grows the whole box symmetrically around its stored center — the width
    // change is twice the edge delta. The raw screen-space drag delta is
    // rotated by -rotation first, so dragging along the handle's own visual
    // direction resizes correctly even when the element is rotated (the local
    // width axis no longer lines up with the canvas's raw X axis once rotated).
    onResizeMove(event) {
        if (!this._resizeElementId || !this._resizeContainerRect) {
            return;
        }
        const dxPx = event.clientX - this._resizeStartX;
        const dyPx = event.clientY - this._resizeStartY;
        const theta = (this._resizeRotationDeg * Math.PI) / 180;
        const localDxPx = dxPx * Math.cos(theta) + dyPx * Math.sin(theta);
        const deltaXPct = (localDxPx / this._resizeContainerRect.width) * 100;
        const width = Math.min(Math.max(this._resizeOriginWidth + deltaXPct * 2, WIDTH_MIN), WIDTH_MAX);
        this.previewWidths = { ...this.previewWidths, [this._resizeElementId]: width };
    }

    onResizeEnd() {
        const elementId = this._resizeElementId;
        const width = this.previewWidths[elementId];
        this._detachResize();
        this._resizeElementId = null;
        this._resizeContainerRect = null;
        if (elementId && width != null) {
            const preview = { ...this.previewWidths };
            delete preview[elementId];
            this.previewWidths = preview;
            this._patchElements((list) =>
                list.map((e) => (e.elementId === elementId ? { ...e, width } : e))
            );
        }
    }

    _detachResize() {
        window.removeEventListener('pointermove', this._onResizeMove);
        window.removeEventListener('pointerup', this._onResizeEnd);
    }

    // ---- drag to rotate -------------------------------------------------------
    handleRotateStart(event) {
        event.preventDefault();
        event.stopPropagation();
        const { elementId } = event.currentTarget.dataset;
        const el = (this.content?.elements || []).find((e) => e.elementId === elementId);
        const item = this.template.querySelector(`.ff__item[data-element-id="${elementId}"]`);
        if (!el || el.locked || !item) {
            return;
        }
        const rect = item.getBoundingClientRect();
        this._rotateCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        this._rotateElementId = elementId;
        this._rotateOrigin = el.rotation || 0;
        this._rotateStartAngle = this._angleFromCenter(event.clientX, event.clientY);
        this.selectedElementIds = [elementId];
        window.addEventListener('pointermove', this._onRotateMove);
        window.addEventListener('pointerup', this._onRotateEnd);
    }

    _angleFromCenter(px, py) {
        return (Math.atan2(py - this._rotateCenter.y, px - this._rotateCenter.x) * 180) / Math.PI;
    }

    // Deliberately unbounded during the live preview — normalizing to a
    // -180..180 range here would make a smooth rotation past that boundary
    // visually snap backward mid-drag. Normalization happens once, on release.
    onRotateMove(event) {
        if (!this._rotateElementId || !this._rotateCenter) {
            return;
        }
        const current = this._angleFromCenter(event.clientX, event.clientY);
        const raw = this._rotateOrigin + (current - this._rotateStartAngle);
        const snapped = Math.round(raw / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
        const rotation = Math.abs(raw - snapped) <= ROTATE_SNAP_THRESHOLD_DEG ? snapped : raw;
        this.previewRotations = { ...this.previewRotations, [this._rotateElementId]: rotation };
    }

    onRotateEnd() {
        const elementId = this._rotateElementId;
        const raw = this.previewRotations[elementId];
        this._detachRotate();
        this._rotateElementId = null;
        this._rotateCenter = null;
        if (elementId && raw != null) {
            const rotation = ((raw + 180) % 360 + 360) % 360 - 180;
            const preview = { ...this.previewRotations };
            delete preview[elementId];
            this.previewRotations = preview;
            this._patchElements((list) =>
                list.map((e) => (e.elementId === elementId ? { ...e, rotation } : e))
            );
        }
    }

    _detachRotate() {
        window.removeEventListener('pointermove', this._onRotateMove);
        window.removeEventListener('pointerup', this._onRotateEnd);
    }

    // ---- element edits ------------------------------------------------------
    handleTextBlur(event) {
        const { elementId } = event.currentTarget.dataset;
        // eslint-disable-next-line @lwc/lwc/no-inner-html -- read-only; sanitized on the same line
        const value = sanitizeInlineHtml(event.target.innerHTML);
        this._patchElements((list) => list.map((e) => (e.elementId === elementId ? { ...e, text: value } : e)));
    }

    handleButtonLabelBlur(event) {
        const { elementId } = event.currentTarget.dataset;
        const value = (event.target.textContent || '').trim();
        this._patchElements((list) => list.map((e) => (e.elementId === elementId ? { ...e, label: value } : e)));
    }

    handleButtonHrefChange(event) {
        const { elementId } = event.currentTarget.dataset;
        const value = event.target.value;
        this._patchElements((list) => list.map((e) => (e.elementId === elementId ? { ...e, href: value } : e)));
    }

    handleImageUploaded(event) {
        const { elementId } = event.currentTarget.dataset;
        const { assetId, url } = event.detail;
        store.touchRecentAsset(assetId);
        this._patchElements((list) =>
            list.map((e) => (e.elementId === elementId ? { ...e, imageAssetId: assetId, imageUrl: url } : e))
        );
    }

    handleImageRemove(event) {
        const { elementId } = event.currentTarget.dataset;
        this._patchElements((list) =>
            list.map((e) => (e.elementId === elementId ? { ...e, imageAssetId: null, imageUrl: '' } : e))
        );
    }

    // ---- per-element background (colour or image) ---------------------------
    handleToggleBgPicker(event) {
        event.stopPropagation();
        const { elementId } = event.currentTarget.dataset;
        this.bgOpenElementId = this.bgOpenElementId === elementId ? null : elementId;
    }

    handleBgTypeChange(event) {
        const { elementId, type } = event.currentTarget.dataset;
        this._patchElements((list) =>
            list.map((e) => (e.elementId === elementId ? { ...e, background: { ...e.background, type } } : e))
        );
    }

    handleBgColorChange(event) {
        const { elementId } = event.currentTarget.dataset;
        const color = event.target.value;
        this._patchElements((list) =>
            list.map((e) =>
                e.elementId === elementId ? { ...e, background: { ...e.background, type: 'color', color } } : e
            )
        );
    }

    handleBgImageUploaded(event) {
        const { elementId } = event.currentTarget.dataset;
        const { assetId, url } = event.detail;
        store.touchRecentAsset(assetId);
        this._patchElements((list) =>
            list.map((e) =>
                e.elementId === elementId
                    ? { ...e, background: { ...e.background, type: 'image', imageAssetId: assetId, imageUrl: url } }
                    : e
            )
        );
    }

    handleBgImageRemove(event) {
        const { elementId } = event.currentTarget.dataset;
        this._patchElements((list) =>
            list.map((e) =>
                e.elementId === elementId
                    ? { ...e, background: { ...e.background, imageAssetId: null, imageUrl: '' } }
                    : e
            )
        );
    }

    // A file upload/library pick and a pasted embed link are mutually
    // exclusive on the element, same convention as a hero's bgVideo* fields —
    // setting one always clears the other.
    handleVideoUploaded(event) {
        const { elementId } = event.currentTarget.dataset;
        const { assetId, url } = event.detail;
        store.touchRecentAsset(assetId);
        this._patchElements((list) =>
            list.map((e) => (e.elementId === elementId ? { ...e, videoAssetId: assetId, videoUrl: url, videoEmbed: null } : e))
        );
    }

    handleVideoEmbedSet(event) {
        const { elementId } = event.currentTarget.dataset;
        const { provider, embedUrl } = event.detail;
        this._patchElements((list) =>
            list.map((e) =>
                e.elementId === elementId ? { ...e, videoEmbed: { provider, embedUrl }, videoAssetId: null, videoUrl: '' } : e
            )
        );
    }

    handleVideoRemove(event) {
        const { elementId } = event.currentTarget.dataset;
        this._patchElements((list) =>
            list.map((e) => (e.elementId === elementId ? { ...e, videoAssetId: null, videoUrl: '', videoEmbed: null } : e))
        );
    }

    handleSpacerCycle(event) {
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
            return; // a modifier click is a selection gesture, not a resize
        }
        const { elementId } = event.currentTarget.dataset;
        const el = (this.content?.elements || []).find((e) => e.elementId === elementId);
        if (el?.locked) {
            return;
        }
        this._patchElements((list) =>
            list.map((e) => {
                if (e.elementId !== elementId) {
                    return e;
                }
                const next = SPACER_SIZES[(SPACER_SIZES.indexOf(e.height) + 1) % SPACER_SIZES.length];
                return { ...e, height: next };
            })
        );
    }

    handleLayoutAddColumn(event) {
        const { elementId } = event.currentTarget.dataset;
        const el = (this.content?.elements || []).find((e) => e.elementId === elementId);
        if (el?.locked) {
            return;
        }
        this._patchElements((list) =>
            list.map((e) => (e.elementId === elementId ? { ...e, columns: Math.min((e.columns || 2) + 1, 4) } : e))
        );
    }

    handleLayoutRemoveColumn(event) {
        const { elementId } = event.currentTarget.dataset;
        const el = (this.content?.elements || []).find((e) => e.elementId === elementId);
        if (el?.locked) {
            return;
        }
        this._patchElements((list) =>
            list.map((e) => (e.elementId === elementId ? { ...e, columns: Math.max((e.columns || 2) - 1, 1) } : e))
        );
    }

    handleMoveUp(event) {
        this._move(event.currentTarget.dataset.elementId, -1);
    }

    handleMoveDown(event) {
        this._move(event.currentTarget.dataset.elementId, 1);
    }

    _move(elementId, direction) {
        this._patchElements((list) => {
            const i = list.findIndex((e) => e.elementId === elementId);
            const target = i + direction;
            if (i === -1 || target < 0 || target >= list.length) {
                return list;
            }
            const [moved] = list.splice(i, 1);
            list.splice(target, 0, moved);
            return list;
        });
    }

    handleBringToFront(event) {
        this._moveToEnd(event.currentTarget.dataset.elementId);
    }

    handleSendToBack(event) {
        this._moveToStart(event.currentTarget.dataset.elementId);
    }

    _moveToEnd(elementId) {
        this._patchElements((list) => {
            const i = list.findIndex((e) => e.elementId === elementId);
            if (i === -1 || i === list.length - 1) {
                return list;
            }
            const [moved] = list.splice(i, 1);
            list.push(moved);
            return list;
        });
    }

    _moveToStart(elementId) {
        this._patchElements((list) => {
            const i = list.findIndex((e) => e.elementId === elementId);
            if (i <= 0) {
                return list;
            }
            const [moved] = list.splice(i, 1);
            list.unshift(moved);
            return list;
        });
    }

    handleDelete(event) {
        const { elementId } = event.currentTarget.dataset;
        this._patchElements((list) => list.filter((e) => e.elementId !== elementId));
    }

    handleKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        }
    }
}