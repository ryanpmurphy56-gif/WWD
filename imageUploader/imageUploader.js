/**
 * imageUploader — a small "upload / replace / remove" image control. Wraps a
 * hidden file input, uploads via assetUpload, and emits `uploaded` ({assetId,
 * url}) or `remove`. Presentational state (uploading, error) only.
 */
import { LightningElement, api } from 'lwc';
import { uploadFile } from 'c/assetUpload';

export default class ImageUploader extends LightningElement {
    @api label = 'Upload image';
    @api siteId;
    @api imageUrl;

    uploading = false;
    error = '';
    libraryOpen = false;

    get hasImage() {
        return !!this.imageUrl;
    }
    get buttonLabel() {
        if (this.uploading) {
            return 'Uploading…';
        }
        return this.hasImage ? 'Replace' : this.label;
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
    // don't care whether the image was freshly uploaded or reused.
    handleLibrarySelect(event) {
        this.libraryOpen = false;
        this.dispatchEvent(new CustomEvent('uploaded', { detail: event.detail }));
    }

    openPicker() {
        this.template.querySelector('input').click();
    }

    handleChange(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = ''; // let the same file be picked again later
        if (!file) {
            return;
        }
        this.uploading = true;
        this.error = '';
        uploadFile(file, this.siteId)
            .then((res) => this.dispatchEvent(new CustomEvent('uploaded', { detail: res })))
            .catch((e) => {
                this.error = e.message;
            })
            .finally(() => {
                this.uploading = false;
            });
    }

    handleRemove() {
        this.dispatchEvent(new CustomEvent('remove'));
    }
}