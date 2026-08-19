/**
 * editorToolbar — the editor's top bar (brief §4.2). Purely presentational: it
 * receives editor state as props and emits intent events; the shell owns the
 * state and does the work. Save state, undo/redo, mode toggle, device toggle,
 * and the persistent "Request a human" exit ramp all live here.
 */
import { LightningElement, api } from 'lwc';

const DEVICES = ['desktop', 'tablet', 'mobile'];
const ZOOM_LEVELS = [50, 75, 100, 125, 150];

export default class EditorToolbar extends LightningElement {
    @api siteName = 'Untitled site';
    @api mode = 'edit';
    @api device = 'desktop';
    @api zoom = 100;
    @api dirty = false;
    @api saving = false;
    @api canUndo = false;
    @api canRedo = false;
    @api statusText = '';
    @api isFullscreen = false;
    @api isPublished = false;
    @api publishing = false;
    @api publishedAt = null;
    @api reviewStatus = 'Not Submitted';
    @api submittedAt = null;

    get fullscreenIcon() {
        return this.isFullscreen ? '⤢' : '⛶';
    }

    get fullscreenTitle() {
        return this.isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
    }

    get isEdit() {
        return this.mode === 'edit';
    }

    get modeButtonLabel() {
        return this.isEdit ? 'Preview' : 'Edit';
    }

    get devices() {
        return DEVICES.map((name) => ({
            name,
            label: name.charAt(0).toUpperCase() + name.slice(1),
            selected: name === this.device
        }));
    }

    get zoomLabel() {
        return `${this.zoom}%`;
    }
    get zoomOutDisabled() {
        return ZOOM_LEVELS.indexOf(this.zoom) <= 0;
    }
    get zoomInDisabled() {
        const i = ZOOM_LEVELS.indexOf(this.zoom);
        return i === -1 || i >= ZOOM_LEVELS.length - 1;
    }

    get saveLabel() {
        if (this.saving) {
            return 'Saving…';
        }
        return this.dirty ? 'Save' : 'Saved';
    }

    get saveDisabled() {
        return this.saving || !this.dirty;
    }

    get publishLabel() {
        if (this.publishing) {
            return 'Submitting…';
        }
        return this.reviewStatus === 'Pending Review' ? 'Pending Review' : 'Submit for Review';
    }

    get publishDisabled() {
        return this.publishing || this.reviewStatus === 'Pending Review';
    }

    get publishStatusLabel() {
        if (this.isPublished && this.publishedAt) {
            return `Live · published ${new Date(this.publishedAt).toLocaleString()}`;
        }
        if (this.reviewStatus === 'Pending Review' && this.submittedAt) {
            return `Submitted ${new Date(this.submittedAt).toLocaleString()} · awaiting review`;
        }
        return 'Not published';
    }

    get undoDisabled() {
        return !this.canUndo;
    }

    get redoDisabled() {
        return !this.canRedo;
    }

    fire(name, detail) {
        this.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));
    }

    toggleMode() {
        this.fire('modetoggle');
    }

    handleDevice(event) {
        this.fire('devicechange', { device: event.target.value });
    }

    handleZoomOut() {
        const i = ZOOM_LEVELS.indexOf(this.zoom);
        if (i > 0) {
            this.fire('zoomchange', { zoom: ZOOM_LEVELS[i - 1] });
        }
    }

    handleZoomIn() {
        const i = ZOOM_LEVELS.indexOf(this.zoom);
        if (i !== -1 && i < ZOOM_LEVELS.length - 1) {
            this.fire('zoomchange', { zoom: ZOOM_LEVELS[i + 1] });
        }
    }

    handleZoomReset() {
        this.fire('zoomchange', { zoom: 100 });
    }

    handleUndo() {
        this.fire('undo');
    }

    handleRedo() {
        this.fire('redo');
    }

    handleSave() {
        this.fire('save');
    }

    handleSubmitForReview() {
        this.fire('submitforreview');
    }

    handleRequestHuman() {
        this.fire('requesthuman');
    }

    handleFullscreen() {
        this.fire('fullscreentoggle');
    }

    handleLogoClick() {
        this.fire('gotohub');
    }
}