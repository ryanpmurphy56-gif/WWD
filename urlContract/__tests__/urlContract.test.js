import {
  slugify,
  looksLikeId,
  isAvailableShape,
  toSlugOr,
  uniqueSlug,
  pageUrl,
  siteUrl,
  RESERVED_SLUGS,
  MAX_SLUG_LENGTH
} from "c/urlContract";

// First tests for this module — written alongside G1b, which is the first
// consumer (sitePublicRenderer's canonical-URL building) to actually exercise
// pageUrl()/siteUrl() at runtime. WebsuiteSlugTest.cls covers the Apex
// restatement of the same rules; these assert the client half stays in step
// with docs/url-contract.md §2-3, especially the two rules that fail silently
// rather than throwing: the home page never carries &page=, and a slug can
// never be Id-shaped.
describe("c/urlContract", () => {
  describe("slugify", () => {
    it("lowercases and hyphenates non-alphanumeric runs", () => {
      expect(slugify("Ruby's Diner & Grill")).toBe("rubys-diner-grill");
    });

    it("deletes apostrophes rather than hyphenating them", () => {
      // The one punctuation mark that appears *inside* a word in a business
      // name — ruby-s-diner would be a worse address than rubys-diner.
      expect(slugify("Ruby's")).toBe("rubys");
    });

    it("trims leading and trailing hyphens", () => {
      expect(slugify("  --Hello World--  ")).toBe("hello-world");
    });

    it("returns '' for input that normalises to nothing, never null", () => {
      expect(slugify("!!!")).toBe("");
      expect(slugify("")).toBe("");
    });

    it("returns '' for non-string input rather than throwing", () => {
      expect(slugify(null)).toBe("");
      expect(slugify(undefined)).toBe("");
    });

    it("truncates to MAX_SLUG_LENGTH without leaving a trailing hyphen", () => {
      const raw = "a".repeat(MAX_SLUG_LENGTH) + "-overflow";
      const result = slugify(raw);
      expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
      expect(result.endsWith("-")).toBe(false);
    });
  });

  describe("looksLikeId", () => {
    it("accepts 15 and 18 character lowercase alphanumeric strings", () => {
      expect(looksLikeId("a0b7x00000abcde")).toBe(true);
      expect(looksLikeId("a0b7x00000abcdeuaw")).toBe(true);
    });

    it("rejects a normalised slug of the same length that contains a hyphen", () => {
      expect(looksLikeId("my-long-busines")).toBe(false); // 16 chars, has hyphen
    });

    it("rejects wrong lengths and non-string input", () => {
      expect(looksLikeId("short")).toBe(false);
      expect(looksLikeId(null)).toBe(false);
      expect(looksLikeId(12345)).toBe(false);
    });
  });

  describe("isAvailableShape / toSlugOr", () => {
    it("rejects every reserved word", () => {
      for (const word of RESERVED_SLUGS) {
        expect(isAvailableShape(word)).toBe(false);
      }
    });

    it("falls back when the normalised result is reserved or Id-shaped", () => {
      expect(toSlugOr("Admin", "site")).toBe("site");
      expect(toSlugOr("a0b7x00000abcdeuaw", "site")).toBe("site");
    });

    it("keeps a normal business name as-is", () => {
      expect(toSlugOr("Ruby's Diner", "site")).toBe("rubys-diner");
    });
  });

  describe("uniqueSlug", () => {
    it("returns the base unchanged when it isn't taken", () => {
      expect(uniqueSlug("rubys-diner", new Set())).toBe("rubys-diner");
    });

    it("walks -2, -3, ... past collisions", () => {
      const taken = new Set(["rubys-diner", "rubys-diner-2", "rubys-diner-3"]);
      expect(uniqueSlug("rubys-diner", taken)).toBe("rubys-diner-4");
    });

    it("accepts a plain array as well as a Set", () => {
      expect(uniqueSlug("x", ["x"])).toBe("x-2");
    });
  });

  describe("pageUrl / siteUrl — the home-page-no-&page= rule (§2)", () => {
    it("omits &page= for the home page", () => {
      expect(
        pageUrl({ origin: "https://example.com", site: "rubys-diner", isHome: true })
      ).toBe("https://example.com/WebsitePublicSite?site=rubys-diner");
    });

    it("omits &page= when no pageSlug is given, even without isHome", () => {
      expect(pageUrl({ origin: "", site: "rubys-diner" })).toBe(
        "/WebsitePublicSite?site=rubys-diner"
      );
    });

    it("includes &page= for a non-home page", () => {
      expect(
        pageUrl({ origin: "", site: "rubys-diner", pageSlug: "about" })
      ).toBe("/WebsitePublicSite?site=rubys-diner&page=about");
    });

    it("resolves to '' with no site given, rather than a malformed URL", () => {
      expect(pageUrl({ origin: "https://example.com" })).toBe("");
    });

    it("url-encodes both the site and page values", () => {
      expect(pageUrl({ origin: "", site: "a b", pageSlug: "c&d" })).toBe(
        "/WebsitePublicSite?site=a%20b&page=c%26d"
      );
    });

    it("siteUrl is always the home form of pageUrl", () => {
      expect(siteUrl({ origin: "", site: "rubys-diner" })).toBe(
        pageUrl({ origin: "", site: "rubys-diner", isHome: true })
      );
    });
  });
});
