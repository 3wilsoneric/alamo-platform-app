import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const storeRoot = await mkdtemp(path.join(os.tmpdir(), "alamo-acquisition-check-"));
await mkdir(path.join(storeRoot, "derived"), { recursive: true });
const fixtureCounts = {
  total: 1,
  include: 1,
  review: 0,
  exclude: 0
};
await writeFile(path.join(storeRoot, "derived/manifest.json"), JSON.stringify({
  version: 1,
  generatedAt: "2026-09-07T00:00:00.000Z",
  datasetYear: 2024,
  status: "discovery_only",
  identityJoinStatus: "not_publicly_available",
  caveat: "The source layers do not expose a shared public record identifier.",
  limitations: ["Discovery only."],
  publicUse: {
    rawRecords: 27957,
    usStateRecords: 27763,
    counts: {
      privateForProfit: 8060,
      adult: 13335,
      residential: 4938,
      preliminaryPrivateAdultResidential: 787,
      preliminaryCoreCandidates: 787
    },
    byState: { ID: { rawRecords: 233, preliminaryCandidates: 2, coreCandidates: 2 } }
  },
  directory: { counts: fixtureCounts, byState: { ID: fixtureCounts } }
}));
await writeFile(path.join(storeRoot, "derived/facility-directory.json"), JSON.stringify({
  version: 1,
  generatedAt: "2026-09-07T00:00:00.000Z",
  facilities: [{
    id: "ft-test",
    name: "Example Residential Center",
    secondaryName: "",
    address: { street1: "100 Main Street", street2: "", city: "Boise", stateCode: "ID", zip: "83702" },
    phone: "",
    website: "",
    typeFacilities: ["MH"],
    services: {
      FOP: ["Private for-profit organization"],
      SET: ["Residential/24-hour residential"],
      AGE: ["Adults"],
      TC: ["Mental health treatment"]
    },
    sourceRowCount: 1,
    disposition: "include",
    reasons: ["private for-profit, adult, residential, and mental-health signal"],
    tags: ["private_for_profit_signal", "adult_signal", "residential_signal"],
    verificationStatus: "directory_discovery_only",
    licenseMatchStatus: "pending",
    ownershipResolutionStatus: "unresolved"
  }]
}));
process.env.ACQUISITION_INTELLIGENCE_ROOT = storeRoot;
const {
  acquisitionWebsiteDomain,
  buildAcquisitionOperatorIndex,
  isValidatedAcquisitionTarget
} = await import("../shared/acquisition-operator-resolution.mjs");
const fixtureDirectory = JSON.parse(await readFile(path.join(storeRoot, "derived/facility-directory.json"), "utf8"));
const operatorFixture = buildAcquisitionOperatorIndex([
  { ...fixtureDirectory.facilities[0], website: "https://example-health.test" },
  {
    ...fixtureDirectory.facilities[0],
    id: "ft-test-2",
    name: "Example Residential Center North",
    address: { ...fixtureDirectory.facilities[0].address, city: "Meridian" },
    website: "https://example-health.test/programs"
  },
  {
    ...fixtureDirectory.facilities[0],
    id: "ft-test-3",
    name: "Example Residential Center East",
    address: { ...fixtureDirectory.facilities[0].address, city: "Nampa" },
    website: "https://example-health.test/locations/nampa"
  },
  {
    ...fixtureDirectory.facilities[0],
    id: "ft-test-4",
    name: "Example Residential Center West",
    address: { ...fixtureDirectory.facilities[0].address, city: "Caldwell" },
    website: "https://example-health.test/locations/caldwell"
  },
  {
    ...fixtureDirectory.facilities[0],
    id: "ft-test-ca",
    address: { ...fixtureDirectory.facilities[0].address, stateCode: "CA", city: "Sacramento" }
  }
], { generatedAt: "2026-09-07T00:00:00.000Z", excludedStateCodes: ["CA"] });
const evidenceParentFixture = buildAcquisitionOperatorIndex([
  { ...fixtureDirectory.facilities[0], id: "private-a", website: "https://brand-a.test" },
  { ...fixtureDirectory.facilities[0], id: "private-b", name: "Second Brand", website: "https://brand-b.test" },
  { ...fixtureDirectory.facilities[0], id: "public-a", name: "Public Brand", website: "https://public-brand.test" }
], {
  generatedAt: "2026-09-07T00:00:00.000Z",
  excludedStateCodes: ["CA"],
  parentAssertions: [
    {
      id: "private-parent",
      operatingParentName: "Private Parent",
      canonicalLegalName: "Private Parent LLC",
      primaryDomain: "private-parent.test",
      sponsorName: "Example Sponsor",
      ownershipType: "private_equity_backed",
      acquisitionEligibility: "eligible_private",
      valuationModel: {
        segmentId: "high_acuity_smi_residential",
        selectionBasis: "Fixture core residential capacity."
      },
      matchedDomains: ["brand-a.test", "brand-b.test"],
      confidence: { relationship: "high", legalIdentity: "high", ownership: "high", targetFit: "medium", capacity: "unverified", valuation: "unverified" },
      sources: [{ id: "private-source", sourceType: "first_party", title: "Parent structure", url: "https://private-parent.test/about", asOf: "2026-09-07", supports: ["operating_parent"] }],
      contradictions: []
    },
    {
      id: "public-parent",
      operatingParentName: "Public Parent",
      canonicalLegalName: "Public Parent, Inc.",
      primaryDomain: "public-parent.test",
      sponsorName: null,
      ownershipType: "public_company",
      acquisitionEligibility: "excluded_public_company",
      matchedDomains: ["public-brand.test"],
      confidence: { relationship: "high", legalIdentity: "high", ownership: "high", targetFit: "excluded", capacity: "unverified", valuation: "not_applicable" },
      sources: [{ id: "public-source", sourceType: "sec_filing", title: "Annual report", url: "https://sec.test/public-parent", asOf: "2026-09-07", supports: ["public_company_status"] }],
      contradictions: []
    }
  ],
  licenseSources: [{
    id: "state-report",
    authorityName: "Example State Health Department",
    authorityType: "state_regulator",
    title: "Licensed program and bed report",
    landingPageUrl: "https://state.test/licenses",
    reportUrl: "https://state.test/licenses/report.xlsx",
    publishedAt: "2026-09-01",
    retrievedAt: "2026-09-07"
  }],
  licenseAssertions: [
    {
      id: "state-license-core-1",
      parentAssertionId: "private-parent",
      brandName: "Example Residential Center",
      programName: "Example Residential Center",
      legalOperatorName: "Example Residential Operator LLC",
      address: { street1: "100 Main Street", city: "Boise", stateCode: "ID", zip: "83702" },
      license: {
        authorityName: "Example State Health Department",
        authorityType: "state_regulator",
        number: "BH-100",
        serviceType: "adult_residential_mental_health",
        status: "active",
        issuedAt: "2026-01-01",
        expiresAt: "2027-01-01"
      },
      capacity: { licensedBeds: 18, scopeClassification: "core_target", confidence: "high" },
      populationSignals: { adolescents: false, coOccurringDisorders: true },
      source: { sourceId: "state-report", workbookSheet: "Residential", asOf: "2026-09-01" }
    },
    {
      id: "state-license-adjacent-1",
      parentAssertionId: "private-parent",
      brandName: "Second Brand",
      programName: "Second Brand Stabilization",
      legalOperatorName: "Second Brand Operator LLC",
      address: { street1: "200 Main Street", city: "Meridian", stateCode: "ID", zip: "83642" },
      license: {
        authorityName: "Example State Health Department",
        authorityType: "state_regulator",
        number: "BH-200",
        serviceType: "sud_stabilization",
        status: "active",
        issuedAt: "2026-02-01",
        expiresAt: "2027-02-01"
      },
      capacity: { licensedBeds: 32, scopeClassification: "adjacent_high_acuity_sud", confidence: "high" },
      populationSignals: { adolescents: false, coOccurringDisorders: true },
      source: { sourceId: "state-report", workbookSheet: "Stabilization", asOf: "2026-09-01" }
    },
    {
      id: "state-license-current-capacity-unpublished",
      parentAssertionId: "private-parent",
      brandName: "Example Residential Center",
      programName: "Example Residential Center Annex",
      legalOperatorName: "Example Residential Operator LLC",
      address: { street1: "102 Main Street", city: "Boise", stateCode: "ID", zip: "83702" },
      license: {
        authorityName: "Example State Health Department",
        authorityType: "state_regulator",
        number: null,
        serviceType: "adult_residential_mental_health",
        status: "active",
        issuedAt: null,
        expiresAt: null
      },
      capacity: { licensedBeds: null, scopeClassification: "core_target", confidence: "unverified" },
      populationSignals: { adults: true, adolescents: false, primaryMentalHealth: true },
      source: { sourceId: "state-report", workbookSheet: "Residential", asOf: "2026-09-01" }
    }
  ],
  capacitySources: [{
    id: "operator-program-page",
    authorityName: "Private Parent",
    authorityType: "operator_first_party",
    title: "Example residential program",
    reportUrl: "https://private-parent.test/residential",
    retrievedAt: "2026-09-07"
  }],
  capacityAssertions: [{
    id: "operator-reported-capacity-1",
    parentAssertionId: "private-parent",
    brandName: "Example Residential Center",
    programName: "Example Residential Center",
    address: { street1: "100 Main Street", city: "Boise", stateCode: "ID", zip: "83702" },
    capacity: {
      reportedBeds: 16,
      evidenceBasis: "operator_reported",
      scopeClassification: "core_target",
      confidence: "medium"
    },
    source: {
      sourceId: "operator-program-page",
      asOf: "2026-09-07",
      rowFingerprint: "Sixteen beds"
    }
  }]
});
const fitPriorityFixture = buildAcquisitionOperatorIndex([
  { ...fixtureDirectory.facilities[0], id: "high-fit", name: "High Fit Brand", website: "https://high-fit-brand.test" },
  { ...fixtureDirectory.facilities[0], id: "low-fit", name: "Low Fit Brand", website: "https://low-fit-brand.test" }
], {
  parentAssertions: [
    {
      id: "high-fit-parent",
      operatingParentName: "High Fit Parent",
      matchedDomains: ["high-fit-brand.test"],
      acquisitionEligibility: "eligible_private",
      confidence: { relationship: "high", targetFit: "high" },
      sources: [],
      contradictions: []
    },
    {
      id: "low-fit-parent",
      operatingParentName: "Low Fit Parent",
      matchedDomains: ["low-fit-brand.test"],
      acquisitionEligibility: "eligible_private",
      confidence: { relationship: "high", targetFit: "low" },
      sources: [],
      contradictions: []
    }
  ]
});
const stateLicenseDiscoveryFixture = buildAcquisitionOperatorIndex([], {
  parentAssertions: [{
    id: "state-discovered-parent",
    operatingParentName: "State Discovered Parent",
    canonicalLegalName: "State Discovered Parent LLC",
    primaryDomain: "state-discovered.test",
    ownershipType: "founder_owned_private",
    acquisitionEligibility: "eligible_private",
    targetClassification: "core_adult_mental_health",
    valuationModel: {
      segmentId: "high_acuity_smi_residential",
      selectionBasis: "Fixture current core licensed capacity."
    },
    confidence: { relationship: "high", legalIdentity: "high", ownership: "high", targetFit: "high", capacity: "high", valuation: "unverified" },
    sources: [],
    contradictions: []
  }],
  licenseSources: [{
    id: "state-discovery-report",
    authorityName: "Example State Health Department",
    authorityType: "state_regulator",
    title: "Current adult residential facilities",
    landingPageUrl: "https://state.test/adult-residential",
    reportUrl: "https://state.test/current-residential.json",
    retrievedAt: "2026-09-08"
  }],
  licenseAssertions: [{
    id: "state-discovered-license",
    parentAssertionId: "state-discovered-parent",
    brandName: "State Discovered Residence",
    programName: "State Discovered Residence",
    legalOperatorName: "State Discovered Parent LLC",
    address: { street1: "300 Main Street", city: "Boise", stateCode: "ID", zip: "83702" },
    license: {
      authorityName: "Example State Health Department",
      authorityType: "state_regulator",
      number: "ARMH-300",
      serviceType: "adult_residential_mental_health",
      status: "active",
      issuedAt: "2026-01-01",
      expiresAt: null
    },
    capacity: { licensedBeds: 20, scopeClassification: "core_target", confidence: "high" },
    populationSignals: { adults: true, adolescents: false, primaryMentalHealth: true },
    source: { sourceId: "state-discovery-report", asOf: "2026-09-08", rowFingerprint: "ARMH-300" }
  }]
});
const globalSortFixture = buildAcquisitionOperatorIndex([
  {
    ...fixtureDirectory.facilities[0],
    id: "alpha-local",
    name: "Alpha Local Behavioral Health",
    website: "https://alpha-local.test"
  },
  ...["Boise", "Meridian", "Nampa", "Caldwell"].map((city, index) => ({
    ...fixtureDirectory.facilities[0],
    id: `zulu-regional-${index + 1}`,
    name: `Zulu Regional Behavioral Health ${city}`,
    address: { ...fixtureDirectory.facilities[0].address, city },
    website: `https://zulu-regional.test/locations/${city.toLowerCase()}`
  }))
], { generatedAt: "2026-09-07T00:00:00.000Z", excludedStateCodes: ["CA"] });
const matureFirstFunnelFixture = buildAcquisitionOperatorIndex([
  {
    ...fixtureDirectory.facilities[0],
    id: "smaller-core-candidate",
    name: "Smaller Core Candidate",
    website: "https://smaller-core-candidate.test"
  },
  ...["Boise", "Meridian", "Nampa", "Caldwell"].map((city, index) => ({
    ...fixtureDirectory.facilities[0],
    id: `mature-fit-review-${index + 1}`,
    name: `Mature Fit Review Company ${city}`,
    address: { ...fixtureDirectory.facilities[0].address, city, street1: `${index + 1}00 Review Street` },
    website: `https://mature-fit-review.test/locations/${city.toLowerCase()}`,
    services: { FOP: ["Private for-profit organization"] },
    disposition: "exclude",
    reasons: ["private-company directory signal; service fit unresolved"],
    tags: ["private_for_profit_signal"]
  })),
  ...["Twin Falls", "Pocatello", "Idaho Falls", "Lewiston"].map((city, index) => ({
    ...fixtureDirectory.facilities[0],
    id: `mature-private-open-${index + 1}`,
    name: `Mature Ownership Open Company ${city}`,
    address: { ...fixtureDirectory.facilities[0].address, city, street1: `${index + 5}00 Open Street` },
    website: `https://mature-private-open.test/locations/${city.toLowerCase().replaceAll(" ", "-")}`,
    services: {
      SET: ["Residential/24-hour residential"],
      AGE: ["Adults"],
      TC: ["Mental health treatment"]
    },
    reasons: ["adult residential mental-health signal; ownership unresolved"],
    tags: ["adult_signal", "residential_signal"]
  }))
], { generatedAt: "2026-09-07T00:00:00.000Z", excludedStateCodes: ["CA"] });
const nonOperatorDomainFixture = buildAcquisitionOperatorIndex([
  {
    ...fixtureDirectory.facilities[0],
    id: "third-party-domain-a",
    name: "Independent Idaho Residence",
    website: "https://www.psychologytoday.com/us/treatment-rehab/independent-idaho"
  },
  {
    ...fixtureDirectory.facilities[0],
    id: "third-party-domain-b",
    name: "Unrelated Michigan Residence",
    address: { ...fixtureDirectory.facilities[0].address, stateCode: "MI", city: "Detroit" },
    website: "https://www.psychologytoday.com/us/treatment-rehab/unrelated-michigan"
  }
], { generatedAt: "2026-09-07T00:00:00.000Z", excludedStateCodes: ["CA"] });
assert(acquisitionWebsiteDomain("https://www.psychologytoday.com/us/treatment-rehab/example") === null, "third-party listing domains must not become company identity keys");
assert(acquisitionWebsiteDomain("https://provider-name.wixsite.com/website") === null, "hosted-site subdomains must not create shared company-domain clusters");
assert(nonOperatorDomainFixture.counts.organizationProposals === 2, "unrelated facilities sharing a third-party directory must remain separate company proposals");
assert(nonOperatorDomainFixture.organizations.every((organization) =>
  organization.rootDomain === null && organization.screeningProfile.maturityTier === "single_site_or_unresolved"
), "third-party directory links must not manufacture multi-state maturity signals");
const productionParentRegistry = JSON.parse(await readFile(path.join(root, "config/acquisition-intelligence/parent-assertions-v1.json"), "utf8"));
const newportParentAssertion = productionParentRegistry.assertions.find(({ id }) => id === "newport-healthcare");
const newportConsolidationFixture = buildAcquisitionOperatorIndex([
  ["newport-academy", "Newport Academy", "https://www.newportacademy.com", "CT"],
  ["newport-institute", "Newport Institute", "https://www.newportinstitute.com", "MN"],
  ["prairie-care", "PrairieCare", "https://prairie-care.com", "MN"],
  ["center-for-families", "Center for Families", "https://centerforfamilies.com", "PA"]
].map(([id, name, website, stateCode]) => ({
  ...fixtureDirectory.facilities[0],
  id,
  name,
  website,
  address: { ...fixtureDirectory.facilities[0].address, stateCode }
})), {
  generatedAt: "2026-09-08T00:00:00.000Z",
  excludedStateCodes: ["CA"],
  parentAssertions: [newportParentAssertion]
});
assert(newportConsolidationFixture.organizations.length === 1, "current first-party brand relationships must collapse Newport's four directory clusters into one operating parent");
assert(newportConsolidationFixture.organizations[0]?.proposedName === "Newport Healthcare", "the consolidated Newport row must expose the operating parent rather than a child brand");
assert(["newportacademy.com", "newportinstitute.com", "prairie-care.com", "centerforfamilies.com"].every((domain) =>
  newportConsolidationFixture.organizations[0]?.identityKeys.includes(`domain:${domain}`)
), "the Newport parent must retain each exact brand domain for decision reattachment and source lineage");
const matureParentCorrectionIds = ["amfm-healthcare", "erc-pathlight", "monte-nido-affiliates", "nuway-alliance"];
const matureParentCorrectionAssertions = matureParentCorrectionIds.map((id) => {
  const assertion = productionParentRegistry.assertions.find((record) => record.id === id);
  assert(assertion, `production parent registry must include ${id}`);
  return assertion;
});
const matureParentCorrectionFixture = buildAcquisitionOperatorIndex([
  ["amfm-residential", "A Mission for Michael", "https://amfmtreatment.com", "MN"],
  ["amfm-outpatient", "Mission Connection", "https://missionconnectionhealthcare.com", "WA"],
  ["erc", "Eating Recovery Center", "https://eatingrecoverycenter.com", "CO"],
  ["pathlight", "Pathlight Mood and Anxiety Center", "https://pathlightbh.com", "IL"],
  ["monte-nido", "Monte Nido", "https://montenido.com", "NY"],
  ["rosewood", "Rosewood Centers for Eating Disorders", "https://rosewoodranch.com", "AZ"],
  ["the-gables", "The Gables", "https://nuway.org", "MN"]
].map(([id, name, website, stateCode]) => ({
  ...fixtureDirectory.facilities[0],
  id,
  name,
  website,
  address: { ...fixtureDirectory.facilities[0].address, stateCode }
})), {
  generatedAt: "2026-09-09T00:00:00.000Z",
  excludedStateCodes: ["CA"],
  parentAssertions: matureParentCorrectionAssertions
});
assert(matureParentCorrectionFixture.organizations.length === 4, "known mature brand domains must collapse into their four evidence-backed operating parents");
const correctedParents = new Map(matureParentCorrectionFixture.organizations.map((organization) => [organization.parentIdentity?.id, organization]));
assert(correctedParents.get("amfm-healthcare")?.facilityCounts.total === 2, "Mission Connection must roll into AMFM without becoming a second company row");
assert(correctedParents.get("erc-pathlight")?.facilityCounts.total === 2, "Eating Recovery Center and Pathlight must roll into one ERC Pathlight row");
assert(correctedParents.get("monte-nido-affiliates")?.facilityCounts.total === 2, "Monte Nido and Rosewood must roll into one Monte Nido & Affiliates row");
assert(correctedParents.get("monte-nido-affiliates")?.scope.fitCategory === "adjacent_signal", "eating-disorder platforms must remain adjacent rather than core adult SMI targets");
assert(correctedParents.get("nuway-alliance")?.targetRank === null, "the evidence-backed NUWAY nonprofit must remain outside the private target funnel");
assert(correctedParents.get("nuway-alliance")?.acquisitionEligibility === "excluded_out_of_scope", "NUWAY nonprofit status must be explicit rather than inferred as private");
const maturePlatformResolutionIds = [
  "behavioral-health-group",
  "sagent-behavioral-health",
  "rha-health-services",
  "meadows-behavioral-healthcare"
];
const maturePlatformResolutionAssertions = maturePlatformResolutionIds.map((id) => {
  const assertion = productionParentRegistry.assertions.find((record) => record.id === id);
  assert(assertion, `production parent registry must include ${id}`);
  return assertion;
});
const maturePlatformResolutionFixture = buildAcquisitionOperatorIndex([
  ["bhg-domain", "BHG Aiken Treatment Center", "https://bhgrecovery.com", "SC"],
  ["bhg-prefix", "BHG XLII, LLC", "", "VA"],
  ["sagent", "Sagent Behavioral Health", "https://sagentbh.com", "MN"],
  ["nystrom", "Nystrom and Associates", "https://nystromcounseling.com", "WI"],
  ["rha", "RHA Health Services", "https://rhahealthservices.org", "NC"],
  ["salisbury", "Salisbury Behavioral Health", "", "PA"],
  ["pahrtners", "PAHrtners Deaf Services", "https://pahrtners.com", "PA"],
  ["meadows", "Meadows", "https://themeadows.com", "AZ"],
  ["meadows-iop", "Meadows Outpatient Center Dallas", "https://themeadowsiop.com", "TX"],
  ["meadows-legacy", "Meadows Outpatient Center Denver", "https://meadowsbh.com", "CO"],
  ["meadows-texas", "Meadows Texas", "https://themeadowstexas.com", "TX"]
].map(([id, name, website, stateCode]) => ({
  ...fixtureDirectory.facilities[0],
  id,
  name,
  website,
  address: { ...fixtureDirectory.facilities[0].address, stateCode }
})), {
  generatedAt: "2026-09-09T00:00:00.000Z",
  excludedStateCodes: ["CA"],
  parentAssertions: maturePlatformResolutionAssertions
});
assert(maturePlatformResolutionFixture.organizations.length === 4, "mature brand clusters must resolve into four operating-parent rows");
const resolvedMaturePlatforms = new Map(maturePlatformResolutionFixture.organizations.map((organization) => [organization.parentIdentity?.id, organization]));
assert(resolvedMaturePlatforms.get("behavioral-health-group")?.facilityCounts.total === 2, "BHG domains and prefixed legal entities must consolidate under Behavioral Health Group");
assert(resolvedMaturePlatforms.get("behavioral-health-group")?.targetRank === null, "BHG's current outpatient-only OUD network must remain outside the residential mental-health target funnel");
assert(resolvedMaturePlatforms.get("sagent-behavioral-health")?.facilityCounts.total === 2, "Sagent and Nystrom records must consolidate under the current Sagent operating brand");
assert(resolvedMaturePlatforms.get("rha-health-services")?.facilityCounts.total === 3, "RHA, Salisbury, and PAHrtners records must consolidate under RHA Health Services");
assert(resolvedMaturePlatforms.get("meadows-behavioral-healthcare")?.facilityCounts.total === 4, "current and legacy Meadows domains must consolidate under Meadows Behavioral Healthcare");
const ownerFunnelCleanupIds = [
  "pinnacle-treatment-centers",
  "embark-behavioral-health",
  "american-addiction-centers",
  "universal-health-services"
];
const ownerFunnelCleanupAssertions = ownerFunnelCleanupIds.map((id) => {
  const assertion = productionParentRegistry.assertions.find((record) => record.id === id);
  assert(assertion, `production parent registry must include ${id}`);
  return assertion;
});
const ownerFunnelCleanupFixture = buildAcquisitionOperatorIndex([
  ["pinnacle-current", "Pinnacle Treatment Centers", "https://pinnacletreatment.com", "NJ"],
  ["pinnacle-legacy", "Culpeper Treatment Services", "https://pinnacletreatmentcenters.com", "VA"],
  ["pinnacle-legal", "Pinnacle Treatment Centers OH-II, LLC", "", "OH"],
  ["embark-domain", "Embark Behavioral Health", "https://embarkbh.com", "AZ"],
  ["embark-name", "Embark Behavioral Health Pennsylvania", "", "PA"],
  ["aac-adcare", "AdCare Rhode Island", "https://adcare.com", "RI"],
  ["aac-desert-hope", "Desert Hope Treatment Center", "https://deserthopetreatment.com", "NV"],
  ["aac-greenhouse", "Greenhouse Treatment Center", "https://greenhousetreatment.com", "TX"],
  ["aac-oxford", "Oxford Treatment Center", "https://oxfordtreatment.com", "MS"],
  ["aac-recovery-first", "Recovery First Treatment Center", "https://recoveryfirst.org", "FL"],
  ["aac-river-oaks", "River Oaks Treatment Center", "https://riveroakstreatment.com", "FL"],
  ["uhs-emerald", "Emerald Coast Behavioral Hospital", "https://emeraldcoastbehavioral.com", "FL"],
  ["uhs-domain", "McDowell Center", "https://uhsinc.com", "TN"]
].map(([id, name, website, stateCode]) => ({
  ...fixtureDirectory.facilities[0],
  id,
  name,
  website,
  address: { ...fixtureDirectory.facilities[0].address, stateCode }
})), {
  generatedAt: "2026-09-09T00:00:00.000Z",
  excludedStateCodes: ["CA"],
  parentAssertions: ownerFunnelCleanupAssertions
});
assert(ownerFunnelCleanupFixture.organizations.length === 4, "mature funnel cleanup fixtures must resolve into four operating-parent rows");
const cleanedOwnerFunnelParents = new Map(ownerFunnelCleanupFixture.organizations.map((organization) => [organization.parentIdentity?.id, organization]));
assert(cleanedOwnerFunnelParents.get("pinnacle-treatment-centers")?.facilityCounts.total === 3, "Pinnacle's current domain, legacy domain, and state legal entities must consolidate under one parent");
assert(cleanedOwnerFunnelParents.get("pinnacle-treatment-centers")?.parentIdentity?.sponsorName === "Linden Capital Partners", "Pinnacle must expose its current sponsor on the owner-facing parent row");
assert(cleanedOwnerFunnelParents.get("embark-behavioral-health")?.facilityCounts.total === 2, "Embark domain and parent-name records must consolidate without treating youth capacity as adult capacity");
assert(cleanedOwnerFunnelParents.get("american-addiction-centers")?.facilityCounts.total === 6, "AAC's current named facility brands must consolidate under American Addiction Centers");
assert(cleanedOwnerFunnelParents.get("american-addiction-centers")?.scope.fitCategory === "adjacent_signal", "AAC's SUD-primary network must remain adjacent rather than become a core mental-health platform");
assert(cleanedOwnerFunnelParents.get("universal-health-services")?.targetRank === null, "UHS facilities must remain outside the private-company target ranks");
assert(cleanedOwnerFunnelParents.get("universal-health-services")?.acquisitionEligibility === "excluded_public_company", "UHS public-company status must be explicit on its parent row");
const matureScreeningCorrectionIds = [
  "sandstone-care",
  "bradford-health-services",
  "northpoint-recovery-holdings",
  "praesum-healthcare"
];
const matureScreeningCorrectionAssertions = matureScreeningCorrectionIds.map((id) => {
  const assertion = productionParentRegistry.assertions.find((record) => record.id === id);
  assert(assertion, `production parent registry must include ${id}`);
  return assertion;
});
const matureScreeningCorrectionFixture = buildAcquisitionOperatorIndex([
  ["sandstone-domain", "Sandstone Care Detox Center", "https://sandstonecare.com", "CO"],
  ["sandstone-name", "Sandstone Care Residential at The Alps", "", "VA"],
  ["bradford-domain", "Bradford Health Services", "https://bradfordhealth.com", "AL"],
  ["bradford-lakeview", "Lakeview Health Systems LLC", "https://lakeviewhealth.com", "FL"],
  ["bradford-parkdale", "Parkdale Center", "https://parkdalecenter.com", "IN"],
  ["bradford-legal", "Bradford Health Services - Warrior", "", "AL"],
  ["northpoint-domain", "Northpoint Recovery", "https://northpointrecovery.com", "ID"],
  ["northpoint-imagine", "Imagine by Northpoint", "https://imaginebynorthpoint.com", "WA"],
  ["praesum-sunrise", "Sunrise Detox", "https://sunrisedetox.com", "FL"],
  ["praesum-evolve", "Evolve Recovery Center", "https://evolverecoverycenter.com", "MA"],
  ["praesum-legal", "Sunrise Detox Toms River, LLC", "", "NJ"]
].map(([id, name, website, stateCode]) => ({
  ...fixtureDirectory.facilities[0],
  id,
  name,
  website,
  address: { ...fixtureDirectory.facilities[0].address, stateCode }
})), {
  generatedAt: "2026-09-09T00:00:00.000Z",
  excludedStateCodes: ["CA"],
  parentAssertions: matureScreeningCorrectionAssertions
});
assert(matureScreeningCorrectionFixture.organizations.length === 4, "mature screening corrections must resolve into four operating-parent rows");
const correctedMatureScreeningParents = new Map(matureScreeningCorrectionFixture.organizations.map((organization) => [organization.parentIdentity?.id, organization]));
assert(correctedMatureScreeningParents.get("sandstone-care")?.facilityCounts.total === 2, "Sandstone domain and prefixed brand records must resolve beneath Sandstone Care");
assert(correctedMatureScreeningParents.get("sandstone-care")?.parentIdentity?.targetClassification === "mixed_core_and_adjacent", "Sandstone must remain explicitly mixed core-and-adjacent while license-level adult capacity is unresolved");
assert(correctedMatureScreeningParents.get("bradford-health-services")?.facilityCounts.total === 4, "Bradford, Lakeview Health, Parkdale, and Bradford legal-name records must consolidate beneath Bradford Health Services");
assert(correctedMatureScreeningParents.get("bradford-health-services")?.parentIdentity?.targetClassification === "sud_primary_adjacent", "Bradford must remain explicitly SUD-primary adjacent");
assert(correctedMatureScreeningParents.get("northpoint-recovery-holdings")?.facilityCounts.total === 2, "Northpoint Recovery and Imagine by Northpoint must consolidate beneath Northpoint Recovery Holdings");
assert(correctedMatureScreeningParents.get("northpoint-recovery-holdings")?.parentIdentity?.confidence?.ownership === "medium", "Northpoint's incomplete current sponsor table must remain an explicit ownership research gap");
assert(correctedMatureScreeningParents.get("praesum-healthcare")?.facilityCounts.total === 3, "Sunrise Detox and Evolve Recovery Center must consolidate beneath Praesum Healthcare");
assert(correctedMatureScreeningParents.get("praesum-healthcare")?.parentIdentity?.sponsorName === "Mayfair Group", "Praesum must expose its current Mayfair ownership on the company row");
await writeFile(path.join(storeRoot, "derived/operator-proposals.json"), JSON.stringify(operatorFixture));
const {
  calculateAcquisitionValuation,
  getAcquisitionIntelligenceOverview,
  getAcquisitionIntelligenceOverviewResponse
} = await import("../server/acquisition-intelligence.mjs");
const { searchNationalFacilityDiscovery } = await import("../server/acquisition-intelligence-store.mjs");
const {
  resolveAcquisitionOperatorSelections,
  searchAcquisitionOperatorUniverse
} = await import("../server/acquisition-operator-store.mjs");
const {
  buildAcquisitionOperatorCsv,
  getAcquisitionOperatorExportResponse
} = await import("../server/acquisition-operator-export.mjs");
const { createAcquisitionOperatorSelectionStore } = await import("../server/acquisition-operator-selection-store.mjs");
const {
  mutateAcquisitionOperatorBulkDecision,
  mutateAcquisitionOperatorDecision,
  validateAcquisitionOperatorBulkDecisionRequest,
  validateAcquisitionOperatorDecisionRequest
} = await import("../server/acquisition-operator-selections.mjs");
const {
  freezeSelectedAcquisitionOperatorCohort,
  getAcquisitionOperatorCohortResponse,
  validateAcquisitionOperatorCohortRequest
} = await import("../server/acquisition-operator-cohorts.mjs");
const {
  mutateAcquisitionOperatorResearchJob,
  validateAcquisitionOperatorResearchJobRequest
} = await import("../server/acquisition-operator-research-jobs.mjs");
const {
  buildProposedOperatorClusters,
  getAcquisitionResearchResponse,
  mutateAcquisitionResearch,
  validateAcquisitionResearchRequest
} = await import("../server/acquisition-research.mjs");
const { screenAcquisitionDirectoryFacility } = await import("../shared/acquisition-discovery.mjs");

function assert(condition, message) {
  if (!condition) throw new Error(`Acquisition intelligence check failed: ${message}`);
}

function approximatelyEqual(left, right, tolerance = 0.000001) {
  return Math.abs(left - right) <= tolerance;
}

function assertThrows(callback, message) {
  let threw = false;
  try {
    callback();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

async function assertRejects(callback, message) {
  let rejected = false;
  try {
    await callback();
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

const overview = getAcquisitionIntelligenceOverview();
assert(overview.visibility === "owner_only", "private acquisition records must remain owner-only");
assert(overview.datasetStatus === "discovery_seed_only", "seed records must not be represented as a verified universe");
assert(overview.leads.length === 15, `expected 15 workbook discovery leads, found ${overview.leads.length}`);
assert(overview.counts.verifiedFacilities === 0, "unsupported facilities must not be marked verified");
assert(overview.counts.verifiedPrivateOperators === 0, "unsupported ownership must not be marked verified");
assert(overview.counts.rankedOperators === 0, "a Top 100 must not exist before facility evidence");
assert(
  overview.leads.every((lead) =>
    lead.verificationStatus === "discovery_only" &&
    ["review", "hold"].includes(lead.candidateDisposition) &&
    lead.reportedScale &&
    lead.estimatedBeds.low > 0 &&
    lead.estimatedBeds.high >= lead.estimatedBeds.low &&
    ["reported", "estimated"].includes(lead.estimatedBeds.sourceType) &&
    lead.estimatedEnterpriseValue.low < lead.estimatedEnterpriseValue.base &&
    lead.estimatedEnterpriseValue.base < lead.estimatedEnterpriseValue.high &&
    lead.sources.length > 0
  ),
  "operator screen must carry bounded, sourced bed estimates and formula-derived values"
);
const sunLead = overview.leads.find((lead) => lead.id === "PV005");
assert(sunLead?.reportedScale.includes("4 psychiatric hospitals"), "SUN must show its current reported hospital footprint");
assert(
  sunLead?.estimatedBeds.low === 579 &&
    sunLead?.estimatedBeds.high === 579 &&
    sunLead?.estimatedBeds.sourceType === "reported" &&
    sunLead?.estimatedBeds.confidence === "high",
  "SUN's published 579-bed total must be labeled as reported and high confidence"
);
const crestwoodLead = overview.leads.find((lead) => lead.id === "PV002");
assert(crestwoodLead?.reportedSiteCount === 31, "Crestwood must show its current 31-campus footprint");
assert(crestwoodLead?.estimatedBeds.sourceType === "estimated", "Crestwood's bounded bed range must remain labeled estimated");
assert(operatorFixture.counts.excludedGeographyFacilities === 1, "California facilities must be excluded from operator proposals");
assert(operatorFixture.counts.organizationProposals === 1, "shared domains must create a single organization proposal");
assert(operatorFixture.counts.targetCandidateOrganizations === 1, "target candidate organization counts must remain explicit");
assert(operatorFixture.counts.facilitySignalOrganizations === 1, "facility-signal counts must remain separately visible from the broader consideration funnel");
assert(operatorFixture.organizations[0]?.resolution.confidence === "medium", "repeated domain evidence must remain proposed at medium confidence");
assert(operatorFixture.organizations[0]?.screeningProfile.maturityTier === "regional_scale_signal", "four-location proposals must enter the regional maturity tier");
assert(operatorFixture.organizations[0]?.screeningProfile.selectionBucket === "mature_target_signal", "broad screening buckets must remain separate from expensive verification gates");
assert(operatorFixture.organizations[0]?.screeningProfile.basis.includes("not_company_age_or_revenue"), "maturity signals must disclose that they do not verify age or revenue");
assert(operatorFixture.organizations[0]?.screeningProfile.facilityScaleBand === "four_nine_locations", "observable company footprint must be assigned to a non-overlapping location bucket");
assert(
  operatorFixture.organizations[0]?.screeningCapacity.range.low === 44 &&
    operatorFixture.organizations[0]?.screeningCapacity.range.base === 96 &&
    operatorFixture.organizations[0]?.screeningCapacity.range.high === 180 &&
    operatorFixture.organizations[0]?.screeningCapacity.bucket === "75_149",
  "four adjacent candidate sites must use the fixed 2024 N-SUMHSS p25/p50/p75 screening range"
);
assert(operatorFixture.organizations[0]?.screeningCapacity.isWholeCompanyEstimate === false, "peer-derived capacity ranges must never be labeled as whole-company bed estimates");
assert(operatorFixture.organizations[0]?.valuationEvidence === null, "a peer-derived screening capacity range must not create a valuation without eligible capacity evidence");
assert(operatorFixture.counts.matureScaleSignals === 1, "the mature-scale pool must combine platform and regional proposals");
assert(
  operatorFixture.counts.matureCoreTargetSignals + operatorFixture.counts.matureAdjacentTargetSignals === 1,
  "mature core and adjacent service lanes must partition the fixture target signal"
);
assert(operatorFixture.counts.matureNeedsFitReview === 0, "mature fit-review lanes must remain separate from signaled targets");
assert(operatorFixture.counts.matureMarketContext === 0, "mature market context must remain separate from signaled targets");
assert(
  operatorFixture.counts.matureTargetParentEvidenced + operatorFixture.counts.matureTargetParentToResolve ===
    operatorFixture.counts.matureTargetSignals,
  "evidenced and unresolved parent-readiness counts must partition the mature target-service lane"
);
assert(
  operatorFixture.counts.matureCoreTargetSignals +
    operatorFixture.counts.matureAdjacentTargetSignals +
    operatorFixture.counts.matureNeedsFitReview +
    operatorFixture.counts.matureMarketContext === operatorFixture.counts.matureScaleSignals,
  "mature service lanes must partition the mature-scale universe without overlap"
);
assert(operatorFixture.counts.matureResearch100 === 1, "mature target candidates must be retained in the suggested first-pass queue");
assert(operatorFixture.organizations[0]?.identityKeys.includes("domain:example-health.test"), "organization proposals must retain exact domain identity keys across rebuilds");
assert(operatorFixture.organizations[0]?.licenseEvidence.bedTotals.reportedByOperator === null, "missing reported beds must remain unknown rather than zero");
assert(operatorFixture.counts.highConfidenceParentRelationships === 0, "discovery clustering must never create high-confidence parent relationships");
assert(matureFirstFunnelFixture.counts.targetCandidateOrganizations === 3, "the consideration funnel must include all non-excluded mature proposals plus smaller companies with facility signals");
assert(matureFirstFunnelFixture.counts.facilitySignalOrganizations === 2, "facility-signal counts must remain separate from mature scale-only additions");
assert(
  matureFirstFunnelFixture.organizations[0]?.screeningProfile.selectionBucket === "mature_needs_fit_review" &&
    matureFirstFunnelFixture.organizations[0]?.targetRank === 1,
  "a mature fit-to-resolve company must outrank a smaller facility-signal candidate in the cheap owner funnel"
);
assert(
  matureFirstFunnelFixture.organizations.find((organization) => organization.rootDomain === "mature-private-open.test")?.targetRank === 2 &&
    matureFirstFunnelFixture.organizations.find((organization) => organization.rootDomain === "smaller-core-candidate.test")?.targetRank === 3,
  "a mature ownership-open proposal must remain in the scale-first funnel ahead of a smaller fitted company"
);
assert(evidenceParentFixture.counts.organizationProposals === 2, "curated parent assertions must merge distinct brand domains");
assert(evidenceParentFixture.counts.parentAssertionsApplied === 2, "applied parent assertions must be counted");
assert(evidenceParentFixture.counts.highConfidenceParentRelationships === 2, "authoritative parent relationships must retain high confidence");
assert(evidenceParentFixture.counts.fullyQualifiedTargetParents === 0, "verified relationships cannot imply verified beds or a fully qualified target");
assert(evidenceParentFixture.counts.excludedPublicCompanyOrganizations === 1, "public parent companies must be explicitly counted");
assert(evidenceParentFixture.counts.targetCandidateOrganizations === 1, "public parent companies must stay outside the private target funnel");
const privateParent = evidenceParentFixture.organizations.find((organization) => organization.parentIdentity?.id === "private-parent");
const publicParent = evidenceParentFixture.organizations.find((organization) => organization.parentIdentity?.id === "public-parent");
assert(privateParent?.facilityCounts.candidates === 2, "a verified parent must roll up candidate facilities across matched domains");
assert(privateParent?.parentIdentity?.sponsorName === "Example Sponsor", "sponsor and operating parent must remain separate fields");
assert(privateParent?.research.gaps.includes("licensed_capacity"), "verified parent relationships must still expose unresolved capacity research");
assert(privateParent?.licenseEvidence.bedTotals.verifiedCurrentLicensed === 50, "current licensed beds must sum without mixing source types");
assert(privateParent?.licenseEvidence.bedTotals.verifiedCoreTarget === 18, "core licensed beds must remain separate from adjacent services");
assert(privateParent?.licenseEvidence.bedTotals.verifiedAdjacentHighAcuitySud === 32, "adjacent licensed beds must remain separately visible");
assert(privateParent?.licenseEvidence.counts.currentLicenses === 3, "a current regulator listing must be preserved when its bed count is not published");
assert(privateParent?.licenseEvidence.licenses.some((license) => license.capacity.licensedBeds === null), "unpublished licensed capacity must remain null rather than zero");
assert(privateParent?.licenseEvidence.confidence.currentLicenseCapacity === "medium", "unknown capacity on a current licensed site must prevent a high-confidence licensed-bed subtotal");
assert(privateParent?.licenseEvidence.bedTotals.reportedByOperator === 16, "operator-reported beds must remain separate from licensed capacity");
assert(
  privateParent?.screeningCapacity.evidencedFloorBeds === 50 &&
    privateParent?.screeningCapacity.range.low === 50 &&
    privateParent?.screeningCapacity.range.base === 50 &&
    privateParent?.screeningCapacity.range.high === 90,
  "known capacity evidence must floor but never add overlapping source totals to the peer screening range"
);
assert(privateParent?.valuationEvidence?.capacity.valuedBeds === 18, "known-capacity valuation must use core beds only");
assert(privateParent?.valuationEvidence?.capacity.overlappingOperatorReportedBedsExcluded === 16, "reported beds at a licensed address must not be double counted");
assert(privateParent?.valuationEvidence?.isWholeCompanyEstimate === false, "partial evidence cannot be represented as a whole-company value");
assert(approximatelyEqual(privateParent?.valuationEvidence?.valuation.outputs.base.enterpriseValueMillions ?? 0, 3.532032), "known-capacity valuation must reproduce workbook arithmetic");
assert(privateParent?.licenseEvidence.reportedCapacity[0]?.source.sourceType === "operator_first_party", "reported capacity must retain source lineage");
assert(privateParent?.licenseEvidence.portfolioCoverage === "partial_facility_crosswalk_pending", "individual licenses cannot imply complete portfolio coverage");
assert(privateParent?.resolution.legalOperatorIds.length === 2, "distinct state-license legal operators must remain linked below the parent");
assert(publicParent?.targetRank === null, "excluded public parents must remain visible as context without receiving a target rank");
assert(evidenceParentFixture.counts.licenseAssertionsApplied === 3, "license evidence assertions must include current sites whose capacity is unpublished");
assert(evidenceParentFixture.counts.capacityAssertionsApplied === 1, "reported capacity assertions must be counted separately");
assert(evidenceParentFixture.counts.verifiedCurrentLicensedBeds === 50, "index totals must include only verified current licensed beds");
assert(evidenceParentFixture.counts.operatorReportedBeds === 16, "index totals must preserve operator-reported beds separately");
assert(evidenceParentFixture.counts.organizationsWithKnownCapacityValuation === 1, "index must count evidence-backed known-capacity valuations");
assert(evidenceParentFixture.counts.knownCapacityBedsValued === 18, "index valued-bed totals must exclude adjacent and overlapping reported beds");
assert(fitPriorityFixture.organizations[0]?.proposedName === "High Fit Parent", "evidence-backed target fit must outrank an otherwise equivalent low-fit parent");
assert(stateLicenseDiscoveryFixture.counts.organizationProposals === 1, "current state-license evidence must materialize a parent absent from the older federal directory");
assert(stateLicenseDiscoveryFixture.counts.regulatorDiscoveredOrganizations === 1, "state-discovered parents must remain separately countable");
assert(stateLicenseDiscoveryFixture.counts.regulatorDiscoveredFacilities === 1, "state-discovered facilities must remain separately countable");
assert(stateLicenseDiscoveryFixture.counts.fullyQualifiedTargetParents === 1, "a complete high-confidence state-discovered parent may clear the target gate");
assert(stateLicenseDiscoveryFixture.counts.validatedFinalTargets === 1, "the final target count must use the same strict evidence and valuation predicate as the queryable stage");
assert(stateLicenseDiscoveryFixture.organizations[0]?.validatedTargetRank === 1, "validated targets must receive a deterministic rank separate from the broad screening rank");
assert(stateLicenseDiscoveryFixture.organizations[0]?.valuationEvidence?.isWholeCompanyEstimate === false, "validated-target values must remain transparent known-capacity slices rather than whole-company claims");
assert(!isValidatedAcquisitionTarget({ ...stateLicenseDiscoveryFixture.organizations[0], valuationEvidence: null }), "high confidence identity and beds must not clear the final gate without a transparent capacity-bounded valuation");
assert(!isValidatedAcquisitionTarget({
  ...stateLicenseDiscoveryFixture.organizations[0],
  resolution: { ...stateLicenseDiscoveryFixture.organizations[0].resolution, contradictionIds: ["open-contradiction"] }
}), "an open contradiction must block final-target eligibility");
assert(!isValidatedAcquisitionTarget({
  ...stateLicenseDiscoveryFixture.organizations[0],
  stateCodes: [...stateLicenseDiscoveryFixture.organizations[0].stateCodes, "CA"]
}), "California exposure must fail the final-target predicate even if upstream geography filtering regresses");
assert(stateLicenseDiscoveryFixture.organizations[0]?.discoveryBasis === "state_license_assertions", "state-discovered parents must expose their discovery basis");
assert(stateLicenseDiscoveryFixture.organizations[0]?.licenseEvidence.bedTotals.verifiedCoreTarget === 20, "state-discovered core beds must roll up from the authoritative license");
const preParentSelectionFixture = buildAcquisitionOperatorIndex([
  { ...fixtureDirectory.facilities[0], id: "selection-brand", name: "Selection Brand", website: "https://selection-brand.test" }
]);
const postParentSelectionFixture = buildAcquisitionOperatorIndex([
  { ...fixtureDirectory.facilities[0], id: "selection-brand", name: "Selection Brand", website: "https://selection-brand.test" }
], {
  parentAssertions: [{
    id: "selection-parent",
    operatingParentName: "Selection Parent",
    primaryDomain: "selection-parent.test",
    matchedDomains: ["selection-brand.test"],
    acquisitionEligibility: "eligible_private",
    confidence: { relationship: "high" },
    sources: [],
    contradictions: []
  }]
});
const priorSelectionOperator = preParentSelectionFixture.organizations[0];
const currentSelectionOperator = postParentSelectionFixture.organizations[0];
const priorSelectionDecision = {
  operatorId: priorSelectionOperator.id,
  status: "selected",
  notes: "Owner selected before parent consolidation.",
  snapshot: {
    proposedName: priorSelectionOperator.proposedName,
    rootDomain: priorSelectionOperator.rootDomain,
    selectionBucket: priorSelectionOperator.screeningProfile.selectionBucket,
    maturityTier: priorSelectionOperator.screeningProfile.maturityTier,
    targetRank: priorSelectionOperator.targetRank,
    identityKeys: priorSelectionOperator.identityKeys
  },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  updatedBy: "owner@example.test"
};
const reattachedSelection = resolveAcquisitionOperatorSelections(
  postParentSelectionFixture.organizations,
  [priorSelectionDecision]
);
assert(priorSelectionOperator.id !== currentSelectionOperator.id, "the parent-consolidation fixture must change the generated organization id");
assert(reattachedSelection.activeDecisions[0]?.operatorId === currentSelectionOperator.id, "an exact historical brand domain must reattach the owner decision to the consolidated parent");
assert(reattachedSelection.integrity.reattached.length === 1, "automatic exact-identity reattachment must remain auditable");
const orphanedSelection = resolveAcquisitionOperatorSelections(postParentSelectionFixture.organizations, [{
  ...priorSelectionDecision,
  operatorId: "retired-operator",
  snapshot: { ...priorSelectionDecision.snapshot, identityKeys: ["domain:no-current-match.test"] }
}]);
assert(orphanedSelection.activeDecisions.length === 0 && orphanedSelection.integrity.orphaned.length === 1, "unmatched owner decisions must remain explicit orphans rather than disappearing or guessing");
const conflictedSelection = resolveAcquisitionOperatorSelections([
  { id: "current-a", identityKeys: ["name:shared behavioral health"] },
  { id: "current-b", identityKeys: ["name:shared behavioral health"] }
], [{
  ...priorSelectionDecision,
  operatorId: "retired-shared",
  snapshot: { ...priorSelectionDecision.snapshot, identityKeys: ["name:shared behavioral health"] }
}]);
assert(conflictedSelection.activeDecisions.length === 0 && conflictedSelection.integrity.conflicts.length === 1, "ambiguous identity keys must require review instead of auto-merging selections");

const legacySelectionPath = path.join(storeRoot, "research/legacy-operator-selections.json");
await mkdir(path.dirname(legacySelectionPath), { recursive: true });
await writeFile(legacySelectionPath, JSON.stringify({
  version: 1,
  revision: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  decisions: [{
    ...priorSelectionDecision,
    snapshot: { ...priorSelectionDecision.snapshot, identityKeys: undefined }
  }]
}));
const legacySelectionStore = createAcquisitionOperatorSelectionStore({ storePath: legacySelectionPath });
const migratedLegacySelection = await legacySelectionStore.read();
assert(migratedLegacySelection.decisions[0]?.snapshot.identityKeys.includes("domain:selection-brand.test"), "legacy saved decisions must derive conservative identity keys when read");
const cohortSelectionPath = path.join(storeRoot, "cohort-store/operator-selections-v1.json");
const cohortSelectionStore = createAcquisitionOperatorSelectionStore({ storePath: cohortSelectionPath });
const cohortOperators = Array.from({ length: 50 }, (_, index) => {
  const operatorId = `cohort-operator-${String(index + 1).padStart(2, "0")}`;
  return {
    ...currentSelectionOperator,
    id: operatorId,
    proposedName: `Cohort Operator ${String(index + 1).padStart(2, "0")}`,
    identityKeys: [`domain:cohort-operator-${index + 1}.test`],
    screeningDecision: {
      operatorId,
      status: "selected",
      notes: "",
      snapshot: {
        proposedName: `Cohort Operator ${String(index + 1).padStart(2, "0")}`,
        rootDomain: `cohort-operator-${index + 1}.test`,
        selectionBucket: currentSelectionOperator.screeningProfile.selectionBucket,
        maturityTier: currentSelectionOperator.screeningProfile.maturityTier,
        identityKeys: [`domain:cohort-operator-${index + 1}.test`],
        targetRank: currentSelectionOperator.targetRank
      },
      createdAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
      updatedBy: "owner@example.test"
    }
  };
});
const frozenCohortResult = await cohortSelectionStore.freezeCohort(cohortOperators, {
  idempotencyKey: "cohort-freeze-check-001",
  name: "First research cohort",
  selectionRevision: 0,
  indexVersion: postParentSelectionFixture.version,
  indexGeneratedAt: postParentSelectionFixture.generatedAt
}, "owner@example.test");
assert(frozenCohortResult.created === true && frozenCohortResult.value.memberCount === 50, "a valid 50-company research cohort must freeze immutably");
assert(frozenCohortResult.value.members.every((member) => member.identityKeys.length > 0), "frozen cohort members must retain durable identity keys");
assert(frozenCohortResult.state.jobs.length === 300, "cohort freeze must create a bounded evidence-gap research queue only for its 50 members");
assert(new Set(frozenCohortResult.state.jobs.map(({ id }) => id)).size === 300, "cohort research job identifiers must be deterministic and unique");
assert(frozenCohortResult.state.jobs.every(({ stateCode }) => stateCode !== "CA"), "cohort research jobs must exclude California");
assert(frozenCohortResult.state.jobs.filter(({ kind }) => kind === "state_license_capacity").length === 50, "license research must be bounded to one job per member and observed state");
const firstValuationJob = frozenCohortResult.state.jobs.find(({ operatorId, kind }) =>
  operatorId === cohortOperators[0].id && kind === "valuation_inputs"
);
assert(firstValuationJob?.dependsOnJobIds.length === 2, "valuation work must depend on the member's ownership and state-capacity jobs");
const idempotentCohortRetry = await cohortSelectionStore.freezeCohort(cohortOperators, {
  idempotencyKey: "cohort-freeze-check-001",
  name: "First research cohort",
  selectionRevision: 0,
  indexVersion: postParentSelectionFixture.version,
  indexGeneratedAt: postParentSelectionFixture.generatedAt
}, "owner@example.test");
assert(idempotentCohortRetry.created === false && idempotentCohortRetry.value.id === frozenCohortResult.value.id, "cohort freeze retries must be idempotent");
const frozenCohortState = await cohortSelectionStore.read();
assert(frozenCohortState.cohorts.length === 1, "idempotent cohort retries must not create duplicate snapshots");
assert(frozenCohortState.jobs.length === 300, "idempotent cohort retries must not duplicate research jobs");
const frozenCohortRevision = JSON.parse(await readFile(path.join(
  path.dirname(cohortSelectionPath),
  "operator-selection-revisions/00000001.json"
), "utf8"));
assert(frozenCohortRevision.cohorts[0]?.memberCount === 50, "local cohort writes must retain an immutable revision copy");
assert(frozenCohortRevision.jobs.length === 300, "immutable cohort revisions must include the generated research queue");
const blockedPhaseTwoClaim = await cohortSelectionStore.claimNextResearchJob({
  cohortId: frozenCohortResult.value.id,
  workerId: "phase-two-worker",
  kinds: ["state_license_capacity"],
  leaseSeconds: 60
});
assert(blockedPhaseTwoClaim.value === null && blockedPhaseTwoClaim.leaseToken === null, "state-capacity work must remain unclaimable until its company dependencies complete");
const [firstConcurrentClaim, secondConcurrentClaim] = await Promise.all([
  cohortSelectionStore.claimNextResearchJob({
    cohortId: frozenCohortResult.value.id,
    workerId: "identity-worker-a",
    kinds: ["parent_legal_identity"],
    leaseSeconds: 60
  }),
  cohortSelectionStore.claimNextResearchJob({
    cohortId: frozenCohortResult.value.id,
    workerId: "identity-worker-b",
    kinds: ["parent_legal_identity"],
    leaseSeconds: 60
  })
]);
assert(firstConcurrentClaim.value?.id !== secondConcurrentClaim.value?.id, "concurrent workers must never receive the same live-leased job");
assert(Boolean(firstConcurrentClaim.leaseToken) && Boolean(secondConcurrentClaim.leaseToken), "each claimed research job must receive a unique settlement token");
const stateWithConcurrentClaims = await cohortSelectionStore.read();
const persistedFirstClaim = stateWithConcurrentClaims.jobs.find(({ id }) => id === firstConcurrentClaim.value?.id);
assert(persistedFirstClaim?.claim?.leaseTokenHash !== firstConcurrentClaim.leaseToken, "research stores must retain only a one-way lease-token hash");
assert(persistedFirstClaim?.attemptCount === 1, "a successful claim must increment the durable attempt counter exactly once");
await assertRejects(
  () => cohortSelectionStore.settleResearchJob({
    jobId: firstConcurrentClaim.value.id,
    leaseToken: "not-the-issued-token",
    action: "release"
  }, "owner@example.test"),
  "a worker must not settle a job with another or expired lease token"
);
await assertRejects(
  () => cohortSelectionStore.settleResearchJob({
    jobId: secondConcurrentClaim.value.id,
    leaseToken: secondConcurrentClaim.leaseToken,
    action: "block",
    notes: ""
  }, "owner@example.test"),
  "blocked research jobs must preserve a human-readable blocker"
);
const blockedResearchJob = await cohortSelectionStore.settleResearchJob({
  jobId: secondConcurrentClaim.value.id,
  leaseToken: secondConcurrentClaim.leaseToken,
  action: "block",
  notes: "Conflicting legal entities require owner review."
}, "owner@example.test");
assert(blockedResearchJob.value.status === "blocked" && blockedResearchJob.value.claim === null, "blocking must durably clear the lease and retain the blocker state");
const completedResearchJob = await cohortSelectionStore.settleResearchJob({
  jobId: firstConcurrentClaim.value.id,
  leaseToken: firstConcurrentClaim.leaseToken,
  action: "complete",
  notes: "Ready for deterministic validation.",
  result: {
    outcome: "evidence_found",
    summary: "A current first-party source identifies the proposed operating parent.",
    sources: [{
      id: "source-1",
      title: "Company overview",
      url: "https://cohort-operator-1.test/about",
      sourceType: "first_party",
      observedAt: "2026-09-08T00:00:00.000Z",
      supports: ["operating_parent"]
    }],
    assertions: [{
      field: "operating_parent",
      value: "Cohort Operator 01 Parent LLC",
      confidence: "medium",
      sourceIds: ["source-1"],
      note: "Proposed relationship; registry validation remains required."
    }],
    contradictions: []
  }
}, "owner@example.test");
assert(completedResearchJob.value.status === "completed", "a valid cited result must complete the claimed research job");
assert(completedResearchJob.value.result?.promotionStatus === "proposal_pending_deterministic_validation", "agent research results must remain non-promoted proposals");
assert(completedResearchJob.state.cohorts[0]?.members[0]?.confidence.legalIdentity !== "high", "completing an agent job must not mutate the frozen evidence-confidence snapshot");
const releaseClaim = await cohortSelectionStore.claimNextResearchJob({
  cohortId: frozenCohortResult.value.id,
  workerId: "ownership-worker",
  kinds: ["private_ownership"],
  leaseSeconds: 60
});
const releasedResearchJob = await cohortSelectionStore.settleResearchJob({
  jobId: releaseClaim.value.id,
  leaseToken: releaseClaim.leaseToken,
  action: "release",
  notes: "Returned for another worker."
}, "owner@example.test");
assert(releasedResearchJob.value.status === "pending" && releasedResearchJob.value.claim === null, "released work must return to the pending queue without retaining its lease");

const resultValidationPath = path.join(storeRoot, "result-validation-store/operator-selections-v1.json");
await mkdir(path.dirname(resultValidationPath), { recursive: true });
await writeFile(resultValidationPath, JSON.stringify(frozenCohortState));
const resultValidationStore = createAcquisitionOperatorSelectionStore({ storePath: resultValidationPath });
const validationClaim = await resultValidationStore.claimNextResearchJob({
  cohortId: frozenCohortResult.value.id,
  workerId: "evidence-validator",
  kinds: ["private_ownership"],
  leaseSeconds: 60
});
await assertRejects(
  () => resultValidationStore.settleResearchJob({
    jobId: validationClaim.value.id,
    leaseToken: validationClaim.leaseToken,
    action: "complete",
    result: { outcome: "evidence_found", summary: "Unsupported.", sources: [], assertions: [], contradictions: [] }
  }, "owner@example.test"),
  "evidence-found results must not complete without cited sources and assertions"
);
await assertRejects(
  () => resultValidationStore.settleResearchJob({
    jobId: validationClaim.value.id,
    leaseToken: validationClaim.leaseToken,
    action: "complete",
    result: {
      outcome: "evidence_found",
      summary: "Insecure source.",
      sources: [{ id: "source-http", title: "Insecure", url: "http://example.test", sourceType: "first_party", observedAt: "2026-09-08T00:00:00.000Z", supports: ["ownership"] }],
      assertions: [{ field: "ownership", value: "private", confidence: "low", sourceIds: ["source-http"] }],
      contradictions: []
    }
  }, "owner@example.test"),
  "research proposals must reject non-HTTPS evidence URLs"
);
await assertRejects(
  () => resultValidationStore.settleResearchJob({
    jobId: validationClaim.value.id,
    leaseToken: validationClaim.leaseToken,
    action: "complete",
    result: {
      outcome: "evidence_found",
      summary: "Unknown citation.",
      sources: [{ id: "source-known", title: "Known", url: "https://example.test", sourceType: "first_party", observedAt: "2026-09-08T00:00:00.000Z", supports: ["ownership"] }],
      assertions: [{ field: "ownership", value: "private", confidence: "low", sourceIds: ["source-missing"] }],
      contradictions: []
    }
  }, "owner@example.test"),
  "research assertions must cite source identifiers included in the same immutable result"
);
const validationStateAfterRejections = await resultValidationStore.read();
assert(validationStateAfterRejections.jobs.find(({ id }) => id === validationClaim.value.id)?.status === "in_progress", "invalid evidence payloads must leave the live claim unsettled and retryable");

const expiryStorePath = path.join(storeRoot, "expiry-store/operator-selections-v1.json");
await mkdir(path.dirname(expiryStorePath), { recursive: true });
await writeFile(expiryStorePath, JSON.stringify(frozenCohortState));
const expiryStore = createAcquisitionOperatorSelectionStore({ storePath: expiryStorePath });
const expiringClaim = await expiryStore.claimNextResearchJob({
  cohortId: frozenCohortResult.value.id,
  workerId: "expired-worker",
  kinds: ["parent_legal_identity"],
  leaseSeconds: 60
});
const manuallyExpiredState = JSON.parse(await readFile(expiryStorePath, "utf8"));
const manuallyExpiredJob = manuallyExpiredState.jobs.find(({ id }) => id === expiringClaim.value.id);
manuallyExpiredJob.claim.leaseExpiresAt = "2026-09-01T00:00:00.000Z";
await writeFile(expiryStorePath, JSON.stringify(manuallyExpiredState));
const reclaimedClaim = await expiryStore.claimNextResearchJob({
  cohortId: frozenCohortResult.value.id,
  workerId: "replacement-worker",
  kinds: ["parent_legal_identity"],
  leaseSeconds: 60
});
assert(reclaimedClaim.value.id === expiringClaim.value.id, "an expired lease must make the same highest-priority job claimable again");
assert(reclaimedClaim.value.attemptCount === 2 && reclaimedClaim.leaseToken !== expiringClaim.leaseToken, "reclaimed work must increment attempts and rotate the settlement token");
await assertRejects(
  () => createAcquisitionOperatorSelectionStore({ storePath: path.join(storeRoot, "research/undersized-cohort.json") }).freezeCohort(
    cohortOperators.slice(0, 49),
    {
      idempotencyKey: "undersized-cohort-check",
      name: "Too small",
      selectionRevision: 0,
      indexVersion: postParentSelectionFixture.version,
      indexGeneratedAt: postParentSelectionFixture.generatedAt
    },
    "owner@example.test"
  ),
  "cohort persistence must reject fewer than 50 selected companies"
);
await assertRejects(
  () => createAcquisitionOperatorSelectionStore({ storePath: path.join(storeRoot, "research/california-cohort.json") }).freezeCohort(
    cohortOperators.map((operator, index) => index === 0 ? { ...operator, stateCodes: ["CA"] } : operator),
    {
      idempotencyKey: "california-cohort-check",
      name: "Excluded geography",
      selectionRevision: 0,
      indexVersion: postParentSelectionFixture.version,
      indexGeneratedAt: postParentSelectionFixture.generatedAt
    },
    "owner@example.test"
  ),
  "cohort persistence must reject California before creating members or research jobs"
);
await writeFile(path.join(storeRoot, "derived/operator-proposals.json"), JSON.stringify(stateLicenseDiscoveryFixture));
const validatedTargetSearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=validated_targets&sort=rank&limit=100")
);
assert(validatedTargetSearch.matched === 1 && validatedTargetSearch.results[0]?.validatedTargetRank === 1, "the protected operator search must expose the strict validated-target stage in deterministic rank order");
assert(validatedTargetSearch.results[0]?.proposedName === "State Discovered Parent", "the final stage must show the operating parent rather than its underlying state-license facility");
await writeFile(path.join(storeRoot, "derived/operator-proposals.json"), JSON.stringify(operatorFixture));
const operatorSearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=screen_500&q=example&state=ID")
);
assert(operatorSearch.matched === 1, "the local parent-company proposal index must be searchable");
assert(operatorSearch.results[0]?.facilityCounts.candidates === 4, "operator search must preserve candidate facility rollups");
assert(operatorSearch.matchedBreakdown.total === 1 && operatorSearch.matchedBreakdown.unresolvedParentProposals === 1, "operator search must summarize the complete filtered view before pagination");
assert(
  operatorSearch.matchedBreakdown.platformScaleSignals +
    operatorSearch.matchedBreakdown.regionalScaleSignals +
    operatorSearch.matchedBreakdown.establishedLocalSignals +
    operatorSearch.matchedBreakdown.singleSiteOrUnresolved === operatorSearch.matched,
  "filtered-view scale buckets must account for every matched company exactly once"
);
assert(operatorSearch.matchedBreakdown.coreFitSignals + operatorSearch.matchedBreakdown.adjacentFitSignals === 1 && operatorSearch.matchedBreakdown.withVerifiedCoreBeds === 0, "filtered-view quality counts must separate discovery fit from verified capacity");
assert(
  operatorSearch.matchedBreakdown.screeningCapacityAvailable === 1 &&
    operatorSearch.matchedBreakdown.screeningCapacity75To149 === 1 &&
    operatorSearch.matchedBreakdown.screeningCapacityNotEstimable === 0,
  "filtered-view summaries must expose complete screening-capacity buckets separately from verified beds"
);
assert(operatorSearch.matchedBreakdown.verifiedPrivate + operatorSearch.matchedBreakdown.ownershipPending + operatorSearch.matchedBreakdown.excludedOwnership === operatorSearch.matched, "filtered-view ownership counts must account for every matched proposal without treating exclusions as pending");
const parentProofNeededSearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&relationshipConfidence=not_high")
);
assert(parentProofNeededSearch.matched === 1 && parentProofNeededSearch.results[0]?.resolution.confidence !== "high", "the parent-readiness lane must retrieve low, medium, and unverified proposals without mixing in evidenced parents");
const maturePoolSearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&maturity=mature_scale_signal")
);
assert(maturePoolSearch.matched === 1, "the mature-scale filter must combine platform and regional proposals without requiring verified fit or ownership");
const capacityBucketSearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&screeningCapacityBand=75_149&facilityScaleBand=four_nine_locations")
);
assert(capacityBucketSearch.matched === 1 && capacityBucketSearch.results[0]?.proposedName.includes("Example Residential"), "operator search must combine screening-bed and observable-location range filters");
const estimableCapacitySearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&screeningCapacityBand=estimable")
);
assert(estimableCapacitySearch.matched === 1, "operator search must expose an all-estimable lane without including capacity-unknown proposals");
await writeFile(path.join(storeRoot, "derived/operator-proposals.json"), JSON.stringify(globalSortFixture));
const globallyAlphabetizedPage = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&sort=company&limit=1&offset=0")
);
assert(globallyAlphabetizedPage.results[0]?.proposedName === "Alpha Local Behavioral Health", "company sorting must execute before pagination");
const globallyMaturePage = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&sort=maturity&limit=1&offset=0")
);
assert(globallyMaturePage.results[0]?.proposedName === "Zulu Regional Behavioral Health Boise", "maturity sorting must execute across the full filtered universe before pagination");
const globallyCapacitySortedPage = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&sort=screening_capacity&limit=1&offset=0")
);
assert(globallyCapacitySortedPage.results[0]?.proposedName === "Zulu Regional Behavioral Health Boise", "screening-capacity sorting must execute across the full filtered universe before pagination");
assertThrows(
  () => validateAcquisitionOperatorBulkDecisionRequest({
    action: "select_unreviewed_page",
    operatorIds: ["duplicate-company", "duplicate-company"],
    selectionRevision: 0
  }),
  "bulk page selection must reject duplicate company identifiers"
);
assertThrows(
  () => validateAcquisitionOperatorBulkDecisionRequest({
    action: "select_unreviewed_page",
    operatorIds: Array.from({ length: 51 }, (_, index) => `company-${index + 1}`),
    selectionRevision: 0
  }),
  "bulk page selection must remain bounded to the 50-row browser page"
);
const alphaGlobalOperator = globalSortFixture.organizations.find(({ proposedName }) => proposedName === "Alpha Local Behavioral Health");
const zuluGlobalOperator = globalSortFixture.organizations.find(({ proposedName }) => proposedName === "Zulu Regional Behavioral Health Boise");
assert(Boolean(alphaGlobalOperator && zuluGlobalOperator), "the bulk-selection fixture must contain both page companies");
await mutateAcquisitionOperatorDecision(
  validateAcquisitionOperatorDecisionRequest({ operatorId: alphaGlobalOperator.id, status: "hold", notes: "Keep the prior review." }),
  { claims: { email: "owner@example.test" } }
);
const bulkPageSelection = await mutateAcquisitionOperatorBulkDecision(
  validateAcquisitionOperatorBulkDecisionRequest({
    action: "select_unreviewed_page",
    operatorIds: [alphaGlobalOperator.id, zuluGlobalOperator.id],
    selectionRevision: 1,
    notes: "Owner chose the current filtered page."
  }),
  { claims: { email: "owner@example.test" } }
);
assert(
  bulkPageSelection.selected === 1 && bulkPageSelection.skippedAlreadyReviewed === 1,
  "page selection must add only undecided companies and preserve prior hold/pass/research decisions"
);
assert(bulkPageSelection.revision === 2 && bulkPageSelection.ownerSelected === 1, "a page add must persist as one atomic owner-selection revision");
const bulkPageState = JSON.parse(await readFile(path.join(storeRoot, "research/operator-selections-v1.json"), "utf8"));
assert(
  bulkPageState.decisions.find(({ operatorId }) => operatorId === alphaGlobalOperator.id)?.status === "hold" &&
    bulkPageState.decisions.find(({ operatorId }) => operatorId === zuluGlobalOperator.id)?.status === "selected",
  "page selection must never overwrite a previously reviewed company"
);
const globalPageExport = await getAcquisitionOperatorExportResponse(new URL(
  "http://localhost/api/platform/acquisition/operators/export?stage=all&sort=company&exportLimit=2"
));
assert(
  globalPageExport.rowCount === 2 && globalPageExport.matched === 2 && globalPageExport.truncated === false,
  "the owner export must preserve the complete filtered company count within its bounded limit"
);
assert(
  globalPageExport.content.includes('"Alpha Local Behavioral Health"') &&
    globalPageExport.content.includes('"Zulu Regional Behavioral Health Boise"') &&
    globalPageExport.content.includes('"hold"') &&
    globalPageExport.content.includes('"selected"'),
  "the company export must contain one company row per filtered proposal and retain owner decisions"
);
assert(
  globalPageExport.content.split("\r\n").filter(Boolean).length === 3,
  "the CSV export must contain exactly one header plus one physical row per company"
);
assert(
  globalPageExport.content.includes('"Observable location band"') &&
    globalPageExport.content.includes('"Screening bed band"') &&
    globalPageExport.content.includes('"Screening beds base"') &&
    globalPageExport.content.includes('"partial_observable_site_proxy"'),
  "the company export must include transparent footprint and peer-capacity screening buckets without implying whole-company capacity"
);
const matureOnlyExport = await getAcquisitionOperatorExportResponse(new URL(
  "http://localhost/api/platform/acquisition/operators/export?stage=all&maturity=mature_scale_signal&sort=company"
));
assert(
  matureOnlyExport.rowCount === 1 &&
    matureOnlyExport.content.includes('"Zulu Regional Behavioral Health Boise"') &&
    !matureOnlyExport.content.includes('"Alpha Local Behavioral Health"'),
  "company export filters and global sort must match the owner screen rather than exporting the unfiltered index"
);
const formulaSafeExport = buildAcquisitionOperatorCsv([{
  ...alphaGlobalOperator,
  proposedName: "=HYPERLINK(\"https://invalid.test\",\"unsafe\")"
}]);
assert(formulaSafeExport.includes('"\'=HYPERLINK(""https://invalid.test""'), "CSV text cells must neutralize spreadsheet-formula injection");
assertThrows(
  () => buildAcquisitionOperatorCsv(Array.from({ length: 501 }, () => alphaGlobalOperator)),
  "company CSV generation must reject more than 500 rows"
);
await assertRejects(
  () => getAcquisitionOperatorExportResponse(new URL(
    "http://localhost/api/platform/acquisition/operators/export?stage=all&exportLimit=501"
  )),
  "the protected company export must reject requests above its 500-row ceiling"
);
let staleBulkSelectionError = null;
try {
  await mutateAcquisitionOperatorBulkDecision(
    validateAcquisitionOperatorBulkDecisionRequest({
      action: "select_unreviewed_page",
      operatorIds: [zuluGlobalOperator.id],
      selectionRevision: 1
    }),
    { claims: { email: "owner@example.test" } }
  );
} catch (error) {
  staleBulkSelectionError = error;
}
assert(
  staleBulkSelectionError?.statusCode === 409 && staleBulkSelectionError?.code === "acquisition_operator_selection_revision_changed",
  "stale browser pages must not mutate a newer owner research list"
);

const bulkCapFixture = buildAcquisitionOperatorIndex(Array.from({ length: 102 }, (_, index) => ({
  ...fixtureDirectory.facilities[0],
  id: `bulk-cap-facility-${String(index + 1).padStart(3, "0")}`,
  name: `Bulk Cap Company ${String(index + 1).padStart(3, "0")}`,
  website: `https://bulk-cap-company-${index + 1}.test`
})), { generatedAt: "2026-09-07T00:00:00.000Z", excludedStateCodes: ["CA"] });
await writeFile(path.join(storeRoot, "derived/operator-proposals.json"), JSON.stringify(bulkCapFixture));
const capTimestamp = "2026-09-07T00:00:00.000Z";
await writeFile(path.join(storeRoot, "research/operator-selections-v1.json"), JSON.stringify({
  version: 1,
  revision: 7,
  createdAt: capTimestamp,
  updatedAt: capTimestamp,
  decisions: bulkCapFixture.organizations.slice(0, 99).map((operator) => ({
    operatorId: operator.id,
    status: "selected",
    notes: "Existing research list",
    snapshot: {
      proposedName: operator.proposedName,
      rootDomain: operator.rootDomain,
      selectionBucket: operator.screeningProfile.selectionBucket,
      maturityTier: operator.screeningProfile.maturityTier,
      identityKeys: operator.identityKeys,
      targetRank: operator.targetRank
    },
    createdAt: capTimestamp,
    updatedAt: capTimestamp,
    updatedBy: "owner@example.test"
  })),
  cohorts: [],
  jobs: []
}));
const cappedBulkPageSelection = await mutateAcquisitionOperatorBulkDecision(
  validateAcquisitionOperatorBulkDecisionRequest({
    action: "select_unreviewed_page",
    operatorIds: bulkCapFixture.organizations.slice(99, 102).map(({ id }) => id),
    selectionRevision: 7
  }),
  { claims: { email: "owner@example.test" } }
);
assert(
  cappedBulkPageSelection.selected === 1 &&
    cappedBulkPageSelection.skippedResearchListLimit === 2 &&
    cappedBulkPageSelection.ownerSelected === 100,
  "bulk selection must stop the active owner research list at 100 companies"
);

await writeFile(path.join(storeRoot, "research/operator-selections-v1.json"), JSON.stringify({
  version: 1,
  revision: 0,
  createdAt: capTimestamp,
  updatedAt: capTimestamp,
  decisions: [],
  cohorts: [],
  jobs: []
}));
await writeFile(path.join(storeRoot, "derived/operator-proposals.json"), JSON.stringify(evidenceParentFixture));
const verifiedPrivateParentSearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&eligibility=eligible_private&relationshipConfidence=high")
);
assert(verifiedPrivateParentSearch.matched === 1, "operator search must filter evidence-backed private parent relationships");
assert(verifiedPrivateParentSearch.results[0]?.proposedName === "Private Parent", "operator search must return the operating parent rather than a brand");
assert(verifiedPrivateParentSearch.matchedBreakdown.evidenceBackedParents === 1 && verifiedPrivateParentSearch.matchedBreakdown.verifiedPrivate === 1, "filtered-view quality counts must identify evidence-backed private operating parents");
const eligibleOnlyBulkSelection = await mutateAcquisitionOperatorBulkDecision(
  validateAcquisitionOperatorBulkDecisionRequest({
    action: "select_unreviewed_page",
    operatorIds: [privateParent.id, publicParent.id],
    selectionRevision: 0
  }),
  { claims: { email: "owner@example.test" } }
);
assert(
  eligibleOnlyBulkSelection.selected === 1 &&
    eligibleOnlyBulkSelection.skippedIneligible === 1 &&
    eligibleOnlyBulkSelection.selectedOperatorIds[0] === privateParent.id,
  "page selection must skip known public or out-of-scope companies without hiding them from market context"
);
const broadBucketSearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&maturity=established_local_signal&selectionBucket=established_target_signal&privateLikelihood=verified_private&fit=adjacent_signal")
);
assert(broadBucketSearch.matched === 1, "operator search must support maturity, selection, private-likelihood, and fit buckets across the broad universe");
const savedOperatorDecision = await mutateAcquisitionOperatorDecision(
  validateAcquisitionOperatorDecisionRequest({ operatorId: privateParent.id, status: "selected", notes: "Owner research list" }),
  { claims: { email: "owner@example.test" } }
);
assert(savedOperatorDecision.ok === true && savedOperatorDecision.decision?.status === "selected", "owner screening decisions must persist against stable operator identifiers");
assert(savedOperatorDecision.decision?.snapshot.identityKeys.length > 0, "new owner decisions must snapshot durable organization identity keys");
const selectedOperatorSearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&ownerDecision=selected")
);
assert(selectedOperatorSearch.matched === 1, "the persistent owner research list must be filterable");
assert(selectedOperatorSearch.results[0]?.screeningDecision?.notes === "Owner research list", "operator results must retain owner decision context");
assert(selectedOperatorSearch.counts.ownerSelected === 1, "the operator screen must count the persistent owner research list");
assert(selectedOperatorSearch.counts.ownerReviewed === 1, "the operator screen must count active owner decisions as reviewed");
assert(selectedOperatorSearch.counts.ownerMatureReviewed === 0, "mature-pool progress must not count an established-local decision");
assert(selectedOperatorSearch.counts.ownerResearch100Reviewed === 1 && selectedOperatorSearch.counts.ownerResearch100Remaining === 0, "the suggested-100 lane must count a reviewed current rank independently of maturity");
assert(selectedOperatorSearch.counts.ownerScreen500Reviewed === 1 && selectedOperatorSearch.counts.ownerScreen500Remaining === 0, "the 500-company lane must count reviewed ranks from the same durable decision state");
await assertRejects(
  () => freezeSelectedAcquisitionOperatorCohort(validateAcquisitionOperatorCohortRequest({
    action: "freeze_selected",
    name: "Undersized live cohort",
    idempotencyKey: "live-cohort-check-001"
  }), { claims: { email: "owner@example.test" } }),
  "the owner-only cohort service must reject a live selection list below 50 companies"
);
const verifiedCapacitySearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&capacityEvidence=verified_core&q=BH-100")
);
assert(verifiedCapacitySearch.matched === 1, "operator search must find verified core capacity by state license number");
assert(verifiedCapacitySearch.results[0]?.licenseEvidence.bedTotals.verifiedCoreTarget === 18, "capacity search must preserve the verified core bed subtotal");
const reportedCapacitySearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&capacityEvidence=reported&q=Example Residential Center")
);
assert(reportedCapacitySearch.matched === 1, "operator search must filter and search reported capacity observations");
assert(reportedCapacitySearch.results[0]?.licenseEvidence.bedTotals.reportedByOperator === 16, "reported capacity search must preserve the source-separated total");
const valuationEvidenceSearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&valuationEvidence=available")
);
assert(valuationEvidenceSearch.matched === 1, "operator search must filter known-capacity valuation evidence");
assert(valuationEvidenceSearch.results[0]?.valuationEvidence?.capacity.valuedBeds === 18, "operator search must preserve the valued capacity slice");
const publicContextSearch = await searchAcquisitionOperatorUniverse(
  new URL("http://localhost/api/platform/acquisition/operators?stage=all&eligibility=excluded_public_company")
);
assert(publicContextSearch.matched === 1, "operator search must retain public parents as filterable market context");
assert(publicContextSearch.results[0]?.targetRank === null, "public context cannot leak into target ranks");
await writeFile(path.join(storeRoot, "research/operator-selections-v1.json"), JSON.stringify(frozenCohortState));
const publicResearchJobClaim = await mutateAcquisitionOperatorResearchJob(
  validateAcquisitionOperatorResearchJobRequest({
    action: "claim_next",
    cohortId: frozenCohortResult.value.id,
    workerId: "owner-agent-harness",
    kinds: ["parent_legal_identity"],
    leaseSeconds: 60
  }),
  { claims: { email: "owner@example.test" } }
);
assert(publicResearchJobClaim.job?.status === "in_progress" && Boolean(publicResearchJobClaim.leaseToken), "the owner research-job service must return a claim and its one-time settlement token");
assert(!JSON.stringify(publicResearchJobClaim.job).includes("leaseTokenHash"), "owner-facing job responses must never expose persisted lease-token hashes");
const publicResearchJobRelease = await mutateAcquisitionOperatorResearchJob(
  validateAcquisitionOperatorResearchJobRequest({
    action: "release",
    jobId: publicResearchJobClaim.job.id,
    leaseToken: publicResearchJobClaim.leaseToken,
    notes: "Service contract check complete."
  }),
  { claims: { email: "owner@example.test" } }
);
assert(publicResearchJobRelease.job.status === "pending" && publicResearchJobRelease.leaseToken === null, "the public research-job service must safely release claimed work");
const frozenCohortRead = await getAcquisitionOperatorCohortResponse(new URL(
  `http://localhost/api/platform/acquisition/operator-cohort?id=${encodeURIComponent(frozenCohortResult.value.id)}`
));
assert(frozenCohortRead.cohort.members.length === 50, "the owner-only cohort endpoint must return the immutable research members");
assert(frozenCohortRead.cohort.readiness.parentRelationshipHigh === 50, "cohort readiness must summarize evidence dimensions from frozen member snapshots");
assert(frozenCohortRead.cohort.readiness.privateOwnershipHigh === 0, "cohort readiness must preserve unresolved confidence dimensions rather than promoting them");
assert(frozenCohortRead.cohort.evidenceTotals.verifiedCoreBedsInSnapshots === 0, "cohort capacity totals must preserve unknown beds without inventing values");
assert(frozenCohortRead.cohort.jobs.length === 300, "the owner-only cohort endpoint must return its bounded research jobs");
assert(frozenCohortRead.cohort.researchQueue.phase1 === 200 && frozenCohortRead.cohort.researchQueue.phase2 === 50 && frozenCohortRead.cohort.researchQueue.phase3 === 50, "cohort research readiness must expose dependency phases");
assertThrows(() => buildAcquisitionOperatorIndex([
  { ...fixtureDirectory.facilities[0], id: "excluded-license-facility", website: "https://brand-a.test" }
], {
  excludedStateCodes: ["CA"],
  parentAssertions: [{
    id: "private-parent",
    operatingParentName: "Private Parent",
    matchedDomains: ["brand-a.test"],
    acquisitionEligibility: "eligible_private",
    confidence: { relationship: "high" },
    sources: [],
    contradictions: []
  }],
  licenseSources: [{
    id: "state-report",
    authorityType: "state_regulator",
    title: "Report",
    landingPageUrl: "https://state.test/licenses",
    reportUrl: "https://state.test/report.xlsx"
  }],
  licenseAssertions: [{
    id: "excluded-ca-license",
    parentAssertionId: "private-parent",
    programName: "California Program",
    legalOperatorName: "California Operator LLC",
    address: { street1: "1 Main Street", city: "Los Angeles", stateCode: "CA", zip: "90001" },
    license: { authorityName: "California regulator", number: "CA-1", status: "active" },
    capacity: { licensedBeds: 20, scopeClassification: "core_target", confidence: "high" },
    source: { sourceId: "state-report", workbookSheet: "Residential", asOf: "2026-09-01" }
  }]
}), "California license evidence must be rejected before any parent or bed rollup");

const baseDirectoryRecord = {
  typeFacilities: ["MH"],
  services: {
    FOP: ["Private for-profit organization"],
    SET: ["Residential/24-hour residential"],
    AGE: ["Young Adults; Adults"],
    TC: ["Mental health treatment"]
  }
};
assert(
  screenAcquisitionDirectoryFacility(baseDirectoryRecord).disposition === "include",
  "a private for-profit adult residential mental-health record should enter the include queue"
);
assert(
  screenAcquisitionDirectoryFacility({
    ...baseDirectoryRecord,
    services: { ...baseDirectoryRecord.services, FOP: ["Local, county, or community government"] }
  }).disposition === "exclude",
  "a government record must be excluded from active acquisition queues"
);
assert(
  screenAcquisitionDirectoryFacility({
    ...baseDirectoryRecord,
    services: { ...baseDirectoryRecord.services, FOP: ["Private (for-profit/non-profit) organization"] }
  }).disposition === "review",
  "ambiguous private ownership must stay in review rather than the include queue"
);
assert(
  screenAcquisitionDirectoryFacility({
    ...baseDirectoryRecord,
    services: { ...baseDirectoryRecord.services, AGE: ["Children/Adolescents"] }
  }).disposition === "exclude",
  "a youth-only record must be excluded"
);

const storedOverview = await getAcquisitionIntelligenceOverviewResponse();
assert(storedOverview.nationalDiscovery.available, "the refreshed local national datastore must be surfaced");
assert(storedOverview.nationalDiscovery.publicUse.rawRecords === 27957, "the PUF raw row count must be preserved");
assert(storedOverview.workflow[0]?.status === "refreshed", "the national workflow stage must reflect a refreshed datastore");
assert(storedOverview.workflow[1]?.status === "queue_ready", "the facility-screen stage must reflect a ready queue");
assert(storedOverview.workflow[2]?.status === "queue_ready", "ownership resolution must expose the durable case queue");
assert(storedOverview.workflow[3]?.status === "manual_workflow_ready", "license and capacity validation must expose its manual evidence workflow");
const facilitySearch = await searchNationalFacilityDiscovery(
  new URL("http://localhost/api/platform/acquisition/search?q=boise&state=ID&disposition=include")
);
assert(facilitySearch.matched === 1, "facility discovery search must match normalized local records");
assert(facilitySearch.results[0]?.verificationStatus === "directory_discovery_only", "facility results must remain discovery-only");

const research = await getAcquisitionResearchResponse(
  new URL("http://localhost/api/platform/acquisition/research?queue=priority&limit=10"),
  { authenticated: false, mode: "explicit-development-bypass" }
);
assert(research.persistence === "local_file_store", "facility research cases must use the bounded local persistence layer");
assert(research.summary.totalCases === 1, "every include/review discovery facility must receive one durable case");
assert(research.summary.evidencePriorityCases === 1, "small discovery universes must remain available in the priority queue");
assert(research.cases[0]?.facilityId === "ft-test", "research cases must preserve their source discovery identity");

const proposals = buildProposedOperatorClusters([
  facilitySearch.results[0],
  {
    ...facilitySearch.results[0],
    id: "ft-test-2",
    name: "Example Residential Center North",
    address: { ...facilitySearch.results[0].address, city: "Meridian" },
    website: "https://example-health.test/programs"
  },
  {
    ...facilitySearch.results[0],
    id: "ft-test-3",
    website: "https://example-health.test/locations"
  }
]);
assert(proposals[0]?.status === "proposed_not_verified", "operator clusters must never be returned as verified owners");
assert(proposals[0]?.facilityCount === 2, "shared domains should form a bounded operator research proposal");

const caseUpdate = validateAcquisitionResearchRequest({
  action: "update_case",
  facilityId: "ft-test",
  case: {
    status: "researching",
    priority: "urgent",
    assignee: "Owner",
    notes: "Validate the Idaho state license and legal operator.",
    scope: { adult: "confirmed", residential: "confirmed", privateForProfit: "pending" },
    ownership: { status: "proposed", operatorName: "Example Health", parentName: null, sourceUrl: null },
    license: {
      status: "pending",
      legalEntity: null,
      licenseNumber: null,
      licensedBeds: null,
      sourceUrl: null
    }
  }
});
await mutateAcquisitionResearch(caseUpdate, { authenticated: false, mode: "explicit-development-bypass" });
const evidenceUpdate = validateAcquisitionResearchRequest({
  action: "add_evidence",
  facilityId: "ft-test",
  evidence: {
    kind: "ownership",
    title: "Example official ownership record",
    url: "https://example.test/ownership",
    note: "Supports the proposed operating company.",
    observedAt: "2026-09-07"
  }
});
await mutateAcquisitionResearch(evidenceUpdate, { authenticated: false, mode: "explicit-development-bypass" });
const updatedResearch = await getAcquisitionResearchResponse(
  new URL("http://localhost/api/platform/acquisition/research?queue=all&limit=10"),
  { authenticated: false, mode: "explicit-development-bypass" }
);
assert(updatedResearch.cases[0]?.status === "researching", "case workflow decisions must persist across reads");
assert(updatedResearch.cases[0]?.evidence.length === 1, "cited evidence must persist in the case history");
assert(updatedResearch.summary.evidenceRecords === 1, "research summary must count persisted evidence");
assert(
  overview.scope.excluded.includes("public companies") &&
    overview.scope.excluded.includes("nonprofits") &&
    overview.scope.excluded.includes("government providers"),
  "the strict private-company exclusions are missing"
);

const workbookExample = calculateAcquisitionValuation({
  operatorId: null,
  segmentId: "crisis_subacute_step_down",
  bedsLow: 2000,
  bedsHigh: 2000,
  assumptions: {
    occupancy: { low: 0.8, base: 0.8, high: 0.8 },
    netRevenuePerOccupiedBedDay: { low: 700, base: 700, high: 700 },
    ebitdaMargin: { low: 0.12, base: 0.12, high: 0.12 },
    ebitdaMultiple: { low: 7, base: 7, high: 7 }
  }
});
assert(approximatelyEqual(workbookExample.outputs.base.revenueMillions, 408.8), "revenue must reproduce the workbook arithmetic");
assert(approximatelyEqual(workbookExample.outputs.base.ebitdaMillions, 49.056), "EBITDA must reproduce the workbook arithmetic");
assert(approximatelyEqual(workbookExample.outputs.base.enterpriseValueMillions, 343.392), "enterprise value must reproduce the workbook arithmetic");

const midpointCase = calculateAcquisitionValuation({
  operatorId: "TEST",
  segmentId: "high_acuity_smi_residential",
  bedsLow: 1200,
  bedsHigh: 2500
});
assert(midpointCase.outputs.base.beds === 1850, "the base case must use midpoint beds");
assert(midpointCase.outputs.low.enterpriseValueMillions < midpointCase.outputs.base.enterpriseValueMillions, "low EV must remain below base EV");
assert(midpointCase.outputs.base.enterpriseValueMillions < midpointCase.outputs.high.enterpriseValueMillions, "base EV must remain below high EV");

assertThrows(
  () => calculateAcquisitionValuation({
    segmentId: "high_acuity_smi_residential",
    bedsLow: 200,
    bedsHigh: 100
  }),
  "the model must reject a high-bed case below the low-bed case"
);

const [
  pageSource,
  workspaceSource,
  researchWorkspaceSource,
  researchCaseEditorSource,
  browserApiSource,
  browserOperatorApiSource,
  browserResearchApiSource,
  platformApiSource,
  devApiSource,
  refreshSource,
  azureStorageSource,
  publishSource
] = await Promise.all([
  readFile(path.join(root, "src/features/fiftystate/pages/FiftyStatePage.tsx"), "utf8"),
  readFile(path.join(root, "src/features/fiftystate/components/AcquisitionIntelligenceWorkspace.tsx"), "utf8"),
  readFile(path.join(root, "src/features/fiftystate/components/AcquisitionResearchWorkflow.tsx"), "utf8"),
  readFile(path.join(root, "src/features/fiftystate/components/AcquisitionResearchCaseEditor.tsx"), "utf8"),
  readFile(path.join(root, "src/features/fiftystate/data/acquisitionIntelligenceApi.ts"), "utf8"),
  readFile(path.join(root, "src/features/fiftystate/data/acquisitionOperatorApi.ts"), "utf8"),
  readFile(path.join(root, "src/features/fiftystate/data/acquisitionResearchApi.ts"), "utf8"),
  readFile(path.join(root, "api/platform.js"), "utf8"),
  readFile(path.join(root, "server/dev-api.mjs"), "utf8"),
  readFile(path.join(root, "scripts/refresh-acquisition-discovery.mjs"), "utf8"),
  readFile(path.join(root, "server/acquisition-azure-storage.mjs"), "utf8"),
  readFile(path.join(root, "scripts/publish-acquisition-intelligence.mjs"), "utf8")
]);

assert(pageSource.includes("fetchAcquisitionOverview"), "Fifty States must discover owner access through the protected API");
assert(pageSource.includes("Acquisition intelligence"), "Fifty States is missing the acquisition workspace control");
assert(workspaceSource.includes("Private operator screen"), "the visible company-level operator screen is missing");
assert(workspaceSource.includes("data-acquisition-operator-screen"), "the operator screen needs a stable UI contract");
assert(workspaceSource.includes("fetchAcquisitionOperators"), "the visible screen must use the persistent parent-company index");
assert(workspaceSource.includes("valuationEvidence"), "the visible screen must show evidence-bounded value estimates");
assert(workspaceSource.includes("sourceRows(record)"), "the visible screen must link parent, license, and capacity evidence");
assert(workspaceSource.includes("data-acquisition-selection-controls"), "the company screen must expose persistent owner research-list decisions");
assert(workspaceSource.includes("ownerMatureRemaining"), "the company screen must expose progress through the mature-scale pool");
assert(workspaceSource.includes("Optional suggested 100"), "the algorithmic queue must remain visibly distinct and subordinate to the owner's research cohort");
assert(workspaceSource.includes("Review 100") && workspaceSource.includes("Review 500") && workspaceSource.includes("Review mature"), "the company screen must expose focused unreviewed triage lanes for every funnel stage");
assert(workspaceSource.includes("ownerResearch100Remaining") && workspaceSource.includes("ownerScreen500Remaining"), "the company screen must expose persistent review progress for the 100- and 500-company funnels");
assert(workspaceSource.includes("data-acquisition-quick-decision"), "company rows must expose persistent quick-screening decisions");
assert(workspaceSource.includes("data-acquisition-bulk-selection"), "the company screen must expose bounded page-level research-list selection");
assert(workspaceSource.includes("Add unreviewed page") && workspaceSource.includes("prior Research, Hold, and Pass decisions are preserved"), "bulk selection must explain its safe non-overwrite behavior to the owner");
assert(workspaceSource.includes("data-acquisition-company-export") && workspaceSource.includes("fetchAcquisitionOperatorExport"), "the owner screen must expose a bounded export of the exact filtered company view");
assert(workspaceSource.includes("data-acquisition-fast-screen"), "the company screen must explain why a proposal was shortlisted and what still needs proof");
assert(workspaceSource.includes("Operating parent is unresolved"), "directory-derived rows must be visibly labeled as unresolved company proposals");
assert(workspaceSource.includes("data-acquisition-shortlist-composition"), "the owner screen must expose the evidence composition of the complete filtered shortlist");
assert(workspaceSource.includes("Scale signal") && workspaceSource.includes("matchedBreakdown.platformScaleSignals"), "the current shortlist must show its platform, regional, established, and smaller scale composition");
assert(workspaceSource.includes("data-acquisition-mature-readiness-lanes") && workspaceSource.includes("Parent to resolve"), "the mature target-service screen must split evidenced parents from brand/domain proposals needing cleanup");
assert(workspaceSource.includes("data-acquisition-deferred-readiness") && workspaceSource.includes("Later diligence lenses"), "parent and ownership cleanup must remain available without dominating the broad-screening workflow");
assert(workspaceSource.includes('"not_high"') && workspaceSource.includes("matureTargetVerifiedPrivate"), "the owner screen must expose parent-proof and verified-private readiness filters without inferring either from scale");
assert(workspaceSource.includes('value="validated_targets"') && workspaceSource.includes("validatedTargetRank"), "the owner screen must expose the governed final-target stage and its separate rank");
assert(workspaceSource.includes('setOwnerDecision("undecided")'), "mature triage must hide companies the owner already reviewed");
assert(workspaceSource.includes("Selection identity review"), "the owner screen must expose unresolved selection identity issues");
assert(workspaceSource.includes("latestCohort.readiness"), "the owner screen must expose immutable cohort readiness to the overview workflow");
assert(workspaceSource.includes("latestCohort.researchQueue"), "the owner screen must expose the bounded cohort research queue to the overview workflow");
assert(workspaceSource.includes('<option value="all">All'), "the visible screen must expose the full paginated proposal universe");
assert(!workspaceSource.includes("<AcquisitionResearchWorkflow"), "the detailed research workflow must remain hidden from the visible screen");
assert(!workspaceSource.includes("<NationalFacilityDiscovery"), "the facility discovery table must remain hidden from the visible screen");
assert(workspaceSource.includes("Open a company only when you want to inspect") && workspaceSource.includes("Close detail"), "deep company evidence must remain behind an intentional screening-list action");
assert(researchWorkspaceSource.includes("Facility research workflow"), "the durable research-case interface is missing");
assert(researchWorkspaceSource.includes("Proposed operator clusters"), "operator resolution proposals are missing from the workflow");
assert(
  researchCaseEditorSource.includes("persistent research store"),
  "research saves must not describe production Azure persistence as local"
);
assert(browserApiSource.includes("fetchWithApiAuth"), "browser acquisition requests must use delegated API auth");
assert(browserOperatorApiSource.includes("fetchWithApiAuth"), "browser operator requests must use delegated API auth");
assert(browserOperatorApiSource.includes("offset"), "browser operator search must support pagination through the national universe");
assert(browserOperatorApiSource.includes("selectUnreviewedAcquisitionOperatorPage") && browserOperatorApiSource.includes('"/api/platform/acquisition/operator-decisions/bulk"'), "the owner browser must expose the bounded page-selection API client");
assert(browserOperatorApiSource.includes("fetchAcquisitionOperatorExport") && browserOperatorApiSource.includes("/api/platform/acquisition/operators/export"), "the owner browser must download the governed company-screen artifact through the protected API");
assert(browserOperatorApiSource.includes("freezeAcquisitionResearchCohort"), "the owner browser must expose the protected cohort-freeze client");
assert(browserOperatorApiSource.includes('"validated_targets"') && browserOperatorApiSource.includes("validatedTargetRank"), "the browser contract must validate the final-target stage and rank");
assert(browserResearchApiSource.includes("fetchWithApiAuth"), "browser research mutations must use delegated API auth");
assert(browserApiSource.includes("response.status === 404"), "non-owner access must stay hidden rather than advertising a forbidden feature");
assert(platformApiSource.includes('"/api/platform/acquisition"'), "production acquisition overview route is missing");
assert(platformApiSource.includes('"/api/platform/acquisition/valuation"'), "production acquisition valuation route is missing");
assert(platformApiSource.includes('"/api/platform/acquisition/search"'), "production acquisition search route is missing");
assert(platformApiSource.includes('"/api/platform/acquisition/operators"'), "production operator-proposal search route is missing");
assert(platformApiSource.includes('"/api/platform/acquisition/operators/export"'), "production owner-only company export route is missing");
assert(platformApiSource.includes('"/api/platform/acquisition/operator-decision"'), "production owner decision route is missing");
assert(platformApiSource.includes('"/api/platform/acquisition/operator-decisions/bulk"'), "production bounded owner page-selection route is missing");
assert(platformApiSource.includes('"/api/platform/acquisition/operator-cohort"'), "production owner cohort route is missing");
assert(platformApiSource.includes('"/api/platform/acquisition/operator-research-job"'), "production owner research-job worker route is missing");
assert(platformApiSource.includes('"/api/platform/acquisition/research"'), "production acquisition research route is missing");
assert(
  platformApiSource.includes('req.method === "POST" && requestPath === "/api/platform/acquisition/research"'),
  "production research mutations must not intercept research GET requests"
);
assert(devApiSource.includes('"/api/platform/acquisition"'), "local acquisition overview route is missing");
assert(devApiSource.includes('"/api/platform/acquisition/valuation"'), "local acquisition valuation route is missing");
assert(devApiSource.includes('"/api/platform/acquisition/search"'), "local acquisition search route is missing");
assert(devApiSource.includes('"/api/platform/acquisition/operators"'), "local operator-proposal search route is missing");
assert(devApiSource.includes('"/api/platform/acquisition/operators/export"'), "local owner-only company export route is missing");
assert(devApiSource.includes('"/api/platform/acquisition/operator-decision"'), "local owner decision route is missing");
assert(devApiSource.includes('"/api/platform/acquisition/operator-decisions/bulk"'), "local bounded owner page-selection route is missing");
assert(devApiSource.includes('"/api/platform/acquisition/operator-cohort"'), "local owner cohort route is missing");
assert(devApiSource.includes('"/api/platform/acquisition/operator-research-job"'), "local owner research-job worker route is missing");
assert(devApiSource.includes('"/api/platform/acquisition/research"'), "local acquisition research route is missing");
assert(refreshSource.includes("identityJoinStatus: \"not_publicly_available\""), "the ingestion pipeline must preserve the no-public-join boundary");
assert(refreshSource.includes("raw/findtreatment") || refreshSource.includes("directoryRawRoot"), "the ingestion pipeline must preserve raw directory captures");
assert(refreshSource.includes("buildAcquisitionOperatorIndex"), "the refresh must rebuild the parent-company proposal index");
assert(refreshSource.includes("parentAssertionRegistry.assertions"), "the refresh must apply the curated parent-relationship registry");
assert(refreshSource.includes("capacityAssertionRegistry.assertions") && refreshSource.includes("capacityAssertionRegistry.sources"), "the refresh must apply the curated operator-reported capacity registry without converting it to licensed capacity");
assert(azureStorageSource.includes("ifMatch") && azureStorageSource.includes("ifNoneMatch"), "Azure research writes must use optimistic concurrency");
assert(azureStorageSource.includes("research/revisions"), "Azure research writes must preserve immutable revision copies");
assert(azureStorageSource.includes("operator-selections-v1.json.gz"), "Azure storage must preserve owner operator selections separately from generated indexes");
assert(azureStorageSource.includes("operator-selection-revisions"), "Azure owner selections and frozen cohorts must retain immutable revision blobs");
assert(publishSource.includes('conditions: { ifNoneMatch: "*" }'), "the research publisher must refuse to overwrite production research");
assert(publishSource.includes("operator-proposals.json.gz"), "the operator-proposal index must publish to private Azure storage");

console.log(
  "Acquisition intelligence check passed: owner-only broad company buckets, atomic page-level shortlist building that preserves prior decisions and caps the active list at 100, persistent research/hold/pass decisions, California-excluded 500/100 funnels, immutable 50-100 cohorts, dependency-gated and safely leased agent research jobs, cited non-promoting evidence proposals, separated license and reported capacity evidence, known-core-capacity valuation slices, hidden-but-preserved facility research, durable local/Azure contracts, protected APIs, and workbook valuation arithmetic verified."
);
