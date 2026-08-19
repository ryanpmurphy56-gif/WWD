import { LightningElement, track } from 'lwc';
import getOrderHistory from '@salesforce/apex/PnpV2MemberController.getOrderHistory';
import cancelOrder from '@salesforce/apex/CheckoutController.cancelOrder';

const dateFmt = new Intl.DateTimeFormat('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
const currFmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export default class PnpV2OrderHistory extends LightningElement {
    @track orders = [];
    @track message = '';
    @track messageIsError = false;
    @track cancellingId = null;

    connectedCallback() {
        this._load();
    }

    _load() {
        getOrderHistory()
            .then((data) => {
                this.orders = (data || []).map((order) => ({
                    ...order,
                    displayDate:  order.createdDate ? dateFmt.format(new Date(order.createdDate)) : '',
                    displayTotal: currFmt.format(order.total || 0),
                    displayDiscount: order.discount > 0 ? '−' + currFmt.format(order.discount) : '',
                    _expanded: false,
                    _cancelArmed: false,
                    _cancelLabel: 'Cancel order & refund',
                    _statusClass: 'status-pill status-' + (order.status || '').toLowerCase().replace(/ /g, '-'),
                    lines: (order.lines || []).map((line) => ({
                        ...line,
                        displayQty: '× ' + line.quantity,
                        displayLineTotal: currFmt.format(line.lineTotal || 0)
                    }))
                }));
            })
            .catch((error) => {
                console.error('Order history error:', error);
            });
    }

    get hasOrders() { return this.orders && this.orders.length > 0; }
    get messageClass() { return this.messageIsError ? 'history-message history-message--error' : 'history-message'; }

    handleToggle(event) {
        const orderId = event.currentTarget.dataset.id;
        this.orders = this.orders.map((o) =>
            o.orderId === orderId ? { ...o, _expanded: !o._expanded } : o
        );
    }

    _decorateArmed() {
        this.orders = this.orders.map((o) => ({
            ...o,
            _cancelArmed: o.orderId === this.armedCancelId,
            _cancelLabel: o.orderId === this.armedCancelId
                ? 'Press again to confirm refund'
                : 'Cancel order & refund'
        }));
    }

    // Two-step confirm: first click arms the button, second click cancels.
    // (window.confirm is blocked by Lightning Web Security.)
    @track armedCancelId = null;
    _armTimer = null;

    disconnectedCallback() {
        clearTimeout(this._armTimer);
    }

    handleCancel(event) {
        event.stopPropagation();
        const orderId = event.target.dataset.id;

        if (this.armedCancelId !== orderId) {
            this.armedCancelId = orderId;
            this._decorateArmed();
            clearTimeout(this._armTimer);
            this._armTimer = setTimeout(() => {
                this.armedCancelId = null;
                this._decorateArmed();
            }, 6000);
            return;
        }

        clearTimeout(this._armTimer);
        this.armedCancelId = null;
        this._decorateArmed();

        this.cancellingId = orderId;
        this.message = '';
        cancelOrder({ orderId })
            .then((result) => {
                this.message = result;
                this.messageIsError = false;
                this._load();
            })
            .catch((error) => {
                this.message = error?.body?.message || 'Could not cancel the order.';
                this.messageIsError = true;
            })
            .finally(() => { this.cancellingId = null; });
    }
}