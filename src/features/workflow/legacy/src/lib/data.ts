import { LIBRARY_DOCUMENTS, LIBRARY_KNOWLEDGE } from './library-content'
import type { Procedure, Video, Document, QuickTap, KnowledgeFile } from './types'
import { assessorProcedures } from './assessor-procedures'

// ─── Procedures ───────────────────────────────────────────────────────────────

export const mockProcedures: Procedure[] = [
    ...assessorProcedures,
    {
        id: 1, title: "Medication Refusal Protocol", dept: "Nursing", role: "RN",
        type: "Medication", updated_at: "Jan 13, 2025", status: "active", code: "PRO-041",
        overview: "Applies whenever a resident declines a prescribed medication or treatment. Follow these steps in order. Stop and contact your supervisor if uncertain at any point.",
        tags: ["medication", "refusal", "meds", "refused", "won't take", "declining medication"],
        video: { id: "VID-041", title: "Medication Refusal — Overview & Documentation", duration: "6:12", trnCode: "TRN-008" },
        steps: [
            { id: "s1", procedure_id: 1, order: 1, title: "Ensure resident safety", body: "Remain calm at all times. Do not coerce, pressure, or physically force the resident. Maintain a non-threatening posture and speak in a low, even tone.", note_prompt: "Note the resident's current demeanor and any immediate safety concerns.", caution: null, video: null },
            { id: "s2", procedure_id: 1, order: 2, title: "Document the refusal", body: "Record the refusal immediately in the medication administration record (MAR). Include the time, medication name, dose, and the resident's stated reason if given.", note_prompt: "Record exact wording used by the resident if possible.", caution: null, video: { id: "VID-041b", title: "How to complete the MAR refusal entry", duration: "2:18" } },
            { id: "s3", procedure_id: 1, order: 3, title: "Notify charge nurse or supervisor", body: "Contact the charge nurse or on-call supervisor immediately. Do not wait until end of shift. Provide the resident's name, medication name, and any reason given.", note_prompt: "Record who you notified and at what time.", caution: null, video: null },
            { id: "s4", procedure_id: 1, order: 4, title: "Attempt to understand the reason", body: "Using therapeutic communication, attempt to understand the reason for refusal. Common causes include side effects, beliefs, confusion about the medication, or fear. Do not argue or dismiss concerns.", note_prompt: "Document the reason given by the resident, or note if no reason was provided.", caution: null, video: null },
            { id: "s5", procedure_id: 1, order: 5, title: "Contact prescribing physician if clinically significant", body: "If the refused medication is clinically critical (e.g. insulin, antipsychotics, cardiac medication), contact the prescribing physician immediately for guidance on how to proceed.", note_prompt: "If physician contacted, record name, time, and any instructions given.", caution: "Do not administer medication by alternative means without explicit physician authorization.", video: null },
            { id: "s6", procedure_id: 1, order: 6, title: "Complete the Medication Refusal Form", body: "Complete Form MR-04 within 2 hours of the refusal event. Ensure all fields are filled including time, medication, reason, actions taken, and supervisor notified.", note_prompt: "Note the time MR-04 was completed and where it was filed.", caution: null, video: { id: "VID-041c", title: "Completing Form MR-04 correctly", duration: "3:44" } },
            { id: "s7", procedure_id: 1, order: 7, title: "Monitor and document ongoing", body: "Monitor the resident for any behavioral or physical changes every 30 minutes for a minimum of 2 hours following the refusal. Document each check in the resident's chart.", note_prompt: "Record each monitoring check with time and observations.", caution: null, video: null },
        ],
        resources: [
            { type: "Form", label: "Medication Refusal Form", code: "MR-04" },
            { type: "Policy", label: "Patient Rights & Autonomy", code: "POL-012" },
            { type: "Training", label: "Medication Management", code: "TRN-008" },
        ],
    },
    {
        id: 2, title: "Crisis De-escalation Protocol", dept: "Behavioral Health", role: "All Staff",
        type: "Crisis", updated_at: "Jan 7, 2025", status: "active", code: "PRO-017",
        overview: "Use when a resident shows signs of behavioral escalation or emotional crisis. The goal is to reduce distress and prevent harm without physical intervention.",
        tags: ["crisis", "escalating", "escalation", "aggressive", "agitated", "angry", "threatening", "behavioral", "out of control", "upset"],
        video: { id: "VID-017", title: "Crisis De-escalation — Techniques & Approach", duration: "11:30", trnCode: "TRN-003" },
        steps: [
            { id: "s1", procedure_id: 2, order: 1, title: "Assess the situation", body: "From a safe distance, assess the resident's level of distress. Note body language, tone of voice, and any potential safety risks in the environment. Do not approach until you have assessed.", note_prompt: "Describe the resident's presentation and environment.", caution: "Do not approach if there is an immediate risk of physical violence. Call for backup first.", video: null },
            { id: "s2", procedure_id: 2, order: 2, title: "Use a calm, non-threatening approach", body: "Approach slowly from the front. Maintain open body language — no crossed arms, no pointing. Introduce yourself calmly and use the resident's name.", note_prompt: "Note how the resident responded to initial approach.", caution: null, video: { id: "VID-017b", title: "Body language and approach demonstration", duration: "4:02" } },
            { id: "s3", procedure_id: 2, order: 3, title: "Actively listen and validate", body: "Allow the resident to speak without interruption. Reflect back what you hear. Validate their feelings without necessarily agreeing with their interpretation. Avoid 'you need to calm down' language.", note_prompt: "Document key statements made by the resident.", caution: null, video: { id: "VID-017c", title: "Active listening — role play examples", duration: "5:15" } },
            { id: "s4", procedure_id: 2, order: 4, title: "Offer choices and reduce stimulation", body: "Offer the resident small, manageable choices to restore a sense of control (e.g. 'Would you prefer to talk here or in your room?'). Reduce environmental stimulation — dim lights, reduce noise, ask others to give space.", note_prompt: "Note what choices were offered and how the resident responded.", caution: null, video: null },
            { id: "s5", procedure_id: 2, order: 5, title: "Notify supervisor and document", body: "Notify the supervisor of the incident regardless of outcome. Document the de-escalation in the resident's chart including triggers observed, techniques used, and resident's response.", note_prompt: "Record supervisor notified, time, and chart entry completed.", caution: null, video: null },
        ],
        resources: [
            { type: "Policy", label: "Restraint & Seclusion Policy", code: "POL-009" },
            { type: "Training", label: "De-escalation Techniques", code: "TRN-003" },
            { type: "Form", label: "Behavioral Incident Report", code: "BIR-01" },
        ],
    },
    {
        id: 3, title: "Elopement Prevention & Response", dept: "Security", role: "Supervisor",
        type: "Safety", updated_at: "Jan 10, 2025", status: "active", code: "PRO-028",
        overview: "Applies when a resident at risk of elopement is identified, or when an elopement has occurred. Prevention steps should be completed at admission for all at-risk residents.",
        tags: ["elopement", "missing", "left", "ran away", "escaped", "wandered", "eloped", "gone", "can't find"],
        video: { id: "VID-028", title: "Elopement Prevention — Risk Assessment & Response", duration: "8:45", trnCode: "TRN-014" },
        steps: [
            { id: "s1", procedure_id: 3, order: 1, title: "Identify elopement risk at admission", body: "Screen all incoming residents using the Elopement Risk Assessment tool (ERA-01). Residents scoring moderate or high risk require additional precautions documented in the care plan.", note_prompt: "Record risk score and any specific risk factors noted.", caution: null, video: null },
            { id: "s2", procedure_id: 3, order: 2, title: "Implement precautionary measures", body: "For moderate/high-risk residents: ensure ID bracelet is worn, document in care plan, brief all unit staff, confirm door alarms are active, and schedule regular welfare checks no less than every 15 minutes.", note_prompt: "Confirm each precaution has been put in place.", caution: null, video: null },
            { id: "s3", procedure_id: 3, order: 3, title: "Respond immediately if elopement occurs", body: "If a resident is found missing: immediately notify supervisor, activate the elopement response (call facility code), search the immediate premises, and contact security.", note_prompt: "Record exact time elopement was detected and who was notified.", caution: "Do not delay notification to search independently first.", video: { id: "VID-028b", title: "Elopement response — first 15 minutes", duration: "3:20" } },
            { id: "s4", procedure_id: 3, order: 4, title: "Contact law enforcement if not located within 15 minutes", body: "If the resident is not located within 15 minutes of the elopement being detected, contact local law enforcement. Provide physical description, last known location, and any known destinations.", note_prompt: "Record time law enforcement was contacted and case number if provided.", caution: null, video: null },
            { id: "s5", procedure_id: 3, order: 5, title: "Notify family or emergency contact", body: "Notify the resident's emergency contact as soon as possible, no later than 1 hour after elopement detection. Document time of notification and the person contacted.", note_prompt: "Record name of person notified, their relationship, and time of call.", caution: null, video: null },
            { id: "s6", procedure_id: 3, order: 6, title: "Complete incident documentation", body: "Complete an Elopement Incident Report (EIR-02) within 4 hours. Conduct a post-incident review within 24 hours to identify contributing factors and prevent recurrence.", note_prompt: "Record EIR-02 filing time and who conducted the post-incident review.", caution: null, video: null },
        ],
        resources: [
            { type: "Form", label: "Elopement Risk Assessment", code: "ERA-01" },
            { type: "Form", label: "Elopement Incident Report", code: "EIR-02" },
            { type: "Policy", label: "Resident Safety Policy", code: "POL-007" },
        ],
    },
    {
        id: 4, title: "Restraint & Seclusion Policy", dept: "Clinical", role: "MD / RN",
        type: "Safety", updated_at: "Dec 28, 2024", status: "review", code: "PRO-009",
        overview: "Restraint and seclusion are interventions of last resort. This procedure must only be initiated when less restrictive alternatives have been attempted and failed.",
        tags: ["restraint", "seclusion", "hold", "physical hold", "restrain", "CPI", "last resort", "physical intervention"],
        video: { id: "VID-009", title: "CPI Restraint Technique — Approved Methods Only", duration: "14:20", trnCode: "TRN-011" },
        steps: [
            { id: "s1", procedure_id: 4, order: 1, title: "Confirm all less restrictive alternatives have been attempted", body: "Document all de-escalation techniques attempted prior to this point. Restraint cannot be initiated without documented evidence that alternatives were tried.", note_prompt: "List all prior interventions attempted.", caution: "Restraint initiated without documented alternatives constitutes a policy violation.", video: null },
            { id: "s2", procedure_id: 4, order: 2, title: "Obtain physician or authorized clinician order", body: "A restraint order must be obtained from a licensed physician or authorized clinician. Verbal orders are permissible in emergencies but must be co-signed within 1 hour.", note_prompt: "Record ordering clinician, time, and order type.", caution: null, video: null },
            { id: "s3", procedure_id: 4, order: 3, title: "Apply restraint according to approved technique", body: "Only apply restraints using CPI-approved techniques. Ensure the restraint does not restrict breathing. Assign a dedicated staff member to monitor the restrained resident continuously.", note_prompt: "Record technique used and staff assigned to monitoring.", caution: "Never leave a restrained resident unmonitored.", video: { id: "VID-009b", title: "Approved CPI hold positions — technique review", duration: "6:50" } },
            { id: "s4", procedure_id: 4, order: 4, title: "Conduct welfare checks every 15 minutes", body: "Document circulation, respiration, and resident's psychological status every 15 minutes. Reassess the continued necessity of restraint at each check.", note_prompt: "Log each 15-minute check with observations.", caution: null, video: null },
            { id: "s5", procedure_id: 4, order: 5, title: "Discontinue as soon as criteria are met", body: "Remove the restraint as soon as the resident no longer meets criteria for its use. Document the time of removal and the resident's condition post-removal.", note_prompt: "Record time of removal and post-removal assessment.", caution: null, video: null },
        ],
        resources: [
            { type: "Policy", label: "Restraint & Seclusion Policy", code: "POL-009" },
            { type: "Form", label: "Restraint Order & Monitor Log", code: "RSM-03" },
            { type: "Training", label: "CPI Nonviolent Crisis Intervention", code: "TRN-011" },
        ],
    },
    {
        id: 5, title: "Incident Documentation Workflow", dept: "All Departments", role: "All Staff",
        type: "Administrative", updated_at: "Jan 8, 2025", status: "active", code: "PRO-003",
        overview: "Applies to all reportable incidents. Documentation must be completed accurately and within the required timeframe. Incomplete or late documentation is a compliance risk.",
        tags: ["incident", "document", "report", "documentation", "filing", "record", "write up", "reporting"],
        video: { id: "VID-003", title: "Incident Documentation — What to Record and When", duration: "7:05", trnCode: "TRN-002" },
        steps: [
            { id: "s1", procedure_id: 5, order: 1, title: "Determine if the event is reportable", body: "Review the Reportable Events list (POL-002). If in doubt, treat the event as reportable. Consult your supervisor if unsure.", note_prompt: "Note the event type and confirm it meets reporting criteria.", caution: null, video: null },
            { id: "s2", procedure_id: 5, order: 2, title: "Notify supervisor immediately", body: "Notify your direct supervisor of the event as soon as possible, regardless of severity. Do not wait for documentation to be completed before notifying.", note_prompt: "Record supervisor name and time of notification.", caution: null, video: null },
            { id: "s3", procedure_id: 5, order: 3, title: "Complete the incident report form", body: "Complete the relevant incident report form within the required timeframe (generally 2 hours for most events). Be factual, specific, and objective. Do not include opinion or blame.", note_prompt: "Record form completed, time filed, and where submitted.", caution: "Do not document the same incident in both the chart and the incident report system in conflicting ways.", video: { id: "VID-003b", title: "Filling out GIR-01 — common mistakes to avoid", duration: "4:30" } },
            { id: "s4", procedure_id: 5, order: 4, title: "Document in the resident's chart separately", body: "Make a factual clinical entry in the resident's chart describing the event, your assessment, and actions taken. This entry should be clinical in nature and not reference the incident report.", note_prompt: "Confirm chart entry completed and time of entry.", caution: null, video: null },
            { id: "s5", procedure_id: 5, order: 5, title: "Preserve any physical evidence", body: "If relevant, preserve any physical evidence (medication, equipment, etc.) and ensure it is not discarded or used until the supervisor has reviewed it.", note_prompt: "Note any evidence preserved and its current location.", caution: null, video: null },
            { id: "s6", procedure_id: 5, order: 6, title: "Cooperate with post-incident review", body: "Participate in any post-incident review or root cause analysis as requested. These processes are non-punitive and aimed at system improvement.", note_prompt: "Note any follow-up review scheduled or completed.", caution: null, video: null },
        ],
        resources: [
            { type: "Policy", label: "Reportable Events Policy", code: "POL-002" },
            { type: "Form", label: "General Incident Report", code: "GIR-01" },
        ],
    },
    {
        id: 6, title: "Suicide Risk Assessment Protocol", dept: "Behavioral Health", role: "Licensed Staff",
        type: "Crisis", updated_at: "Jan 14, 2025", status: "active", code: "PRO-022",
        overview: "Must be completed by licensed clinical staff when a resident expresses suicidal ideation, has a known history of attempts, or when risk is flagged by another staff member.",
        tags: ["suicide", "suicidal", "self harm", "self-harm", "wants to die", "kill themselves", "harm themselves", "SI", "ideation", "safety plan"],
        video: { id: "VID-022", title: "Suicide Risk Assessment — C-SSRS Administration Guide", duration: "16:40", trnCode: "TRN-006" },
        steps: [
            { id: "s1", procedure_id: 6, order: 1, title: "Ensure immediate safety", body: "Before beginning the formal assessment, ensure the environment is safe. Remove or secure any items that could be used for self-harm. Do not leave the resident alone.", note_prompt: "Document any environmental hazards identified and addressed.", caution: "Do not leave the resident unattended at any point during this procedure.", video: null },
            { id: "s2", procedure_id: 6, order: 2, title: "Administer Columbia Suicide Severity Rating Scale (C-SSRS)", body: "Use the C-SSRS to assess ideation intensity and behavior. Ask all screening questions in the specified order. Do not skip questions even if the resident becomes uncomfortable.", note_prompt: "Record C-SSRS score and ideation category.", caution: null, video: { id: "VID-022b", title: "C-SSRS question walkthrough — live demonstration", duration: "8:12" } },
            { id: "s3", procedure_id: 6, order: 3, title: "Assess for protective factors and plan", body: "Ask directly about means, plan, intent, and timeline. Also assess protective factors: family support, future orientation, treatment engagement. Both dimensions inform the risk level.", note_prompt: "Document presence or absence of a specific plan and protective factors identified.", caution: null, video: null },
            { id: "s4", procedure_id: 6, order: 4, title: "Assign a risk level", body: "Based on C-SSRS results and clinical judgment, assign a risk level: Low, Moderate, or High. Document your clinical reasoning. Each risk level has a corresponding response protocol.", note_prompt: "Record assigned risk level and clinical rationale.", caution: null, video: null },
            { id: "s5", procedure_id: 6, order: 5, title: "Notify supervisor and implement corresponding protocol", body: "Notify your supervisor of the risk level assigned. For Moderate risk: increase monitoring. For High risk: initiate 1:1 observation and contact the on-call psychiatrist immediately.", note_prompt: "Record supervisor notified, time, and protocol implemented.", caution: "High risk requires immediate psychiatrist notification — do not defer to next business hours.", video: null },
            { id: "s6", procedure_id: 6, order: 6, title: "Complete safety planning with resident", body: "For residents who are able to engage, complete a written safety plan collaboratively. Include warning signs, coping strategies, support contacts, and means restriction. File in the chart.", note_prompt: "Note whether resident engaged with safety planning and where plan is filed.", caution: null, video: { id: "VID-022c", title: "Collaborative safety planning — example session", duration: "5:48" } },
            { id: "s7", procedure_id: 6, order: 7, title: "Document fully in the clinical record", body: "Complete a thorough clinical note documenting the assessment, risk level, clinical reasoning, interventions taken, and follow-up plan. This note is a legal document.", note_prompt: "Confirm clinical note completed and time of entry.", caution: null, video: null },
            { id: "s8", procedure_id: 6, order: 8, title: "Schedule follow-up assessment", body: "Schedule a follow-up risk assessment within 24 hours regardless of risk level assigned. Document the follow-up appointment in the resident's chart.", note_prompt: "Record follow-up assessment date and time scheduled.", caution: null, video: null },
        ],
        resources: [
            { type: "Form", label: "C-SSRS Assessment Form", code: "CSS-01" },
            { type: "Form", label: "Safety Planning Template", code: "SPT-02" },
            { type: "Policy", label: "Suicide Prevention Policy", code: "POL-015" },
            { type: "Training", label: "Suicide Risk Assessment", code: "TRN-006" },
        ],
    },
]

// ─── Quick taps ───────────────────────────────────────────────────────────────

export const QUICK_TAPS: QuickTap[] = [
    { label: "Resident refusing meds", ids: [1] },
    { label: "Resident escalating", ids: [2, 4] },
    { label: "Resident missing / eloped", ids: [3] },
    { label: "Restraint needed", ids: [4] },
    { label: "Suicidal ideation expressed", ids: [6] },
    { label: "Need to document an incident", ids: [5] },
    { label: "Physical altercation", ids: [2, 4] },
    { label: "Fall occurred", ids: [5] },
]

// ─── Video library ────────────────────────────────────────────────────────────

export const VIDEO_LIBRARY: Video[] = [
    { id: "VID-041", title: "Medication Refusal — Overview & Documentation", duration: "6:12", dept: "Nursing", role: "RN", proc_code: "PRO-041", trn_code: "TRN-008", series: "Medication Management", assigned: true, watched: true },
    { id: "VID-041b", title: "How to complete the MAR refusal entry", duration: "2:18", dept: "Nursing", role: "RN", proc_code: "PRO-041", trn_code: "TRN-008", series: "Medication Management", assigned: true, watched: true },
    { id: "VID-041c", title: "Completing Form MR-04 correctly", duration: "3:44", dept: "Nursing", role: "RN", proc_code: "PRO-041", trn_code: "TRN-008", series: "Medication Management", assigned: true, watched: false },
    { id: "VID-017", title: "Crisis De-escalation — Techniques & Approach", duration: "11:30", dept: "Behavioral Health", role: "All Staff", proc_code: "PRO-017", trn_code: "TRN-003", series: "De-escalation Fundamentals", assigned: true, watched: true },
    { id: "VID-017b", title: "Body language and approach demonstration", duration: "4:02", dept: "Behavioral Health", role: "All Staff", proc_code: "PRO-017", trn_code: "TRN-003", series: "De-escalation Fundamentals", assigned: true, watched: false },
    { id: "VID-017c", title: "Active listening — role play examples", duration: "5:15", dept: "Behavioral Health", role: "All Staff", proc_code: "PRO-017", trn_code: "TRN-003", series: "De-escalation Fundamentals", assigned: false, watched: false },
    { id: "VID-028", title: "Elopement Prevention — Risk Assessment & Response", duration: "8:45", dept: "Security", role: "Supervisor", proc_code: "PRO-028", trn_code: "TRN-014", series: "Resident Safety", assigned: false, watched: false },
    { id: "VID-028b", title: "Elopement response — first 15 minutes", duration: "3:20", dept: "Security", role: "Supervisor", proc_code: "PRO-028", trn_code: "TRN-014", series: "Resident Safety", assigned: false, watched: false },
    { id: "VID-009", title: "CPI Restraint Technique — Approved Methods Only", duration: "14:20", dept: "Clinical", role: "MD / RN", proc_code: "PRO-009", trn_code: "TRN-011", series: "CPI Nonviolent Crisis Intervention", assigned: true, watched: false },
    { id: "VID-009b", title: "Approved CPI hold positions — technique review", duration: "6:50", dept: "Clinical", role: "MD / RN", proc_code: "PRO-009", trn_code: "TRN-011", series: "CPI Nonviolent Crisis Intervention", assigned: true, watched: false },
    { id: "VID-003", title: "Incident Documentation — What to Record and When", duration: "7:05", dept: "All Staff", role: "All Staff", proc_code: "PRO-003", trn_code: "TRN-002", series: "Documentation & Compliance", assigned: true, watched: true },
    { id: "VID-003b", title: "Filling out GIR-01 — common mistakes to avoid", duration: "4:30", dept: "All Staff", role: "All Staff", proc_code: "PRO-003", trn_code: "TRN-002", series: "Documentation & Compliance", assigned: false, watched: false },
    { id: "VID-022", title: "Suicide Risk Assessment — C-SSRS Administration Guide", duration: "16:40", dept: "Behavioral Health", role: "Licensed Staff", proc_code: "PRO-022", trn_code: "TRN-006", series: "Suicide Risk & Safety Planning", assigned: true, watched: false },
    { id: "VID-022b", title: "C-SSRS question walkthrough — live demonstration", duration: "8:12", dept: "Behavioral Health", role: "Licensed Staff", proc_code: "PRO-022", trn_code: "TRN-006", series: "Suicide Risk & Safety Planning", assigned: true, watched: false },
    { id: "VID-022c", title: "Collaborative safety planning — example session", duration: "5:48", dept: "Behavioral Health", role: "Licensed Staff", proc_code: "PRO-022", trn_code: "TRN-006", series: "Suicide Risk & Safety Planning", assigned: false, watched: false },
]

// ─── Documents ────────────────────────────────────────────────────────────────

export const REPO_DOCS: Document[] = [
    ...LIBRARY_DOCUMENTS,
    { id: "d01", code: "POL-001", title: "Admissions & Intake Policy", type: "Policy", dept: "Administration", owner: "M. Rodriguez", version: "3.1", effective_date: "Jan 1, 2025", reviewed_at: "Jan 1, 2025", review_due: "Jan 1, 2026", status: "active", size: "1.1 MB", format: "PDF" },
    { id: "d02", code: "POL-012", title: "Patient Rights & Autonomy Policy", type: "Policy", dept: "Clinical", owner: "Dr. K. Patel", version: "2.4", effective_date: "Dec 1, 2024", reviewed_at: "Dec 1, 2024", review_due: "Dec 1, 2025", status: "active", size: "0.8 MB", format: "PDF" },
    { id: "d03", code: "POL-015", title: "Suicide Prevention Policy", type: "Policy", dept: "Behavioral Health", owner: "Dr. K. Patel", version: "4.0", effective_date: "Nov 15, 2024", reviewed_at: "Nov 15, 2024", review_due: "Nov 15, 2025", status: "active", size: "1.3 MB", format: "PDF" },
    { id: "d04", code: "PRO-041", title: "Medication Refusal Protocol", type: "Procedure", dept: "Nursing", owner: "S. Chen", version: "1.7", effective_date: "Jan 13, 2025", reviewed_at: "Jan 13, 2025", review_due: "Jul 13, 2025", status: "active", size: "0.6 MB", format: "PDF" },
    { id: "d05", code: "PRO-017", title: "Crisis De-escalation Protocol", type: "Procedure", dept: "Behavioral Health", owner: "J. Okafor", version: "2.1", effective_date: "Jan 7, 2025", reviewed_at: "Jan 7, 2025", review_due: "Jul 7, 2025", status: "active", size: "0.9 MB", format: "PDF" },
    { id: "d06", code: "PRO-009", title: "Restraint & Seclusion Policy", type: "Procedure", dept: "Clinical", owner: "Dr. K. Patel", version: "5.2", effective_date: "Dec 28, 2024", reviewed_at: "Dec 28, 2024", review_due: "Jun 28, 2025", status: "review", size: "2.1 MB", format: "PDF" },
    { id: "d07", code: "TRN-003", title: "De-escalation Techniques — Staff Guide", type: "Training", dept: "All Staff", owner: "HR Dept.", version: "1.3", effective_date: "Oct 1, 2024", reviewed_at: "Oct 1, 2024", review_due: "Oct 1, 2025", status: "active", size: "3.7 MB", format: "DOCX" },
    { id: "d08", code: "TRN-011", title: "CPI Nonviolent Crisis Intervention", type: "Training", dept: "All Staff", owner: "HR Dept.", version: "2.0", effective_date: "Sep 15, 2024", reviewed_at: "Sep 15, 2024", review_due: "Sep 15, 2025", status: "active", size: "5.1 MB", format: "PDF" },
    { id: "d09", code: "TRN-006", title: "Suicide Risk Assessment — Staff Guide", type: "Training", dept: "Behavioral Health", owner: "Dr. K. Patel", version: "1.1", effective_date: "Nov 1, 2024", reviewed_at: "Nov 1, 2024", review_due: "May 1, 2025", status: "expiring", size: "2.4 MB", format: "PDF" },
    { id: "d10", code: "FRM-001", title: "General Incident Report Form", type: "Form", dept: "All Staff", owner: "Compliance", version: "4.3", effective_date: "Jan 1, 2025", reviewed_at: "Jan 1, 2025", review_due: "Jan 1, 2026", status: "active", size: "0.2 MB", format: "PDF" },
    { id: "d11", code: "FRM-004", title: "Medication Refusal Form (MR-04)", type: "Form", dept: "Nursing", owner: "S. Chen", version: "2.0", effective_date: "Jan 13, 2025", reviewed_at: "Jan 13, 2025", review_due: "Jan 13, 2026", status: "active", size: "0.1 MB", format: "PDF" },
    { id: "d12", code: "FRM-007", title: "Elopement Incident Report (EIR-02)", type: "Form", dept: "Security", owner: "T. Rivera", version: "1.4", effective_date: "Dec 10, 2024", reviewed_at: "Dec 10, 2024", review_due: "Dec 10, 2025", status: "active", size: "0.2 MB", format: "PDF" },
]

// ─── Knowledge workspace ─────────────────────────────────────────────────────

export const KNOWLEDGE_FILES: KnowledgeFile[] = [
    ...LIBRARY_KNOWLEDGE,
    {
        id: 'kf-med-refusal-map',
        title: 'Medication refusal workflow map',
        folder: 'Operations/Medication',
        type: 'Workflow',
        updated_at: 'Apr 4, 2026',
        summary: 'Cross-links the refusal SOP, resident-rights policy, MR-04 form, and Sidecar MAR guidance.',
        tags: ['meds', 'refusal', 'workflow'],
        linked_file_ids: ['kf-mar-helper', 'kf-incident-followup', 'kf-resident-rights'],
        source_codes: ['PRO-041', 'POL-012', 'FRM-004'],
        body:
            '# Medication refusal workflow map\n\nUse this workspace note when the team needs the operational through-line, not just the procedure itself.\n\n## Core path\n- Start with the refusal event and immediate safety check.\n- Confirm resident rights and autonomy framing.\n- Document the refusal in the MAR and complete MR-04.\n- Notify supervisor for clinically significant medications.\n- Carry forward any monitoring or handoff requirements.\n\n## Why this note exists\nThis note is the connective tissue between formal policy, the step-by-step SOP, and the in-system helper guidance used in Sidecar.',
    },
    {
        id: 'kf-mar-helper',
        title: 'ElderMark MAR refusal helper',
        folder: 'Helpers/ElderMark',
        type: 'Helper Note',
        updated_at: 'Apr 5, 2026',
        summary: 'Short helper note for charge nurses charting a medication refusal in MAR.',
        tags: ['eldermark', 'mar', 'refusal', 'sidecar'],
        linked_file_ids: ['kf-med-refusal-map', 'kf-resident-rights'],
        source_codes: ['PRO-041', 'TRN-008'],
        body:
            '# ElderMark MAR refusal helper\n\n## Staff usually ask\n- What fields are required before I leave MAR?\n- Do I document this as refused, held, or missed?\n- What comes after the refusal entry?\n\n## Before leaving MAR\n- Enter the refusal correctly.\n- Capture the resident-stated reason if one was given.\n- Record behavior during prompting if clinically relevant.\n- Move to the follow-up notification step when required.\n\n## Use in Sidecar\nThis note should be distilled into lightweight prompts, not shown as a full article unless requested.',
    },
    {
        id: 'kf-incident-followup',
        title: 'Incident follow-up and shift continuity',
        folder: 'Operations/Continuity',
        type: 'Case Pattern',
        updated_at: 'Apr 3, 2026',
        summary: 'Defines what must survive handoff after a medication refusal or behavioral escalation.',
        tags: ['handoff', 'case-memory', 'incident', 'follow-up'],
        linked_file_ids: ['kf-med-refusal-map', 'kf-lighthouse-routing'],
        source_codes: ['FRM-001', 'PRO-003'],
        body:
            '# Incident follow-up and shift continuity\n\n## Keep across shifts\n- What happened\n- What guidance was used\n- What was completed\n- What is still unresolved\n- Which notifications are pending\n\n## Good handoff language\nUse plain operational language. Keep it short enough that the next shift can resume without reconstructing the entire event.',
    },
    {
        id: 'kf-resident-rights',
        title: 'Resident rights note for refusal events',
        folder: 'Policies/Rights',
        type: 'Policy Note',
        updated_at: 'Apr 1, 2026',
        summary: 'Operational note translating patient rights policy into medication refusal behavior and documentation.',
        tags: ['policy', 'rights', 'refusal'],
        linked_file_ids: ['kf-med-refusal-map', 'kf-mar-helper'],
        source_codes: ['POL-012', 'POL-021'],
        body:
            '# Resident rights note for refusal events\n\nMedication refusal should be framed first as a rights issue and second as a workflow issue.\n\n## What staff should remember\n- Do not coerce.\n- Use the resident’s own language when possible.\n- Document refusal clearly and respectfully.\n- Escalate based on clinical significance, not frustration.',
    },
    {
        id: 'kf-lighthouse-routing',
        title: 'Lighthouse routing for overnight escalation',
        folder: 'Operations/Incidents',
        type: 'Reference',
        updated_at: 'Apr 2, 2026',
        summary: 'Maps incident severity to routing, review, and next-shift visibility inside Lighthouse.',
        tags: ['lighthouse', 'incident', 'routing', 'operations'],
        linked_file_ids: ['kf-incident-followup'],
        source_codes: ['FRM-001', 'POL-002'],
        body:
            '# Lighthouse routing for overnight escalation\n\nUse Lighthouse when the operational problem is visibility and follow-up, not just documentation.\n\n## High-priority incident expectations\n- Structure the incident quickly.\n- Route it to the right evening or supervisory reviewer.\n- Preserve the open items for the next shift.\n- Link guidance that was used so no one restarts from zero.',
    },
]
