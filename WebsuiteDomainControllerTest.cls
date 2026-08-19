@isTest
private class WebsuiteDomainControllerTest {
    // A user holding the Websuite Command Center permission set, so tests
    // exercise the same FLS-enforced (USER_MODE) path the editor hits at
    // runtime. Same pattern as WebsuiteSiteControllerTest.buildUser().
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wsdom',
            Email = 'websuite.domain.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.domain.tester.' + System.now().getTime() + '@example.com.wstest'
        );
        insert u;
        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Websuite_Command_Center' LIMIT 1];
        insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id);
        return u;
    }

    private static Id newSite(String name) {
        Website_Site__c site = new Website_Site__c(
            Name = name,
            Config__c = '{"pages":[]}'
        );
        insert site;
        return site.Id;
    }

    @isTest
    static void getDomainReturnsNullWhenNoneExists() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('No domain yet');
            Test.startTest();
            WebsuiteDomainController.DomainView v = WebsuiteDomainController.getDomain(siteId);
            Test.stopTest();
            System.assertEquals(null, v, 'No domain claim exists for this site');
        }
    }

    @isTest
    static void addDomainInsertsWithTokenAndPendingStatus() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('Ruby\'s Diner');
            Test.startTest();
            WebsuiteDomainController.DomainView v = WebsuiteDomainController.addDomain(siteId, 'https://www.Rubys-Diner.com/');
            Test.stopTest();

            System.assertEquals('rubys-diner.com', v.domain, 'Scheme/www/trailing slash stripped, lowercased');
            System.assertEquals('Pending Verification', v.status, 'New claims start pending');
            System.assertNotEquals(null, v.verificationToken, 'A token is generated');
            System.assertEquals(32, v.verificationToken.length(), '128-bit token hex-encodes to 32 chars');
        }
    }

    @isTest
    static void addDomainAgainReplacesInPlaceRatherThanDuplicating() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('Ruby\'s Diner');
            WebsuiteDomainController.DomainView first = WebsuiteDomainController.addDomain(siteId, 'rubys-diner.com');

            Test.startTest();
            WebsuiteDomainController.DomainView second = WebsuiteDomainController.addDomain(siteId, 'rubysdiner.net');
            Test.stopTest();

            System.assertEquals('rubysdiner.net', second.domain, 'Second call overwrites the domain');
            System.assertNotEquals(first.verificationToken, second.verificationToken, 'A fresh token is generated on replace');
            List<Websuite_Domain__c> rows = [SELECT Id FROM Websuite_Domain__c WHERE Website_Site__c = :siteId];
            System.assertEquals(1, rows.size(), 'Still exactly one domain row for the site, not two');
        }
    }

    @isTest
    static void addDomainRejectsInvalidFormat() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('Bad domain');
            Boolean threw = false;
            try {
                WebsuiteDomainController.addDomain(siteId, 'not a domain');
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'A non-hostname string is rejected');
            System.assertEquals(null, WebsuiteDomainController.getDomain(siteId), 'Nothing was saved');
        }
    }

    @isTest
    static void addDomainRejectsBlank() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('Blank domain');
            Boolean threw = false;
            try {
                WebsuiteDomainController.addDomain(siteId, '   ');
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'A blank domain is rejected');
        }
    }

    @isTest
    static void addDomainRejectsOneAlreadyClaimedByAnotherSite() {
        User u = buildUser();
        System.runAs(u) {
            Id firstSiteId = newSite('First site');
            Id secondSiteId = newSite('Second site');
            WebsuiteDomainController.addDomain(firstSiteId, 'rubys-diner.com');

            Test.startTest();
            Boolean threw = false;
            try {
                WebsuiteDomainController.addDomain(secondSiteId, 'rubys-diner.com');
            } catch (AuraHandledException e) {
                // AuraHandledException.getMessage() always returns the
                // generic "Script-thrown exception" unless setMessage() was
                // called explicitly — same reason no other test in this repo
                // asserts on message content (see WebsiteSiteControllerTest).
                // The friendly text still reaches a real LWC caller via
                // error.body.message; only the in-Apex getMessage() is masked.
                threw = true;
            }
            Test.stopTest();
            System.assertEquals(true, threw, 'A domain already claimed by another site is rejected');
            System.assertEquals(null, WebsuiteDomainController.getDomain(secondSiteId), 'The second site never got a domain claim');
        }
    }

    @isTest
    static void removeDomainDeletesTheRow() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('Ruby\'s Diner');
            WebsuiteDomainController.addDomain(siteId, 'rubys-diner.com');

            Test.startTest();
            WebsuiteDomainController.removeDomain(siteId);
            Test.stopTest();

            System.assertEquals(null, WebsuiteDomainController.getDomain(siteId), 'Domain claim is gone');
            System.assertEquals(0, [SELECT COUNT() FROM Websuite_Domain__c WHERE Website_Site__c = :siteId]);
        }
    }

    @isTest
    static void removeDomainOnSiteWithNoneIsANoOp() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('Never had a domain');
            Test.startTest();
            WebsuiteDomainController.removeDomain(siteId);
            Test.stopTest();
            // No exception thrown is the assertion here.
            System.assertEquals(null, WebsuiteDomainController.getDomain(siteId));
        }
    }

    @isTest
    static void getDomainRequiresSiteId() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteDomainController.getDomain(null);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'A null siteId is rejected');
        }
    }

    @isTest
    static void getDomainExposesVerificationHostAndCnameTarget() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('Ruby\'s Diner');
            WebsuiteDomainController.DomainView v = WebsuiteDomainController.addDomain(siteId, 'rubys-diner.com');
            System.assertEquals(
                '_websuite-challenge.rubys-diner.com',
                v.verificationHost,
                'The TXT challenge host is the reserved subdomain plus the claimed domain'
            );
            System.assertNotEquals(null, v.cnameTarget, 'A CNAME target comes from Websuite_Domain_Settings__mdt');
        }
    }

    // ---- getPublicSiteOrigin (F7b-2) -----------------------------------------

    @isTest
    static void getPublicSiteOriginCombinesHostAndPathFromSettings() {
        User u = buildUser();
        System.runAs(u) {
            Test.startTest();
            String origin = WebsuiteDomainController.getPublicSiteOrigin();
            Test.stopTest();
            System.assertEquals(
                'https://ryanstest-dev-ed.develop.my.site.com/testWebsuitevforcesite',
                origin,
                'Origin is host + path from the Default Websuite_Domain_Settings__mdt record'
            );
        }
    }

    // ---- verifyDomain (G1d) -------------------------------------------------

    @isTest
    static void verifyDomainSetsVerifiedWhenTxtMatches() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('Ruby\'s Diner');
            WebsuiteDomainController.DomainView added = WebsuiteDomainController.addDomain(siteId, 'rubys-diner.com');
            Test.setMock(HttpCalloutMock.class, new DnsMock(added.verificationToken, 200));

            Test.startTest();
            WebsuiteDomainController.DomainView v = WebsuiteDomainController.verifyDomain(siteId);
            Test.stopTest();

            System.assertEquals('Verified', v.status, 'A matching TXT record verifies the domain');
        }
    }

    @isTest
    static void verifyDomainSetsFailedWhenNoTxtRecordPublished() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('Ruby\'s Diner');
            WebsuiteDomainController.addDomain(siteId, 'rubys-diner.com');
            Test.setMock(HttpCalloutMock.class, new DnsMock(null, 200)); // NXDOMAIN / no Answer

            Test.startTest();
            WebsuiteDomainController.DomainView v = WebsuiteDomainController.verifyDomain(siteId);
            Test.stopTest();

            System.assertEquals('Failed', v.status, 'No TXT record yet is a definitive not-verified, not left pending');
        }
    }

    @isTest
    static void verifyDomainSetsFailedWhenTxtValueDoesNotMatch() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('Ruby\'s Diner');
            WebsuiteDomainController.addDomain(siteId, 'rubys-diner.com');
            Test.setMock(HttpCalloutMock.class, new DnsMock('not-the-right-token', 200));

            Test.startTest();
            WebsuiteDomainController.DomainView v = WebsuiteDomainController.verifyDomain(siteId);
            Test.stopTest();

            System.assertEquals('Failed', v.status, 'A wrong TXT value fails verification');
        }
    }

    @isTest
    static void verifyDomainThrowsAndLeavesStatusUnchangedOnResolverError() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('Ruby\'s Diner');
            WebsuiteDomainController.addDomain(siteId, 'rubys-diner.com');
            Test.setMock(HttpCalloutMock.class, new DnsMock(null, 500));

            Test.startTest();
            Boolean threw = false;
            try {
                WebsuiteDomainController.verifyDomain(siteId);
            } catch (AuraHandledException e) {
                threw = true;
            }
            Test.stopTest();

            System.assertEquals(true, threw, 'A resolver-side failure surfaces as an error, not a false verdict');
            System.assertEquals(
                'Pending Verification',
                WebsuiteDomainController.getDomain(siteId).status,
                'Status is untouched when WebSuite could not actually reach the resolver'
            );
        }
    }

    @isTest
    static void verifyDomainRequiresAnExistingDomainClaim() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = newSite('No domain yet');
            Boolean threw = false;
            try {
                WebsuiteDomainController.verifyDomain(siteId);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Verifying with nothing claimed is rejected');
        }
    }

    // Minimal DNS-over-HTTPS (dns.google /resolve) mock. Apex inner classes
    // can't hold static members, so state is passed through the
    // constructor rather than set on the class the way PnPStripeMock does.
    // txtValue null means "no Answer array" (NXDOMAIN / no records); a
    // non-null value returns one TXT Answer carrying it quoted, matching
    // Google's real response shape.
    private class DnsMock implements HttpCalloutMock {
        private String txtValue;
        private Integer statusCode;

        DnsMock(String txtValue, Integer statusCode) {
            this.txtValue = txtValue;
            this.statusCode = statusCode;
        }

        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setStatusCode(statusCode);
            if (statusCode != 200) {
                res.setBody('{"error":"resolver unavailable"}');
            } else if (txtValue == null) {
                res.setBody('{"Status":3,"Answer":null}');
            } else {
                res.setBody('{"Status":0,"Answer":[{"name":"challenge.","type":16,"TTL":300,"data":"\\"' + txtValue + '\\""}]}');
            }
            return res;
        }
    }
}
