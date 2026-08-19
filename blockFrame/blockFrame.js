/**
 * blockFrame — one absolutely-positioned block on the free canvas: its box,
 * its selection chrome, and its eight resize handles plus a rotate handle.
 *
 * It owns NO drag math. Pointer-downs on the body or a handle are announced
 * upward as `blockgrab` and freeCanvas does all the geometry — one component
 * doing the arithmetic means snapping, multi-select drag and the zoom/scale
 * correction all live in a single place instead of being reimplemented per
 * block.
 */
import { LightningElement, api } from "lwc";

// Handle ids double as the resize anchor: which edges/corners move.
const HANDLES = [
  { id: "nw", cls: "h h_nw" },
  { id: "n", cls: "h h_n" },
  { id: "ne", cls: "h h_ne" },
  { id: "e", cls: "h h_e" },
  { id: "se", cls: "h h_se" },
  { id: "s", cls: "h h_s" },
  { id: "sw", cls: "h h_sw" },
  { id: "w", cls: "h h_w" }
];

export default class BlockFrame extends LightningElement {
  @api block;
  @api frame;
  @api mode = "edit";
  @api selected = false;
  @api globals;
  @api navMenu;
  @api siteId;

  get isEdit() {
    return this.mode === "edit";
  }

  get locked() {
    return !!this.block?.flags?.locked;
  }

  get hidden() {
    return !!this.block?.flags?.hidden;
  }

  /** Hidden blocks stay visible-but-dimmed while editing so they can be found. */
  get isRendered() {
    return this.isEdit || !this.hidden;
  }

  get rootClass() {
    const parts = ["blk"];
    if (this.isEdit) {
      parts.push("blk_edit");
    }
    if (this.selected) {
      parts.push("blk_selected");
    }
    if (this.locked) {
      parts.push("blk_locked");
    }
    if (this.hidden) {
      parts.push("blk_hidden");
    }
    return parts.join(" ");
  }

  /**
   * Position/size in canvas pixels. Height is omitted for auto-height blocks so
   * their own content drives it — a text block with a pinned height overflows
   * the moment someone types another line.
   */
  get rootStyle() {
    const f = this.frame || { x: 0, y: 0, w: 100, h: 100 };
    const opacity = this.block?.style?.opacity;
    const parts = [
      `left:${f.x}px`,
      `top:${f.y}px`,
      `width:${f.w}px`,
      this.autoHeight ? "height:auto" : `height:${f.h}px`,
      `z-index:${this.block?.z || 0}`
    ];
    if (f.rotation) {
      parts.push(`transform:rotate(${f.rotation}deg)`);
    }
    if (opacity !== undefined && opacity !== null && opacity !== 100) {
      parts.push(`opacity:${Number(opacity) / 100}`);
    }
    return parts.join(";");
  }

  get autoHeight() {
    return this.block?.autoHeight === true;
  }

  get handles() {
    return HANDLES;
  }

  /** Handles are chrome, not content — never shown in preview or when locked. */
  get showHandles() {
    return this.isEdit && this.selected && !this.locked;
  }

  get blockKind() {
    return this.block?.kind;
  }
  get blockType() {
    return this.block?.type;
  }
  get blockContentData() {
    return this.block?.content || {};
  }
  get blockStyleData() {
    return this.block?.style || {};
  }
  get blockVariant() {
    return this.block?.variant || "default";
  }
  get blockLayout() {
    return this.block?.layout || {};
  }

  // ---- pointer plumbing ---------------------------------------------------
  // Everything below only announces intent; freeCanvas decides what it means.

  handleBodyDown(event) {
    if (!this.isEdit || this.locked) {
      return;
    }
    // Let a real inline edit (contenteditable) or an interactive control keep
    // the pointer — otherwise clicking into a text block would start a drag
    // instead of placing a caret.
    const el = event.composedPath()[0];
    if (
      el &&
      (el.isContentEditable ||
        (el.closest && el.closest("input, textarea, select, button")))
    ) {
      return;
    }
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("blockgrab", {
        detail: {
          blockId: this.block.blockId,
          action: "move",
          x: event.clientX,
          y: event.clientY,
          additive: event.shiftKey || event.metaKey || event.ctrlKey
        },
        bubbles: true,
        composed: true
      })
    );
  }

  handleHandleDown(event) {
    event.stopPropagation();
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent("blockgrab", {
        detail: {
          blockId: this.block.blockId,
          action: "resize",
          anchor: event.currentTarget.dataset.handle,
          x: event.clientX,
          y: event.clientY
        },
        bubbles: true,
        composed: true
      })
    );
  }

  handleRotateDown(event) {
    event.stopPropagation();
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent("blockgrab", {
        detail: {
          blockId: this.block.blockId,
          action: "rotate",
          x: event.clientX,
          y: event.clientY
        },
        bubbles: true,
        composed: true
      })
    );
  }

  /**
   * An auto-height block's real rendered height still has to reach the store,
   * or the canvas can't grow to fit it and nothing below it can snap to its
   * bottom edge. Report it upward whenever it changes materially.
   */
  renderedCallback() {
    if (!this.autoHeight || !this.isEdit) {
      return;
    }
    const host = this.template.querySelector(".blk");
    if (!host) {
      return;
    }
    // offsetHeight, not getBoundingClientRect: the canvas is CSS-scaled for
    // zoom/fit, and a rect would report screen pixels while the store stores
    // canvas pixels. offsetHeight ignores ancestor transforms.
    const measured = Math.round(host.offsetHeight);
    if (!measured || Math.abs(measured - (this._reported || 0)) < 2) {
      return;
    }
    this._reported = measured;
    this.dispatchEvent(
      new CustomEvent("blockmeasure", {
        detail: { blockId: this.block.blockId, height: measured },
        bubbles: true,
        composed: true
      })
    );
  }
}