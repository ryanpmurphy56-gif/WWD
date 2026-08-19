/**
 * Backs the pnpHomeDashboard LWC (internal Home page "Command Center").
 * All methods are read-only aggregations over existing data.
 */
public with sharing class HomeDashboardController {

    /* ───────────────────────── Stock ───────────────────────── */

    @AuraEnabled(cacheable=true)
    public static StockSummary getStockSummary() {
        StockSummary summary = new StockSummary();
        summary.products = new List<StockRow>();

        for (Product2 p : [
            SELECT Id, Name, Quantity_on_Hand__c, Minimum_Quantity__c, Selling_Price__c,
                   Supplier__c, Supplier__r.Name
            FROM Product2
            WHERE IsActive = true
            ORDER BY Quantity_on_Hand__c DESC NULLS LAST, Name ASC
            LIMIT 500
        ]) {
            StockRow row = new StockRow();
            row.productId = p.Id;
            row.name = p.Name;
            row.quantityOnHand = p.Quantity_on_Hand__c == null ? 0 : p.Quantity_on_Hand__c;
            row.minimumQuantity = p.Minimum_Quantity__c == null ? 0 : p.Minimum_Quantity__c;
            row.price = p.Selling_Price__c;
            row.supplierName = p.Supplier__c != null ? p.Supplier__r.Name : null;
            summary.products.add(row);

            summary.totalUnits += row.quantityOnHand;
            if (row.quantityOnHand <= 0) {
                summary.outOfStockCount++;
            } else if (row.minimumQuantity > 0 && row.quantityOnHand < row.minimumQuantity) {
                summary.lowStockCount++;
            }
        }
        summary.totalSkus = summary.products.size();
        return summary;
    }

    /* ───────────────────────── Sales ───────────────────────── */

    @AuraEnabled(cacheable=true)
    public static SalesSummary getSalesSummary(Integer days) {
        Integer windowDays = normaliseDays(days);
        Date startDate = Date.today().addDays(-(windowDays - 1));
        Datetime startDt = Datetime.newInstance(startDate, Time.newInstance(0, 0, 0, 0));

        SalesSummary summary = new SalesSummary();

        // Daily order counts + revenue, keyed off EffectiveDate (a Date field)
        Map<Date, DailyPoint> byDay = new Map<Date, DailyPoint>();
        for (Integer i = 0; i < windowDays; i++) {
            Date d = startDate.addDays(i);
            DailyPoint pt = new DailyPoint();
            pt.day = d;
            byDay.put(d, pt);
        }

        for (Order o : [
            SELECT Id, EffectiveDate, Order_Total__c
            FROM Order
            WHERE EffectiveDate >= :startDate
        ]) {
            Decimal total = o.Order_Total__c == null ? 0 : o.Order_Total__c;
            summary.totalOrders++;
            summary.totalRevenue += total;
            DailyPoint pt = byDay.get(o.EffectiveDate);
            if (pt != null) {
                pt.orders++;
                pt.revenue += total;
            }
        }
        summary.daily = byDay.values();
        summary.avgOrderValue = summary.totalOrders > 0
            ? (summary.totalRevenue / summary.totalOrders).setScale(2, RoundingMode.HALF_UP)
            : 0;

        // Top products by revenue over the window
        summary.topProducts = new List<TopProduct>();
        for (AggregateResult ar : [
            SELECT Product_Name__c pname,
                   SUM(Quantity__c) units,
                   SUM(Line_Total__c) revenue
            FROM Order_Item__c
            WHERE CreatedDate >= :startDt
            GROUP BY Product_Name__c
            ORDER BY SUM(Line_Total__c) DESC
            LIMIT 10
        ]) {
            TopProduct tp = new TopProduct();
            tp.name = (String) ar.get('pname');
            tp.units = ar.get('units') == null ? 0 : (Decimal) ar.get('units');
            tp.revenue = ar.get('revenue') == null ? 0 : (Decimal) ar.get('revenue');
            summary.topProducts.add(tp);
        }

        // Most recent orders regardless of window
        summary.recentOrders = new List<RecentOrder>();
        for (Order o : [
            SELECT Id, OrderNumber, Account.Name, Order_Total__c,
                   Status__c, Fulfilment_Type__c, CreatedDate
            FROM Order
            ORDER BY CreatedDate DESC
            LIMIT 8
        ]) {
            RecentOrder ro = new RecentOrder();
            ro.orderId = o.Id;
            ro.orderNumber = o.OrderNumber;
            ro.accountName = o.Account != null ? o.Account.Name : '';
            ro.total = o.Order_Total__c;
            ro.status = o.Status__c;
            ro.fulfilment = o.Fulfilment_Type__c;
            ro.createdDate = o.CreatedDate;
            summary.recentOrders.add(ro);
        }

        return summary;
    }

    /* ──────────────────────── Funnel ───────────────────────── */

    @AuraEnabled(cacheable=true)
    public static FunnelSummary getFunnelSummary(Integer days) {
        Integer windowDays = normaliseDays(days);
        Date startDate = Date.today().addDays(-(windowDays - 1));

        FunnelSummary summary = new FunnelSummary();
        summary.daily = new List<FunnelDay>();

        for (AggregateResult ar : [
            SELECT Aggregation_Date__c d,
                   SUM(Views__c) views,
                   SUM(Add_to_Cart__c) adds,
                   SUM(Checkout_Starts__c) checkouts,
                   SUM(Purchases__c) purchases,
                   SUM(Revenue__c) revenue
            FROM Funnel_Daily_Rollup__c
            WHERE Aggregation_Date__c >= :startDate
            GROUP BY Aggregation_Date__c
            ORDER BY Aggregation_Date__c ASC
        ]) {
            FunnelDay fd = new FunnelDay();
            fd.day = (Date) ar.get('d');
            fd.views = toDec(ar.get('views'));
            fd.adds = toDec(ar.get('adds'));
            fd.checkouts = toDec(ar.get('checkouts'));
            fd.purchases = toDec(ar.get('purchases'));
            fd.revenue = toDec(ar.get('revenue'));
            summary.daily.add(fd);

            summary.views += fd.views;
            summary.adds += fd.adds;
            summary.checkouts += fd.checkouts;
            summary.purchases += fd.purchases;
            summary.revenue += fd.revenue;
            if (summary.lastRollupDate == null || fd.day > summary.lastRollupDate) {
                summary.lastRollupDate = fd.day;
            }
        }

        summary.products = new List<FunnelProduct>();
        for (AggregateResult ar : [
            SELECT Product__r.Name pname,
                   SUM(Views__c) views,
                   SUM(Add_to_Cart__c) adds,
                   SUM(Purchases__c) purchases,
                   SUM(Revenue__c) revenue
            FROM Funnel_Daily_Rollup__c
            WHERE Aggregation_Date__c >= :startDate
            GROUP BY Product__r.Name
            ORDER BY SUM(Views__c) DESC
            LIMIT 15
        ]) {
            FunnelProduct fp = new FunnelProduct();
            fp.name = (String) ar.get('pname');
            fp.views = toDec(ar.get('views'));
            fp.adds = toDec(ar.get('adds'));
            fp.purchases = toDec(ar.get('purchases'));
            fp.revenue = toDec(ar.get('revenue'));
            fp.conversionPct = fp.views > 0
                ? ((fp.purchases / fp.views) * 100).setScale(1, RoundingMode.HALF_UP)
                : 0;
            summary.products.add(fp);
        }

        return summary;
    }

    /* ─────────────────── Live ops (polled) ─────────────────── */

    @AuraEnabled(cacheable=false)
    public static LiveOps getLiveOps() {
        LiveOps ops = new LiveOps();

        // Sold today — orders placed since midnight
        AggregateResult orderAgg = [
            SELECT COUNT(Id) c, SUM(Order_Total__c) rev
            FROM Order
            WHERE CreatedDate = TODAY
        ];
        ops.soldTodayOrders = orderAgg.get('c') == null ? 0 : (Integer) orderAgg.get('c');
        ops.soldTodayRevenue = orderAgg.get('rev') == null ? 0 : (Decimal) orderAgg.get('rev');

        AggregateResult unitAgg = [
            SELECT SUM(Quantity__c) units
            FROM Order_Item__c
            WHERE CreatedDate = TODAY
        ];
        ops.soldTodayUnits = unitAgg.get('units') == null ? 0 : (Decimal) unitAgg.get('units');

        // Active carts — what shoppers have in their baskets right now
        ops.carts = new List<CartRow>();
        List<Cart__c> carts = [
            SELECT Id, Owner.Name, Temporary_OwnerId__c, LastModifiedDate
            FROM Cart__c
            WHERE Status__c = 'Active'
            ORDER BY LastModifiedDate DESC
            LIMIT 50
        ];

        Map<Id, List<Cart_Item__c>> itemsByCart = new Map<Id, List<Cart_Item__c>>();
        if (!carts.isEmpty()) {
            for (Cart_Item__c item : [
                SELECT Cart__c, Quantity__c, Line_Total__c,
                       Product__r.Name, Product__r.Price__c
                FROM Cart_Item__c
                WHERE Cart__c IN :carts
            ]) {
                if (!itemsByCart.containsKey(item.Cart__c)) {
                    itemsByCart.put(item.Cart__c, new List<Cart_Item__c>());
                }
                itemsByCart.get(item.Cart__c).add(item);
            }
        }

        ops.activeCartCount = 0;
        ops.activeCartUnits = 0;
        ops.activeCartValue = 0;

        for (Cart__c cart : carts) {
            List<Cart_Item__c> items = itemsByCart.get(cart.Id);
            if (items == null || items.isEmpty()) continue; // skip empty carts

            CartRow row = new CartRow();
            row.cartId = cart.Id;
            String ownerName = cart.Owner != null ? cart.Owner.Name : '';
            row.isGuest = ownerName.containsIgnoreCase('guest');
            row.shopper = row.isGuest ? 'Guest shopper' : ownerName;
            row.lastActivity = cart.LastModifiedDate;
            row.units = 0;
            row.value = 0;

            List<String> names = new List<String>();
            for (Cart_Item__c item : items) {
                Decimal qty = item.Quantity__c == null ? 0 : item.Quantity__c;
                row.units += qty;
                if (item.Line_Total__c != null) {
                    row.value += item.Line_Total__c;
                } else if (item.Product__r.Price__c != null) {
                    row.value += item.Product__r.Price__c * qty;
                }
                if (names.size() < 3) {
                    names.add(item.Product__r.Name + ' ×' + qty.intValue());
                }
            }
            row.itemsSummary = String.join(names, ', ')
                + (items.size() > 3 ? ' +' + (items.size() - 3) + ' more' : '');

            ops.activeCartCount++;
            ops.activeCartUnits += row.units;
            ops.activeCartValue += row.value;
            ops.carts.add(row);
        }

        return ops;
    }

    /* ─────────────── Order fulfilment (staff) ─────────────── */

    // Valid staff transitions per current status. Cancelled/Refunded are
    // customer- or refund-driven and never set from the fulfilment UI.
    private static final Map<String, List<String>> NEXT_STATUSES = new Map<String, List<String>>{
        'Pending'              => new List<String>{ 'Confirmed', 'Cancelled' },
        'Confirmed'            => new List<String>{ 'Picked' },
        'Picked'               => new List<String>{ 'Shipped', 'Ready for Collection' },
        'Shipped'              => new List<String>{ 'Completed' },
        'Ready for Collection' => new List<String>{ 'Completed' }
    };

    @AuraEnabled(cacheable=false)
    public static List<OpenOrder> getOpenOrders() {
        List<OpenOrder> rows = new List<OpenOrder>();
        for (Order o : [
            SELECT Id, OrderNumber, Account.Name, Order_Total__c, Status__c,
                   Fulfilment_Type__c, Tracking_Number__c, CreatedDate,
                   Delivery_Street__c, Delivery_Suburb__c, Delivery_State__c, Delivery_Postcode__c
            FROM Order
            WHERE Status__c IN ('Pending', 'Confirmed', 'Picked', 'Shipped', 'Ready for Collection')
            ORDER BY CreatedDate ASC
            LIMIT 100
        ]) {
            OpenOrder row = new OpenOrder();
            row.orderId = o.Id;
            row.orderNumber = o.OrderNumber;
            row.accountName = o.Account != null ? o.Account.Name : '';
            row.total = o.Order_Total__c;
            row.status = o.Status__c;
            row.fulfilment = o.Fulfilment_Type__c;
            row.trackingNumber = o.Tracking_Number__c;
            row.createdDate = o.CreatedDate;
            row.deliveryAddress = o.Fulfilment_Type__c == 'Delivery'
                ? String.join(new List<String>{
                    o.Delivery_Street__c == null ? '' : o.Delivery_Street__c,
                    o.Delivery_Suburb__c == null ? '' : o.Delivery_Suburb__c,
                    o.Delivery_State__c == null ? '' : o.Delivery_State__c,
                    o.Delivery_Postcode__c == null ? '' : o.Delivery_Postcode__c
                  }, ' ').normalizeSpace()
                : null;
            row.nextStatuses = NEXT_STATUSES.containsKey(o.Status__c)
                ? NEXT_STATUSES.get(o.Status__c) : new List<String>();
            rows.add(row);
        }
        return rows;
    }

    @AuraEnabled
    public static void updateOrderStatus(Id orderId, String newStatus, String trackingNumber) {
        List<Order> orders = [SELECT Id, Status__c FROM Order WHERE Id = :orderId LIMIT 1];
        if (orders.isEmpty()) {
            throw new AuraHandledException('Order not found.');
        }
        Order order = orders[0];
        List<String> allowed = NEXT_STATUSES.containsKey(order.Status__c)
            ? NEXT_STATUSES.get(order.Status__c) : new List<String>();
        if (!allowed.contains(newStatus)) {
            throw new AuraHandledException(
                'Cannot move an order from ' + order.Status__c + ' to ' + newStatus + '.');
        }
        order.Status__c = newStatus;
        if (String.isNotBlank(trackingNumber)) {
            order.Tracking_Number__c = trackingNumber.trim();
        }
        update order;
    }

    public class OpenOrder {
        @AuraEnabled public Id orderId;
        @AuraEnabled public String orderNumber;
        @AuraEnabled public String accountName;
        @AuraEnabled public Decimal total;
        @AuraEnabled public String status;
        @AuraEnabled public String fulfilment;
        @AuraEnabled public String trackingNumber;
        @AuraEnabled public String deliveryAddress;
        @AuraEnabled public Datetime createdDate;
        @AuraEnabled public List<String> nextStatuses;
    }

    /* ──────────────────────── Reports ──────────────────────── */

    @AuraEnabled(cacheable=true)
    public static ReportLinks getReportLinks() {
        ReportLinks links = new ReportLinks();
        links.reports = new List<LinkItem>();
        links.dashboards = new List<LinkItem>();

        for (Report r : [
            SELECT Id, Name, FolderName
            FROM Report
            ORDER BY LastModifiedDate DESC
            LIMIT 20
        ]) {
            LinkItem item = new LinkItem();
            item.recordId = r.Id;
            item.name = r.Name;
            item.folder = r.FolderName;
            links.reports.add(item);
        }

        for (Dashboard d : [
            SELECT Id, Title, FolderName
            FROM Dashboard
            ORDER BY LastModifiedDate DESC
            LIMIT 20
        ]) {
            LinkItem item = new LinkItem();
            item.recordId = d.Id;
            item.name = d.Title;
            item.folder = d.FolderName;
            links.dashboards.add(item);
        }

        return links;
    }

    /* ──────────────────────── Helpers ──────────────────────── */

    private static Integer normaliseDays(Integer days) {
        if (days == null || days <= 0) return 30;
        return Math.min(days, 365);
    }

    private static Decimal toDec(Object value) {
        return value == null ? 0 : (Decimal) value;
    }

    /* ──────────────────────── Wrappers ─────────────────────── */

    public class StockSummary {
        @AuraEnabled public Integer totalSkus = 0;
        @AuraEnabled public Decimal totalUnits = 0;
        @AuraEnabled public Integer lowStockCount = 0;
        @AuraEnabled public Integer outOfStockCount = 0;
        @AuraEnabled public List<StockRow> products;
    }

    public class StockRow {
        @AuraEnabled public Id productId;
        @AuraEnabled public String name;
        @AuraEnabled public Decimal quantityOnHand;
        @AuraEnabled public Decimal minimumQuantity;
        @AuraEnabled public Decimal price;
        @AuraEnabled public String supplierName;
    }

    public class SalesSummary {
        @AuraEnabled public Integer totalOrders = 0;
        @AuraEnabled public Decimal totalRevenue = 0;
        @AuraEnabled public Decimal avgOrderValue = 0;
        @AuraEnabled public List<DailyPoint> daily;
        @AuraEnabled public List<TopProduct> topProducts;
        @AuraEnabled public List<RecentOrder> recentOrders;
    }

    public class DailyPoint {
        @AuraEnabled public Date day;
        @AuraEnabled public Integer orders = 0;
        @AuraEnabled public Decimal revenue = 0;
    }

    public class TopProduct {
        @AuraEnabled public String name;
        @AuraEnabled public Decimal units;
        @AuraEnabled public Decimal revenue;
    }

    public class RecentOrder {
        @AuraEnabled public Id orderId;
        @AuraEnabled public String orderNumber;
        @AuraEnabled public String accountName;
        @AuraEnabled public Decimal total;
        @AuraEnabled public String status;
        @AuraEnabled public String fulfilment;
        @AuraEnabled public Datetime createdDate;
    }

    public class FunnelSummary {
        @AuraEnabled public Decimal views = 0;
        @AuraEnabled public Decimal adds = 0;
        @AuraEnabled public Decimal checkouts = 0;
        @AuraEnabled public Decimal purchases = 0;
        @AuraEnabled public Decimal revenue = 0;
        @AuraEnabled public Date lastRollupDate;
        @AuraEnabled public List<FunnelDay> daily;
        @AuraEnabled public List<FunnelProduct> products;
    }

    public class FunnelDay {
        @AuraEnabled public Date day;
        @AuraEnabled public Decimal views = 0;
        @AuraEnabled public Decimal adds = 0;
        @AuraEnabled public Decimal checkouts = 0;
        @AuraEnabled public Decimal purchases = 0;
        @AuraEnabled public Decimal revenue = 0;
    }

    public class FunnelProduct {
        @AuraEnabled public String name;
        @AuraEnabled public Decimal views;
        @AuraEnabled public Decimal adds;
        @AuraEnabled public Decimal purchases;
        @AuraEnabled public Decimal revenue;
        @AuraEnabled public Decimal conversionPct;
    }

    public class LiveOps {
        @AuraEnabled public Integer soldTodayOrders = 0;
        @AuraEnabled public Decimal soldTodayUnits = 0;
        @AuraEnabled public Decimal soldTodayRevenue = 0;
        @AuraEnabled public Integer activeCartCount = 0;
        @AuraEnabled public Decimal activeCartUnits = 0;
        @AuraEnabled public Decimal activeCartValue = 0;
        @AuraEnabled public List<CartRow> carts;
    }

    public class CartRow {
        @AuraEnabled public String cartId;
        @AuraEnabled public String shopper;
        @AuraEnabled public Boolean isGuest;
        @AuraEnabled public String itemsSummary;
        @AuraEnabled public Decimal units;
        @AuraEnabled public Decimal value;
        @AuraEnabled public Datetime lastActivity;
    }

    public class ReportLinks {
        @AuraEnabled public List<LinkItem> reports;
        @AuraEnabled public List<LinkItem> dashboards;
    }

    public class LinkItem {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String name;
        @AuraEnabled public String folder;
    }
}