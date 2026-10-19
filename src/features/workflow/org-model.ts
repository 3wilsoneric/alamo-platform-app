import { ALAMO_FACILITIES } from "../../../shared/community-names.mjs";

export type OrgTone = "blue" | "green" | "plum" | "rust" | "gold";

export interface OrgArea {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  responsibilities: string[];
  tone: OrgTone;
  marker: string;
  keywords: string[];
}

export const ORG_AREAS: OrgArea[] = [
  {
    id: "operations",
    title: "Executive operations",
    shortTitle: "Operations",
    description: "Coordinates priorities, escalations, and the operating rhythm across communities.",
    responsibilities: ["Cross-community priorities", "Operational escalation", "Site performance"],
    tone: "blue",
    marker: "01",
    keywords: ["operations", "operator", "escalation", "executive", "leadership"],
  },
  {
    id: "clinical",
    title: "Clinical & quality",
    shortTitle: "Clinical & quality",
    description: "Connects clinical standards, quality review, and procedure ownership to frontline work.",
    responsibilities: ["Clinical standards", "Quality review", "Procedure stewardship"],
    tone: "plum",
    marker: "02",
    keywords: ["clinical", "medication", "quality", "care", "nursing", "procedure"],
  },
  {
    id: "workforce",
    title: "People & workforce",
    shortTitle: "People & workforce",
    description: "Supports staffing, role readiness, hiring, and workforce coordination.",
    responsibilities: ["Staffing & coverage", "Hiring & onboarding", "Role readiness"],
    tone: "green",
    marker: "03",
    keywords: ["staff", "staffing", "coverage", "hiring", "people", "workforce", "training"],
  },
  {
    id: "finance",
    title: "Finance & growth",
    shortTitle: "Finance & growth",
    description: "Brings together financial planning, admissions economics, and development priorities.",
    responsibilities: ["Financial planning", "Admissions economics", "Growth priorities"],
    tone: "gold",
    marker: "04",
    keywords: ["finance", "budget", "growth", "admissions", "development"],
  },
  {
    id: "systems",
    title: "Systems & knowledge",
    shortTitle: "Systems & knowledge",
    description: "Maintains the tools, trusted guidance, and information flow people use to do the work.",
    responsibilities: ["Platform systems", "Workflow guidance", "Information stewardship"],
    tone: "rust",
    marker: "05",
    keywords: ["systems", "technology", "workflow", "knowledge", "documents", "software"],
  },
];

export interface OrgCommunity {
  id: string;
  title: string;
  code: string;
  label: string;
  aliases: readonly string[];
}

export const ORG_COMMUNITIES: OrgCommunity[] = ALAMO_FACILITIES.map((facility) => ({
  id: facility.facilityId,
  title: facility.shortName,
  code: facility.code,
  label: facility.communityName,
  aliases: facility.aliases,
}));

export const COMMUNITY_FUNCTIONS = [
  "Community leadership",
  "Clinical support",
  "Direct-care teams",
  "Operations & administration",
];

export interface OrgAnswer {
  heading: string;
  body: string;
  nodeId: string | null;
  related: string[];
}

export function answerOrgQuestion(question: string): OrgAnswer {
  const normalized = question.trim().toLowerCase();
  const community = ORG_COMMUNITIES.find((site) =>
    [site.title, site.label, ...site.aliases].some((name) => normalized.includes(name.toLowerCase())),
  );
  const area = ORG_AREAS.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)));

  if (/report(s|ing)? to|manager|director name|who is|phone|email|contact/.test(normalized)) {
    return {
      heading: "That relationship is not verified yet",
      body: "This preview maps functions and communities, not employee assignments or reporting lines. An approved staff directory is needed before Workflow can identify a person or contact route.",
      nodeId: community ? `community:${community.id}` : area?.id ?? null,
      related: ["View functional map", "Ask about staffing support"],
    };
  }

  if (community) {
    return {
      heading: `${community.title} in the organization`,
      body: `${community.title} is one of the five communities in this preview. Its local work is represented by community leadership, clinical support, direct-care teams, and operations. The executive functions shown in the map support communities across the organization; actual person-level ownership is not yet connected.`,
      nodeId: `community:${community.id}`,
      related: ["Who supports staffing?", "How are communities connected?"],
    };
  }

  if (area) {
    return {
      heading: area.title,
      body: `${area.description} In this model, the area covers ${area.responsibilities.join(", ").toLowerCase()}. This is a functional guide, not a verified reporting or contact directory.`,
      nodeId: area.id,
      related: ["Show all communities", "How are communities connected?"],
    };
  }

  if (/connect|support/.test(normalized) && /communit|sites|facilit/.test(normalized)) {
    return {
      heading: "Shared support, local delivery",
      body: "The map places five executive functions alongside five care-delivery communities. Executive areas provide cross-community support; each community has its own leadership, clinical support, direct-care, and operations layers. It does not assert a person-level reporting chain.",
      nodeId: null,
      related: ["Show San Pablo", "Who supports staffing?"],
    };
  }

  if (/communit|sites|locations|facilit|where/.test(normalized)) {
    return {
      heading: "Five communities",
      body: `The current Platform community list includes ${ORG_COMMUNITIES.map((site) => site.title).join(", ")}. Select a community on the map to see its functional team layers.`,
      nodeId: null,
      related: ["Show San Pablo", "Who supports staffing?"],
    };
  }

  return {
    heading: "I can navigate this organization preview",
    body: "Try a community name, staffing, clinical quality, operations, finance, or systems. I won't invent names, reporting lines, or contact details that are not in the directory.",
    nodeId: null,
    related: ["Show all communities", "Who supports staffing?"],
  };
}
