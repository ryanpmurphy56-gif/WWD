/**
 * settingsPanel — the context panel (brief §4.2). Shows the selected section's
 * settings (content fields from the registry, plus variant and the allowed
 * style overrides) when a section is selected, and the active page's settings
 * otherwise. It reads its inputs from props and writes every change straight to
 * the shared store — it never holds site state.
 */
import { LightningElement, api } from "lwc";
import store from "c/siteStateService";
import { contentFields, variantsFor, typeLabel } from "c/sectionRegistry";
import { bpValue, overriddenAt } from "c/sectionCommon";
import { buildSitemapXml, buildRobotsTxt } from "c/siteSeoTools";

const DEVICE_LABELS = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile"
};
// Style keys that can be overridden per breakpoint, in the order the panel shows
// them, mapped to the label the reset banner uses.
const STYLE_LABELS = {
  background: "Background",
  gradient: "Gradient",
  tone: "Tone",
  padding: "Padding",
  margin: "Margin",
  radius: "Corners",
  shadow: "Shadow",
  border: "Border"
};

const BACKGROUNDS = [
  { value: "surface", label: "Surface" },
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "gradient", label: "Gradient" },
  { value: "image", label: "Image" },
  { value: "none", label: "None" }
];
const TONES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];
const PADDINGS = [
  { value: "none", label: "None" },
  { value: "XS", label: "Tiny" },
  { value: "S", label: "Small" },
  { value: "M", label: "Medium" },
  { value: "L", label: "Large" },
  { value: "XL", label: "Huge" }
];
const MARGINS = [
  { value: "none", label: "None" },
  { value: "S", label: "Small" },
  { value: "M", label: "Medium" },
  { value: "L", label: "Large" }
];
const FONT_WEIGHTS = [
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extrabold" }
];
const TEXT_SHADOWS = [
  { value: "none", label: "None" },
  { value: "soft", label: "Soft" },
  { value: "hard", label: "Hard" }
];
const MEDIA_FILTERS = [
  { value: "none", label: "None" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "bw", label: "Black & white" },
  { value: "vivid", label: "Vivid" },
  { value: "muted", label: "Muted" }
];
const RADII = [
  { value: "inherit", label: "Theme default" },
  { value: "none", label: "Square" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
  { value: "pill", label: "Pill" }
];
const SHADOWS = [
  { value: "none", label: "None" },
  { value: "sm", label: "Subtle" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Dramatic" }
];
const BORDER_STYLES = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" }
];
const HOVER_EFFECTS = [
  { value: "none", label: "None" },
  { value: "lift", label: "Lift" },
  { value: "scale", label: "Grow" },
  { value: "glow", label: "Glow" }
];
const GAPS = [
  { value: "none", label: "None" },
  { value: "XS", label: "Tiny" },
  { value: "S", label: "Small" },
  { value: "M", label: "Medium" },
  { value: "L", label: "Large" },
  { value: "XL", label: "Huge" }
];
// Side-by-side columns top out at 6 before they're unusably narrow; grid mode
// wraps its cells onto new lines, so it can sensibly hold up to 12.
const MAX_COLUMNS = 6;
const MAX_GRID_CELLS = 12;

const LAYOUT_MODES = [
  { value: "columns", label: "Columns" },
  { value: "flex", label: "Flex" },
  { value: "grid", label: "Grid" }
];
const FLEX_DIRECTIONS = [
  { value: "row", label: "Horizontal" },
  { value: "column", label: "Vertical (stacked)" }
];
const FLEX_JUSTIFY = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "between", label: "Space between" },
  { value: "around", label: "Space around" }
];
const FLEX_ALIGN = [
  { value: "stretch", label: "Stretch" },
  { value: "start", label: "Top" },
  { value: "center", label: "Middle" },
  { value: "end", label: "Bottom" }
];
const WIDTH_MODES = [
  { value: "span", label: "Span (12ths)" },
  { value: "percent", label: "Percent" },
  { value: "auto", label: "Auto (fit content)" }
];
const GRID_COLS = [
  { value: "2", label: "2 across" },
  { value: "3", label: "3 across" },
  { value: "4", label: "4 across" },
  { value: "5", label: "5 across" },
  { value: "6", label: "6 across" }
];

// Grid placement presets on a 12-column track — where the content block sits.
const PLACEMENTS = [
  { id: "full", label: "Full", colStart: 1, colSpan: 12 },
  { id: "wide", label: "Wide", colStart: 2, colSpan: 10 },
  { id: "centered", label: "Centered", colStart: 3, colSpan: 8 },
  { id: "narrow", label: "Narrow", colStart: 4, colSpan: 6 },
  { id: "left-half", label: "Left half", colStart: 1, colSpan: 6 },
  { id: "right-half", label: "Right half", colStart: 7, colSpan: 6 },
  { id: "left-third", label: "Left third", colStart: 1, colSpan: 4 },
  { id: "center-third", label: "Centre third", colStart: 5, colSpan: 4 },
  { id: "right-third", label: "Right third", colStart: 9, colSpan: 4 }
];

const VALIGNS = [
  { value: "top", label: "Top" },
  { value: "center", label: "Middle" },
  { value: "bottom", label: "Bottom" }
];

const IMAGE_TYPES = new Set(["hero", "imageText"]);
// Which section types get the media-filter control — every type with a real
// image/video surface today, including gallery (its filter applies to every
// tile uniformly, same "list items don't get per-item styling" precedent as
// per-field typography).
const MEDIA_FILTER_TYPES = new Set(["hero", "imageText", "gallery"]);

export default class SettingsPanel extends LightningElement {
  @api activePage;
  @api selectedSection;
  // The full page list, used to build the "Parent page" dropdown (which pages
  // are eligible parents). Passed from the shell so it stays reactive.
  @api pages = [];
  // config.nav ({ customLinks, mobileMenuStyle }) — drives the nav builder
  // shown when the selected section is the header. From the shell, reactive.
  @api nav = {};
  // Which breakpoint edits are written to, and which one values are read back
  // at. Today the toolbar only ever previews desktop (= the 'base' breakpoint),
  // so every write lands on base and style values stay plain scalars.
  @api device = "desktop";
  // The site's display name, threaded from the shell — used only to build a
  // plausible domain for the SEO preview card's URL line.
  @api siteName = "";
  // config.meta.seo — site-wide SEO defaults (title suffix, default share
  // image, robots indexing, canonical domain). From the shell, reactive.
  @api siteSeo = {};
  // config.meta.contact / config.meta.social — business info + social links.
  @api siteContact = {};
  @api siteSocial = {};
  // config.marketing — announcement bar + promo popup settings.
  @api marketing = {};
  // config.customCode — site-wide custom CSS (see c/siteSeoTools.applyCustomCss).
  @api customCode = {};

  // Drag state for the placement bar.
  dragMode = null; // 'move' | 'left' | 'right'
  _startX = 0;
  _startCol = 1;
  _startSpan = 12;
  _trackW = 0;
  previewCol = null;
  previewSpan = null;

  // Collapsible group state for the panel sections (all open by default).
  pageGroupOpen = true;
  sectionGroupOpen = true;
  seoGroupOpen = true;
  siteSeoGroupOpen = false;
  marketingGroupOpen = false;
  advancedGroupOpen = false;
  sitemapText = "";
  robotsText = "";

  // Which content fields' typography sub-panel is expanded — local UI state
  // only, not persisted (same idea as the group-open booleans above, just
  // keyed by field instead of being one flag per group).
  _openTypeFields = new Set();

  togglePageGroup() {
    this.pageGroupOpen = !this.pageGroupOpen;
  }

  toggleSectionGroup() {
    this.sectionGroupOpen = !this.sectionGroupOpen;
  }

  toggleSeoGroup() {
    this.seoGroupOpen = !this.seoGroupOpen;
  }

  get pageChevron() {
    return this.pageGroupOpen ? "▾" : "▸";
  }

  get sectionChevron() {
    return this.sectionGroupOpen ? "▾" : "▸";
  }

  get seoChevron() {
    return this.seoGroupOpen ? "▾" : "▸";
  }

  toggleSiteSeoGroup() {
    this.siteSeoGroupOpen = !this.siteSeoGroupOpen;
  }

  get siteSeoChevron() {
    return this.siteSeoGroupOpen ? "▾" : "▸";
  }

  constructor() {
    super();
    this._onMove = this.onDragMove.bind(this);
    this._onUp = this.onDragEnd.bind(this);
  }

  disconnectedCallback() {
    this.detachDragListeners();
  }

  get hasSelection() {
    return !!this.selectedSection;
  }

  get sectionTitle() {
    return this.selectedSection ? typeLabel(this.selectedSection.type) : "";
  }

  // ---- blog (F8 CMS) -------------------------------------------------------
  get isBlogSection() {
    return !!this.selectedSection && this.selectedSection.type === "blogList";
  }
  handleManagePosts() {
    this.dispatchEvent(new CustomEvent("openblogmanager"));
  }

  // ---- shop (F13) -----------------------------------------------------
  get isShopSection() {
    return !!this.selectedSection && this.selectedSection.type === "shop";
  }
  handleManageProducts() {
    this.dispatchEvent(new CustomEvent("openproductmanager"));
  }

  // ---- team / portfolio / testimonials / events (F8b CMS) --------------
  get isTeamListSection() {
    return !!this.selectedSection && this.selectedSection.type === "teamList";
  }
  handleManageTeam() {
    this.dispatchEvent(new CustomEvent("openteammanager"));
  }
  get isPortfolioListSection() {
    return !!this.selectedSection && this.selectedSection.type === "portfolioList";
  }
  handleManagePortfolio() {
    this.dispatchEvent(new CustomEvent("openportfoliomanager"));
  }
  get isTestimonialListSection() {
    return !!this.selectedSection && this.selectedSection.type === "testimonialList";
  }
  handleManageTestimonials() {
    this.dispatchEvent(new CustomEvent("opentestimonialmanager"));
  }
  get isEventListSection() {
    return !!this.selectedSection && this.selectedSection.type === "eventList";
  }
  handleManageEvents() {
    this.dispatchEvent(new CustomEvent("openeventmanager"));
  }

  // ---- lock / hide / opacity --------------------------------------------
  get sectionLocked() {
    return !!this.selectedSection?.flags?.locked;
  }
  get sectionHidden() {
    return !!this.selectedSection?.flags?.hidden;
  }
  get sectionOpacityPercent() {
    const v = this.selectedSection?.style?.opacity;
    return Math.round(
      (v === undefined || v === null || v === "" ? 1 : Number(v)) * 100
    );
  }
  handleLockToggle(event) {
    store.setSectionFlags(this.pageId, this.sectionId, {
      locked: event.target.checked
    });
  }
  handleHideToggle(event) {
    store.setSectionFlags(this.pageId, this.sectionId, {
      hidden: event.target.checked
    });
  }
  handleOpacityChange(event) {
    const pct = Math.max(0, Math.min(100, Number(event.target.value) || 0));
    store.updateSectionStyle(this.pageId, this.sectionId, {
      opacity: pct / 100
    });
  }
  get sectionSticky() {
    return !!this.selectedSection?.style?.sticky;
  }
  handleStickyToggle(event) {
    store.updateSectionStyle(this.pageId, this.sectionId, {
      sticky: event.target.checked
    });
  }

  // ---- entrance animation ------------------------------------------------
  get animation() {
    return this.selectedSection?.style?.animation || {};
  }
  get animationTypeOptions() {
    return this.selectOptions(
      [
        ["none", "None"],
        ["fade", "Fade in"],
        ["slide-up", "Slide up"],
        ["slide-left", "Slide in from right"],
        ["slide-right", "Slide in from left"],
        ["zoom", "Zoom in"]
      ],
      this.animation.type || "none"
    );
  }
  get hasAnimationType() {
    return (this.animation.type || "none") !== "none";
  }
  get animationTriggerOptions() {
    return this.selectOptions(
      [
        ["onScroll", "When scrolled into view"],
        ["onLoad", "On page load"]
      ],
      this.animation.trigger || "onScroll"
    );
  }
  get animationDurationOptions() {
    return this.selectOptions(
      [
        ["S", "Fast"],
        ["M", "Normal"],
        ["L", "Slow"]
      ],
      this.animation.duration || "M"
    );
  }
  get animationDelayOptions() {
    return this.selectOptions(
      [
        ["none", "None"],
        ["short", "Short"],
        ["long", "Long"]
      ],
      this.animation.delay || "none"
    );
  }
  selectOptions(pairs, selectedValue) {
    return pairs.map(([value, label]) => ({
      value,
      label,
      selected: value === selectedValue
    }));
  }
  handleAnimationType(event) {
    store.updateSectionAnimation(this.pageId, this.sectionId, {
      type: event.target.value
    });
  }
  handleAnimationTrigger(event) {
    store.updateSectionAnimation(this.pageId, this.sectionId, {
      trigger: event.target.value
    });
  }
  handleAnimationDuration(event) {
    store.updateSectionAnimation(this.pageId, this.sectionId, {
      duration: event.target.value
    });
  }
  handleAnimationDelay(event) {
    store.updateSectionAnimation(this.pageId, this.sectionId, {
      delay: event.target.value
    });
  }

  // ---- section content fields -----------------------------------------
  get fields() {
    if (!this.selectedSection) {
      return [];
    }
    const content = this.selectedSection.content || {};
    const styleFields = this.selectedSection.style?.fields || {};
    return contentFields(this.selectedSection.type).map((f) => {
      const styleable = f.type === "text" || f.type === "textarea";
      const fs = styleFields[f.key] || {};
      return {
        key: f.key,
        label: f.label,
        value: content[f.key] == null ? "" : content[f.key],
        isText: f.type === "text",
        isUrl: f.type === "url",
        isTextarea: f.type === "textarea",
        isList: f.type === "list",
        styleable,
        typeOpen: this._openTypeFields.has(f.key),
        typeToggleLabel: this._openTypeFields.has(f.key)
          ? "Aa Typography ▾"
          : "Aa Typography ▸",
        fontSize: fs.fontSize == null ? "" : fs.fontSize,
        lineHeight: fs.lineHeight == null ? "" : fs.lineHeight,
        letterSpacing: fs.letterSpacing == null ? "" : fs.letterSpacing,
        fontWeightOptions: this.withSelected(
          FONT_WEIGHTS,
          String(fs.fontWeight || 400)
        ),
        textShadowOptions: this.withSelected(
          TEXT_SHADOWS,
          fs.textShadow || "none"
        )
      };
    });
  }

  handleFieldTypeToggle(event) {
    const key = event.currentTarget.dataset.key;
    const next = new Set(this._openTypeFields);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this._openTypeFields = next;
  }

  handleFieldFontSize(event) {
    const key = event.currentTarget.dataset.key;
    const raw = event.target.value;
    store.updateFieldStyle(this.pageId, this.sectionId, key, {
      fontSize: raw === "" ? null : Number(raw)
    });
  }

  handleFieldFontWeight(event) {
    const key = event.currentTarget.dataset.key;
    store.updateFieldStyle(this.pageId, this.sectionId, key, {
      fontWeight: event.target.value
    });
  }

  handleFieldLineHeight(event) {
    const key = event.currentTarget.dataset.key;
    const raw = event.target.value;
    store.updateFieldStyle(this.pageId, this.sectionId, key, {
      lineHeight: raw === "" ? null : Number(raw)
    });
  }

  handleFieldLetterSpacing(event) {
    const key = event.currentTarget.dataset.key;
    const raw = event.target.value;
    store.updateFieldStyle(this.pageId, this.sectionId, key, {
      letterSpacing: raw === "" ? null : Number(raw)
    });
  }

  handleFieldTextShadow(event) {
    const key = event.currentTarget.dataset.key;
    store.updateFieldStyle(this.pageId, this.sectionId, key, {
      textShadow: event.target.value
    });
  }

  // ---- margin / min-max sizing ------------------------------------------
  get marginOptions() {
    return this.withSelected(MARGINS, this.styleValue("margin") || "none");
  }

  get minWidth() {
    const v = this.selectedSection?.style?.minWidth;
    return v == null ? "" : v;
  }
  get maxWidth() {
    const v = this.selectedSection?.style?.maxWidth;
    return v == null ? "" : v;
  }
  get minHeight() {
    const v = this.selectedSection?.style?.minHeight;
    return v == null ? "" : v;
  }
  get maxHeight() {
    const v = this.selectedSection?.style?.maxHeight;
    return v == null ? "" : v;
  }

  handleMinMaxChange(event) {
    const key = event.currentTarget.dataset.key;
    const raw = event.target.value;
    store.updateSectionStyle(this.pageId, this.sectionId, {
      [key]: raw === "" ? null : Number(raw)
    });
  }

  get variantOptions() {
    if (!this.selectedSection) {
      return [];
    }
    const current = this.selectedSection.variant;
    return variantsFor(this.selectedSection.type).map((v) => ({
      value: v,
      label: v,
      selected: v === current
    }));
  }

  get hasVariants() {
    return this.variantOptions.length > 1;
  }

  // ---- nav builder (only for the header section) -----------------------
  get isNavHeader() {
    return this.selectedSection?.type === "navHeader";
  }

  // ---- form notifications (only for the contact/form section) ----------
  get isContact() {
    return this.selectedSection?.type === "contact";
  }
  get notifyEmail() {
    return this.selectedSection?.content?.notifyEmail || "";
  }
  handleNotifyEmailChange(event) {
    store.updateSectionContent(this.pageId, this.sectionId, {
      notifyEmail: event.target.value.trim()
    });
  }

  get navLinks() {
    const links = (this.nav && this.nav.customLinks) || [];
    return links.map((l, i) => ({
      linkId: l.linkId,
      label: l.label,
      url: l.url,
      newTab: l.newTab,
      isFirst: i === 0,
      isLast: i === links.length - 1
    }));
  }

  get hasNavLinks() {
    return this.navLinks.length > 0;
  }

  get mobileMenuStyleOptions() {
    const current = (this.nav && this.nav.mobileMenuStyle) || "dropdown";
    return [
      { value: "dropdown", label: "Dropdown panel" },
      { value: "overlay", label: "Full-screen overlay" }
    ].map((o) => ({ ...o, selected: o.value === current }));
  }

  handleAddNavLink() {
    store.addNavLink("New link", "https://");
  }
  handleNavLinkLabel(event) {
    store.updateNavLink(event.currentTarget.dataset.linkId, {
      label: event.target.value
    });
  }
  handleNavLinkUrl(event) {
    store.updateNavLink(event.currentTarget.dataset.linkId, {
      url: event.target.value
    });
  }
  handleNavLinkNewTab(event) {
    store.updateNavLink(event.currentTarget.dataset.linkId, {
      newTab: event.target.checked
    });
  }
  handleNavLinkUp(event) {
    store.moveNavLink(event.currentTarget.dataset.linkId, -1);
  }
  handleNavLinkDown(event) {
    store.moveNavLink(event.currentTarget.dataset.linkId, 1);
  }
  handleRemoveNavLink(event) {
    store.removeNavLink(event.currentTarget.dataset.linkId);
  }
  handleMobileMenuStyle(event) {
    store.updateNavSettings({ mobileMenuStyle: event.target.value });
  }

  get backgroundOptions() {
    // "Video" only offered on hero — the only type with a real background
    // rendering surface for it (imageText treats its image as foreground
    // content, not a background), same scoping precedent as supportsImage.
    const list =
      this.selectedSection?.type === "hero"
        ? [...BACKGROUNDS, { value: "video", label: "Video" }]
        : BACKGROUNDS;
    return this.withSelected(list, this.styleValue("background") || "surface");
  }
  get toneOptions() {
    return this.withSelected(TONES, this.styleValue("tone") || "light");
  }
  get paddingOptions() {
    return this.withSelected(PADDINGS, this.styleValue("padding") || "M");
  }
  get radiusOptions() {
    return this.withSelected(RADII, this.styleValue("radius") || "inherit");
  }
  get shadowOptions() {
    return this.withSelected(SHADOWS, this.styleValue("shadow") || "none");
  }

  /** Read a style value resolved for the device currently being edited. */
  styleValue(key) {
    return (
      bpValue(
        this.selectedSection &&
          this.selectedSection.style &&
          this.selectedSection.style[key],
        this.device
      ) || ""
    );
  }

  // ---- border ----------------------------------------------------------
  get border() {
    return bpValue(this.selectedSection?.style?.border, this.device) || {};
  }
  get borderWidth() {
    return Number(this.border.width || 0);
  }
  get borderColor() {
    return this.border.color || "#e5e7eb";
  }
  get borderStyleOptions() {
    return this.withSelected(BORDER_STYLES, this.border.style || "solid");
  }
  /** Style and colour are noise until there's actually a border to see. */
  get hasBorder() {
    return this.borderWidth > 0;
  }

  // ---- gradient --------------------------------------------------------
  get gradient() {
    return bpValue(this.selectedSection?.style?.gradient, this.device) || {};
  }
  get gradientFrom() {
    return this.gradient.from || "#1f3d5c";
  }
  get gradientTo() {
    return this.gradient.to || "#ff5b04";
  }
  get gradientAngle() {
    return this.gradient.angle === undefined ? 135 : this.gradient.angle;
  }
  get isGradient() {
    return (this.styleValue("background") || "surface") === "gradient";
  }

  // ---- hover -----------------------------------------------------------
  // Hover is pointer-only, so it is deliberately not per-breakpoint: read and
  // write it at base whatever device is being previewed.
  get hover() {
    return bpValue(this.selectedSection?.style?.hover) || {};
  }
  get hoverOptions() {
    return this.withSelected(HOVER_EFFECTS, this.hover.effect || "none");
  }

  // ---- row (layout container) -------------------------------------------
  get isRow() {
    return this.selectedSection?.type === "row";
  }
  get rowContent() {
    return (this.selectedSection && this.selectedSection.content) || {};
  }
  get rowColumnCount() {
    return (this.rowContent.columns || []).length || 2;
  }
  /** Count options 1..max, extended to include the current count if a mode
   *  switch left the row holding more than this mode's usual maximum. */
  countOptions(max, noun) {
    const count = this.rowColumnCount;
    const top = Math.max(max, count);
    const opts = [];
    for (let n = 1; n <= top; n += 1) {
      opts.push({
        value: String(n),
        label: `${n} ${n === 1 ? noun : `${noun}s`}`
      });
    }
    return this.withSelected(opts, String(count));
  }
  get columnCountOptions() {
    return this.countOptions(MAX_COLUMNS, "column");
  }
  get cellCountOptions() {
    return this.countOptions(MAX_GRID_CELLS, "cell");
  }
  get gapOptions() {
    return this.withSelected(GAPS, this.styleValue("gap") || "M");
  }

  handleColumnCount(event) {
    store.setRowColumns(this.pageId, this.sectionId, event.target.value);
  }

  // ---- row layout modes -------------------------------------------------
  get rowLayoutMode() {
    const mode = this.rowContent.layoutMode;
    return mode === "flex" || mode === "grid" ? mode : "columns";
  }
  get layoutModes() {
    return LAYOUT_MODES.map((m) => ({
      ...m,
      cssClass: m.value === this.rowLayoutMode ? "seg seg_on" : "seg"
    }));
  }
  get isFlexMode() {
    return this.rowLayoutMode === "flex";
  }
  get isGridMode() {
    return this.rowLayoutMode === "grid";
  }
  /** Grid cells are always equal, so per-column widths only apply otherwise. */
  get showColumnWidths() {
    return !this.isGridMode;
  }

  get rowFlex() {
    return this.rowContent.flex || {};
  }
  get flexDirectionOptions() {
    return this.withSelected(FLEX_DIRECTIONS, this.rowFlex.direction || "row");
  }
  get flexJustifyOptions() {
    return this.withSelected(FLEX_JUSTIFY, this.rowFlex.justify || "start");
  }
  get flexAlignOptions() {
    return this.withSelected(FLEX_ALIGN, this.rowFlex.align || "stretch");
  }
  get flexWraps() {
    return this.rowFlex.wrap !== false;
  }
  get gridColsOptions() {
    return this.withSelected(GRID_COLS, String(this.rowContent.gridCols || 3));
  }

  /** View models for the per-column width editor. */
  get rowColumns() {
    return (this.rowContent.columns || []).map((c, i) => {
      const mode =
        c.widthMode === "percent" || c.widthMode === "auto"
          ? c.widthMode
          : "span";
      return {
        colId: c.colId,
        label: `Col ${i + 1}`,
        modeOptions: WIDTH_MODES.map((m) => ({
          ...m,
          selected: m.value === mode
        })),
        isSpan: mode === "span",
        isPercent: mode === "percent",
        isAuto: mode === "auto",
        span: c.span || 6,
        percent: c.percent == null ? 50 : c.percent
      };
    });
  }

  handleLayoutMode(event) {
    store.updateRowLayout(this.pageId, this.sectionId, {
      layoutMode: event.currentTarget.dataset.mode
    });
  }
  handleGridCols(event) {
    store.updateRowLayout(this.pageId, this.sectionId, {
      gridCols: Number(event.target.value)
    });
  }
  handleFlexDirection(event) {
    store.updateRowLayout(this.pageId, this.sectionId, {
      flex: { direction: event.target.value }
    });
  }
  handleFlexWrap(event) {
    store.updateRowLayout(this.pageId, this.sectionId, {
      flex: { wrap: event.target.checked }
    });
  }
  handleFlexJustify(event) {
    store.updateRowLayout(this.pageId, this.sectionId, {
      flex: { justify: event.target.value }
    });
  }
  handleFlexAlign(event) {
    store.updateRowLayout(this.pageId, this.sectionId, {
      flex: { align: event.target.value }
    });
  }
  handleColWidthMode(event) {
    store.updateRowColumn(
      this.pageId,
      this.sectionId,
      event.currentTarget.dataset.colId,
      {
        widthMode: event.target.value
      }
    );
  }
  handleColSpan(event) {
    const span = Math.max(1, Math.min(12, Number(event.target.value) || 6));
    store.updateRowColumn(
      this.pageId,
      this.sectionId,
      event.currentTarget.dataset.colId,
      { span }
    );
  }
  handleColPercent(event) {
    const percent = Math.max(
      5,
      Math.min(100, Number(event.target.value) || 50)
    );
    store.updateRowColumn(
      this.pageId,
      this.sectionId,
      event.currentTarget.dataset.colId,
      { percent }
    );
  }

  // ---- breakpoint editing ----------------------------------------------
  get deviceLabel() {
    return DEVICE_LABELS[this.device] || "Desktop";
  }
  /** Desktop IS the base value; only narrower devices author overrides. */
  get isBaseDevice() {
    return (this.device || "desktop") === "desktop";
  }
  get showBreakpointBar() {
    return !!this.selectedSection && !this.isBaseDevice;
  }
  get overriddenLabel() {
    return overriddenAt(this.selectedSection?.style, this.device)
      .map((k) => STYLE_LABELS[k] || k)
      .join(", ");
  }
  get hasOverrides() {
    return !!this.overriddenLabel;
  }

  handleResetOverrides() {
    store.clearSectionStyleOverrides(this.pageId, this.sectionId, this.device);
  }

  withSelected(options, current) {
    return options.map((o) => ({ ...o, selected: o.value === current }));
  }

  // ---- grid placement --------------------------------------------------
  get layout() {
    return (this.selectedSection && this.selectedSection.layout) || {};
  }

  get placements() {
    const start = this.layout.colStart || 1;
    const span = this.layout.colSpan || 12;
    return PLACEMENTS.map((p) => {
      const selected = p.colStart === start && p.colSpan === span;
      // 12-cell mini preview showing which columns the block occupies.
      const cells = [];
      for (let i = 1; i <= 12; i++) {
        const on = i >= p.colStart && i < p.colStart + p.colSpan;
        cells.push({
          key: i,
          cssClass: on ? "mini__cell mini__cell_on" : "mini__cell"
        });
      }
      return {
        id: p.id,
        label: p.label,
        colStart: p.colStart,
        colSpan: p.colSpan,
        cells,
        cssClass: selected ? "place place_on" : "place"
      };
    });
  }

  get valigns() {
    const current = this.layout.valign || "center";
    return VALIGNS.map((v) => ({
      value: v.value,
      label: v.label,
      cssClass: v.value === current ? "seg seg_on" : "seg"
    }));
  }

  // ---- image control (hero / imageText) -------------------------------
  get supportsImage() {
    return !!this.selectedSection && IMAGE_TYPES.has(this.selectedSection.type);
  }
  get sectionBackgroundIsImage() {
    return this.selectedSection?.style?.background === "image";
  }
  get sectionParallax() {
    return !!this.selectedSection?.style?.parallax;
  }
  handleParallaxToggle(event) {
    store.updateSectionStyle(this.pageId, this.sectionId, {
      parallax: event.target.checked
    });
  }
  get currentImageUrl() {
    return (
      (this.selectedSection &&
        this.selectedSection.content &&
        this.selectedSection.content.imageUrl) ||
      ""
    );
  }
  get uploadSiteId() {
    return store.getRecordId();
  }
  get currentFocalX() {
    const f = this.selectedSection?.content?.focal;
    return f && f.x != null ? f.x : 50;
  }
  get currentFocalY() {
    const f = this.selectedSection?.content?.focal;
    return f && f.y != null ? f.y : 50;
  }

  // ---- media filter (hero / imageText / gallery) ------------------------
  get supportsMediaFilter() {
    return (
      !!this.selectedSection &&
      MEDIA_FILTER_TYPES.has(this.selectedSection.type)
    );
  }
  get mediaFilterOptions() {
    return this.withSelected(
      MEDIA_FILTERS,
      this.styleValue("mediaFilter") || "none"
    );
  }
  handleMediaFilterChange(event) {
    store.updateSectionStyle(this.pageId, this.sectionId, {
      mediaFilter: event.target.value
    });
  }

  // ---- background video (hero only) --------------------------------------
  // Same gating shape as supportsImage above — shown for the type
  // regardless of which background is currently selected, since picking a
  // video (like picking an image) auto-switches the Background dropdown.
  get supportsBgVideo() {
    return this.selectedSection?.type === "hero";
  }
  get bgVideoUrl() {
    return this.selectedSection?.content?.bgVideoUrl || "";
  }
  get bgVideoEmbedUrl() {
    return this.selectedSection?.content?.bgVideoEmbed?.embedUrl || "";
  }
  handleBgVideoUploaded(event) {
    const { assetId, url } = event.detail;
    store.touchRecentAsset(assetId);
    store.updateSectionContent(this.pageId, this.sectionId, {
      bgVideoAssetId: assetId,
      bgVideoUrl: url,
      bgVideoEmbed: null
    });
    store.updateSectionStyle(this.pageId, this.sectionId, {
      background: "video"
    });
  }
  handleBgVideoEmbedSet(event) {
    const { provider, embedUrl } = event.detail;
    store.updateSectionContent(this.pageId, this.sectionId, {
      bgVideoEmbed: { provider, embedUrl },
      bgVideoAssetId: null,
      bgVideoUrl: null
    });
    store.updateSectionStyle(this.pageId, this.sectionId, {
      background: "video"
    });
  }
  handleBgVideoRemove() {
    store.updateSectionContent(this.pageId, this.sectionId, {
      bgVideoAssetId: null,
      bgVideoUrl: null,
      bgVideoEmbed: null
    });
  }

  // ---- draggable placement bar ----------------------------------------
  get isDragging() {
    return this.dragMode !== null;
  }
  get effCol() {
    return this.isDragging ? this.previewCol : this.layout.colStart || 1;
  }
  get effSpan() {
    return this.isDragging ? this.previewSpan : this.layout.colSpan || 12;
  }
  get segStyle() {
    const left = ((this.effCol - 1) / 12) * 100;
    const width = (this.effSpan / 12) * 100;
    return `left:${left}%;width:${width}%`;
  }
  get dragHint() {
    return `Columns ${this.effCol}–${this.effCol + this.effSpan - 1} of 12`;
  }

  // ---- page settings ---------------------------------------------------
  get pageTitle() {
    return this.activePage ? this.activePage.title : "";
  }
  get pageSlug() {
    return this.activePage ? this.activePage.slug : "";
  }
  get pageInNav() {
    return this.activePage ? this.activePage.inNav : false;
  }
  get pageIsHome() {
    return this.activePage ? this.activePage.isHome : false;
  }

  // ---- SEO & social sharing --------------------------------------------
  get seo() {
    return (this.activePage && this.activePage.seo) || {};
  }
  get seoMetaTitle() {
    return this.seo.metaTitle || "";
  }
  get seoMetaDescription() {
    return this.seo.metaDescription || "";
  }
  get seoDescCount() {
    return this.seoMetaDescription.length;
  }
  get seoDescCountLabel() {
    return `${this.seoDescCount} / 160`;
  }
  /** Warn once past what Google will show, without blocking longer text. */
  get seoDescCountClass() {
    return this.seoDescCount > 160
      ? "seo__count seo__count_over"
      : "seo__count";
  }
  get socialImageUrl() {
    return this.seo.socialImageUrl || "";
  }
  get hasSocialImage() {
    return !!this.socialImageUrl;
  }
  get socialImageStyle() {
    return this.socialImageUrl
      ? `background-image:url('${this.socialImageUrl}')`
      : "";
  }

  // Live search/social preview card. Title and description fall back to the
  // page title and a hint when their SEO overrides are blank, so the card
  // always shows something realistic.
  get previewTitle() {
    return this.seoMetaTitle || this.pageTitle || "Untitled page";
  }
  get previewDescription() {
    return (
      this.seoMetaDescription ||
      "Add a meta description to control the snippet shown in Google and when the page is shared."
    );
  }
  get previewDomain() {
    const base = (this.siteName || "your website")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 30);
    return `${base || "yourwebsite"}.com`;
  }
  get previewUrl() {
    const slug = this.pageSlug;
    return this.pageIsHome || !slug || slug === "home"
      ? this.previewDomain
      : `${this.previewDomain}/${slug}`;
  }

  handleSeoTitle(event) {
    store.updatePageSeo(this.pageId, { metaTitle: event.target.value });
  }
  handleSeoDescription(event) {
    store.updatePageSeo(this.pageId, { metaDescription: event.target.value });
  }
  handleSocialImageUploaded(event) {
    const { assetId, url } = event.detail;
    store.touchRecentAsset(assetId);
    store.updatePageSeo(this.pageId, {
      socialImageAssetId: assetId,
      socialImageUrl: url
    });
  }
  handleSocialImageRemove() {
    store.updatePageSeo(this.pageId, {
      socialImageAssetId: null,
      socialImageUrl: null
    });
  }

  // ---- site-wide SEO defaults --------------------------------------------
  // Fallbacks a page's own SEO fields (above) take priority over. Not tied to
  // any one page, so this group renders regardless of which page is active.
  get siteSeoTitleSuffix() {
    return this.siteSeo.titleSuffix || "";
  }
  get siteSeoCanonicalDomain() {
    return this.siteSeo.canonicalDomain || "";
  }
  get siteSeoRobotsIndex() {
    return this.siteSeo.robotsIndex !== false;
  }
  get siteSeoDefaultImageUrl() {
    return this.siteSeo.defaultSocialImageUrl || "";
  }
  get hasSiteSeoDefaultImage() {
    return !!this.siteSeoDefaultImageUrl;
  }

  handleSiteSeoTitleSuffix(event) {
    store.updateSiteSeo({ titleSuffix: event.target.value });
  }
  handleSiteSeoCanonicalDomain(event) {
    store.updateSiteSeo({ canonicalDomain: event.target.value.trim() });
  }
  handleSiteSeoRobotsToggle(event) {
    store.updateSiteSeo({ robotsIndex: event.target.checked });
  }
  handleSiteSeoDefaultImageUploaded(event) {
    const { assetId, url } = event.detail;
    store.touchRecentAsset(assetId);
    store.updateSiteSeo({
      defaultSocialImageAssetId: assetId,
      defaultSocialImageUrl: url
    });
  }
  handleSiteSeoDefaultImageRemove() {
    store.updateSiteSeo({
      defaultSocialImageAssetId: null,
      defaultSocialImageUrl: null
    });
  }

  // Sitemap/robots are generated client-side from the pages already in this
  // panel — there's no public domain wired up to serve them at a URL yet
  // (see c/siteSeoTools), so "Copy" is the honest affordance for now rather
  // than a link that would 404.
  get seoDomainConfig() {
    return { pages: this.pages, meta: { seo: this.siteSeo } };
  }
  get hasCanonicalDomain() {
    return !!this.siteSeoCanonicalDomain;
  }
  get sitemapDisabled() {
    return !this.hasCanonicalDomain;
  }

  async handleCopySitemap() {
    const xml = buildSitemapXml(this.seoDomainConfig);
    await this.copyToClipboard(xml, "sitemapText");
  }
  async handleCopyRobots() {
    const txt = buildRobotsTxt(this.seoDomainConfig);
    await this.copyToClipboard(txt, "robotsText");
  }
  async copyToClipboard(text, flagField) {
    try {
      await navigator.clipboard.writeText(text || "");
      this[flagField] = "Copied!";
    } catch {
      this[flagField] = text || "";
    }
    // eslint-disable-next-line @lwc/lwc/no-async-operation -- transient "Copied!" flash
    window.setTimeout(() => {
      this[flagField] = "";
    }, 2000);
  }

  // ---- marketing: announcement bar & promo popup -------------------------
  get announcementBar() {
    return this.marketing.announcementBar || {};
  }
  get barEnabled() {
    return !!this.announcementBar.enabled;
  }
  get barText() {
    return this.announcementBar.text || "";
  }
  get barCtaLabel() {
    return this.announcementBar.ctaLabel || "";
  }
  get barCtaTarget() {
    return this.announcementBar.ctaTarget || "";
  }
  get barDismissible() {
    return this.announcementBar.dismissible !== false;
  }
  handleBarEnabled(event) {
    store.updateAnnouncementBar({ enabled: event.target.checked });
  }
  handleBarText(event) {
    store.updateAnnouncementBar({ text: event.target.value });
  }
  handleBarCtaLabel(event) {
    store.updateAnnouncementBar({ ctaLabel: event.target.value });
  }
  handleBarCtaTarget(event) {
    store.updateAnnouncementBar({ ctaTarget: event.target.value });
  }
  handleBarDismissible(event) {
    store.updateAnnouncementBar({ dismissible: event.target.checked });
  }

  get popup() {
    return this.marketing.popup || {};
  }
  get popupEnabled() {
    return !!this.popup.enabled;
  }
  get popupHeading() {
    return this.popup.heading || "";
  }
  get popupBody() {
    return this.popup.body || "";
  }
  get popupCtaLabel() {
    return this.popup.ctaLabel || "";
  }
  get popupCtaTarget() {
    return this.popup.ctaTarget || "";
  }
  get popupTriggerOptions() {
    return this.selectOptions(
      [
        ["delay", "After a delay"],
        ["scroll", "After scrolling"],
        ["exit", "When leaving the page"]
      ],
      this.popup.trigger || "delay"
    );
  }
  get popupTrigger() {
    return this.popup.trigger || "delay";
  }
  get isDelayTrigger() {
    return this.popupTrigger === "delay";
  }
  get isScrollTrigger() {
    return this.popupTrigger === "scroll";
  }
  get popupDelaySeconds() {
    return this.popup.delaySeconds || 5;
  }
  get popupScrollPercent() {
    return this.popup.scrollPercent || 50;
  }
  get popupDismissDays() {
    return this.popup.dismissDays || 7;
  }
  handlePopupEnabled(event) {
    store.updateMarketingPopup({ enabled: event.target.checked });
  }
  handlePopupHeading(event) {
    store.updateMarketingPopup({ heading: event.target.value });
  }
  handlePopupBody(event) {
    store.updateMarketingPopup({ body: event.target.value });
  }
  handlePopupCtaLabel(event) {
    store.updateMarketingPopup({ ctaLabel: event.target.value });
  }
  handlePopupCtaTarget(event) {
    store.updateMarketingPopup({ ctaTarget: event.target.value });
  }
  handlePopupTrigger(event) {
    store.updateMarketingPopup({ trigger: event.target.value });
  }
  handlePopupDelaySeconds(event) {
    store.updateMarketingPopup({
      delaySeconds: Number(event.target.value) || 5
    });
  }
  handlePopupScrollPercent(event) {
    store.updateMarketingPopup({
      scrollPercent: Number(event.target.value) || 50
    });
  }
  handlePopupDismissDays(event) {
    store.updateMarketingPopup({
      dismissDays: Number(event.target.value) || 7
    });
  }

  // ---- business contact & social links -----------------------------------
  get contactEmail() {
    return this.siteContact.email || "";
  }
  get contactPhone() {
    return this.siteContact.phone || "";
  }
  get contactAddress() {
    return this.siteContact.address || "";
  }
  get contactHours() {
    return this.siteContact.hours || "";
  }
  handleContactEmail(event) {
    store.updateSiteContact({ email: event.target.value });
  }
  handleContactPhone(event) {
    store.updateSiteContact({ phone: event.target.value });
  }
  handleContactAddress(event) {
    store.updateSiteContact({ address: event.target.value });
  }
  handleContactHours(event) {
    store.updateSiteContact({ hours: event.target.value });
  }
  get socialInstagram() {
    return this.siteSocial.instagram || "";
  }
  get socialFacebook() {
    return this.siteSocial.facebook || "";
  }
  get socialLinkedin() {
    return this.siteSocial.linkedin || "";
  }
  handleSocialInstagram(event) {
    store.updateSiteSocial({ instagram: event.target.value });
  }
  handleSocialFacebook(event) {
    store.updateSiteSocial({ facebook: event.target.value });
  }
  handleSocialLinkedin(event) {
    store.updateSiteSocial({ linkedin: event.target.value });
  }

  toggleMarketingGroup() {
    this.marketingGroupOpen = !this.marketingGroupOpen;
  }
  get marketingChevron() {
    return this.marketingGroupOpen ? "▾" : "▸";
  }

  // ---- advanced: custom CSS -----------------------------------------------
  toggleAdvancedGroup() {
    this.advancedGroupOpen = !this.advancedGroupOpen;
  }
  get advancedChevron() {
    return this.advancedGroupOpen ? "▾" : "▸";
  }
  get customCss() {
    return this.customCode.css || "";
  }
  handleCustomCss(event) {
    store.updateCustomCss(event.target.value);
  }

  // ---- parent page (one-level nesting) ---------------------------------
  /** True when the active page already has subpages — so it can't itself be
   *  nested (nesting is capped at one level). */
  get pageHasChildren() {
    const page = this.activePage;
    return !!page && (this.pages || []).some((p) => p.parentId === page.pageId);
  }

  /** None + every eligible top-level page (not self, not the current page). */
  get parentOptions() {
    const page = this.activePage;
    if (!page) {
      return [];
    }
    const opts = [
      { value: "", label: "None (top level)", selected: !page.parentId }
    ];
    (this.pages || [])
      .filter((p) => !p.parentId && p.pageId !== page.pageId)
      .forEach((p) =>
        opts.push({
          value: p.pageId,
          label: p.title,
          selected: page.parentId === p.pageId
        })
      );
    return opts;
  }

  handlePageParent(event) {
    store.setPageParent(this.pageId, event.target.value || null);
  }

  handleDuplicatePage() {
    const newId = store.duplicatePage(this.pageId);
    if (newId) {
      // Selection is the shell's to own; ask it to switch to the copy.
      this.dispatchEvent(
        new CustomEvent("selectpage", { detail: { pageId: newId } })
      );
    }
  }

  // ---- writes ----------------------------------------------------------
  get pageId() {
    return this.activePage && this.activePage.pageId;
  }
  get sectionId() {
    return this.selectedSection && this.selectedSection.sectionId;
  }

  handleContentChange(event) {
    const key = event.currentTarget.dataset.key;
    store.updateSectionContent(this.pageId, this.sectionId, {
      [key]: event.target.value
    });
  }

  handleVariantChange(event) {
    store.updateSectionVariant(this.pageId, this.sectionId, event.target.value);
  }

  handleStyleChange(event) {
    const key = event.currentTarget.dataset.key;
    store.updateSectionStyle(
      this.pageId,
      this.sectionId,
      { [key]: event.target.value },
      this.device
    );
  }

  /*
   * border/gradient/hover are composite values, so each handler rebuilds the
   * whole object from the resolved getters before applying the one field that
   * changed. Spreading the raw stored value instead would persist a partial
   * object the first time any single field is touched.
   */
  handleBorderChange(event) {
    const key = event.currentTarget.dataset.key; // width | style | color
    const next = {
      width: this.borderWidth,
      style: this.border.style || "solid",
      color: this.borderColor,
      [key]: key === "width" ? Number(event.target.value) : event.target.value
    };
    store.updateSectionStyle(
      this.pageId,
      this.sectionId,
      { border: next },
      this.device
    );
  }

  handleGradientChange(event) {
    const key = event.currentTarget.dataset.key; // from | to | angle
    const next = {
      from: this.gradientFrom,
      to: this.gradientTo,
      angle: this.gradientAngle,
      [key]: key === "angle" ? Number(event.target.value) : event.target.value
    };
    store.updateSectionStyle(
      this.pageId,
      this.sectionId,
      { gradient: next },
      this.device
    );
  }

  handleHoverChange(event) {
    store.updateSectionStyle(
      this.pageId,
      this.sectionId,
      { hover: { effect: event.target.value } },
      this.device
    );
  }

  handlePlacement(event) {
    const el = event.currentTarget;
    store.updateSectionLayout(this.pageId, this.sectionId, {
      colStart: parseInt(el.dataset.start, 10),
      colSpan: parseInt(el.dataset.span, 10)
    });
  }

  handleValign(event) {
    store.updateSectionLayout(this.pageId, this.sectionId, {
      valign: event.currentTarget.dataset.valign
    });
  }

  // ---- image handlers --------------------------------------------------
  handleImageUploaded(event) {
    const { assetId, url } = event.detail;
    store.touchRecentAsset(assetId);
    store.updateSectionContent(this.pageId, this.sectionId, {
      imageAssetId: assetId,
      imageUrl: url
    });
    if (this.selectedSection.type === "hero") {
      store.updateSectionStyle(this.pageId, this.sectionId, {
        background: "image"
      });
    }
  }
  handleImageRemove() {
    store.updateSectionContent(this.pageId, this.sectionId, {
      imageAssetId: null,
      imageUrl: null,
      focal: null
    });
  }
  handleFocalChange(event) {
    store.updateSectionContent(this.pageId, this.sectionId, {
      focal: event.detail
    });
  }

  // ---- crop ------------------------------------------------------------
  // The cropper uploads the cropped region as a new asset and reports it
  // through the same {assetId, url} contract as an upload, so a crop is just
  // another way to set the section's image — reuse handleImageUploaded.
  cropperOpen = false;
  openCropper() {
    this.cropperOpen = true;
  }
  closeCropper() {
    this.cropperOpen = false;
  }
  handleCropped(event) {
    this.handleImageUploaded(event);
    this.cropperOpen = false;
  }

  // ---- placement drag --------------------------------------------------
  startMove(event) {
    this.beginDrag(event, "move");
  }
  startLeft(event) {
    event.stopPropagation();
    this.beginDrag(event, "left");
  }
  startRight(event) {
    event.stopPropagation();
    this.beginDrag(event, "right");
  }

  beginDrag(event, mode) {
    event.preventDefault();
    const track = this.template.querySelector(".dragtrack");
    this._trackW = track ? track.clientWidth : 1;
    this._startX = event.clientX;
    this._startCol = this.layout.colStart || 1;
    this._startSpan = this.layout.colSpan || 12;
    this.previewCol = this._startCol;
    this.previewSpan = this._startSpan;
    this.dragMode = mode;
    window.addEventListener("pointermove", this._onMove);
    window.addEventListener("pointerup", this._onUp);
  }

  onDragMove(event) {
    if (!this.dragMode) {
      return;
    }
    const colW = this._trackW / 12 || 1;
    const delta = Math.round((event.clientX - this._startX) / colW);
    const startEnd = this._startCol + this._startSpan - 1;
    if (this.dragMode === "move") {
      const maxStart = 12 - this._startSpan + 1;
      this.previewCol = Math.min(Math.max(this._startCol + delta, 1), maxStart);
      this.previewSpan = this._startSpan;
    } else if (this.dragMode === "left") {
      const newStart = Math.min(Math.max(this._startCol + delta, 1), startEnd);
      this.previewCol = newStart;
      this.previewSpan = startEnd - newStart + 1;
    } else {
      const newEnd = Math.min(Math.max(startEnd + delta, this._startCol), 12);
      this.previewCol = this._startCol;
      this.previewSpan = newEnd - this._startCol + 1;
    }
  }

  onDragEnd() {
    if (!this.dragMode) {
      return;
    }
    const col = this.previewCol;
    const span = this.previewSpan;
    this.detachDragListeners();
    this.dragMode = null;
    this.previewCol = null;
    this.previewSpan = null;
    // Commit once, so the whole drag is a single undo step.
    store.updateSectionLayout(this.pageId, this.sectionId, {
      colStart: col,
      colSpan: span
    });
  }

  detachDragListeners() {
    window.removeEventListener("pointermove", this._onMove);
    window.removeEventListener("pointerup", this._onUp);
  }

  handlePageTitle(event) {
    store.updatePage(this.pageId, { title: event.target.value });
  }

  handlePageSlug(event) {
    store.updatePage(this.pageId, { slug: event.target.value });
  }

  handlePageNav(event) {
    store.updatePage(this.pageId, { inNav: event.target.checked });
  }

  handleSetHome() {
    store.setHomePage(this.pageId);
  }
}