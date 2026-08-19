/**
 * freeCanvas — the page as one continuous free canvas.
 *
 * Replaces the stacked pageCanvas: blocks are absolutely positioned at stored
 * pixel coordinates (per breakpoint — see c/blockModel) and this component owns
 * every bit of the interaction maths: move, resize from any of eight handles,
 * rotate, marquee select, alignment snapping, and keyboard nudge/delete.
 *
 * ---- why all the geometry lives here ---------------------------------------
 * blockFrame announces "the pointer went down on me, doing X" and stops. All
 * arithmetic happens in one place because a multi-select drag has to move
 * several blocks against ONE snap solution, and because the canvas is CSS-
 * scaled (zoom, and fitting a 1440px canvas into a narrower stage) — so every
 * screen-space delta must be divided by that scale before it means anything in
 * stored coordinates. Doing that per-block would be the same bug written N
 * times.
 *
 * ---- why a gesture doesn't touch the store until it ends --------------------
 * Live geometry is held in `liveFrames` and only committed on pointerup. The
 * store pushes an undo entry (and clones the entire SiteConfig) on every write,
 * so writing per pointermove would put dozens of entries on the history stack
 * per drag and re-clone the document every frame. One gesture = one undo step.
 */
import { LightningElement, api, track } from "lwc";
import store from "c/siteStateService";
import {
  CANVAS_WIDTH,
  CANVAS_TAIL,
  blocksInPaintOrder,
  frameFor,
  clampFrame,
  MIN_SIZE
} from "c/blockModel";

// Pointer travel (screen px) before a press becomes a drag. Below this a
// press-and-release is just a click, so selecting never nudges a block.
const DRAG_THRESHOLD = 4;
// How close (canvas px) two edges must be to snap together.
const SNAP_TOLERANCE = 6;
const NUDGE = 1;
const NUDGE_LARGE = 10;

export default class FreeCanvas extends LightningElement {
  @api page;
  @api mode = "edit";
  @api breakpoint = "desktop";
  @api selectedBlockIds = [];
  @api globals;
  @api navMenu;
  @api siteId;

  // Geometry for blocks under an active gesture, in canvas px. Rendered in
  // preference to the stored frame, then flushed to the store on release.
  @track liveFrames = {};
  // Real rendered heights of auto-height blocks. Deliberately NOT persisted:
  // the height is a consequence of the content, so storing it would both
  // pollute undo and fight the next re-measure.
  @track measured = {};

  guides = [];
  marquee = null;

  // How much the 1440/768/375 canvas is shrunk to fit the available stage.
  // 1 = rendering at true size. Purely presentational: every stored coordinate
  // stays in canvas px, and _scale() re-derives this from the live rect so the
  // pointer maths never has to know about it.
  fitScale = 1;

  _drag = null; // active gesture, or null
  _pending = null; // pointer down but threshold not yet crossed
  _resizeObserver = null;

  constructor() {
    super();
    this._onMove = this.onPointerMove.bind(this);
    this._onUp = this.onPointerUp.bind(this);
    this._onKey = this.onKeyDown.bind(this);
  }

  connectedCallback() {
    window.addEventListener("keydown", this._onKey);
  }

  renderedCallback() {
    if (this._resizeObserver) {
      return;
    }
    const stage = this.template.querySelector(".fc");
    if (!stage || typeof ResizeObserver === "undefined") {
      return;
    }
    // Watch the stage rather than the window: the right-hand panel and the
    // page rail collapse independently of any window resize, and both change
    // how much room the canvas actually has.
    this._resizeObserver = new ResizeObserver(() => this._recomputeFit());
    this._resizeObserver.observe(stage);
    this._recomputeFit();
  }

  disconnectedCallback() {
    this._teardown();
    window.removeEventListener("keydown", this._onKey);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  _recomputeFit() {
    const stage = this.template.querySelector(".fc");
    if (!stage) {
      return;
    }
    const available = stage.clientWidth;
    if (!available) {
      return;
    }
    // Only ever shrink. Blowing a 375px mobile canvas up to fill a wide stage
    // would misrepresent how the page actually looks on a phone.
    const next = Math.min(1, available / this.canvasWidth);
    if (Math.abs(next - this.fitScale) > 0.005) {
      this.fitScale = next;
    }
  }

  // ---- derived view state -------------------------------------------------
  get isEdit() {
    return this.mode === "edit";
  }

  get blocks() {
    return (this.page && this.page.blocks) || [];
  }

  get pageId() {
    return this.page && this.page.pageId;
  }

  get canvasWidth() {
    return CANVAS_WIDTH[this.breakpoint] || CANVAS_WIDTH.desktop;
  }

  /** Canvas height in canvas px: the lowest block's bottom, plus drop room. */
  get canvasHeightPx() {
    const lowest = this.blocks.reduce((max, b) => {
      const f = this._resolvedFrame(b);
      return Math.max(max, (f.y || 0) + (f.h || 0));
    }, 0);
    return Math.max(lowest + CANVAS_TAIL, 800);
  }

  get canvasStyle() {
    // Rendered at true authoring size and then scaled. transform-origin is
    // top-left so the scaled visual lines up with the sizing wrapper's box
    // (a centred origin would leave the two offset from each other).
    return [
      `width:${this.canvasWidth}px`,
      `height:${this.canvasHeightPx}px`,
      `transform:scale(${this.fitScale})`,
      "transform-origin:top left"
    ].join(";");
  }

  /** The scaled footprint, so surrounding layout and scrolling stay correct. */
  get fitStyle() {
    return [
      `width:${Math.round(this.canvasWidth * this.fitScale)}px`,
      `height:${Math.round(this.canvasHeightPx * this.fitScale)}px`
    ].join(";");
  }

  get hasBlocks() {
    return this.blocks.length > 0;
  }

  get showEmptyState() {
    return this.isEdit && !this.hasBlocks;
  }

  /**
   * The frame to draw a block at: its live gesture frame if one is in flight,
   * otherwise its stored frame, with a measured height substituted for
   * auto-height blocks so snapping and canvas growth see the real box.
   */
  _resolvedFrame(block) {
    const live = this.liveFrames[block.blockId];
    const base = live || frameFor(block, this.breakpoint);
    if (block.autoHeight && this.measured[block.blockId]) {
      return { ...base, h: this.measured[block.blockId] };
    }
    return base;
  }

  /** Blocks in paint order with their resolved frame and selection state. */
  get renderBlocks() {
    const selected = new Set(this.selectedBlockIds || []);
    return blocksInPaintOrder(this.blocks, this.breakpoint).map(
      ({ block }) => ({
        key: block.blockId,
        block,
        frame: this._resolvedFrame(block),
        selected: selected.has(block.blockId)
      })
    );
  }

  get guideLines() {
    return this.guides.map((g, i) => ({
      key: `${g.axis}-${g.at}-${i}`,
      style:
        g.axis === "x"
          ? `left:${g.at}px;top:0;width:1px;height:100%`
          : `top:${g.at}px;left:0;height:1px;width:100%`
    }));
  }

  get marqueeStyle() {
    if (!this.marquee) {
      return "display:none";
    }
    const { x, y, w, h } = this.marquee;
    return `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  }

  // ---- coordinate conversion ---------------------------------------------
  /**
   * Screen pixels → canvas pixels. The canvas renders at its authoring width
   * and is then CSS-scaled to fit the stage (and by the zoom control), so this
   * ratio is the only honest way to turn a mouse delta into a coordinate delta.
   * Recomputed per gesture rather than cached, since zoom can change between them.
   */
  _scale() {
    const el = this.template.querySelector(".fc__canvas");
    if (!el) {
      return 1;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 ? rect.width / this.canvasWidth : 1;
  }

  _canvasPoint(clientX, clientY) {
    const el = this.template.querySelector(".fc__canvas");
    if (!el) {
      return { x: 0, y: 0 };
    }
    const rect = el.getBoundingClientRect();
    const scale = rect.width > 0 ? rect.width / this.canvasWidth : 1;
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale
    };
  }

  // ---- gesture start ------------------------------------------------------
  handleBlockGrab(event) {
    if (!this.isEdit) {
      return;
    }
    const { blockId, action, anchor, x, y, additive } = event.detail;

    // Selection resolves on pointer DOWN so a drag can begin immediately, but
    // an additive click toggles rather than replaces.
    if (action === "move") {
      if (additive) {
        this._emitSelect(blockId, true);
      } else if (!(this.selectedBlockIds || []).includes(blockId)) {
        this._emitSelect(blockId, false);
      }
    } else {
      this._emitSelect(blockId, false);
    }

    const ids =
      action === "move" && (this.selectedBlockIds || []).includes(blockId)
        ? [...this.selectedBlockIds]
        : [blockId];

    this._pending = {
      action,
      anchor,
      blockId,
      ids,
      startX: x,
      startY: y,
      origin: this._framesFor(ids)
    };
    this._arm();
  }

  _framesFor(ids) {
    const map = {};
    ids.forEach((id) => {
      const block = this.blocks.find((b) => b.blockId === id);
      if (block) {
        map[id] = { ...this._resolvedFrame(block) };
      }
    });
    return map;
  }

  _arm() {
    window.addEventListener("pointermove", this._onMove, true);
    window.addEventListener("pointerup", this._onUp, true);
  }

  _teardown() {
    window.removeEventListener("pointermove", this._onMove, true);
    window.removeEventListener("pointerup", this._onUp, true);
    this._pending = null;
    this._drag = null;
    this.guides = [];
    this.marquee = null;
    this.liveFrames = {};
  }

  // ---- marquee (drag on empty canvas) -------------------------------------
  handleCanvasDown(event) {
    if (!this.isEdit || event.button !== 0) {
      return;
    }
    this._pending = {
      action: "marquee",
      startX: event.clientX,
      startY: event.clientY,
      originPoint: this._canvasPoint(event.clientX, event.clientY)
    };
    this._arm();
    if (!(event.shiftKey || event.metaKey || event.ctrlKey)) {
      this._emitSelect(null, false);
    }
  }

  // ---- gesture move -------------------------------------------------------
  onPointerMove(event) {
    const pending = this._pending;
    if (pending && !this._drag) {
      const travelled = Math.hypot(
        event.clientX - pending.startX,
        event.clientY - pending.startY
      );
      if (travelled < DRAG_THRESHOLD) {
        return;
      }
      this._drag = pending;
    }
    if (!this._drag) {
      return;
    }
    event.preventDefault();

    const scale = this._scale();
    const dx = (event.clientX - this._drag.startX) / scale;
    const dy = (event.clientY - this._drag.startY) / scale;

    switch (this._drag.action) {
      case "marquee":
        this._updateMarquee(event);
        break;
      case "move":
        this._applyMove(dx, dy, event.shiftKey);
        break;
      case "resize":
        this._applyResize(dx, dy, event.shiftKey);
        break;
      case "rotate":
        this._applyRotate(event);
        break;
      default:
        break;
    }
  }

  _updateMarquee(event) {
    const from = this._drag.originPoint;
    const to = this._canvasPoint(event.clientX, event.clientY);
    this.marquee = {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      w: Math.abs(to.x - from.x),
      h: Math.abs(to.y - from.y)
    };
  }

  _applyMove(dx, dy, noSnap) {
    const { ids, origin } = this._drag;
    // Snap is solved for the primary block only, then the same correction is
    // applied to every block in the selection — that keeps their relative
    // positions rigid, which is what makes a multi-drag feel like one object.
    const primary = origin[this._drag.blockId];
    let adjustX = 0;
    let adjustY = 0;
    if (!noSnap && primary) {
      const snap = this._snap(
        { ...primary, x: primary.x + dx, y: primary.y + dy },
        ids
      );
      adjustX = snap.dx;
      adjustY = snap.dy;
      this.guides = snap.guides;
    } else {
      this.guides = [];
    }
    const next = {};
    ids.forEach((id) => {
      const start = origin[id];
      if (!start) {
        return;
      }
      next[id] = clampFrame(
        { ...start, x: start.x + dx + adjustX, y: start.y + dy + adjustY },
        this.breakpoint
      );
    });
    this.liveFrames = next;
  }

  /**
   * Resize from `anchor`. Each letter in the anchor names an edge that moves;
   * the opposite edge stays pinned, which is what makes dragging the NW handle
   * grow the box up-and-left rather than translating it.
   */
  _applyResize(dx, dy, keepRatio) {
    const { anchor, blockId, origin } = this._drag;
    const start = origin[blockId];
    if (!start) {
      return;
    }
    let { x, y, w, h } = start;

    if (anchor.includes("e")) {
      w = start.w + dx;
    }
    if (anchor.includes("s")) {
      h = start.h + dy;
    }
    if (anchor.includes("w")) {
      w = start.w - dx;
      x = start.x + dx;
    }
    if (anchor.includes("n")) {
      h = start.h - dy;
      y = start.y + dy;
    }

    // Shift keeps the original aspect ratio, driven by whichever axis moved
    // further so a corner drag still tracks the pointer naturally.
    if (keepRatio && start.w > 0 && start.h > 0) {
      const ratio = start.w / start.h;
      if (Math.abs(dx) > Math.abs(dy)) {
        h = w / ratio;
        if (anchor.includes("n")) {
          y = start.y + (start.h - h);
        }
      } else {
        w = h * ratio;
        if (anchor.includes("w")) {
          x = start.x + (start.w - w);
        }
      }
    }

    // Clamp here rather than only in the store, so a handle dragged past its
    // opposite edge pins at the minimum instead of inverting the box mid-drag.
    if (w < MIN_SIZE.w) {
      if (anchor.includes("w")) {
        x = start.x + start.w - MIN_SIZE.w;
      }
      w = MIN_SIZE.w;
    }
    if (h < MIN_SIZE.h) {
      if (anchor.includes("n")) {
        y = start.y + start.h - MIN_SIZE.h;
      }
      h = MIN_SIZE.h;
    }

    this.liveFrames = {
      [blockId]: clampFrame({ ...start, x, y, w, h }, this.breakpoint)
    };
  }

  _applyRotate(event) {
    const { blockId, origin } = this._drag;
    const start = origin[blockId];
    if (!start) {
      return;
    }
    const centre = { x: start.x + start.w / 2, y: start.y + start.h / 2 };
    const point = this._canvasPoint(event.clientX, event.clientY);
    const degrees =
      (Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI + 90;
    // 15° detents unless Shift is held, matching sectionFreeform's rotate.
    const snapped = event.shiftKey ? degrees : Math.round(degrees / 15) * 15;
    this.liveFrames = {
      [blockId]: { ...start, rotation: Math.round(snapped) }
    };
  }

  /**
   * Nearest-edge snapping against the canvas (left/centre/right) and every
   * other block's edges and centres. Only the closest candidate per axis wins,
   * so guides never stack up into noise.
   */
  _snap(moved, movingIds) {
    const ignore = new Set(movingIds);
    const canvasW = this.canvasWidth;

    const xTargets = [0, canvasW / 2, canvasW];
    const yTargets = [];
    this.blocks.forEach((b) => {
      if (ignore.has(b.blockId)) {
        return;
      }
      const f = this._resolvedFrame(b);
      xTargets.push(f.x, f.x + f.w / 2, f.x + f.w);
      yTargets.push(f.y, f.y + f.h / 2, f.y + f.h);
    });

    const best = (edges, targets) => {
      let winner = null;
      edges.forEach((edge) => {
        targets.forEach((target) => {
          const distance = Math.abs(edge - target);
          if (
            distance <= SNAP_TOLERANCE &&
            (!winner || distance < winner.distance)
          ) {
            winner = { distance, delta: target - edge, at: target };
          }
        });
      });
      return winner;
    };

    const x = best(
      [moved.x, moved.x + moved.w / 2, moved.x + moved.w],
      xTargets
    );
    const y = best(
      [moved.y, moved.y + moved.h / 2, moved.y + moved.h],
      yTargets
    );
    const guides = [];
    if (x) {
      guides.push({ axis: "x", at: x.at });
    }
    if (y) {
      guides.push({ axis: "y", at: y.at });
    }
    return { dx: x ? x.delta : 0, dy: y ? y.delta : 0, guides };
  }

  // ---- gesture end --------------------------------------------------------
  onPointerUp() {
    const drag = this._drag;
    if (drag) {
      if (drag.action === "marquee" && this.marquee) {
        this._selectWithinMarquee();
      } else if (Object.keys(this.liveFrames).length) {
        // One commit for the whole gesture = one undo step.
        store.updateBlockFrames(this.pageId, this.breakpoint, this.liveFrames);
      }
    }
    this._teardown();
  }

  _selectWithinMarquee() {
    const box = this.marquee;
    const hits = this.blocks
      .filter((b) => {
        if (b.flags && b.flags.locked) {
          return false;
        }
        const f = this._resolvedFrame(b);
        // Intersection, not containment: a marquee that merely clips a block
        // should still catch it, which is what every design tool does.
        return (
          f.x < box.x + box.w &&
          f.x + f.w > box.x &&
          f.y < box.y + box.h &&
          f.y + f.h > box.y
        );
      })
      .map((b) => b.blockId);
    this.dispatchEvent(
      new CustomEvent("blockselect", {
        detail: { blockIds: hits },
        bubbles: true,
        composed: true
      })
    );
  }

  _emitSelect(blockId, additive) {
    this.dispatchEvent(
      new CustomEvent("blockselect", {
        detail: { blockId, additive },
        bubbles: true,
        composed: true
      })
    );
  }

  // ---- inline content edits ----------------------------------------------
  handleContentChange(event) {
    const blockId = event.target?.dataset?.blockId;
    const patch = event.detail?.patch;
    if (blockId && patch) {
      store.updateBlockContent(this.pageId, blockId, patch);
    }
  }

  /**
   * An auto-height block reporting its real rendered height. Kept local (see
   * `measured`) so the canvas can grow and snapping can see the true bottom
   * edge, without writing a derived value into the saved document.
   */
  handleBlockMeasure(event) {
    const { blockId, height } = event.detail;
    if (this.measured[blockId] === height) {
      return;
    }
    this.measured = { ...this.measured, [blockId]: height };
  }

  // ---- keyboard -----------------------------------------------------------
  onKeyDown(event) {
    if (!this.isEdit || this._drag) {
      return;
    }
    const target = event.composedPath()[0];
    if (
      target &&
      (target.isContentEditable ||
        (target.closest &&
          target.closest(
            "input, textarea, select, button, a, c-image-uploader"
          )))
    ) {
      return;
    }
    const ids = this.selectedBlockIds || [];
    if (!ids.length) {
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      store.deleteBlocks(this.pageId, ids);
      this._emitSelect(null, false);
      return;
    }

    const step = event.shiftKey ? NUDGE_LARGE : NUDGE;
    const move = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    }[event.key];
    if (!move) {
      return;
    }
    event.preventDefault();
    // One commit for the whole nudge, not one per selected block.
    const next = {};
    ids.forEach((id) => {
      const block = this.blocks.find((b) => b.blockId === id);
      if (!block || block.flags?.locked) {
        return;
      }
      const f = this._resolvedFrame(block);
      next[id] = { x: f.x + move[0], y: f.y + move[1] };
    });
    store.updateBlockFrames(this.pageId, this.breakpoint, next);
  }

  // ---- empty state --------------------------------------------------------
  handleAddFirst() {
    this.dispatchEvent(
      new CustomEvent("openpalette", { bubbles: true, composed: true })
    );
  }

  /** Exposed so a palette drop can land where the pointer actually is. */
  @api
  pointToCanvas(clientX, clientY) {
    return this._canvasPoint(clientX, clientY);
  }
}