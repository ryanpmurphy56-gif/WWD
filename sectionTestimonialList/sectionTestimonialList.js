/**
 * sectionTestimonialList — F8b CMS: renders live from
 * Websuite_Testimonial__c records (getActiveTestimonials), same
 * "dynamic, not SiteConfig" pattern as sectionBlogList/sectionShop.
 * Testimonials are managed from the Properties panel's "Manage
 * testimonials" button (see testimonialManagerModal), not inline here.
 *
 * Distinct from the existing static `testimonials` section type, whose
 * quotes live as a plain content.items array — this one is the DB-backed
 * CMS collection.
 */
import { LightningElement, api } from "lwc";
import getActiveTestimonials from "@salesforce/apex/WebsuiteTestimonialController.getActiveTestimonials";
import {
  sectionRootClass,
  sectionRootStyle,
  fieldStyle,
  commitField
} from "c/sectionCommon";

export default class SectionTestimonialList extends LightningElement {
  @api content = {};
  @api sectionStyle = {};
  @api variant = "grid";
  @api layout = {};
  @api mode = "live";
  @api siteId;

  testimonials = [];
  loading = false;
  _loadedFor;

  get isEdit() {
    return this.mode === "edit";
  }
  get rootClass() {
    return sectionRootClass("sec_testimoniallist", {
      variant: this.variant,
      style: this.sectionStyle,
      layout: this.layout,
      mode: this.mode
    });
  }
  get rootStyle() {
    return sectionRootStyle(this.sectionStyle);
  }
  get headingFieldStyle() {
    return fieldStyle(this.sectionStyle?.fields, "heading");
  }
  get heading() {
    return this.content?.heading || "";
  }
  get editableAttr() {
    return this.isEdit ? "true" : "false";
  }

  get hasTestimonials() {
    return this.testimonials.length > 0;
  }
  get hasSite() {
    return !!this.siteId;
  }
  get showEmptyNoSite() {
    return this.isEdit && !this.hasSite;
  }
  get showEmptyNoTestimonials() {
    return this.isEdit && this.hasSite && !this.loading && !this.hasTestimonials;
  }

  renderedCallback() {
    if (!this.siteId || this.siteId === this._loadedFor) {
      return;
    }
    this._loadedFor = this.siteId;
    this.loading = true;
    getActiveTestimonials({ siteId: this.siteId })
      .then((rows) => {
        this.testimonials = (rows || []).map((t) => ({
          id: t.id,
          quote: t.quote,
          authorName: t.authorName,
          roleCompany: t.roleCompany,
          hasPhoto: !!t.photoUrl,
          photoStyle: t.photoUrl ? `background-image:url('${t.photoUrl}')` : ""
        }));
      })
      .catch(() => {
        this.testimonials = [];
      })
      .finally(() => {
        this.loading = false;
      });
  }

  handleKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.target.blur();
    }
  }
  handleHeadingEdit(event) {
    commitField(this, event, this.content);
  }
}