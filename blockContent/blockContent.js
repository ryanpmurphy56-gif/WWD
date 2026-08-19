/**
 * blockContent — renders what is INSIDE a canvas block, and nothing else.
 *
 * Deliberately separate from blockFrame (which owns position, selection chrome
 * and drag handles): this component knows only how to turn a {kind, type,
 * content, style, variant} into markup. That split is what lets the canvas
 * reuse every existing section renderer untouched — a hero block renders
 * through the very same c-section-hero the stacked model used.
 *
 * The type switch mirrors sectionSlot's. It is duplicated rather than shared
 * because sectionSlot's copy is welded to the legacy stacked model (drag-to-
 * reorder, drop targets, row nesting, global refs); pulling those apart while
 * the old editor still has to run would be riskier than one honest duplication.
 * Adding a section type = its LWC + registry entry + one branch in each.
 */
import { LightningElement, api } from "lwc";

export default class BlockContent extends LightningElement {
  @api kind = "section";
  @api type;
  @api content = {};
  @api blockStyle = {};
  @api variant = "default";
  @api layout = {};
  @api mode = "edit";
  @api globals;
  @api navMenu;
  @api siteId;

  // Section renderers still expect an edit/live mode. On the canvas, blocks are
  // never inline-edited while being dragged, so edit chrome inside a section is
  // suppressed by handing them 'live' whenever the canvas is in preview.
  get childMode() {
    return this.mode === "edit" ? "edit" : "live";
  }

  handleContentChange(event) {
    // Re-dispatch so blockFrame → freeCanvas → the store sees inline edits.
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("contentchange", {
        detail: event.detail,
        bubbles: true,
        composed: true
      })
    );
  }

  // ---- element kinds ------------------------------------------------------
  get isElement() {
    return this.kind === "element";
  }
  get isText() {
    return this.isElement && this.type === "text";
  }
  get isImage() {
    return this.isElement && this.type === "image";
  }
  get isButton() {
    return this.isElement && this.type === "button";
  }
  get isVideo() {
    return this.isElement && this.type === "video";
  }
  get isSpacer() {
    return this.isElement && this.type === "spacer";
  }

  get textValue() {
    return this.content?.text || "";
  }
  get buttonLabel() {
    return this.content?.label || "Button";
  }
  get buttonHref() {
    return this.content?.href || "";
  }
  get imageUrl() {
    return this.content?.imageUrl || "";
  }
  get hasImage() {
    return !!this.content?.imageUrl;
  }
  get videoEmbedUrl() {
    return this.content?.videoEmbed?.embedUrl || "";
  }
  get hasVideoEmbed() {
    return !!this.content?.videoEmbed?.embedUrl;
  }
  get hasVideoFile() {
    return !!this.content?.videoUrl;
  }
  get videoUrl() {
    return this.content?.videoUrl || "";
  }
  get editableAttr() {
    return this.mode === "edit" ? "true" : "false";
  }

  handleTextBlur(event) {
    const text = event.target.innerText;
    if (text !== this.textValue) {
      this.dispatchEvent(
        new CustomEvent("contentchange", {
          detail: { patch: { text } },
          bubbles: true,
          composed: true
        })
      );
    }
  }

  // ---- section types (mirrors sectionSlot's switch) -----------------------
  get isSection() {
    return this.kind === "section";
  }
  get isHero() {
    return this.isSection && this.type === "hero";
  }
  get isNavHeader() {
    return this.isSection && this.type === "navHeader";
  }
  get isTextBlock() {
    return this.isSection && this.type === "textBlock";
  }
  get isImageText() {
    return this.isSection && this.type === "imageText";
  }
  get isFeatures() {
    return this.isSection && this.type === "features";
  }
  get isGallery() {
    return this.isSection && this.type === "gallery";
  }
  get isTestimonials() {
    return this.isSection && this.type === "testimonials";
  }
  get isContact() {
    return this.isSection && this.type === "contact";
  }
  get isPricing() {
    return this.isSection && this.type === "pricing";
  }
  get isFooter() {
    return this.isSection && this.type === "footer";
  }
  get isFaq() {
    return this.isSection && this.type === "faq";
  }
  get isCta() {
    return this.isSection && this.type === "cta";
  }
  get isStats() {
    return this.isSection && this.type === "stats";
  }
  get isTeam() {
    return this.isSection && this.type === "team";
  }
  get isLogoStrip() {
    return this.isSection && this.type === "logoStrip";
  }
  get isEmbed() {
    return this.isSection && this.type === "embed";
  }
  get isBlogList() {
    return this.isSection && this.type === "blogList";
  }
  get isShop() {
    return this.isSection && this.type === "shop";
  }
  get isTeamList() {
    return this.isSection && this.type === "teamList";
  }
  get isPortfolioList() {
    return this.isSection && this.type === "portfolioList";
  }
  get isTestimonialList() {
    return this.isSection && this.type === "testimonialList";
  }
  get isEventList() {
    return this.isSection && this.type === "eventList";
  }
}