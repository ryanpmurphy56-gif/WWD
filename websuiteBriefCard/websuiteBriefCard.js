import { LightningElement, api } from 'lwc';

const ROWS = [
    { key: 'purpose', label: 'Type' },
    { key: 'goal', label: 'Goal' },
    { key: 'pages', label: 'Pages' },
    { key: 'style', label: 'Look' },
    { key: 'name', label: 'Name' },
    { key: 'about', label: 'About' }
];

export default class WebsuiteBriefCard extends LightningElement {
    @api title = 'Your brief';
    @api variant = 'hero'; // 'hero' | 'rail' — controls shadow depth only

    _brief = {};

    @api
    get brief() {
        return this._brief;
    }
    set brief(value) {
        this._brief = value || {};
    }

    get cardClass() {
        return this.variant === 'rail' ? 'ws-brief-card ws-brief-card_rail' : 'ws-brief-card';
    }

    get rows() {
        return ROWS.map((row) => {
            const display = this.formatValue(this._brief[row.key]);
            return {
                key: row.key,
                label: row.label,
                value: display || '—',
                rowClass: display ? 'ws-brief-row ws-brief-row_filled' : 'ws-brief-row'
            };
        });
    }

    formatValue(value) {
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return '';
            }
            if (value.length > 2) {
                return `${value.slice(0, 2).join(', ')} +${value.length - 2}`;
            }
            return value.join(', ');
        }
        return value || '';
    }
}