/**
 * sectionTeamList — F8b CMS: renders live from Websuite_Team_Member__c records
 * (getActiveTeamMembers), same "dynamic, not SiteConfig" pattern as
 * sectionBlogList/sectionShop. Members are managed from the Properties
 * panel's "Manage team" button (see teamManagerModal), not inline here.
 *
 * Distinct from the existing static `team` section type, whose people live as
 * a plain content.items array — this one is the DB-backed CMS collection.
 */
import { LightningElement, api } from "lwc";
import getActiveTeamMembers from "@salesforce/apex/WebsuiteTeamController.getActiveTeamMembers";
import {
  sectionRootClass,
  sectionRootStyle,
  fieldStyle,
  commitField
} from "c/sectionCommon";

export default class SectionTeamList extends LightningElement {
  @api content = {};
  @api sectionStyle = {};
  @api variant = "grid";
  @api layout = {};
  @api mode = "live";
  @api siteId;

  members = [];
  loading = false;
  _loadedFor;

  get isEdit() {
    return this.mode === "edit";
  }
  get rootClass() {
    return sectionRootClass("sec_teamlist", {
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

  get hasMembers() {
    return this.members.length > 0;
  }
  get hasSite() {
    return !!this.siteId;
  }
  get showEmptyNoSite() {
    return this.isEdit && !this.hasSite;
  }
  get showEmptyNoMembers() {
    return this.isEdit && this.hasSite && !this.loading && !this.hasMembers;
  }

  renderedCallback() {
    if (!this.siteId || this.siteId === this._loadedFor) {
      return;
    }
    this._loadedFor = this.siteId;
    this.loading = true;
    getActiveTeamMembers({ siteId: this.siteId })
      .then((rows) => {
        this.members = (rows || []).map((m) => ({
          id: m.id,
          name: m.name,
          role: m.role,
          bio: m.bio,
          hasPhoto: !!m.photoUrl,
          photoStyle: m.photoUrl ? `background-image:url('${m.photoUrl}')` : "",
          linkedinUrl: m.linkedinUrl,
          hasLinkedin: !!m.linkedinUrl
        }));
      })
      .catch(() => {
        this.members = [];
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