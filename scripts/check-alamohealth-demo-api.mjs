import assert from 'node:assert/strict'
import {
  ALAMOHEALTH_DEMO_API_PREFIX,
  buildAlamoHealthDemoApiResponse,
  isAlamoHealthDemoPath,
} from '../server/alamohealth-demo-api.mjs'

const profile = {
  res_number: 'SAN-001', resident_name: 'Sanitized Resident', first_name: 'Sanitized',
  last_name: 'Resident', age: 50, facility_id: '337',
  facility_name: 'A & A Health Services San Pablo', primary_diagnosis: 'Sanitized diagnosis',
  physician: 'Sanitized clinician',
}
const medicationSummary = {
  resident_id: 'SAN-001', resident_name: 'Sanitized Resident', facility_id: '337',
  facility_name: 'A & A Health Services San Pablo', active_medication_count: 3,
  active_psychotropic_count: 1, active_narcotic_count: 1, active_prn_count: 1,
  scheduled_30d: 60, given_30d: 58, not_given_30d: 2, refusals_30d: 1,
  prn_given_30d: 2, prn_followup_30d: 1,
}
const order = {
  medication_order_id: 'ORDER-001', resident_id: 'SAN-001',
  resident_name: 'Sanitized Resident', facility_id: '337',
  facility_name: 'A & A Health Services San Pablo', medication_name: 'Sanitized medication',
  dosage: 'Sanitized dose', route: 'PO', schedule: 'Daily', effective_date: '2026-09-01',
  source_private_field: 'must not escape',
}
const baseRow = {
  resident_id: 'SAN-001', resident_name: 'Sanitized Resident', facility_id: '337',
  facility_name: 'A & A Health Services San Pablo',
}
const tables = {
  resident_profile: [profile],
  mar_resident_summary: [medicationSummary],
  mar_medication_orders_current: [order, { ...order, medication_order_id: 'ORDER-002' }],
  mar_exception_detail_90d: [{ ...baseRow, administration_id: 'ADMIN-001', scheduled_date: '2026-09-09' }],
  mar_prn_effectiveness_90d: [{ ...baseRow, administration_id: 'PRN-001', scheduled_date: '2026-09-08' }],
  notes_summary: [{ ...baseRow, note_date: '2026-09-07', note_text: 'Sanitized note' }],
  assessment_summary: [{ ...baseRow, assessment_date: '2026-09-06', assessment_type: 'Sanitized assessment' }],
  services_provided: [{ ...baseRow, service_date: '2026-09-05', service_type: 'Sanitized service' }],
  incident_detail_history: [{ ...baseRow, id: 'INC-001', incident_date: '2026-09-04', client_name: 'Sanitized Resident' }],
  resident_episode_history: [{ ...baseRow, episode_id: 'EP-001', admit_date: '2026-08-01' }],
}
const snapshot = {
  snapshot: {
    source: 'published-snapshot', version: 'snapshot-sanitized',
    generated_at: '2026-09-10T12:00:00.000Z', as_of_date: '2026-09-10',
  },
  health: { ok: true },
  reportsSummary: { toolContext: { tables } },
}

const directory = request('/facilities/337/residents')
assert.equal(directory.total, 1)
assert.equal(directory.residents[0].medication_summary.active_medication_count, 3)

const resident = request('/facilities/337/residents/SAN-001')
assert.equal(resident.datasets['current-medication-orders'].length, 2)
assert.equal(resident.datasets.notes[0].note_text, 'Sanitized note')
assert.equal(resident.datasets.incidents[0].id, 'INC-001')
assert.equal(resident.coverage.notes.total, resident.datasets.notes.length)
assert.deepEqual(resident.unavailable, [
  'allergies',
  'contacts',
  'pharmacies_and_packages',
  'documents',
  'routine_administrations',
  'observations',
])
assert(!JSON.stringify(resident).includes('source_private_field'))

const today = request('/facilities/337/today-summary')
assert.equal(today.read_only, true)
assert.equal(today.residents.current_roster_count, 1)
assert.equal(today.residents.documented_location_count, 0)
assert.equal(today.medications.current_order_count, 2)
assert.equal(today.medications.active_psychotropic_order_count, 1)
assert.equal(today.medications.prn_without_recorded_followup_30d, 1)
assert.equal(today.medications.mar_exception_record_count_90d, 1)
assert.deepEqual(today.clinical_activity, {
  notes_30d: 1,
  assessments_30d: 1,
  services_30d: 1,
  incidents_30d: 1,
})
assert(!JSON.stringify(today).includes('Sanitized Resident'))

const firstPage = request('/facilities/337/data/current-medication-orders?resident=SAN-001&limit=1')
assert.equal(firstPage.total, 2)
assert.equal(firstPage.rows.length, 1)
assert(firstPage.next_cursor)
const secondPage = request(`/facilities/337/data/current-medication-orders?resident=SAN-001&limit=1&cursor=${firstPage.next_cursor}`)
assert.equal(secondPage.rows.length, 1)
assert.equal(secondPage.next_cursor, null)

assert(isAlamoHealthDemoPath(`${ALAMOHEALTH_DEMO_API_PREFIX}/health`))
assert.throws(() => request('/facilities/999/residents'), /not approved/)
assert.throws(() => request('/facilities/337/data/not-approved'), /not approved/)

console.log('AlamoHealth local demo API checks passed')

function request(suffix) {
  return buildAlamoHealthDemoApiResponse(
    snapshot,
    new URL(`${ALAMOHEALTH_DEMO_API_PREFIX}${suffix}`, 'http://127.0.0.1:3002'),
  )
}
