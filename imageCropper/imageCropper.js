/**
 * imageCropper — a modal that crops an image and returns a NEW asset. The user
 * frames a crop rectangle (free or locked to a preset aspect ratio) over the
 * fully-visible image; on Apply the selected region is drawn to a canvas at the
 * image's native resolution, re-encoded as a JPEG, and uploaded through the same
 * assetUpload path everything else uses. Emitting a fresh {assetId, url} means
 * no section's rendering has to know anything about cropping — it just gets a
 * new image URL, exactly like an upload or a library pick.
 *
 * The crop rect is stored in PERCENT of the displayed image, which equals
 * percent of the natural image (the <img> is shown at a single uniform scale),
 * so mapping the rect back to source pixels is a straight multiply — no
 * cover-scale/zoom ambiguity to get wrong.
 */
import { LightningElement, api } from 'lwc';
import { uploadFile } from 'c/assetUpload';

const MIN_PCT = 5; // never let the crop shrink below 5% of the image
const RATIOS = [
    { value: 'free', label: 'Free' },
    { value: '1:1', label: '1:1' },
    { value: '4:3', label: '4:3' },
    { value: '3:2', label: '3:2' },
    { value: '16:9', label: '16:9' },
    { value: '3:4', label: '3:4' },
    { value: '2:3', label: '2:3' }
];

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export default class ImageCropper extends LightningElement {
    @api imageUrl;
    @api siteId;

    imgW = 0;
    imgH = 0;
    loaded = false;
    busy = false;
    error = '';
    ratio = 'free';
    crop = { x: 10, y: 10, w: 80, h: 80 };

    _dragMode = null; // 'move' | 'resize'
    _startX = 0;
    _startY = 0;
    _startCrop = null;
    _wrap = null;

    constructor() {
        super();
        this._onMove = this.onPointerMove.bind(this);
        this._onUp = this.onPointerUp.bind(this);
    }

    disconnectedCallback() {
        this._detach();
    }

    // ---- ratio buttons ----------------------------------------------------
    get ratioOptions() {
        return RATIOS.map((r) => ({
            ...r,
            cssClass: r.value === this.ratio ? 'ratio ratio_on' : 'ratio'
        }));
    }

    /** Output pixel aspect (w/h) for the current ratio, or null when free. */
    get targetAspect() {
        if (this.ratio === 'free') {
            return null;
        }
        const [w, h] = this.ratio.split(':').map(Number);
        return w && h ? w / h : null;
    }

    // ---- render helpers ---------------------------------------------------
    get cropStyle() {
        const c = this.crop;
        return `left:${c.x}%;top:${c.y}%;width:${c.w}%;height:${c.h}%;`;
    }

    get applyDisabled() {
        return this.busy || !this.loaded;
    }

    get applyLabel() {
        return this.busy ? 'Cropping…' : 'Apply crop';
    }

    // ---- image load -------------------------------------------------------
    handleImgLoad(event) {
        this.imgW = event.target.naturalWidth || 0;
        this.imgH = event.target.naturalHeight || 0;
        this.loaded = this.imgW > 0 && this.imgH > 0;
        this.crop = { x: 10, y: 10, w: 80, h: 80 };
    }

    // ---- ratio selection --------------------------------------------------
    handleRatio(event) {
        this.ratio = event.currentTarget.dataset.ratio;
        if (this.targetAspect && this.loaded) {
            this.crop = this._centeredRect(this.targetAspect);
        }
    }

    /** A centred crop of the given pixel aspect, ~90% of the image, in percent. */
    _centeredRect(aspect) {
        let cw = this.imgW * 0.9;
        let ch = cw / aspect;
        if (ch > this.imgH * 0.9) {
            ch = this.imgH * 0.9;
            cw = ch * aspect;
        }
        return {
            x: ((this.imgW - cw) / 2 / this.imgW) * 100,
            y: ((this.imgH - ch) / 2 / this.imgH) * 100,
            w: (cw / this.imgW) * 100,
            h: (ch / this.imgH) * 100
        };
    }

    // ---- drag (move / resize) ---------------------------------------------
    startMove(event) {
        this._begin(event, 'move');
    }

    startResize(event) {
        event.stopPropagation(); // the handle sits inside the rect; don't also move
        this._begin(event, 'resize');
    }

    _begin(event, mode) {
        if (!this.loaded) {
            return;
        }
        event.preventDefault();
        const wrap = this.template.querySelector('.wrap');
        this._wrap = wrap ? wrap.getBoundingClientRect() : { width: 1, height: 1 };
        this._dragMode = mode;
        this._startX = event.clientX;
        this._startY = event.clientY;
        this._startCrop = { ...this.crop };
        window.addEventListener('pointermove', this._onMove, true);
        window.addEventListener('pointerup', this._onUp, true);
    }

    onPointerMove(event) {
        if (!this._dragMode) {
            return;
        }
        const dxPct = ((event.clientX - this._startX) / this._wrap.width) * 100;
        const dyPct = ((event.clientY - this._startY) / this._wrap.height) * 100;
        const s = this._startCrop;

        if (this._dragMode === 'move') {
            this.crop = {
                ...s,
                x: clamp(s.x + dxPct, 0, 100 - s.w),
                y: clamp(s.y + dyPct, 0, 100 - s.h)
            };
            return;
        }

        // resize from the bottom-right corner; top-left stays put
        let w = clamp(s.w + dxPct, MIN_PCT, 100 - s.x);
        let h;
        const aspect = this.targetAspect;
        if (aspect) {
            // Keep the OUTPUT pixel aspect: h% derived from w% via the image's
            // own aspect. If that overflows the bottom edge, clamp h and refit w.
            const factor = this.imgW / this.imgH / aspect; // h% = w% * factor
            h = w * factor;
            if (s.y + h > 100) {
                h = 100 - s.y;
                w = h / factor;
            }
        } else {
            h = clamp(s.h + dyPct, MIN_PCT, 100 - s.y);
        }
        this.crop = { ...s, w, h };
    }

    onPointerUp() {
        this._detach();
        this._dragMode = null;
    }

    _detach() {
        window.removeEventListener('pointermove', this._onMove, true);
        window.removeEventListener('pointerup', this._onUp, true);
    }

    // ---- apply / export ---------------------------------------------------
    apply() {
        const img = this.template.querySelector('.cropper__img');
        if (!img || !this.loaded || this.busy) {
            return;
        }
        const sx = Math.round((this.crop.x / 100) * this.imgW);
        const sy = Math.round((this.crop.y / 100) * this.imgH);
        const sw = Math.max(1, Math.round((this.crop.w / 100) * this.imgW));
        const sh = Math.max(1, Math.round((this.crop.h / 100) * this.imgH));

        let canvas;
        try {
            canvas = document.createElement('canvas');
            canvas.width = sw;
            canvas.height = sh;
            canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        } catch (e) {
            this.error = 'Could not read this image for cropping.';
            return;
        }

        this.busy = true;
        this.error = '';
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    this.busy = false;
                    this.error = 'Could not create the cropped image.';
                    return;
                }
                const file = new File([blob], 'crop.jpg', { type: 'image/jpeg' });
                uploadFile(file, this.siteId)
                    .then((res) => this.dispatchEvent(new CustomEvent('cropped', { detail: res })))
                    .catch((e) => {
                        this.error = e.message;
                    })
                    .finally(() => {
                        this.busy = false;
                    });
            },
            'image/jpeg',
            0.92
        );
    }

    // ---- modal chrome -----------------------------------------------------
    close() {
        if (!this.busy) {
            this.dispatchEvent(new CustomEvent('close'));
        }
    }

    handleBackdrop() {
        this.close();
    }

    stop(event) {
        event.stopPropagation();
    }
}