import { ALAMO_FACILITIES } from '../shared/community-names.mjs'
import { readPlatformSnapshot } from './platform-snapshot.mjs'

export const ALAMOHEALTH_DEMO_API_PREFIX = '/api/integrations/alamohealth/demo'
export const ALAMOHEALTH_DEMO_CONTRACT_VERSION = '1.0'

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const facilitiesById = new Map(ALAMO_FACILITIES.map((facility) => [facility.facilityId, facility]))

const DATASETS = Object.freeze({
  'current-medication-orders': {
    table: 'mar_medication_orders_current',
    residentScoped: true,
    dateFields: ['effective_date', 'prescription_end_date'],
    columns: [
      'medication_order_id', 'resident_id', 'resident_name', 'facility_id', 'facility_name',
      'medication_name', 'dosage', 'route', 'schedule', 'passing_times', 'instructions',
      'indication', 'prescriber_code', 'diagnosis_code', 'is_narcotic', 'is_psychotropic',
      'is_prn', 'is_on_hold', 'effective_date', 'prescription_end_date',
    ],
  },
  'mar-exceptions': {
    table: 'mar_exception_detail_90d',
    residentScoped: true,
    dateFields: ['scheduled_date', 'administration_date', 'recorded_date'],
    columns: [
      'administration_id', 'medication_order_id', 'resident_id', 'resident_name',
      'facility_id', 'facility_name', 'medication_name', 'dosage', 'route',
      'administration_date', 'scheduled_date', 'scheduled_time', 'recorded_date',
      'administration_outcome', 'outcome_category', 'not_given_reason',
      'missed_or_held_reason', 'is_on_hold', 'is_prn', 'prn_reason', 'prn_result',
      'prn_result_date', 'administration_note', 'minutes_late', 'is_refusal',
      'is_over_60_minutes_late', 'month_bucket',
    ],
  },
  'prn-history': {
    table: 'mar_prn_effectiveness_90d',
    residentScoped: true,
    dateFields: ['scheduled_date', 'administration_date', 'recorded_date'],
    columns: [
      'administration_id', 'medication_order_id', 'resident_id', 'resident_name',
      'facility_id', 'facility_name', 'medication_name', 'dosage', 'route',
      'administration_date', 'scheduled_date', 'recorded_date', 'administration_outcome',
      'prn_reason', 'prn_result', 'prn_result_date', 'prn_result_when',
      'has_effectiveness_followup', 'month_bucket',
    ],
  },
  notes: {
    table: 'notes_summary',
    residentScoped: true,
    dateFields: ['note_date'],
    columns: [
      'facility_id', 'facility_name', 'resident_id', 'resident_name', 'note_date',
      'month_bucket', 'note_type', 'note_text', 'action_required_by_date',
    ],
  },
  assessments: {
    table: 'assessment_summary',
    residentScoped: true,
    dateFields: ['assessment_date'],
    columns: [
      'facility_id', 'facility_name', 'resident_id', 'resident_name', 'assessment_date',
      'month_bucket', 'assessment_type', 'assessment_status', 'assessment_score',
    ],
  },
  services: {
    table: 'services_provided',
    residentScoped: true,
    dateFields: ['service_date'],
    columns: [
      'facility_id', 'facility_name', 'resident_id', 'resident_name', 'service_date',
      'month_bucket', 'service_type', 'employee_id', 'service_status', 'service_units',
      'source_table',
    ],
  },
  incidents: {
    table: 'incident_detail_history',
    residentScoped: true,
    dateFields: ['incident_date', 'received_at'],
    columns: [
      'id', 'facility_id', 'facility_name', 'resident_id', 'client_name', 'unit_number',
      'incident_date', 'received_at', 'category', 'incident_type', 'location', 'email_body',
      'assistance_given', 'injury_occurred', 'police_called', 'sentinel_event',
      'previous_history', 'month_bucket',
    ],
  },
  episodes: {
    table: 'resident_episode_history',
    residentScoped: true,
    dateFields: ['admit_date', 'discharge_date'],
    columns: [
      'episode_id', 'facility_id', 'facility_name', 'resident_id', 'resident_name',
      'admit_date', 'discharge_date', 'discharge_reason', 'discharge_destination',
      'episode_status', 'month_bucket', 'source_table', 'canonical_client_id',
      'client_match_method', 'client_match_status',
    ],
  },
})

const PROFILE_COLUMNS = [
  'res_number', 'resident_name', 'first_name', 'last_name', 'age', 'admit_date',
  'los_days', 'facility_id', 'facility_name', 'unit_number', 'care_level', 'payor',
  'primary_diagnosis', 'physician', 'diet', 'incident_count_all_time',
  'incident_count_30d', 'incident_count_90d', 'incident_count_180d', 'last_incident_date',
  'last_incident_category', 'last_note_date', 'days_since_last_note',
  'canonical_client_id', 'client_match_method', 'client_match_status',
]

const MEDICATION_SUMMARY_COLUMNS = [
  'resident_id', 'resident_name', 'facility_id', 'facility_name',
  'active_medication_count', 'active_psychotropic_count', 'active_narcotic_count',
  'active_prn_count', 'scheduled_7d', 'given_7d', 'refusals_7d', 'scheduled_30d',
  'given_30d', 'not_given_30d', 'refusals_30d', 'scheduled_90d', 'given_90d',
  'not_given_90d', 'refusals_90d', 'last_recorded_date', 'prn_given_30d',
  'prn_followup_30d', 'compliance_pct_30d',
]

const RESIDENT_DETAIL_UNAVAILABLE = Object.freeze([
  'allergies',
  'contacts',
  'pharmacies_and_packages',
  'documents',
  'routine_administrations',
  'observations',
])

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

function isLoopbackAddress(address) {
  const normalized = String(address ?? '').replace(/^::ffff:/, '')
  return ['127.0.0.1', '::1'].includes(normalized)
}

function requiredText(value, label, maximumLength = 256) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximumLength) {
    throw new Error(`The Platform demo snapshot has an invalid ${label}.`)
  }
  return value.trim()
}

function validateSnapshot(snapshot) {
  if (!isObject(snapshot) || snapshot.snapshot?.source !== 'published-snapshot' || snapshot.health?.ok !== true) {
    throw new Error('The Platform demo source is not a healthy governed snapshot.')
  }
  const snapshotId = requiredText(
    snapshot.snapshot.version ?? snapshot.snapshot.generated_at,
    'snapshot identifier',
    128,
  )
  const generatedAt = requiredText(snapshot.snapshot.generated_at, 'generated timestamp', 128)
  const dataAsOf = requiredText(snapshot.snapshot.as_of_date, 'data-as-of date', 32)
  if (!Number.isFinite(Date.parse(generatedAt)) || !/^\d{4}-\d{2}-\d{2}$/.test(dataAsOf)) {
    throw new Error('The Platform demo snapshot has invalid provenance dates.')
  }
  const tables = snapshot.reportsSummary?.toolContext?.tables
  if (!isObject(tables)) throw new Error('The Platform demo snapshot has no governed tool tables.')
  return { snapshotId, generatedAt, dataAsOf, tables }
}

function metadata(context) {
  return {
    contract_version: ALAMOHEALTH_DEMO_CONTRACT_VERSION,
    source: 'alamo_platform',
    mode: 'local_read_only_demo',
    snapshot_id: context.snapshotId,
    generated_at: context.generatedAt,
    data_as_of: context.dataAsOf,
  }
}

function rows(context, table) {
  const value = context.tables[table]
  if (!Array.isArray(value) || !value.every(isObject)) {
    throw new Error(`The Platform demo snapshot has an invalid ${table} table.`)
  }
  return value
}

function project(row, columns) {
  return Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))
}

function count(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0
}

function isInTrailingWindow(value, dataAsOf, days) {
  const dateText = String(value ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false
  const observed = Date.parse(`${dateText}T12:00:00Z`)
  const through = Date.parse(`${dataAsOf}T12:00:00Z`)
  if (!Number.isFinite(observed) || !Number.isFinite(through)) return false
  const from = through - ((days - 1) * 24 * 60 * 60 * 1_000)
  return observed >= from && observed <= through
}

function facilityId(value) {
  const id = requiredText(value, 'facility identifier', 64)
  if (!facilitiesById.has(id)) throw new Error('The Platform demo facility is not approved.')
  return id
}

function residentId(value) {
  const id = requiredText(value, 'resident identifier', 128)
  if (!/^[a-z0-9._-]+$/i.test(id)) throw new Error('The Platform demo resident identifier is invalid.')
  return id
}

function parseLimit(value) {
  if (value === null || value === undefined || value === '') return DEFAULT_LIMIT
  if (!/^\d+$/.test(value)) throw new Error('The Platform demo limit is invalid.')
  const limit = Number(value)
  if (limit < 1 || limit > MAX_LIMIT) throw new Error('The Platform demo limit is out of range.')
  return limit
}

function cursorScope(context, dataset, facility, resident) {
  return `${context.snapshotId}|${dataset}|${facility}|${resident ?? ''}`
}

function encodeCursor(scope, offset) {
  return Buffer.from(JSON.stringify({ version: 1, scope, offset }), 'utf8').toString('base64url')
}

function decodeCursor(value, scope) {
  if (!value) return 0
  if (value.length > 1_024) throw new Error('The Platform demo cursor is invalid.')
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (parsed.version !== 1 || parsed.scope !== scope || !Number.isInteger(parsed.offset) || parsed.offset < 0) {
      throw new Error('invalid')
    }
    return parsed.offset
  } catch {
    throw new Error('The Platform demo cursor is invalid.')
  }
}

function newestValue(row, fields) {
  return fields.map((field) => String(row[field] ?? '')).sort().at(-1) ?? ''
}

function findMedicationSummary(context, facility, resident) {
  return rows(context, 'mar_resident_summary').find(
    (row) => String(row.facility_id) === facility && String(row.resident_id) === resident,
  ) ?? null
}

function buildResidentDirectory(context, facility) {
  const summaries = new Map(rows(context, 'mar_resident_summary')
    .filter((row) => String(row.facility_id) === facility)
    .map((row) => [String(row.resident_id), project(row, MEDICATION_SUMMARY_COLUMNS)]))
  const residents = rows(context, 'resident_profile')
    .filter((row) => String(row.facility_id) === facility)
    .map((row) => {
      const projected = project(row, PROFILE_COLUMNS)
      projected.medication_summary = summaries.get(String(row.res_number)) ?? null
      return projected
    })
    .sort((left, right) => String(left.resident_name).localeCompare(String(right.resident_name), 'en'))
  return {
    ...metadata(context),
    facility: facilitiesById.get(facility),
    residents,
    total: residents.length,
  }
}

function filterDatasetRows(
  context,
  definition,
  facility,
  resident = /** @type {string | null} */ (null),
) {
  return rows(context, definition.table)
    .filter((row) => String(row.facility_id) === facility)
    .filter((row) => !resident || !definition.residentScoped || String(row.resident_id) === resident)
    .sort((left, right) => newestValue(right, definition.dateFields)
      .localeCompare(newestValue(left, definition.dateFields), 'en'))
}

function buildDatasetResponse(context, facility, dataset, requestUrl) {
  const definition = DATASETS[dataset]
  if (!definition) throw new Error('The requested Platform demo dataset is not approved.')
  const resident = requestUrl.searchParams.get('resident')
    ? residentId(requestUrl.searchParams.get('resident'))
    : null
  const limit = parseLimit(requestUrl.searchParams.get('limit'))
  const scope = cursorScope(context, dataset, facility, resident)
  const offset = decodeCursor(requestUrl.searchParams.get('cursor'), scope)
  const matching = filterDatasetRows(context, definition, facility, resident)
  if (offset > matching.length) throw new Error('The Platform demo cursor is outside the result set.')
  const page = matching.slice(offset, offset + limit).map((row) => project(row, definition.columns))
  const nextOffset = offset + page.length
  return {
    ...metadata(context),
    facility: facilitiesById.get(facility),
    dataset,
    resident_id: resident,
    rows: page,
    total: matching.length,
    returned: page.length,
    next_cursor: nextOffset < matching.length ? encodeCursor(scope, nextOffset) : null,
  }
}

function buildResidentDetail(context, facility, resident) {
  const profile = rows(context, 'resident_profile').find(
    (row) => String(row.facility_id) === facility && String(row.res_number) === resident,
  )
  if (!profile) throw new Error('The resident is not in the governed current roster.')
  const medicationSummary = findMedicationSummary(context, facility, resident)
  const datasets = {}
  const coverage = {}
  for (const [name, definition] of Object.entries(DATASETS)) {
    const matching = filterDatasetRows(context, definition, facility, resident)
    const limit = name === 'services' || name === 'incidents' ? 100 : 200
    datasets[name] = matching.slice(0, limit).map((row) => project(row, definition.columns))
    coverage[name] = { total: matching.length, returned: datasets[name].length }
  }
  return {
    ...metadata(context),
    facility: facilitiesById.get(facility),
    resident: project(profile, PROFILE_COLUMNS),
    medication_summary: medicationSummary ? project(medicationSummary, MEDICATION_SUMMARY_COLUMNS) : null,
    datasets,
    coverage,
    unavailable: RESIDENT_DETAIL_UNAVAILABLE,
  }
}

function buildTodaySummary(context, facility) {
  const profiles = rows(context, 'resident_profile')
    .filter((row) => String(row.facility_id) === facility)
  const medicationSummaries = rows(context, 'mar_resident_summary')
    .filter((row) => String(row.facility_id) === facility)
  const currentOrders = filterDatasetRows(
    context,
    DATASETS['current-medication-orders'],
    facility,
  )
  const marExceptions = filterDatasetRows(context, DATASETS['mar-exceptions'], facility)

  const medicationTotals = medicationSummaries.reduce((totals, row) => ({
    activePsychotropicOrders: totals.activePsychotropicOrders + count(row.active_psychotropic_count),
    activeNarcoticOrders: totals.activeNarcoticOrders + count(row.active_narcotic_count),
    activePrnOrders: totals.activePrnOrders + count(row.active_prn_count),
    scheduled30d: totals.scheduled30d + count(row.scheduled_30d),
    given30d: totals.given30d + count(row.given_30d),
    notGiven30d: totals.notGiven30d + count(row.not_given_30d),
    refusals30d: totals.refusals30d + count(row.refusals_30d),
    prnGiven30d: totals.prnGiven30d + count(row.prn_given_30d),
    prnFollowupRecorded30d: totals.prnFollowupRecorded30d + count(row.prn_followup_30d),
    prnWithoutRecordedFollowup30d: totals.prnWithoutRecordedFollowup30d + Math.max(
      count(row.prn_given_30d) - count(row.prn_followup_30d),
      0,
    ),
  }), {
    activePsychotropicOrders: 0,
    activeNarcoticOrders: 0,
    activePrnOrders: 0,
    scheduled30d: 0,
    given30d: 0,
    notGiven30d: 0,
    refusals30d: 0,
    prnGiven30d: 0,
    prnFollowupRecorded30d: 0,
    prnWithoutRecordedFollowup30d: 0,
  })

  const recentCount = (dataset, dateFields) => filterDatasetRows(
    context,
    DATASETS[dataset],
    facility,
  ).filter((row) => dateFields.some((field) =>
    isInTrailingWindow(row[field], context.dataAsOf, 30))).length

  return {
    ...metadata(context),
    facility: facilitiesById.get(facility),
    read_only: true,
    windows: { recent_days: 30, mar_history_days: 90 },
    residents: {
      current_roster_count: profiles.length,
      documented_location_count: profiles
        .filter((row) => String(row.unit_number ?? '').trim()).length,
    },
    medications: {
      current_order_count: currentOrders.length,
      active_psychotropic_order_count: medicationTotals.activePsychotropicOrders,
      active_narcotic_order_count: medicationTotals.activeNarcoticOrders,
      active_prn_order_count: medicationTotals.activePrnOrders,
      scheduled_30d: medicationTotals.scheduled30d,
      given_30d: medicationTotals.given30d,
      not_given_30d: medicationTotals.notGiven30d,
      refusals_30d: medicationTotals.refusals30d,
      prn_given_30d: medicationTotals.prnGiven30d,
      prn_followup_recorded_30d: medicationTotals.prnFollowupRecorded30d,
      prn_without_recorded_followup_30d: medicationTotals.prnWithoutRecordedFollowup30d,
      mar_exception_record_count_90d: marExceptions.length,
    },
    clinical_activity: {
      notes_30d: recentCount('notes', ['note_date']),
      assessments_30d: recentCount('assessments', ['assessment_date']),
      services_30d: recentCount('services', ['service_date']),
      incidents_30d: recentCount('incidents', ['incident_date', 'received_at']),
    },
    unavailable: [
      'allergies',
      'pharmacy_packages',
      'inventory_and_counts',
      'beds_and_presence',
      'complete_routine_administration_rows',
    ],
  }
}

export function buildAlamoHealthDemoApiResponse(snapshot, requestUrl) {
  const context = validateSnapshot(snapshot)
  const suffix = requestUrl.pathname.slice(ALAMOHEALTH_DEMO_API_PREFIX.length)
  if (suffix === '/health') {
    return {
      ...metadata(context),
      status: 'ready',
      read_only: true,
      persistence: 'none',
      datasets: Object.keys(DATASETS),
    }
  }

  const residentDirectoryMatch = suffix.match(/^\/facilities\/([^/]+)\/residents$/)
  if (residentDirectoryMatch) {
    return buildResidentDirectory(context, facilityId(decodeURIComponent(residentDirectoryMatch[1])))
  }

  const todaySummaryMatch = suffix.match(/^\/facilities\/([^/]+)\/today-summary$/)
  if (todaySummaryMatch) {
    return buildTodaySummary(
      context,
      facilityId(decodeURIComponent(todaySummaryMatch[1])),
    )
  }

  const residentDetailMatch = suffix.match(/^\/facilities\/([^/]+)\/residents\/([^/]+)$/)
  if (residentDetailMatch) {
    return buildResidentDetail(
      context,
      facilityId(decodeURIComponent(residentDetailMatch[1])),
      residentId(decodeURIComponent(residentDetailMatch[2])),
    )
  }

  const datasetMatch = suffix.match(/^\/facilities\/([^/]+)\/data\/([^/]+)$/)
  if (datasetMatch) {
    return buildDatasetResponse(
      context,
      facilityId(decodeURIComponent(datasetMatch[1])),
      decodeURIComponent(datasetMatch[2]),
      requestUrl,
    )
  }
  throw new Error('The Platform demo route was not found.')
}

export function isAlamoHealthDemoPath(pathname) {
  return pathname === ALAMOHEALTH_DEMO_API_PREFIX ||
    pathname.startsWith(`${ALAMOHEALTH_DEMO_API_PREFIX}/`)
}

export async function handleAlamoHealthDemoApiRequest(req, res, requestUrl) {
  res.setHeader('X-AlamoHealth-Demo-Contract', ALAMOHEALTH_DEMO_CONTRACT_VERSION)
  if (!readBoolean(process.env.PLATFORM_ALAMOHEALTH_DEMO_READ_ENABLED)) {
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'Not found.' }))
    return
  }
  if (!isLoopbackAddress(req.socket?.remoteAddress)) {
    res.statusCode = 403
    res.end(JSON.stringify({ error: 'The AlamoHealth demo projection is loopback-only.' }))
    return
  }
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }
  try {
    const snapshot = await readPlatformSnapshot()
    const body = buildAlamoHealthDemoApiResponse(snapshot, requestUrl)
    const serialized = JSON.stringify(body)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new Error('The Platform demo response exceeded its size limit.')
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(serialized)
  } catch (error) {
    res.statusCode = 503
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'The Platform demo projection is unavailable.',
    }))
  }
}
