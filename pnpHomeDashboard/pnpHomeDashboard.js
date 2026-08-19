import { LightningElement, wire, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getStockSummary from '@salesforce/apex/HomeDashboardController.getStockSummary';
import getSalesSummary from '@salesforce/apex/HomeDashboardController.getSalesSummary';
import getFunnelSummary from '@salesforce/apex/HomeDashboardController.getFunnelSummary';
import getReportLinks from '@salesforce/apex/HomeDashboardController.getReportLinks';
import getLiveOps from '@salesforce/apex/HomeDashboardController.getLiveOps';
import getSales from '@salesforce/apex/SiteSaleController.getSales';
import saveSale from '@salesforce/apex/SiteSaleController.saveSale';
import deleteSale from '@salesforce/apex/SiteSaleController.deleteSale';
import addProductToSale from '@salesforce/apex/SiteSaleController.addProductToSale';
import removeSaleProduct from '@salesforce/apex/SiteSaleController.removeSaleProduct';
import searchProducts from '@salesforce/apex/SiteSaleController.searchProducts';
import createReorder from '@salesforce/apex/ReorderController.createReorder';
import cancelReorder from '@salesforce/apex/ReorderController.cancelReorder';
import getPendingReorders from '@salesforce/apex/ReorderController.getPendingReorders';
import sendOrderSheets from '@salesforce/apex/ReorderController.sendOrderSheets';
import markReceived from '@salesforce/apex/ReorderController.markReceived';
import getOpenOrders from '@salesforce/apex/HomeDashboardController.getOpenOrders';
import updateOrderStatus from '@salesforce/apex/HomeDashboardController.updateOrderStatus';
import getWishlistInsights from '@salesforce/apex/WishlistController.getWishlistInsights';

const LIVE_POLL_MS = 30000;

const CUR0 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const CUR2 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const NUM = new Intl.NumberFormat('en-AU');

const TABS = [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'orders', label: 'Orders', icon: '📬' },
    { id: 'stock', label: 'Stock', icon: '📦' },
    { id: 'sales', label: 'Sales', icon: '💰' },
    { id: 'funnel', label: 'Funnel Rollups', icon: '⏬' },
    { id: 'carts', label: 'Live Carts', icon: '🛒' },
    { id: 'promos', label: 'Promotions', icon: '🏷️' },
    { id: 'reports', label: 'Reports', icon: '📈' }
];

// Funnel stage fills — validated ordinal blue ramp (light→dark = top→bottom of funnel)
const RANGES = [
    { days: 7, label: '7D' },
    { days: 30, label: '30D' },
    { days: 90, label: '90D' }
];

export default class PnpHomeDashboard extends NavigationMixin(LightningElement) {
    @track activeTab = 'overview';
    @track salesDays = 30;
    // Default to 90d: rollups are aggregated overnight and may trail live sales
    @track funnelDays = 90;

    stockData;
    salesData;
    funnelData;
    reportData;
    wishlistInsights;
    loadError;

    // 30-day sales copy for the Overview tab, independent of the Sales tab range
    overviewSales;

    @track tipVisible = false;
    @track tipStyle = '';
    @track tipTitle = '';
    @track tipLine1 = '';
    @track tipLine2 = '';

    // Live ops (sold today + active carts), polled every 30s
    @track liveOps;
    _livePollTimer;

    // Promotions state
    @track sales = [];
    @track showSaleForm = false;
    @track saleForm = {};
    @track saleError = '';
    @track saleSaving = false;
    @track productSearchTerm = '';
    @track productResults = [];
    _productSearchTimer;

    // Reordering state
    @track pendingReorders = [];
    @track reorderTarget = null; // { productId, name, qty }
    @track reorderBusy = false;
    @track sheetSending = false;
    @track orderSheetMsg = '';

    // Order fulfilment state
    @track openOrders = [];
    @track orderMsg = '';
    _trackingDrafts = {};

    connectedCallback() {
        this._loadLiveOps();
        this._loadSales();
        this._loadReorders();
        this._loadOpenOrders();
        this._livePollTimer = setInterval(() => this._loadLiveOps(), LIVE_POLL_MS);
    }

    _loadOpenOrders() {
        getOpenOrders()
            .then((data) => { this.openOrders = data || []; })
            .catch((error) => this.captureError(error));
    }

    _loadReorders() {
        getPendingReorders()
            .then((data) => { this.pendingReorders = data || []; })
            .catch((error) => this.captureError(error));
    }

    disconnectedCallback() {
        clearInterval(this._livePollTimer);
    }

    renderedCallback() {
        // textarea can't take a value attribute in LWC templates — seed it after the form renders
        if (this._syncSaleDesc) {
            const el = this.template.querySelector('.sale-desc-input');
            if (el) {
                el.value = this.saleForm.description || '';
                this._syncSaleDesc = false;
            }
        }
    }

    _loadLiveOps() {
        getLiveOps()
            .then((data) => { this.liveOps = data; })
            .catch((error) => this.captureError(error));
    }

    _loadSales() {
        getSales()
            .then((data) => { this.sales = data || []; })
            .catch((error) => this.captureError(error));
    }

    /* ── wires ── */

    @wire(getStockSummary)
    wiredStock({ data, error }) {
        if (data) this.stockData = data;
        else if (error) this.captureError(error);
    }

    @wire(getSalesSummary, { days: '$salesDays' })
    wiredSales({ data, error }) {
        if (data) {
            this.salesData = data;
            if (this.salesDays === 30) this.overviewSales = data;
        } else if (error) this.captureError(error);
    }

    @wire(getSalesSummary, { days: 30 })
    wiredOverviewSales({ data }) {
        if (data) this.overviewSales = data;
    }

    @wire(getFunnelSummary, { days: '$funnelDays' })
    wiredFunnel({ data, error }) {
        if (data) this.funnelData = data;
        else if (error) this.captureError(error);
    }

    @wire(getReportLinks)
    wiredReports({ data, error }) {
        if (data) this.reportData = data;
        else if (error) this.captureError(error);
    }

    @wire(getWishlistInsights)
    wiredWishlistInsights({ data, error }) {
        if (data) this.wishlistInsights = data;
        else if (error) this.captureError(error);
    }

    captureError(error) {
        const msg = error && error.body && error.body.message ? error.body.message : 'Failed to load dashboard data.';
        this.loadError = msg;
        // eslint-disable-next-line no-console
        console.error('pnpHomeDashboard load error', JSON.stringify(error));
    }

    /* ── navigation ── */

    get navItems() {
        return TABS.map((t) => ({
            ...t,
            cls: t.id === this.activeTab ? 'nav-btn nav-active' : 'nav-btn'
        }));
    }

    get isOverview() { return this.activeTab === 'overview'; }
    get isOrders() { return this.activeTab === 'orders'; }
    get isStock() { return this.activeTab === 'stock'; }
    get isSales() { return this.activeTab === 'sales'; }
    get isFunnel() { return this.activeTab === 'funnel'; }
    get isCarts() { return this.activeTab === 'carts'; }
    get isPromos() { return this.activeTab === 'promos'; }
    get isReports() { return this.activeTab === 'reports'; }

    handleTabClick(event) {
        this.activeTab = event.currentTarget.dataset.tab;
        this.tipVisible = false;
    }

    handleRangeClick(event) {
        const days = parseInt(event.currentTarget.dataset.days, 10);
        if (event.currentTarget.dataset.scope === 'sales') this.salesDays = days;
        else this.funnelDays = days;
        this.tipVisible = false;
    }

    get salesRangeOptions() {
        return RANGES.map((r) => ({
            ...r,
            cls: r.days === this.salesDays ? 'pill-btn pill-active' : 'pill-btn'
        }));
    }

    get funnelRangeOptions() {
        return RANGES.map((r) => ({
            ...r,
            cls: r.days === this.funnelDays ? 'pill-btn pill-active' : 'pill-btn'
        }));
    }

    get todayLabel() {
        return new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    /* ── overview ── */

    get ovRevenue() {
        return this.overviewSales ? CUR0.format(this.overviewSales.totalRevenue || 0) : '—';
    }

    get ovOrdersSub() {
        return this.overviewSales ? `${NUM.format(this.overviewSales.totalOrders || 0)} orders` : '';
    }

    get ovAov() {
        return this.overviewSales ? CUR2.format(this.overviewSales.avgOrderValue || 0) : '—';
    }

    get ovConversion() {
        if (!this.funnelData || !this.funnelData.views) return '—';
        const pct = (this.funnelData.purchases / this.funnelData.views) * 100;
        return `${pct.toFixed(1)}%`;
    }

    /* ── stock ── */

    get stockSkus() { return this.stockData ? NUM.format(this.stockData.totalSkus) : '—'; }
    get stockSkusSub() { return this.stockData ? `${NUM.format(this.stockData.totalSkus)} SKUs` : ''; }
    get stockUnitsLabel() { return this.stockData ? NUM.format(this.stockData.totalUnits) : '—'; }
    get stockLowCount() { return this.stockData ? NUM.format(this.stockData.lowStockCount) : '—'; }
    get stockOutCount() { return this.stockData ? NUM.format(this.stockData.outOfStockCount) : '—'; }

    get stockAlertCount() {
        if (!this.stockData) return '—';
        return NUM.format(this.stockData.lowStockCount + this.stockData.outOfStockCount);
    }

    get stockAlertSub() {
        if (!this.stockData) return '';
        return `${this.stockData.lowStockCount} low · ${this.stockData.outOfStockCount} out`;
    }

    classifyStock(row) {
        const qty = row.quantityOnHand || 0;
        const min = row.minimumQuantity || 0;
        if (qty <= 0) return { statusLabel: '✕ Out of stock', pillClass: 'pill pill-out', rank: 0 };
        if (min > 0 && qty < min) return { statusLabel: '⚠ Low stock', pillClass: 'pill pill-low', rank: 1 };
        return { statusLabel: '✓ In stock', pillClass: 'pill pill-ok', rank: 2 };
    }

    get stockAlertRows() {
        if (!this.stockData) return [];
        return this.stockData.products
            .map((p) => ({ p, s: this.classifyStock(p) }))
            .filter((x) => x.s.rank < 2)
            .sort((a, b) => a.s.rank - b.s.rank)
            .slice(0, 8)
            .map(({ p, s }) => ({
                key: p.productId,
                name: p.name,
                qtyLabel: NUM.format(p.quantityOnHand || 0),
                minLabel: p.minimumQuantity ? NUM.format(p.minimumQuantity) : '—',
                statusLabel: s.statusLabel,
                pillClass: s.pillClass
            }));
    }

    get hasStockAlerts() { return this.stockAlertRows.length > 0; }

    get stockBars() {
        if (!this.stockData) return [];
        const withQty = this.stockData.products.filter((p) => (p.quantityOnHand || 0) > 0).slice(0, 10);
        const max = withQty.reduce((m, p) => Math.max(m, p.quantityOnHand), 0);
        return withQty.map((p) => ({
            key: p.productId,
            name: p.name,
            qtyLabel: NUM.format(p.quantityOnHand),
            style: `width:${max > 0 ? Math.max((p.quantityOnHand / max) * 100, 1) : 0}%`
        }));
    }

    get hasStockBars() { return this.stockBars.length > 0; }

    get allStockRows() {
        if (!this.stockData) return [];
        return this.stockData.products.map((p) => {
            const s = this.classifyStock(p);
            return {
                key: p.productId,
                name: p.name,
                priceLabel: p.price != null ? CUR2.format(p.price) : '—',
                qtyLabel: NUM.format(p.quantityOnHand || 0),
                minLabel: p.minimumQuantity ? NUM.format(p.minimumQuantity) : '—',
                supplierLabel: p.supplierName || '—',
                statusLabel: s.statusLabel,
                pillClass: s.pillClass
            };
        });
    }

    /* ── reordering ── */

    suggestedReorderQty(p) {
        const qty = p.quantityOnHand || 0;
        const min = p.minimumQuantity || 0;
        // Restock to double the minimum, or a slab's worth when no minimum is set
        return min > 0 ? Math.max(min * 2 - qty, min) : 24;
    }

    get pendingReorderRows() {
        return (this.pendingReorders || []).map((r) => ({
            key: r.reorderId,
            reorderId: r.reorderId,
            productName: r.productName,
            qtyLabel: NUM.format(r.quantity || 0),
            supplierLabel: r.supplierName || 'No supplier — goes to store inbox',
            supplierClass: r.supplierName ? 'pill pill-ok' : 'pill pill-low',
            queuedLabel: new Date(r.createdDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
            statusLabel: r.status || 'Pending',
            statusClass: r.status === 'Sent' ? 'pill pill-low' : 'pill pill-neutral',
            canCancel: r.status === 'Pending',
            canReceive: r.status === 'Sent'
        }));
    }

    handleMarkReceived(event) {
        const reorderId = event.currentTarget.dataset.id;
        markReceived({ reorderId })
            .then(() => {
                this.orderSheetMsg = 'Stock received — quantity on hand updated.';
                this._loadReorders();
            })
            .catch((error) => {
                this.orderSheetMsg = error?.body?.message || 'Could not mark the reorder as received.';
            });
    }

    get hasPendingReorders() { return this.pendingReorderRows.length > 0; }
    get pendingReorderCount() { return this.pendingReorderRows.length; }

    handleOrderClick(event) {
        const productId = event.currentTarget.dataset.id;
        const product = this.stockData?.products.find((p) => p.productId === productId);
        if (!product) return;
        this.orderSheetMsg = '';
        this.reorderTarget = {
            productId,
            name: product.name,
            qty: this.suggestedReorderQty(product)
        };
    }

    handleReorderQtyChange(event) {
        this.reorderTarget = { ...this.reorderTarget, qty: event.target.value };
    }

    handleReorderCancelForm() {
        this.reorderTarget = null;
    }

    handleReorderConfirm() {
        const qty = parseInt(this.reorderTarget?.qty, 10);
        if (!qty || qty < 1) {
            this.orderSheetMsg = 'Please enter a quantity of at least 1.';
            return;
        }
        this.reorderBusy = true;
        createReorder({ productId: this.reorderTarget.productId, quantity: qty })
            .then(() => {
                this.orderSheetMsg = `${this.reorderTarget.name} ×${qty} queued for the next order sheet.`;
                this.reorderTarget = null;
                this._loadReorders();
            })
            .catch((error) => {
                this.orderSheetMsg = error?.body?.message || 'Could not queue the reorder.';
            })
            .finally(() => { this.reorderBusy = false; });
    }

    handleCancelReorder(event) {
        const reorderId = event.currentTarget.dataset.id;
        cancelReorder({ reorderId })
            .then(() => this._loadReorders())
            .catch((error) => this.captureError(error));
    }

    handleSendSheets() {
        this.sheetSending = true;
        sendOrderSheets()
            .then((result) => {
                this.orderSheetMsg = result;
                this._loadReorders();
            })
            .catch((error) => {
                this.orderSheetMsg = error?.body?.message || 'Sending order sheets failed.';
            })
            .finally(() => { this.sheetSending = false; });
    }

    /* ── order fulfilment ── */

    get openOrderRows() {
        return (this.openOrders || []).map((o) => ({
            key: o.orderId,
            orderId: o.orderId,
            orderNumber: '#' + o.orderNumber,
            accountName: o.accountName || '—',
            totalLabel: o.total != null ? CUR2.format(o.total) : '—',
            status: o.status,
            statusClass: 'pill pill-' + (o.status === 'Pending' ? 'low' : 'ok'),
            fulfilment: o.fulfilment || '—',
            deliveryAddress: o.deliveryAddress,
            trackingNumber: o.trackingNumber,
            dateLabel: new Date(o.createdDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
            // Show a tracking input while the order can move to Shipped
            needsTracking: (o.nextStatuses || []).includes('Shipped'),
            actions: (o.nextStatuses || []).map((s) => ({
                key: o.orderId + s,
                label: s === 'Cancelled' ? 'Cancel' : '→ ' + s,
                status: s,
                cls: s === 'Cancelled' ? 'pill-btn order-cancel-btn' : 'pill-btn pill-active'
            }))
        }));
    }

    get hasOpenOrders() { return this.openOrderRows.length > 0; }
    get openOrderCount() { return this.openOrderRows.length; }

    handleTrackingInput(event) {
        this._trackingDrafts[event.target.dataset.id] = event.target.value;
    }

    handleOrderStatusClick(event) {
        const orderId = event.currentTarget.dataset.id;
        const newStatus = event.currentTarget.dataset.status;
        this.orderMsg = '';
        updateOrderStatus({
            orderId,
            newStatus,
            trackingNumber: this._trackingDrafts[orderId] || null
        })
            .then(() => {
                this.orderMsg = 'Order moved to ' + newStatus + '.';
                delete this._trackingDrafts[orderId];
                this._loadOpenOrders();
            })
            .catch((error) => {
                this.orderMsg = error?.body?.message || 'Could not update the order.';
            });
    }

    handleOrdersRefresh() {
        this._loadOpenOrders();
    }

    /* ── sales ── */

    get salesOrders() { return this.salesData ? NUM.format(this.salesData.totalOrders) : '—'; }
    get salesRevenue() { return this.salesData ? CUR0.format(this.salesData.totalRevenue || 0) : '—'; }
    get salesAov() { return this.salesData ? CUR2.format(this.salesData.avgOrderValue || 0) : '—'; }

    get sortedDaily() {
        if (!this.salesData || !this.salesData.daily) return [];
        return [...this.salesData.daily].sort((a, b) => (a.day < b.day ? -1 : 1));
    }

    niceCeil(v) {
        if (v <= 0) return 100;
        const pow = Math.pow(10, Math.floor(Math.log10(v)));
        for (const m of [1, 2, 2.5, 5, 10]) {
            if (m * pow >= v) return m * pow;
        }
        return 10 * pow;
    }

    get yNiceMax() {
        const max = this.sortedDaily.reduce((m, d) => Math.max(m, d.revenue || 0), 0);
        return this.niceCeil(max);
    }

    get yMaxLabel() { return CUR0.format(this.yNiceMax); }
    get yMidLabel() { return CUR0.format(this.yNiceMax / 2); }

    get revenueBars() {
        const max = this.yNiceMax;
        return this.sortedDaily.map((d, i) => {
            const pct = max > 0 ? ((d.revenue || 0) / max) * 100 : 0;
            return {
                key: d.day,
                index: i,
                style: `height:${pct > 0 ? Math.max(pct, 1.5) : 0}%`
            };
        });
    }

    get hasSalesBars() {
        return this.sortedDaily.some((d) => (d.revenue || 0) > 0);
    }

    dayLabel(dateStr, opts) {
        return new Date(dateStr).toLocaleDateString('en-AU', opts || { day: 'numeric', month: 'short' });
    }

    get xFirstLabel() {
        const d = this.sortedDaily;
        return d.length ? this.dayLabel(d[0].day) : '';
    }

    get xMidLabel() {
        const d = this.sortedDaily;
        return d.length > 2 ? this.dayLabel(d[Math.floor(d.length / 2)].day) : '';
    }

    get xLastLabel() {
        const d = this.sortedDaily;
        return d.length > 1 ? this.dayLabel(d[d.length - 1].day) : '';
    }

    handleBarEnter(event) {
        const idx = parseInt(event.currentTarget.dataset.index, 10);
        const d = this.sortedDaily[idx];
        if (!d) return;

        const plot = this.template.querySelector('.col-plot');
        const bar = event.currentTarget.querySelector('.col-bar');
        if (!plot || !bar) return;

        const plotRect = plot.getBoundingClientRect();
        const slotRect = event.currentTarget.getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();

        let x = slotRect.left - plotRect.left + slotRect.width / 2;
        x = Math.min(Math.max(x, 60), plotRect.width - 60);
        const y = Math.max(barRect.top - plotRect.top, 8);

        this.tipTitle = this.dayLabel(d.day, { weekday: 'short', day: 'numeric', month: 'short' });
        this.tipLine1 = `Revenue: ${CUR2.format(d.revenue || 0)}`;
        this.tipLine2 = `Orders: ${NUM.format(d.orders || 0)}`;
        this.tipStyle = `left:${x}px; top:${y}px`;
        this.tipVisible = true;
    }

    handleTipLeave() {
        this.tipVisible = false;
    }

    get topProductRows() {
        if (!this.salesData || !this.salesData.topProducts) return [];
        return this.salesData.topProducts.map((t, i) => ({
            key: `${t.name}-${i}`,
            name: t.name,
            unitsLabel: NUM.format(t.units || 0),
            revenueLabel: CUR2.format(t.revenue || 0)
        }));
    }

    get hasTopProducts() { return this.topProductRows.length > 0; }

    get recentOrderRows() {
        if (!this.salesData || !this.salesData.recentOrders) return [];
        return this.salesData.recentOrders.map((o) => ({
            key: o.orderId,
            orderNumber: `#${o.orderNumber}`,
            accountName: o.accountName,
            totalLabel: o.total != null ? CUR2.format(o.total) : '—',
            status: o.status || '—',
            fulfilment: o.fulfilment || '—',
            dateLabel: new Date(o.createdDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        }));
    }

    get hasRecentOrders() { return this.recentOrderRows.length > 0; }

    get wishlistRows() {
        if (!this.wishlistInsights) return [];
        return this.wishlistInsights.map((r) => ({
            key: r.ProductId,
            name: r.ProductName,
            family: r.Family || '—',
            priceLabel: r.Price != null ? CUR2.format(r.Price) : '—',
            savesLabel: NUM.format(r.TotalSaves || 0)
        }));
    }

    get hasWishlistRows() { return this.wishlistRows.length > 0; }

    /* ── funnel ── */

    get fViews() { return this.funnelData ? NUM.format(this.funnelData.views || 0) : '—'; }
    get fAdds() { return this.funnelData ? NUM.format(this.funnelData.adds || 0) : '—'; }
    get fPurchases() { return this.funnelData ? NUM.format(this.funnelData.purchases || 0) : '—'; }
    get fRevenue() { return this.funnelData ? CUR0.format(this.funnelData.revenue || 0) : '—'; }

    get funnelSubtitle() {
        if (!this.funnelData || !this.funnelData.lastRollupDate) {
            return 'Daily aggregated shopper journey';
        }
        return `Daily aggregated shopper journey · last rollup ${this.dayLabel(this.funnelData.lastRollupDate)}`;
    }

    get hasFunnelData() {
        return !!(this.funnelData && (this.funnelData.views || 0) > 0);
    }

    get funnelStages() {
        if (!this.funnelData) return [];
        const stages = [
            { label: 'Views', value: this.funnelData.views || 0, barClass: 'funnel-bar f1' },
            { label: 'Add to cart', value: this.funnelData.adds || 0, barClass: 'funnel-bar f2' },
            { label: 'Checkout', value: this.funnelData.checkouts || 0, barClass: 'funnel-bar f3' },
            { label: 'Purchase', value: this.funnelData.purchases || 0, barClass: 'funnel-bar f4' }
        ];
        const max = stages[0].value;
        return stages.map((s, i) => {
            const prev = i > 0 ? stages[i - 1].value : 0;
            const conv = i > 0 && prev > 0 ? `${((s.value / prev) * 100).toFixed(0)}% of prev` : '';
            return {
                label: s.label,
                barClass: s.barClass,
                countLabel: NUM.format(s.value),
                convLabel: conv,
                style: `width:${max > 0 ? Math.max((s.value / max) * 100, 1) : 0}%`
            };
        });
    }

    get funnelProductRows() {
        if (!this.funnelData || !this.funnelData.products) return [];
        return this.funnelData.products.map((p, i) => ({
            key: `${p.name}-${i}`,
            name: p.name,
            viewsLabel: NUM.format(p.views || 0),
            addsLabel: NUM.format(p.adds || 0),
            purchasesLabel: NUM.format(p.purchases || 0),
            convLabel: `${(p.conversionPct || 0).toFixed ? p.conversionPct.toFixed(1) : p.conversionPct}%`,
            revenueLabel: CUR2.format(p.revenue || 0)
        }));
    }

    get hasFunnelProducts() { return this.funnelProductRows.length > 0; }

    /* ── live ops: sold today + active carts ── */

    get liveSoldUnits() {
        return this.liveOps ? NUM.format(this.liveOps.soldTodayUnits || 0) : '—';
    }

    get liveSoldSub() {
        if (!this.liveOps) return '';
        return `${NUM.format(this.liveOps.soldTodayOrders || 0)} orders · ${CUR0.format(this.liveOps.soldTodayRevenue || 0)}`;
    }

    get liveCartCount() { return this.liveOps ? NUM.format(this.liveOps.activeCartCount || 0) : '—'; }
    get liveCartUnits() { return this.liveOps ? NUM.format(this.liveOps.activeCartUnits || 0) : '—'; }
    get liveCartValue() { return this.liveOps ? CUR0.format(this.liveOps.activeCartValue || 0) : '—'; }

    get cartRows() {
        if (!this.liveOps || !this.liveOps.carts) return [];
        const now = Date.now();
        return this.liveOps.carts.map((c) => {
            const mins = Math.max(Math.round((now - new Date(c.lastActivity).getTime()) / 60000), 0);
            let age;
            if (mins < 1) age = 'just now';
            else if (mins < 60) age = `${mins}m ago`;
            else if (mins < 1440) age = `${Math.round(mins / 60)}h ago`;
            else age = `${Math.round(mins / 1440)}d ago`;
            return {
                key: c.cartId,
                shopper: c.shopper,
                shopperClass: c.isGuest ? 'pill pill-neutral' : 'pill pill-ok',
                itemsSummary: c.itemsSummary,
                unitsLabel: NUM.format(c.units || 0),
                valueLabel: CUR2.format(c.value || 0),
                ageLabel: age
            };
        });
    }

    get hasCartRows() { return this.cartRows.length > 0; }

    handleLiveRefresh() {
        this._loadLiveOps();
    }

    /* ── promotions ── */

    get saleRows() {
        return (this.sales || []).map((s) => ({
            ...s,
            key: s.saleId,
            deleteLabel: this.armedDeleteSaleId === s.saleId ? 'Press again to delete' : 'Delete',
            pctLabel: `${s.discountPercent}% off`,
            scopeLabel: s.scope === 'Sitewide' ? 'Sitewide' : `${(s.products || []).length} product(s)`,
            dateLabel: this._saleDateLabel(s),
            statusLabel: s.isLive ? '● Live' : (s.active ? 'Scheduled' : 'Off'),
            statusClass: s.isLive ? 'pill pill-ok' : (s.active ? 'pill pill-low' : 'pill pill-neutral'),
            hasImage: !!s.imageUrl,
            products: (s.products || []).map((p) => ({ ...p, key: p.saleProductId }))
        }));
    }

    get hasSales() { return this.saleRows.length > 0; }

    _saleDateLabel(s) {
        const f = (d) => this.dayLabel(d);
        if (s.startDate && s.endDate) return `${f(s.startDate)} – ${f(s.endDate)}`;
        if (s.startDate) return `From ${f(s.startDate)}`;
        if (s.endDate) return `Until ${f(s.endDate)}`;
        return 'No date limits';
    }

    get scopeOptions() {
        const current = this.saleForm.scope || 'Sitewide';
        return [
            { value: 'Sitewide', label: 'Sitewide (all products)', selected: current === 'Sitewide' },
            { value: 'Selected Products', label: 'Selected products only', selected: current === 'Selected Products' }
        ];
    }

    get saleFormTitle() { return this.saleForm.saleId ? 'Edit Sale' : 'New Sale'; }
    get isScopedSale() { return this.saleForm.scope === 'Selected Products'; }
    get canPickProducts() { return this.isScopedSale && !!this.saleForm.saleId; }

    get editingSaleProducts() {
        if (!this.saleForm.saleId) return [];
        const sale = this.saleRows.find((s) => s.saleId === this.saleForm.saleId);
        return sale ? sale.products : [];
    }

    get hasProductResults() { return this.productResults.length > 0; }

    handleNewSale() {
        this.saleForm = { scope: 'Sitewide', active: false };
        this.saleError = '';
        this.showSaleForm = true;
        this.productResults = [];
        this.productSearchTerm = '';
        this._syncSaleDesc = true;
    }

    handleEditSale(event) {
        const saleId = event.currentTarget.dataset.id;
        const sale = this.sales.find((s) => s.saleId === saleId);
        if (!sale) return;
        this.saleForm = {
            saleId: sale.saleId,
            name: sale.name,
            discountPercent: sale.discountPercent,
            scope: sale.scope,
            active: sale.active,
            startDate: sale.startDate || '',
            endDate: sale.endDate || '',
            imageUrl: sale.imageUrl || '',
            description: sale.description || ''
        };
        this.saleError = '';
        this.showSaleForm = true;
        this.productResults = [];
        this.productSearchTerm = '';
        this._syncSaleDesc = true;
    }

    handleSaleFormCancel() {
        this.showSaleForm = false;
        this.saleForm = {};
        this.saleError = '';
    }

    handleSaleField(event) {
        const field = event.target.dataset.field;
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        this.saleForm = { ...this.saleForm, [field]: value };
    }

    handleSaveSale() {
        this.saleError = '';
        this.saleSaving = true;
        saveSale({
            saleId: this.saleForm.saleId || null,
            name: this.saleForm.name,
            discountPercent: this.saleForm.discountPercent ? parseFloat(this.saleForm.discountPercent) : null,
            scope: this.saleForm.scope || 'Sitewide',
            active: !!this.saleForm.active,
            startDate: this.saleForm.startDate || '',
            endDate: this.saleForm.endDate || '',
            imageUrl: this.saleForm.imageUrl || '',
            description: this.saleForm.description || ''
        })
            .then((saleId) => {
                // Keep the form open for scoped sales so products can be added right away
                this.saleForm = { ...this.saleForm, saleId };
                if (!this.isScopedSale) this.showSaleForm = false;
                this._loadSales();
            })
            .catch((error) => {
                this.saleError = error?.body?.message || 'Could not save the sale.';
            })
            .finally(() => { this.saleSaving = false; });
    }

    // Two-step confirm: first click arms the button, second click deletes.
    // (window.confirm is blocked by Lightning Web Security and silently no-ops.)
    @track armedDeleteSaleId = null;
    _armedDeleteTimer = null;

    handleDeleteSale(event) {
        const saleId = event.currentTarget.dataset.id;

        if (this.armedDeleteSaleId !== saleId) {
            this.armedDeleteSaleId = saleId;
            clearTimeout(this._armedDeleteTimer);
            this._armedDeleteTimer = setTimeout(() => { this.armedDeleteSaleId = null; }, 6000);
            return;
        }

        clearTimeout(this._armedDeleteTimer);
        this.armedDeleteSaleId = null;
        deleteSale({ saleId })
            .then(() => {
                if (this.saleForm.saleId === saleId) this.handleSaleFormCancel();
                this._loadSales();
            })
            .catch((error) => this.captureError(error));
    }

    handleProductSearch(event) {
        this.productSearchTerm = event.target.value;
        clearTimeout(this._productSearchTimer);
        const term = (this.productSearchTerm || '').trim();
        if (term.length < 2) {
            this.productResults = [];
            return;
        }
        this._productSearchTimer = setTimeout(() => {
            searchProducts({ term })
                .then((results) => {
                    const alreadyIn = new Set(this.editingSaleProducts.map((p) => p.productId));
                    this.productResults = (results || [])
                        .filter((r) => !alreadyIn.has(r.productId))
                        .map((r) => ({
                            ...r,
                            key: r.productId,
                            priceLabel: r.price != null ? CUR2.format(r.price) : ''
                        }));
                })
                .catch(() => { this.productResults = []; });
        }, 300);
    }

    handleAddSaleProduct(event) {
        const productId = event.currentTarget.dataset.id;
        addProductToSale({ saleId: this.saleForm.saleId, productId })
            .then(() => {
                this.productResults = this.productResults.filter((r) => r.productId !== productId);
                this._loadSales();
            })
            .catch((error) => this.captureError(error));
    }

    handleRemoveSaleProduct(event) {
        const saleProductId = event.currentTarget.dataset.id;
        removeSaleProduct({ saleProductId })
            .then(() => this._loadSales())
            .catch((error) => this.captureError(error));
    }

    /* ── reports ── */

    get reportRows() {
        if (!this.reportData || !this.reportData.reports) return [];
        return this.reportData.reports.map((r) => ({ key: r.recordId, ...r }));
    }

    get dashboardRows() {
        if (!this.reportData || !this.reportData.dashboards) return [];
        return this.reportData.dashboards.map((r) => ({ key: r.recordId, ...r }));
    }

    get hasReports() { return this.reportRows.length > 0; }
    get hasDashboards() { return this.dashboardRows.length > 0; }

    handleLinkClick(event) {
        const { id, type } = event.currentTarget.dataset;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: id, objectApiName: type, actionName: 'view' }
        });
    }

    handleAllReports() {
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: { objectApiName: 'Report', actionName: 'home' }
        });
    }

    handleAllDashboards() {
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: { objectApiName: 'Dashboard', actionName: 'home' }
        });
    }
}