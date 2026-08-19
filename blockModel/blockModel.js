/**
 * blockModel — the data model for the free-canvas page (the canvas rewrite).
 *
 * A page is no longer a vertical stack of full-width sections. It is a flat
 * list of BLOCKS, each absolutely positioned on a canvas, at a position that
 * is stored INDEPENDENTLY PER BREAKPOINT.
 *
 * A block is either:
 *   kind: 'section' — a whole prebuilt section (hero, pricing, faq…). Its
 *                     content/style/variant are byte-identical to the old
 *                     section node, which is why every existing section
 *                     renderer keeps working untouched inside a block frame.
 *   kind: 'element' — a single primitive (text, image, button, video, spacer).
 *
 * ---- why pixels, not percentages -------------------------------------------
 * The old freeform canvas stored x/y as a percentage of the canvas and never
 * stored height at all — which is exactly why flush top/bottom snapping was
 * impossible (there was no height to snap to). Here each breakpoint has a
 * KNOWN, FIXED canvas width, so px inside that breakpoint is unambiguous, and
 * height is a first-class stored value. The rendered page scales the whole
 * canvas to fit the viewport; it never re-derives positions.
 *
 * x/y are the block's TOP-LEFT corner (not its centre, as the old element
 * model used) because top-left is what CSS `left`/`top` want, what edge
 * snapping compares, and what a resize handle actually moves.
 */
import { uuid, defaultSection, defaultElement } from "c/sectionRegistry";

/** Editing breakpoints, widest first. `desktop` is the authoring source. */
export const BREAKPOINTS = ["desktop", "tablet", "mobile"];

/**
 * The authoring width of each breakpoint's canvas, in CSS pixels. Every stored
 * x/y/w/h is relative to these. Chosen to match the common device classes the
 * device switcher already offers.
 */
export const CANVAS_WIDTH = {
  desktop: 1440,
  tablet: 768,
  mobile: 375
};

/** Empty vertical room kept below the lowest block so there's always somewhere to drop. */
export const CANVAS_TAIL = 240;

/** Smallest a block may be dragged/resized to, in px. */
export const MIN_SIZE = { w: 24, h: 16 };

// Starting size per element kind, in desktop px. Sections get a full-bleed
// default instead (see defaultBlockFrame) since that is what they were
// designed to render at.
const ELEMENT_SIZE = {
  text: { w: 480, h: 120 },
  button: { w: 180, h: 52 },
  image: { w: 520, h: 340 },
  video: { w: 640, h: 360 },
  spacer: { w: 1440, h: 80 },
  layout: { w: 1080, h: 320 }
};

// Starting height per section type, in desktop px. These are first-drop
// estimates only — the block is resizable immediately, and `autoHeight`
// blocks re-measure themselves from their real content on render.
const SECTION_HEIGHT = {
  hero: 620,
  navHeader: 88,
  footer: 220,
  logoStrip: 160,
  cta: 320,
  stats: 260,
  textBlock: 280
};
const SECTION_HEIGHT_DEFAULT = 520;

/**
 * Blocks whose height is driven by their own content rather than a stored
 * value. A text block with a locked height overflows the moment someone types
 * another line, so text is auto by default; the author can pin it explicitly.
 */
export function isAutoHeightByDefault(kind, type) {
  return kind === "element" && (type === "text" || type === "button");
}

/** A fresh frame for a block of this kind/type at the given breakpoint. */
export function defaultBlockFrame(kind, type, breakpoint = "desktop") {
  const canvas = CANVAS_WIDTH[breakpoint] || CANVAS_WIDTH.desktop;
  if (kind === "section") {
    const h = SECTION_HEIGHT[type] || SECTION_HEIGHT_DEFAULT;
    // Sections are full-bleed by default: they were designed as full-width
    // bands and most still paint their own background edge to edge.
    return { x: 0, y: 0, w: canvas, h, rotation: 0 };
  }
  const size = ELEMENT_SIZE[type] || { w: 400, h: 160 };
  const w = Math.min(size.w, canvas);
  return {
    x: Math.round((canvas - w) / 2),
    y: 0,
    w,
    h: size.h,
    rotation: 0
  };
}

/**
 * Scale a frame from one breakpoint to another. Used when a breakpoint is
 * first opened: rather than making the author lay the page out from scratch
 * three times, tablet/mobile start as a proportional copy of desktop which
 * they then adjust. X and width scale by the canvas ratio; Y and height do
 * NOT — vertical space is scroll, not a proportion of anything, so squashing
 * it would just make everything overlap.
 */
export function deriveFrame(frame, fromBreakpoint, toBreakpoint) {
  const from = CANVAS_WIDTH[fromBreakpoint] || CANVAS_WIDTH.desktop;
  const to = CANVAS_WIDTH[toBreakpoint] || CANVAS_WIDTH.desktop;
  const ratio = to / from;
  const w = Math.round(frame.w * ratio);
  return {
    x: Math.max(0, Math.min(Math.round(frame.x * ratio), to - Math.min(w, to))),
    y: Math.round(frame.y),
    w: Math.min(w, to),
    h: Math.round(frame.h),
    rotation: frame.rotation || 0
  };
}

/**
 * The frame to render/edit a block at for `breakpoint`, falling back to a
 * derived copy of desktop when that breakpoint has never been touched. Always
 * returns a usable frame — callers never have to null-check geometry.
 */
export function frameFor(block, breakpoint = "desktop") {
  const frames = (block && block.frame) || {};
  if (frames[breakpoint]) {
    return frames[breakpoint];
  }
  const base = frames.desktop || defaultBlockFrame(block?.kind, block?.type);
  return breakpoint === "desktop"
    ? base
    : deriveFrame(base, "desktop", breakpoint);
}

/** True when this block's height should follow its content instead of `frame.h`. */
export function isAutoHeight(block) {
  if (!block) {
    return false;
  }
  return block.autoHeight === true;
}

/**
 * A complete, valid block wrapping a prebuilt section. content/style/variant
 * come straight from the existing registry, so the section renders exactly as
 * it always has — only its placement is new.
 */
export function blockFromSection(type, category = "default", frame) {
  const section = defaultSection(type, category);
  return {
    blockId: uuid(),
    kind: "section",
    type,
    variant: section.variant,
    content: section.content,
    style: section.style,
    layout: section.layout,
    flags: {},
    autoHeight: false,
    z: 0,
    frame: {
      desktop: { ...defaultBlockFrame("section", type), ...(frame || {}) }
    }
  };
}

/** A complete, valid block wrapping a single element primitive. */
export function blockFromElement(kind, frame) {
  const el = defaultElement(kind);
  // The old element model carried its own elementId/x/y/width; on the canvas
  // identity is blockId and geometry lives in `frame`, so drop them rather
  // than leave two competing sources of truth for the same facts.
  const content = { ...el };
  delete content.elementId;
  delete content.x;
  delete content.y;
  delete content.width;
  return {
    blockId: uuid(),
    kind: "element",
    type: kind,
    variant: "default",
    content,
    style: {},
    flags: {},
    autoHeight: isAutoHeightByDefault("element", kind),
    z: 0,
    frame: {
      desktop: { ...defaultBlockFrame("element", kind), ...(frame || {}) }
    }
  };
}

/**
 * Convert a legacy stacked page (sections[]) into canvas blocks, laid out in
 * the vertical order they used to render in. Sites saved before the canvas
 * rewrite have no blocks[] at all and would otherwise open as a blank canvas.
 *
 * Full-bleed and stacked, which is exactly how the stacked model drew them —
 * so a migrated page opens looking like it always did, and only then becomes
 * free to rearrange.
 *
 * Container and reference types (`row`, `globalRef`) are skipped: a row's
 * children are a nested tree the flat canvas has no equivalent for, and
 * flattening it silently would scatter a carefully-built layout. They stay in
 * sections[] untouched rather than being half-converted.
 */
export function blocksFromSections(sections = [], breakpoint = "desktop") {
  const canvas = CANVAS_WIDTH[breakpoint] || CANVAS_WIDTH.desktop;
  let y = 0;
  const blocks = [];
  sections.forEach((section, index) => {
    if (!section || section.type === "row" || section.type === "globalRef") {
      return;
    }
    const h = SECTION_HEIGHT[section.type] || SECTION_HEIGHT_DEFAULT;
    blocks.push({
      blockId: uuid(),
      kind: "section",
      type: section.type,
      variant: section.variant || "default",
      content: section.content || {},
      style: section.style || {},
      layout: section.layout || {},
      flags: section.flags || {},
      autoHeight: false,
      z: index,
      frame: { [breakpoint]: { x: 0, y, w: canvas, h, rotation: 0 } }
    });
    y += h;
  });
  return blocks;
}

/** Total canvas height needed to hold every block at this breakpoint. */
export function canvasHeight(blocks, breakpoint = "desktop") {
  const lowest = (blocks || []).reduce((max, b) => {
    const f = frameFor(b, breakpoint);
    return Math.max(max, (f.y || 0) + (f.h || 0));
  }, 0);
  return Math.max(lowest + CANVAS_TAIL, 800);
}

/**
 * Blocks in paint order (ascending z, ties broken by vertical position) with
 * their resolved frame attached. Rendering in this order means the DOM order
 * of a freely-positioned page still reads top-to-bottom, which is what screen
 * readers and crawlers follow — the one real cost of absolute positioning,
 * paid here rather than left as a bug.
 */
export function blocksInPaintOrder(blocks, breakpoint = "desktop") {
  return (blocks || [])
    .map((block) => ({ block, frame: frameFor(block, breakpoint) }))
    .sort((a, b) => {
      const z = (a.block.z || 0) - (b.block.z || 0);
      return z !== 0 ? z : (a.frame.y || 0) - (b.frame.y || 0);
    });
}

/** The next z above everything (bring to front). */
export function topZ(blocks) {
  return (blocks || []).reduce((max, b) => Math.max(max, b.z || 0), 0) + 1;
}

/** The next z below everything (send to back). */
export function bottomZ(blocks) {
  return (blocks || []).reduce((min, b) => Math.min(min, b.z || 0), 0) - 1;
}

/** Find a block on a page by id. Blocks are flat, so this stays a plain find. */
export function findBlock(page, blockId) {
  if (!page || !blockId) {
    return null;
  }
  return (page.blocks || []).find((b) => b.blockId === blockId) || null;
}

/** Clamp a frame so a block can never be dragged fully outside its canvas. */
export function clampFrame(frame, breakpoint = "desktop") {
  const canvas = CANVAS_WIDTH[breakpoint] || CANVAS_WIDTH.desktop;
  const w = Math.max(MIN_SIZE.w, Math.round(frame.w));
  const h = Math.max(MIN_SIZE.h, Math.round(frame.h));
  return {
    ...frame,
    w,
    h,
    // Keep at least a sliver on-canvas horizontally; vertical is unbounded
    // below (the canvas grows) but never above 0.
    x: Math.round(
      Math.min(Math.max(frame.x, -w + MIN_SIZE.w), canvas - MIN_SIZE.w)
    ),
    y: Math.max(0, Math.round(frame.y))
  };
}