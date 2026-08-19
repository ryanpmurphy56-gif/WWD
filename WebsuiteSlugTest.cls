/**
 * The slug rules from docs/url-contract.md, asserted directly. Pure functions,
 * so no DML and no test user — WebsuiteSiteControllerTest covers what happens
 * when these meet the database.
 */
@isTest
private class WebsuiteSlugTest {
  @isTest
  static void normalizeLowercasesAndHyphenates() {
    System.assertEquals(
      'rubys-diner',
      WebsuiteSlug.normalize('Ruby\'s Diner'),
      'Apostrophes are deleted, spaces hyphenate'
    );
    System.assertEquals(
      'rubys-diner',
      WebsuiteSlug.normalize('Ruby’s Diner'),
      'Including the typographic apostrophe autocorrect produces'
    );
    System.assertEquals(
      'about-us',
      WebsuiteSlug.normalize('  About   Us!!  '),
      'Runs of punctuation and whitespace collapse, edges trimmed'
    );
    System.assertEquals(
      'caf-2024',
      WebsuiteSlug.normalize('Café — 2024'),
      'Accented letters are not [a-z0-9] — they hyphenate rather than fold'
    );
  }

  @isTest
  static void normalizeReturnsBlankForNothingUsable() {
    System.assertEquals('', WebsuiteSlug.normalize(null), 'null');
    System.assertEquals('', WebsuiteSlug.normalize('   '), 'whitespace');
    System.assertEquals('', WebsuiteSlug.normalize('!!! ---'), 'punctuation');
  }

  @isTest
  static void normalizeTruncatesWithoutLeavingATrailingHyphen() {
    // Exactly MAX_LENGTH characters, then a space — so the cut lands on the
    // hyphen that space became, which must not be persisted.
    String raw = 'a'.repeat(WebsuiteSlug.MAX_LENGTH) + ' more words';
    String slug = WebsuiteSlug.normalize(raw);
    System.assert(
      slug.length() <= WebsuiteSlug.MAX_LENGTH,
      'Never longer than the field: ' + slug
    );
    System.assert(!slug.endsWith('-'), 'No trailing hyphen: ' + slug);
  }

  @isTest
  static void looksLikeIdCatchesIdShapedSlugsOnly() {
    System.assert(
      WebsuiteSlug.looksLikeId('a0b7x00000abcdeuaw'),
      '18 alphanumeric characters is Id-shaped'
    );
    System.assert(
      WebsuiteSlug.looksLikeId('a0b7x00000abcde'),
      '15 alphanumeric characters is Id-shaped'
    );
    System.assert(
      !WebsuiteSlug.looksLikeId('a0b7x00000-abcdeu'),
      'A hyphen can never appear in an Id'
    );
    System.assert(
      !WebsuiteSlug.looksLikeId('rubys-diner'),
      'An ordinary slug is not Id-shaped'
    );
    System.assert(!WebsuiteSlug.looksLikeId(null), 'null is not Id-shaped');
  }

  @isTest
  static void availabilityRejectsReservedEmptyAndIdShaped() {
    System.assert(
      WebsuiteSlug.isAvailableShape('rubys-diner'),
      'ordinary slug'
    );
    System.assert(!WebsuiteSlug.isAvailableShape(''), 'empty');
    System.assert(!WebsuiteSlug.isAvailableShape('services'), 'reserved');
    System.assert(
      !WebsuiteSlug.isAvailableShape('a0b7x00000abcdeuaw'),
      'Id-shaped'
    );
  }

  @isTest
  static void toSlugOrFallsBackRatherThanReturningSomethingUnusable() {
    System.assertEquals(
      'rubys-diner',
      WebsuiteSlug.toSlugOr('Ruby\'s Diner', 'site'),
      'A usable slug is used'
    );
    System.assertEquals(
      'site',
      WebsuiteSlug.toSlugOr('!!!', 'site'),
      'Nothing usable falls back'
    );
    System.assertEquals(
      'site',
      WebsuiteSlug.toSlugOr('Setup', 'site'),
      'A reserved name falls back rather than being handed out'
    );
  }

  @isTest
  static void candidateWalksCollisionsAndStaysInsideTheField() {
    System.assertEquals(
      'rubys-diner',
      WebsuiteSlug.candidate('rubys-diner', 1),
      'The first attempt is the base itself'
    );
    System.assertEquals(
      'rubys-diner-3',
      WebsuiteSlug.candidate('rubys-diner', 3),
      'Later attempts suffix'
    );

    String long60 = 'a'.repeat(WebsuiteSlug.MAX_LENGTH);
    String suffixed = WebsuiteSlug.candidate(long60, 2);
    System.assertEquals(
      WebsuiteSlug.MAX_LENGTH,
      suffixed.length(),
      'A base already at the limit is shortened to fit its suffix'
    );
    System.assert(suffixed.endsWith('-2'), 'Suffix survives: ' + suffixed);
  }
}