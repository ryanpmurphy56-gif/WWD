/**
 * focalPicker — click the thumbnail to choose the image's focal point (the
 * spot that stays visible however the image is cover-cropped). Emits
 * `focalchange` ({x, y} as canvas percentages). Purely presentational; the
 * caller stores the point on the section's content.
 */
import { LightningElement, api } from 'lwc';

export default class FocalPicker extends LightningElement {
    @api imageUrl;
    @api x = 50;
    @api y = 50;

    get dotStyle() {
        const clamp = (v) => Math.min(Math.max(Number(v) || 0, 0), 100);
        return `left:${clamp(this.x)}%; top:${clamp(this.y)}%;`;
    }

    handleClick(event) {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.round(((event.clientX - rect.left) / rect.width) * 100);
        const y = Math.round(((event.clientY - rect.top) / rect.height) * 100);
        this.dispatchEvent(new CustomEvent('focalchange', { detail: { x, y } }));
    }
}