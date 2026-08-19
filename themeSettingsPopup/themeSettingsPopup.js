/**
 * themeSettingsPopup — wraps c-theme-panel in a dialog overlay so the design
 * settings (brand/theme/personality/palette) are a cog-triggered popup instead
 * of a permanent right-rail tab. c-theme-panel itself is unchanged and stays
 * unaware it's in a popup — it only ever reads `theme` and writes to the store.
 */
import { LightningElement, api } from 'lwc';

export default class ThemeSettingsPopup extends LightningElement {
    @api theme = {};

    close() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleBackdrop() {
        this.close();
    }

    stop(event) {
        event.stopPropagation();
    }
}