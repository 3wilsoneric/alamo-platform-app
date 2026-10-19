import type { WorkforceSummary, WorkforceTotals } from "../../shared/types/platformSnapshot";

type ConnectedWorkforce = Extract<WorkforceSummary, { status: "connected" }>;

// Local development only. These counts and roles are fictional and must never
// be presented as a Workforce or Paylocity feed.
const totals = (
  active: number,
  onboarding: number,
  onLeave: number,
  openRoles: number,
  phase1: number,
  phase2: number,
  phase3: number,
  expired: number,
  expiring: number,
  missing: number,
  staffBlockedFromScheduling: number,
  complianceRate: number
): WorkforceTotals => ({
  active, onboarding, onLeave, openRoles,
  applicants: phase1 + phase2 + phase3,
  phase1, phase2, phase3,
  expired, expiring, missing, staffBlockedFromScheduling, complianceRate
});

export const demoWorkforce: ConnectedWorkforce = {
  status: "connected",
  workforceUrl: null,
  asOf: "2026-10-13",
  generatedAt: "2026-10-13T12:00:00Z",
  phaseNames: ["Screening", "Interview", "Offer and clearance"],
  portfolio: totals(443, 12, 21, 13, 14, 8, 6, 2, 7, 3, 5, 0.93),
  communities: [
    { community: "San Pablo", totals: totals(128, 4, 7, 4, 5, 2, 2, 1, 2, 1, 2, 0.91) },
    { community: "Santa Clarita", totals: totals(111, 3, 5, 3, 3, 2, 2, 0, 2, 1, 1, 0.94) },
    { community: "JC Wallace House", totals: totals(104, 2, 4, 2, 2, 1, 1, 1, 1, 0, 1, 0.93) },
    { community: "Turlock", totals: totals(63, 2, 3, 3, 3, 2, 1, 0, 1, 1, 1, 0.90) },
    { community: "Victoria's House", totals: totals(37, 1, 2, 1, 1, 1, 0, 0, 1, 0, 0, 0.96) }
  ],
  roles: [],
  openPositions: [
    { title: "Psychiatric Technician · Nights", discipline: "psych_tech", roleLabel: "Psychiatric Technician", community: "San Pablo", openedOn: "2026-08-26", openings: 2, daysOpen: 48, phase1: 3, phase2: 1, phase3: 1, url: null },
    { title: "LVN · Evenings", discipline: "lvn", roleLabel: "LVN", community: "San Pablo", openedOn: "2026-09-09", openings: 2, daysOpen: 34, phase1: 2, phase2: 1, phase3: 1, url: null },
    { title: "Direct Care Specialist", discipline: "direct_care", roleLabel: "Direct care", community: "Santa Clarita", openedOn: "2026-09-18", openings: 2, daysOpen: 25, phase1: 2, phase2: 1, phase3: 1, url: null },
    { title: "Cook", discipline: "food_service", roleLabel: "Food service", community: "Santa Clarita", openedOn: "2026-09-28", openings: 1, daysOpen: 15, phase1: 1, phase2: 1, phase3: 1, url: null },
    { title: "House Manager", discipline: "house_manager", roleLabel: "House Manager", community: "JC Wallace House", openedOn: "2026-09-05", openings: 1, daysOpen: 38, phase1: 2, phase2: 1, phase3: 1, url: null },
    { title: "Behavioral Health Specialist", discipline: "behavioral_health", roleLabel: "Behavioral health", community: "JC Wallace House", openedOn: "2026-10-01", openings: 1, daysOpen: 12, phase1: 0, phase2: 0, phase3: 0, url: null },
    { title: "Psychiatric Technician", discipline: "psych_tech", roleLabel: "Psychiatric Technician", community: "Turlock", openedOn: "2026-09-12", openings: 2, daysOpen: 31, phase1: 3, phase2: 2, phase3: 1, url: null },
    { title: "Maintenance Technician", discipline: "maintenance", roleLabel: "Maintenance", community: "Turlock", openedOn: "2026-09-22", openings: 1, daysOpen: 21, phase1: 0, phase2: 0, phase3: 0, url: null },
    { title: "Residential Counselor", discipline: "residential_counselor", roleLabel: "Residential Counselor", community: "Victoria's House", openedOn: "2026-09-29", openings: 1, daysOpen: 14, phase1: 1, phase2: 1, phase3: 0, url: null }
  ],
  upcomingExpirations: [
    { community: "San Pablo", label: "CPR / First Aid", expiresOn: "2026-10-20", people: 2, blocksScheduling: true },
    { community: "Santa Clarita", label: "TB clearance", expiresOn: "2026-10-24", people: 1, blocksScheduling: true },
    { community: "Santa Clarita", label: "CPR / First Aid", expiresOn: "2026-11-02", people: 1, blocksScheduling: false },
    { community: "JC Wallace House", label: "Medication training", expiresOn: "2026-10-29", people: 1, blocksScheduling: true },
    { community: "Turlock", label: "CPR / First Aid", expiresOn: "2026-11-05", people: 1, blocksScheduling: false },
    { community: "Victoria's House", label: "TB clearance", expiresOn: "2026-11-07", people: 1, blocksScheduling: false }
  ]
};
