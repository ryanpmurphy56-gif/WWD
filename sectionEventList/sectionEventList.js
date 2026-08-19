/**
 * sectionEventList — F8b CMS: renders live from Websuite_Event__c records
 * (getActiveEvents, chronological soonest-first), same "dynamic, not
 * SiteConfig" pattern as sectionBlogList/sectionShop. Events are managed
 * from the Properties panel's "Manage events" button (see
 * eventManagerModal), not inline here.
 */
import { LightningElement, api } from "lwc";
import getActiveEvents from "@salesforce/apex/WebsuiteEventController.getActiveEvents";
import {
  sectionRootClass,
  sectionRootStyle,
  fieldStyle,
  commitField
} from "c/sectionCommon";

export default class SectionEventList extends LightningElement {
  @api content = {};
  @api sectionStyle = {};
  @api variant = "grid";
  @api layout = {};
  @api mode = "live";
  @api siteId;

  events = [];
  loading = false;
  _loadedFor;

  get isEdit() {
    return this.mode === "edit";
  }
  get rootClass() {
    return sectionRootClass("sec_eventlist", {
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
      ? "eventlist__grid eventlist__grid_list"
      : "eventlist__grid";
  }
  get editableAttr() {
    return this.isEdit ? "true" : "false";
  }

  get hasEvents() {
    return this.events.length > 0;
  }
  get hasSite() {
    return !!this.siteId;
  }
  get showEmptyNoSite() {
    return this.isEdit && !this.hasSite;
  }
  get showEmptyNoEvents() {
    return this.isEdit && this.hasSite && !this.loading && !this.hasEvents;
  }

  renderedCallback() {
    if (!this.siteId || this.siteId === this._loadedFor) {
      return;
    }
    this._loadedFor = this.siteId;
    this.loading = true;
    getActiveEvents({ siteId: this.siteId })
      .then((rows) => {
        this.events = (rows || []).map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          dateLabel: this.formatDate(e.eventDate),
          location: e.location,
          hasLocation: !!e.location,
          hasImage: !!e.imageUrl,
          imageStyle: e.imageUrl ? `background-image:url('${e.imageUrl}')` : "",
          registrationUrl: e.registrationUrl,
          hasRegistration: !!e.registrationUrl
        }));
      })
      .catch(() => {
        this.events = [];
      })
      .finally(() => {
        this.loading = false;
      });
  }

  formatDate(iso) {
    if (!iso) {
      return "";
    }
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      });
    } catch {
      return "";
    }
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