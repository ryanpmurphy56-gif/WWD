/**
 * WebsuiteDemoData — builds three complete example sites (restaurant, trades,
 * portfolio) as SiteConfig documents and inserts them as Website_Site__c records
 * for stakeholder demos. Idempotent: re-running clears prior "(demo)" records
 * first, so the demo set is always reproducible.
 *
 * The configs match the section registry's content shapes exactly, so every
 * seeded section renders and edits like one added in the editor.
 */
public with sharing class WebsuiteDemoData {
    private static Integer counter = 0;

    private static String nid() {
        counter++;
        return 'demo-' + counter;
    }

    // ---- small builders --------------------------------------------------
    private static Map<String, Object> styleMap(String bg, String tone, String pad) {
        return new Map<String, Object>{ 'background' => bg, 'tone' => tone, 'padding' => pad };
    }

    private static Map<String, Object> layoutMap(Integer colStart, Integer colSpan, String valign) {
        return new Map<String, Object>{ 'colStart' => colStart, 'colSpan' => colSpan, 'valign' => valign };
    }

    private static Map<String, Object> sec(
        String type,
        String variant,
        Map<String, Object> content,
        Map<String, Object> style,
        Map<String, Object> layout
    ) {
        return new Map<String, Object>{
            'sectionId' => nid(),
            'type' => type,
            'variant' => variant,
            'content' => content,
            'style' => style,
            'layout' => layout
        };
    }

    private static Map<String, Object> pg(
        String title,
        String slug,
        Boolean isHome,
        String purpose,
        List<Object> sections
    ) {
        return new Map<String, Object>{
            'pageId' => nid(),
            'title' => title,
            'slug' => slug,
            'isHome' => isHome,
            'inNav' => true,
            'purpose' => purpose,
            'sections' => sections
        };
    }

    private static Map<String, Object> pair(String k1, Object v1, String k2, Object v2) {
        return new Map<String, Object>{ k1 => v1, k2 => v2 };
    }

    private static String config(
        String biz,
        String tagline,
        String category,
        String personality,
        Map<String, Object> palette,
        String fontPair,
        String radius,
        String spacing,
        String motion,
        List<Object> pages
    ) {
        Map<String, Object> meta = new Map<String, Object>{
            'businessName' => biz,
            'tagline' => tagline,
            'category' => category,
            'goal' => 'leads',
            'description' => '',
            'contact' => new Map<String, Object>{ 'email' => '', 'phone' => '', 'address' => '', 'hours' => '' },
            'social' => new Map<String, Object>{ 'instagram' => '', 'facebook' => '', 'linkedin' => '' },
            'logoAssetId' => null
        };
        Map<String, Object> theme = new Map<String, Object>{
            'personality' => personality,
            'palette' => palette,
            'fontPair' => fontPair,
            'radius' => radius,
            'spacing' => spacing,
            'motion' => motion
        };
        Map<String, Object> cfg = new Map<String, Object>{
            'siteId' => nid(),
            'meta' => meta,
            'theme' => theme,
            'pages' => pages,
            'history' => new Map<String, Object>{ 'savedAt' => null, 'version' => 1 }
        };
        return JSON.serialize(cfg);
    }

    // ---- content shortcuts ----------------------------------------------
    private static Map<String, Object> hero(String h, String s, String cta) {
        return new Map<String, Object>{
            'heading' => h,
            'subheading' => s,
            'ctaLabel' => cta,
            'ctaTarget' => '',
            'imageAssetId' => null
        };
    }

    private static Map<String, Object> nav(String brand, String cta) {
        return new Map<String, Object>{ 'brand' => brand, 'ctaLabel' => cta };
    }

    private static Map<String, Object> textBlock(String h, String b) {
        return new Map<String, Object>{ 'heading' => h, 'body' => b };
    }

    private static Map<String, Object> feat(String t, String b) {
        return new Map<String, Object>{ 'title' => t, 'body' => b };
    }

    private static Map<String, Object> quote(String q, String a) {
        return new Map<String, Object>{ 'quote' => q, 'author' => a };
    }

    private static Map<String, Object> tier(String n, String p, String b) {
        return new Map<String, Object>{ 'name' => n, 'price' => p, 'body' => b };
    }

    private static Map<String, Object> shot(String caption) {
        return new Map<String, Object>{ 'caption' => caption };
    }

    private static Map<String, Object> items(List<Object> entries) {
        return new Map<String, Object>{ 'items' => entries };
    }

    // ---- the three sites -------------------------------------------------
    private static String restaurant() {
        List<Object> home = new List<Object>{
            sec('navHeader', 'left', nav('Harvest & Vine', 'Book a table'), styleMap('surface', 'light', 'S'), layoutMap(1, 12, 'center')),
            sec('hero', 'centered', hero('Seasonal plates, natural wine', 'A small kitchen in Fitzroy cooking whatever the farms send us this week.', 'Reserve a table'), styleMap('image', 'light', 'L'), layoutMap(3, 8, 'center')),
            sec('features', 'three-up', items(new List<Object>{ feat('Grown near', 'Produce from growers within a day of the door.'), feat('Natural wine', 'Forty low-intervention bottles, always changing.'), feat('Walk-ins', 'A few seats held back for the brave each night.') }), styleMap('surface', 'light', 'M'), layoutMap(2, 10, 'center')),
            sec('gallery', 'grid', items(new List<Object>{ shot('The room'), shot('Wood grill'), shot('The bar'), shot('Dessert') }), styleMap('surface', 'light', 'M'), layoutMap(2, 10, 'center')),
            sec('testimonials', 'single', items(new List<Object>{ quote('The best meal we had all year.', 'Broadsheet'), quote('Unfussy, generous, delicious.', 'A regular') }), styleMap('primary', 'light', 'M'), layoutMap(3, 8, 'center')),
            sec('footer', 'simple', new Map<String, Object>{ 'text' => 'Harvest & Vine · 214 Gertrude St, Fitzroy · Wed–Sun from 5pm' }, styleMap('primary', 'light', 'M'), layoutMap(1, 12, 'center'))
        };
        List<Object> menu = new List<Object>{
            sec('navHeader', 'left', nav('Harvest & Vine', 'Book a table'), styleMap('surface', 'light', 'S'), layoutMap(1, 12, 'center')),
            sec('textBlock', 'centered', textBlock('What we are cooking', 'The menu changes with the week. Here is the shape of it — the detail lands on the specials board.'), styleMap('surface', 'light', 'M'), layoutMap(3, 8, 'center')),
            sec('features', 'three-up', items(new List<Object>{ feat('To start', 'Bread, cultured butter, and a few small things to share.'), feat('From the grill', 'Whole fish, dry-aged beef, roots and greens.'), feat('To finish', 'One tart, one soft-serve, always changing.') }), styleMap('surface', 'light', 'M'), layoutMap(2, 10, 'center')),
            sec('footer', 'simple', new Map<String, Object>{ 'text' => 'Harvest & Vine · 214 Gertrude St, Fitzroy' }, styleMap('primary', 'light', 'M'), layoutMap(1, 12, 'center'))
        };
        return config(
            'Harvest & Vine',
            'Seasonal kitchen & wine bar',
            'restaurant',
            'warm',
            new Map<String, Object>{ 'primary' => '#B5451B', 'secondary' => '#E0A458', 'surface' => '#FBF6EF', 'text' => '#2A1A12' },
            'serif-classic',
            'soft',
            'comfortable',
            'subtle',
            new List<Object>{ pg('Home', 'home', true, 'Set the tone and drive bookings', home), pg('Menu', 'menu', false, 'Show the food', menu) }
        );
    }

    private static String trades() {
        List<Object> home = new List<Object>{
            sec('navHeader', 'left', nav('Ironclad Plumbing', 'Get a quote'), styleMap('surface', 'light', 'S'), layoutMap(1, 12, 'center')),
            sec('hero', 'centered', hero('Plumbing done properly, first time', 'Licensed, insured, on time. Servicing all of Geelong and the Bellarine, 7 days.', 'Book a plumber'), styleMap('primary', 'light', 'L'), layoutMap(3, 8, 'center')),
            sec('features', 'three-up', items(new List<Object>{ feat('Blocked drains', 'Camera, jet, and a clear drain — same visit.'), feat('Hot water', 'Repairs and replacements across every brand.'), feat('Leaks & bursts', 'Found fast, fixed properly, mess cleaned up.') }), styleMap('surface', 'light', 'M'), layoutMap(2, 10, 'center')),
            sec('pricing', 'tiers', items(new List<Object>{ tier('Call-out', '$89', 'Standard call-out, waived when you go ahead.'), tier('Emergency', '$149', '24/7 rapid response, any hour.'), tier('Care plan', '$29/mo', 'Annual check plus priority booking.') }), styleMap('surface', 'light', 'M'), layoutMap(2, 10, 'center')),
            sec('testimonials', 'single', items(new List<Object>{ quote('Turned up on time and sorted it in an hour.', 'Dave, Highton'), quote('Honest quote, no surprises.', 'Priya, Newtown') }), styleMap('primary', 'light', 'M'), layoutMap(3, 8, 'center')),
            sec('contact', 'form', textBlock('Get a straight quote', 'Tell us what is going on and we will come back with a fixed price today.'), styleMap('surface', 'light', 'M'), layoutMap(3, 8, 'center')),
            sec('footer', 'simple', new Map<String, Object>{ 'text' => 'Ironclad Plumbing · Lic. 000000 · Geelong & Bellarine · 7 days' }, styleMap('primary', 'light', 'M'), layoutMap(1, 12, 'center'))
        };
        List<Object> services = new List<Object>{
            sec('navHeader', 'left', nav('Ironclad Plumbing', 'Get a quote'), styleMap('surface', 'light', 'S'), layoutMap(1, 12, 'center')),
            sec('features', 'four-up', items(new List<Object>{ feat('General plumbing', 'Taps, toilets, leaks, the lot.'), feat('Hot water', 'Gas, electric, heat pump, solar.'), feat('Drains', 'Blockages, CCTV, relining.'), feat('Renovations', 'Bathrooms and kitchens, roughed-in right.') }), styleMap('surface', 'light', 'M'), layoutMap(2, 10, 'center')),
            sec('footer', 'simple', new Map<String, Object>{ 'text' => 'Ironclad Plumbing · Geelong & Bellarine' }, styleMap('primary', 'light', 'M'), layoutMap(1, 12, 'center'))
        };
        return config(
            'Ironclad Plumbing',
            'Licensed plumbers, 7 days',
            'services',
            'bold',
            new Map<String, Object>{ 'primary' => '#0A0A0A', 'secondary' => '#FF5B04', 'surface' => '#FFFFFF', 'text' => '#0A0A0A' },
            'grotesk',
            'sharp',
            'comfortable',
            'energetic',
            new List<Object>{ pg('Home', 'home', true, 'Win the enquiry', home), pg('Services', 'services', false, 'List the work', services) }
        );
    }

    private static String portfolio() {
        List<Object> home = new List<Object>{
            sec('navHeader', 'left', nav('Mara Studio', 'Work with us'), styleMap('surface', 'light', 'S'), layoutMap(1, 12, 'center')),
            sec('hero', 'centered', hero('Design & art direction', 'An independent studio for brands that care about the details.', 'View work'), styleMap('surface', 'light', 'L'), layoutMap(2, 8, 'center')),
            sec('gallery', 'grid', items(new List<Object>{ shot('Aesop — identity'), shot('Koto — packaging'), shot('Ren — website'), shot('Field — brand') }), styleMap('surface', 'light', 'M'), layoutMap(2, 10, 'center')),
            sec('textBlock', 'centered', textBlock('About', 'We are a two-person studio in Melbourne working with founders, galleries and good restaurants. Small on purpose.'), styleMap('surface', 'light', 'M'), layoutMap(3, 6, 'center')),
            sec('testimonials', 'single', items(new List<Object>{ quote('They understood the brief better than we did.', 'Founder, Koto'), quote('Calm, sharp, a pleasure.', 'Director, Field') }), styleMap('primary', 'light', 'M'), layoutMap(3, 8, 'center')),
            sec('footer', 'simple', new Map<String, Object>{ 'text' => 'Mara Studio · Melbourne · hello@mara.studio' }, styleMap('surface', 'light', 'M'), layoutMap(1, 12, 'center'))
        };
        List<Object> work = new List<Object>{
            sec('navHeader', 'left', nav('Mara Studio', 'Work with us'), styleMap('surface', 'light', 'S'), layoutMap(1, 12, 'center')),
            sec('gallery', 'grid', items(new List<Object>{ shot('Aesop — identity'), shot('Koto — packaging'), shot('Ren — website'), shot('Field — brand'), shot('Ora — signage'), shot('Neue — type') }), styleMap('surface', 'light', 'L'), layoutMap(2, 10, 'center')),
            sec('footer', 'simple', new Map<String, Object>{ 'text' => 'Mara Studio · Melbourne' }, styleMap('surface', 'light', 'M'), layoutMap(1, 12, 'center'))
        };
        return config(
            'Mara Studio',
            'Design & art direction',
            'portfolio',
            'minimal',
            new Map<String, Object>{ 'primary' => '#111827', 'secondary' => '#6B7280', 'surface' => '#FFFFFF', 'text' => '#111827' },
            'sans-modern',
            'sharp',
            'spacious',
            'none',
            new List<Object>{ pg('Home', 'home', true, 'Show taste fast', home), pg('Work', 'work', false, 'Show the work', work) }
        );
    }

    /**
     * Clears prior demo sites and inserts a fresh set. Returns the new record Ids.
     */
    public static List<Id> createDemoSites() {
        delete [SELECT Id FROM Website_Site__c WHERE Name LIKE '%(demo)'];
        counter = 0;
        List<Website_Site__c> sites = new List<Website_Site__c>{
            new Website_Site__c(Name = 'Harvest & Vine (demo)', Config__c = restaurant()),
            new Website_Site__c(Name = 'Ironclad Plumbing (demo)', Config__c = trades()),
            new Website_Site__c(Name = 'Mara Studio (demo)', Config__c = portfolio())
        };
        insert sites;
        List<Id> ids = new List<Id>();
        for (Website_Site__c s : sites) {
            ids.add(s.Id);
        }
        return ids;
    }
}