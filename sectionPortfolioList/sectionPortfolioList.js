/**
 * sectionPortfolioList — F8b CMS: renders live from
 * Websuite_Portfolio_Item__c records (getActivePortfolioItems), same
 * "dynamic, not SiteConfig" pattern as sectionBlogList/sectionShop. Items
 * are managed from the Properties panel's "Manage portfolio" button (see
 * portfolioManagerModal), not inline here.
 */
import { LightningElement, api } from "lwc";
import getActivePortfolioItems from "@salesforce/apex/WebsuitePortfolioController.getActivePortfolioItems";
import {
  sectionRootClass,
  sectionRootStyle,
  fieldStyle,
  commitField
} from "c/sectionCommon";

export default class SectionPortfolioList extends LightningElement {
  @api content = {};
  @api sectionStyle = {};
  @api variant = "grid";
  @api layout = {};
  @api mode = "live";
  @api siteId;

  items = [];
  loading = false;
  _loadedFor;

  get isEdit() {
    return this.mode === "edit";
  }
  get rootClass() {
    return sectionRootClass("sec_portfoliolist", {
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
  get gridClass() {
    return this.variant === "list"
      ? "portfoliolist__grid portfoliolist__grid_list"
      : "portfoliolist__grid";
  }
  get editableAttr() {
    return this.isEdit ? "true" : "false";
  }

  get hasItems() {
    return this.items.length > 0;
  }
  get hasSite() {
    return !!this.siteId;
  }
  get showEmptyNoSite() {
    return this.isEdit && !this.hasSite;
  }
  get showEmptyNoItems() {
    return this.isEdit && this.hasSite && !this.loading && !this.hasItems;
  }

  renderedCallback() {
    if (!this.siteId || this.siteId === this._loadedFor) {
      return;
    }
    this._loadedFor = this.siteId;
    this.loading = true;
    getActivePortfolioItems({ siteId: this.siteId })
      .then((rows) => {
        this.items = (rows || []).map((i) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          hasCategory: !!i.category,
          description: i.description,
          hasImage: !!i.imageUrl,
          imageStyle: i.imageUrl ? `background-image:url('${i.imageUrl}')` : "",
          projectUrl: i.projectUrl,
          hasProjectUrl: !!i.projectUrl
        }));
      })
      .catch(() => {
        this.items = [];
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