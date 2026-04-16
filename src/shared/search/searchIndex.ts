import type { SearchEntry } from "./types";

export const searchIndex: SearchEntry[] = [
  {
    id: "page-home",
    type: "page",
    title: "Home",
    subtitle: "Platform home and navigation",
    route: "/home",
    keywords: ["home", "dashboard", "main nav", "landing"],
    rank: 100
  },
  {
    id: "page-communities",
    type: "page",
    title: "Communities",
    subtitle: "Community operations and summaries",
    route: "/communities",
    keywords: ["communities", "facilities", "census", "occupancy", "operations"],
    rank: 100
  },
  {
    id: "page-reports",
    type: "page",
    title: "Reports",
    subtitle: "Report views and exports",
    route: "/reports",
    keywords: ["reports", "reporting", "exports", "trend analysis"],
    rank: 100
  },
  {
    id: "page-incidents",
    type: "page",
    title: "Incident Center",
    subtitle: "Incident review and escalations",
    route: "/incidents",
    keywords: ["incidents", "incident center", "events", "escalations", "review"],
    rank: 100
  },
  {
    id: "page-workforce",
    type: "page",
    title: "Workforce",
    subtitle: "Coverage, staff, and workforce views",
    route: "/workforce",
    keywords: ["workforce", "staff", "coverage", "employees", "scheduling"],
    rank: 100
  },
  {
    id: "page-settings",
    type: "page",
    title: "Settings",
    subtitle: "Profile, notifications, and security",
    route: "/settings",
    keywords: ["settings", "profile", "notifications", "security"],
    rank: 90
  },
  {
    id: "page-admin",
    type: "page",
    title: "Admin",
    subtitle: "Administrative controls and knowledge tools",
    route: "/admin",
    keywords: ["admin", "knowledge base", "administration"],
    rank: 90
  },
  {
    id: "page-command-center",
    type: "admin",
    title: "Command Center",
    subtitle: "System health and admin controls",
    route: "/command-center",
    keywords: ["command center", "system health", "ops", "security", "roles"],
    rank: 95
  },
  {
    id: "page-assistant",
    type: "page",
    title: "Ask Helper",
    subtitle: "Open the full assistant workspace",
    route: "/assistant",
    keywords: ["ask helper", "assistant", "copilot", "chat"],
    rank: 90
  },
  {
    id: "community-san-pablo",
    type: "community",
    title: "San Pablo",
    subtitle: "Open communities with San Pablo context",
    route: "/communities",
    keywords: ["san pablo", "community", "facility"],
    tags: ["community"],
    rank: 80
  },
  {
    id: "community-turlock",
    type: "community",
    title: "Turlock",
    subtitle: "Open communities with Turlock context",
    route: "/communities",
    keywords: ["turlock", "community", "facility"],
    tags: ["community"],
    rank: 80
  },
  {
    id: "community-riverside",
    type: "community",
    title: "Riverside",
    subtitle: "Open communities with Riverside context",
    route: "/communities",
    keywords: ["riverside", "community", "facility"],
    tags: ["community"],
    rank: 80
  },
  {
    id: "community-santa-clarita",
    type: "community",
    title: "Santa Clarita",
    subtitle: "Open communities with Santa Clarita context",
    route: "/communities",
    keywords: ["santa clarita", "community", "facility"],
    tags: ["community"],
    rank: 80
  },
  {
    id: "report-census",
    type: "report",
    title: "Census Trends",
    subtitle: "Census and utilization report shell",
    route: "/reports",
    keywords: ["census trends", "census", "utilization", "occupancy report"],
    rank: 85
  },
  {
    id: "report-referrals",
    type: "report",
    title: "Referral Sources",
    subtitle: "Referral source reporting",
    route: "/reports",
    keywords: ["referral sources", "referrals", "source report"],
    rank: 85
  },
  {
    id: "report-length-of-stay",
    type: "report",
    title: "Length of Stay Analysis",
    subtitle: "Length of stay reporting",
    route: "/reports",
    keywords: ["length of stay", "los", "stay analysis"],
    rank: 85
  },
  {
    id: "report-incident-trends",
    type: "report",
    title: "Incident Trends",
    subtitle: "Incident trend reporting",
    route: "/reports",
    keywords: ["incident trends", "incident report", "incidents"],
    rank: 85
  },
  {
    id: "report-staff-training",
    type: "report",
    title: "Staff Training & Compliance",
    subtitle: "Training and compliance report shell",
    route: "/reports",
    keywords: ["staff training", "compliance", "training report"],
    rank: 85
  },
  {
    id: "definition-occupancy",
    type: "definition",
    title: "Occupancy",
    subtitle: "Definition used in communities and reporting",
    route: "/communities",
    keywords: ["occupancy", "census", "capacity"],
    tags: ["definition"],
    rank: 70
  },
  {
    id: "definition-compliance",
    type: "definition",
    title: "Compliance Score",
    subtitle: "Definition used in communities and command center",
    route: "/communities",
    keywords: ["compliance score", "compliance", "score"],
    tags: ["definition"],
    rank: 70
  },
  {
    id: "definition-workforce",
    type: "definition",
    title: "Coverage Gap",
    subtitle: "Workforce planning and staffing concept",
    route: "/workforce",
    keywords: ["coverage gap", "coverage", "staffing gap"],
    tags: ["definition"],
    rank: 70
  }
];
