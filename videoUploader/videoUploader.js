/**
 * videoUploader — the video sibling of imageUploader. Three ways to set a
 * video: upload a file, browse the asset library (video-only), or paste a
 * YouTube/Vimeo link. A file upload/library pick is `uploaded` ({assetId,
 * url}); a pasted link is `embedset` ({provider, embedUrl}) — the two are
 * mutually exclusive on the caller's side (a section stores one or the
 * other), so this component doesn't need to know which is currently active
 * beyond what its @api props tell it to preview.
 */
import { LightningElement, api } from 'lwc';
import { uploadVideoFile } from 'c/assetUpload';
import { parseVideoEmbed } from 'c/sectionCommon';

export default class VideoUploader extends LightningElement {
    @api label = 'Upload video';
    @api siteId;
    @api videoUrl;
    @api embedUrl;

    uploading = false;
    error = '';
    libraryOpen = false;
    linkInput = '';

    get hasVideo() {
        return !!this.videoUrl;
    }
    get hasEmbed() {
        return !!this.embedUrl;
    }
    get hasAny() {
        return this.hasVideo || this.hasEmbed;
    }
    get buttonLabel() {
        if (this.uploading) {
            return 'Uploading…';
        }
        return this.hasVideo ? 'Replace' : this.label;
    }
    // The library lists files linked to the site record — an unsaved draft has
    // nothing to link to yet, so the button only appears once a site exists.
    get canBrowse() {
        return !!this.siteId;
    }

    openLibrary() {
        this.libraryOpen = true;
    }
    closeLibrary() {
        this.libraryOpen = false;
    }
    // Re-emit a library pick through the same `uploaded` contract, so callers
    // don't care whether the video was freshly uploaded or reused.
    handleLibrarySelect(event) {
        this.libraryOpen = false;
        this.dispatchEvent(new CustomEvent('uploaded', { detail: event.detail }));
    }

    openPicker() {
        this.template.querySelector('input[type="file"]').click();
    }

    handleChange(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = ''; // let the same file be picked again later
        if (!file) {
            return;
        }
        this.uploading = true;
        this.error = '';
        uploadVideoFile(file, this.siteId)
            .then((res) => this.dispatchEvent(new CustomEvent('uploaded', { detail: res })))
            .catch((e) => {
                this.error = e.message;
            })
            .finally(() => {
                this.uploading = false;
            });
    }

    handleLinkInput(event) {
        this.linkInput = event.target.value;
    }

    handleLinkSet() {
        const parsed = parseVideoEmbed(this.linkInput);
        if (!parsed) {
            this.error = "That doesn't look like a YouTube or Vimeo link.";
            return;
        }
        this.error = '';
        this.linkInput = '';
        this.dispatchEvent(new CustomEvent('embedset', { detail: parsed }));
    }

    handleRemove() {
        this.error = '';
        this.dispatchEvent(new CustomEvent('remove'));
    }
}