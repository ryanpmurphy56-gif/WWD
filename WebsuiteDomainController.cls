/**
 * G1c/G1d — customer-facing custom domain records and DNS go-live.
 * One Websuite_Domain__c holds one site's claimed domain, a generated
 * verification token, and a status driven by verifyDomain().
 *
 * getDomain()    — reads the site's current domain claim, or null if none.
 * addDomain()    — validates + normalises a domain, then creates or replaces
 *                  the site's one active claim (upsert, not strict create-once).
 * removeDomain() — deletes the site's domain claim, if any.
 * verifyDomain() — G1d. Looks up the TXT record the customer is asked to
 *                  publish at VERIFICATION_SUBDOMAIN + their domain, via a
 *                  DNS-over-HTTPS callout, and sets Status__c to Verified or
 *                  Failed based on whether it matches Verification_Token__c.
 *
 * What this class still does NOT do: attach the domain to the Site or
 * provision SSL — that remains a manual Setup step, documented in
 * docs/domain-go-live-runbook.md, because Salesforce only hands back the
 * per-domain Edge configuration once an admin registers the domain there.
 * See docs/url-contract.md §8.
 *
 * Kept separate from WebsiteSiteController (whose own doc comment enumerates
 * its exact method list) rather than folded into it — one controller per
 * concern, same as WebsuiteFormController/WebsuiteAssetController/
 * WebsuiteReviewController.
 */
public with sharing class WebsuiteDomainController {
  // Reserved subdomain the customer publishes their verification TXT record
  // under, rather than at the domain's own root — a root TXT record often
  // already carries SPF/other values, and mixing our token in with those
  // invites a copy-paste error on either side. Kept off the RESERVED list in
  // docs/url-contract.md §3 on purpose: that list guards path segments once
  // a domain fronts the Site (G1d's still-open item), this is a DNS label,
  // a different namespace entirely.
  private static final String VERIFICATION_SUBDOMAIN = '_websuite-challenge';

  /**
   * F7b-2. The live origin ({host}/{path}) that a published site's default
   * (non-custom-domain) address hangs off of — `c/urlContract.siteUrl()`
   * appends SITE_PATH and the query string on the client side, same as every
   * other consumer of that module. Not folded into DomainView: this is true
   * for every site regardless of whether it has a Websuite_Domain__c claim,
   * so callers that just want "where can I see my site live" (the hub, the
   * toolbar) don't need to load domain state to get it.
   */
  @AuraEnabled(cacheable=true)
  public static String getPublicSiteOrigin() {
    List<Websuite_Domain_Settings__mdt> settings = [
      SELECT Public_Site_Host__c, Public_Site_Path__c
      FROM Websuite_Domain_Settings__mdt
      WHERE DeveloperName = 'Default'
      LIMIT 1
    ];
    if (settings.isEmpty() || String.isBlank(settings[0].Public_Site_Host__c)) {
      return null;
    }
    String path = settings[0].Public_Site_Path__c;
    return 'https://' + settings[0].Public_Site_Host__c + (String.isBlank(path) ? '' : '/' + path);
  }

  @AuraEnabled(cacheable=true)
  public static DomainView getDomain(Id siteId) {
    if (siteId == null) {
      throw new AuraHandledException('A site record is required.');
    }
    List<Websuite_Domain__c> domains = [
      SELECT Id, Domain__c, Status__c, Verification_Token__c, CreatedDate, LastModifiedDate
      FROM Websuite_Domain__c
      WHERE Website_Site__c = :siteId
      WITH USER_MODE
      LIMIT 1
    ];
    return domains.isEmpty() ? null : toView(domains[0]);
  }

  /**
   * Matches a bare hostname: dot-separated labels of letters/digits/hyphens
   * (never starting or ending a label with a hyphen), a final label of at
   * least two letters. No scheme, no path, no port — normalize() strips
   * those before this ever runs.
   */
  private static final Pattern HOSTNAME = Pattern.compile(
    '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$'
  );

  /**
   * Create or replace the site's one active domain claim. A second call for
   * the same site updates the existing row in place (new domain, fresh
   * token, status reset) rather than requiring a separate remove first —
   * "add a domain" reads as upsert, and a typo shouldn't need two round
   * trips to fix.
   */
  @AuraEnabled
  public static DomainView addDomain(Id siteId, String domain) {
    if (siteId == null) {
      throw new AuraHandledException('A site record is required.');
    }
    String normalized = normalize(domain);
    if (String.isBlank(normalized) || !HOSTNAME.matcher(normalized).matches()) {
      throw new AuraHandledException(
        'That doesn\'t look like a domain — try something like yourbusiness.com.'
      );
    }
    List<Websuite_Domain__c> existing = [
      SELECT Id
      FROM Websuite_Domain__c
      WHERE Website_Site__c = :siteId
      WITH USER_MODE
      LIMIT 1
    ];
    Websuite_Domain__c record = existing.isEmpty()
      ? new Websuite_Domain__c(Website_Site__c = siteId)
      : new Websuite_Domain__c(Id = existing[0].Id);
    record.Domain__c = normalized;
    record.Verification_Token__c = generateToken();
    record.Status__c = 'Pending Verification';
    try {
      if (existing.isEmpty()) {
        insert as system record;
      } else {
        update as system record;
      }
    } catch (DmlException e) {
      if (isDuplicateValue(e)) {
        throw new AuraHandledException(
          '"' + normalized + '" is already connected to another site — try another.'
        );
      }
      throw new AuraHandledException(e.getMessage());
    }
    // Re-query rather than build the view off `record` directly — CreatedDate
    // is server-populated and isn't reflected back onto the sObject variable
    // by `insert`/`update` the way Id is.
    return getDomain(siteId);
  }

  /** Deletes the site's domain claim. Not an error if it has none. */
  @AuraEnabled
  public static void removeDomain(Id siteId) {
    if (siteId == null) {
      throw new AuraHandledException('A site record is required.');
    }
    List<Websuite_Domain__c> existing = [
      SELECT Id
      FROM Websuite_Domain__c
      WHERE Website_Site__c = :siteId
      WITH USER_MODE
      LIMIT 1
    ];
    if (existing.isEmpty()) {
      return;
    }
    try {
      delete as system existing[0];
    } catch (DmlException e) {
      throw new AuraHandledException(e.getMessage());
    }
  }

  /**
   * G1d. Reads the TXT record at VERIFICATION_SUBDOMAIN + the claimed domain
   * via DNS-over-HTTPS and compares it against Verification_Token__c.
   *
   * Three outcomes, deliberately not conflated:
   *  - Token found and matches  -> Status__c = 'Verified'.
   *  - A real DNS answer came back (record missing, NXDOMAIN, or a value
   *    that doesn't match)      -> Status__c = 'Failed'. The customer got a
   *    definitive "not yet right" and can fix their DNS and retry.
   *  - The callout itself failed (timeout, non-200, unparseable body) -> an
   *    AuraHandledException, Status__c left untouched. This is WebSuite's
   *    problem reaching the resolver, not evidence the customer did
   *    anything wrong — writing 'Failed' here would be misleading.
   */
  @AuraEnabled
  public static DomainView verifyDomain(Id siteId) {
    if (siteId == null) {
      throw new AuraHandledException('A site record is required.');
    }
    List<Websuite_Domain__c> existing = [
      SELECT Id, Domain__c, Verification_Token__c
      FROM Websuite_Domain__c
      WHERE Website_Site__c = :siteId
      WITH USER_MODE
      LIMIT 1
    ];
    if (existing.isEmpty()) {
      throw new AuraHandledException('Add a domain before verifying it.');
    }
    Websuite_Domain__c domainRow = existing[0];
    Boolean matched = lookupTxtMatches(domainRow.Domain__c, domainRow.Verification_Token__c);

    Websuite_Domain__c statusUpdate = new Websuite_Domain__c(
      Id = domainRow.Id,
      Status__c = matched ? 'Verified' : 'Failed'
    );
    try {
      update as system statusUpdate;
    } catch (DmlException e) {
      throw new AuraHandledException(e.getMessage());
    }
    return getDomain(siteId);
  }

  // Issues the DoH GET and returns whether any TXT answer, quotes stripped,
  // equals the expected token exactly. Throws AuraHandledException (rather
  // than returning false) for anything that means "we couldn't actually
  // check" as opposed to "we checked and it's wrong" — see verifyDomain's
  // doc comment for why that distinction matters to Status__c.
  private static Boolean lookupTxtMatches(String domain, String expectedToken) {
    HttpRequest req = new HttpRequest();
    req.setEndpoint(
      'https://dns.google/resolve?name=' +
      EncodingUtil.urlEncode(VERIFICATION_SUBDOMAIN + '.' + domain, 'UTF-8') +
      '&type=TXT'
    );
    req.setMethod('GET');
    req.setTimeout(10000);

    HttpResponse res;
    try {
      res = new Http().send(req);
    } catch (System.CalloutException e) {
      throw new AuraHandledException('Could not reach the DNS resolver — try again in a moment.');
    }
    if (res.getStatusCode() != 200) {
      throw new AuraHandledException('The DNS resolver returned an unexpected response — try again in a moment.');
    }

    Map<String, Object> body;
    try {
      body = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    } catch (System.JSONException e) {
      throw new AuraHandledException('The DNS resolver returned an unreadable response — try again in a moment.');
    }

    List<Object> answers = (List<Object>) body.get('Answer');
    if (answers == null) {
      return false; // NXDOMAIN or NOERROR-with-no-records both land here — nothing published yet.
    }
    for (Object rawAnswer : answers) {
      Map<String, Object> answer = (Map<String, Object>) rawAnswer;
      String data = (String) answer.get('data');
      if (data != null && stripQuotes(data) == expectedToken) {
        return true;
      }
    }
    return false;
  }

  // DoH TXT answers come back double-quoted (RFC 1035 presentation format);
  // a real TXT value can never legitimately start and end with '"' itself
  // since our token is a plain hex string, so a blind strip is safe here.
  private static String stripQuotes(String data) {
    if (data.startsWith('"') && data.endsWith('"') && data.length() >= 2) {
      return data.substring(1, data.length() - 1);
    }
    return data;
  }

  /**
   * Lowercase; strip a leading scheme, a leading 'www.', and any trailing
   * path/slash/dot — so "https://www.Rubys-Diner.com/" and "rubys-diner.com"
   * both store identically.
   */
  private static String normalize(String raw) {
    if (String.isBlank(raw)) {
      return '';
    }
    String s = raw.trim().toLowerCase();
    s = s.replaceAll('^[a-z]+://', '');
    s = s.replaceAll('^www\\.', '');
    Integer cut = s.indexOf('/');
    if (cut >= 0) {
      s = s.substring(0, cut);
    }
    return s.replaceAll('\\.+$', '');
  }

  // Public verification value, not a secret — it's meant to be published in
  // the customer's own DNS, so 128 bits (the same Crypto.generateAesKey
  // primitive WebsuiteMemberAuthController/WebsuiteAccountAuthController use
  // for their session tokens) is standard practice here without needing
  // their 256-bit bearer-credential strength.
  private static String generateToken() {
    return EncodingUtil.convertToHex(Crypto.generateAesKey(128));
  }

  // A unique-index violation, as opposed to any other DML failure. Guarded
  // on getNumDml() because getDmlType(0) throws on an exception carrying no
  // rows. Same pattern as WebsiteSiteController.isDuplicateValue.
  private static Boolean isDuplicateValue(DmlException e) {
    return e.getNumDml() > 0 && e.getDmlType(0) == StatusCode.DUPLICATE_VALUE;
  }

  private static DomainView toView(Websuite_Domain__c d) {
    DomainView v = new DomainView();
    v.id = d.Id;
    v.domain = d.Domain__c;
    v.status = d.Status__c;
    v.verificationToken = d.Verification_Token__c;
    v.verificationHost = VERIFICATION_SUBDOMAIN + '.' + d.Domain__c;
    Websuite_Domain_Settings__mdt settings = publicSiteSettings();
    v.cnameTarget = settings?.Public_Site_Host__c;
    v.publicSitePath = settings?.Public_Site_Path__c;
    v.createdAt = d.CreatedDate;
    v.lastCheckedAt = d.LastModifiedDate;
    return v;
  }

  // Org-wide, not per-domain — every published site is served by the same
  // classic-Site host+path (docs/url-contract.md §1), so this is one config
  // record, not something addDomain/verifyDomain compute. Kept in a Custom
  // Metadata Type rather than hardcoded so an org migration is a data edit,
  // not a code change. Public_Site_Host__c alone is the CNAME target (a
  // CNAME can only ever be a bare host); Public_Site_Path__c is exposed
  // alongside it only for building a full reference URL to show in the hub
  // and the go-live runbook, never consumed by verifyDomain's DNS check.
  private static Websuite_Domain_Settings__mdt publicSiteSettings() {
    List<Websuite_Domain_Settings__mdt> settings = [
      SELECT Public_Site_Host__c, Public_Site_Path__c
      FROM Websuite_Domain_Settings__mdt
      WHERE DeveloperName = 'Default'
      LIMIT 1
    ];
    return settings.isEmpty() ? null : settings[0];
  }

  public class DomainView {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String domain;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String verificationToken;
    // Where the customer publishes the TXT record verifyDomain checks.
    @AuraEnabled
    public String verificationHost;
    // Where the customer points a CNAME for their domain to actually serve
    // traffic once the Setup runbook is completed. Not consumed by any
    // check today — DNS propagation of this is the customer/DNS host's
    // concern, not something verifyDomain confirms (see its doc comment).
    @AuraEnabled
    public String cnameTarget;
    @AuraEnabled
    public DateTime createdAt;
    @AuraEnabled
    public DateTime lastCheckedAt;
  }
}
