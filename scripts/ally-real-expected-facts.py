"""Independent read-only answer sheet for Ally's November 24 baseline.

Queries the governed warehouse directly, not Ally's query planner, source
adapter, snapshots or answer validator. Results stay in a private ignored
directory. No resident names, note text or personal identifiers are exported.
"""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone

os.umask(0o077)
out=Path(sys.argv[1]).resolve();out.mkdir(parents=True,exist_ok=True)
env={**os.environ,'DATABRICKS_HOST':'https://adb-7405608024417459.19.azuredatabricks.net','DATABRICKS_AUTH_TYPE':'azure-cli'}
prefix='alamohealth.gold.v_tool_'
fac="Facility IN ('337','342','343','344','345')"
marfac="facility_id IN ('337','342','343','344','345')"
week="BETWEEN DATE '2026-11-16' AND DATE '2026-11-22'"
queries={}
def q(key,sql):
    assert sql.lstrip().upper().startswith(('SELECT','WITH')) and ';' not in sql
    queries[key]=sql
q('age',f"SELECT Facility, Facility_Name, count(*) residents, count(Age) known, count(*)-count(Age) missing, avg(Age) mean, median(Age) median, min(Age) minimum, max(Age) maximum FROM {prefix}resident_profile WHERE {fac} GROUP BY Facility,Facility_Name ORDER BY Facility")
q('age_portfolio',f"SELECT count(*) residents,count(Age) known,count(*)-count(Age) missing,avg(Age) mean,median(Age) median FROM {prefix}resident_profile WHERE {fac}")
q('older_residents',f"SELECT Facility,Facility_Name,Care_Level,count(*) residents,count_if(Age>=65) age_65_plus,count_if(Age IS NULL) missing FROM {prefix}resident_profile WHERE {fac} GROUP BY Facility,Facility_Name,Care_Level ORDER BY Facility,Care_Level")
q('los',f"SELECT Facility,Facility_Name,count(*) residents,count(LOS_Days) known,avg(LOS_Days) mean,median(LOS_Days) median FROM {prefix}resident_profile WHERE {fac} GROUP BY Facility,Facility_Name")
q('los_portfolio',f"SELECT count(*) residents,count(LOS_Days) known,avg(LOS_Days) mean,median(LOS_Days) median FROM {prefix}resident_profile WHERE {fac}")
q('census_quality',f"SELECT * FROM {prefix}census_data_quality WHERE {fac}")
q('weekly_census',f"SELECT Facility,Facility_Name,week_start,week_end,census_date,prior_census_date,census,census_7d_prior,census_change_7d FROM {prefix}census_weekly_by_community WHERE {fac} AND week_start>=DATE '2025-12-22' AND week_start<=DATE '2026-11-24' ORDER BY week_start,Facility")
q('monthly_census',f"SELECT * FROM {prefix}census_monthly_by_community WHERE {fac} AND month_bucket BETWEEN DATE '2026-01-01' AND DATE '2026-11-01'")
q('flow',f"SELECT Facility,Facility_Name,count_if(admit_date BETWEEN DATE '2026-01-01' AND DATE '2026-11-24') admissions,count_if(discharge_date BETWEEN DATE '2026-01-01' AND DATE '2026-11-24') discharges,count_if(admit_date<=DATE '2025-12-31' AND (discharge_date IS NULL OR discharge_date>DATE '2025-12-31')) opening_census,count_if(admit_date<=DATE '2026-11-23' AND (discharge_date IS NULL OR discharge_date>DATE '2026-11-23')) closing_census,count(distinct CASE WHEN admit_date BETWEEN DATE '2026-01-01' AND DATE '2026-11-24' THEN Res_Number END) distinct_people_admitted,sum(greatest(0,datediff(least(coalesce(discharge_date,DATE '2026-11-25'),DATE '2026-11-25'),greatest(admit_date,DATE '2026-01-01')))) occupied_bed_days FROM {prefix}resident_episode_history WHERE {fac} GROUP BY Facility,Facility_Name ORDER BY Facility")
q('episodes',f"WITH e AS(SELECT *,row_number() OVER(PARTITION BY Facility,Res_Number ORDER BY admit_date,episode_id) episode_number FROM {prefix}resident_episode_history WHERE {fac}) SELECT Facility,count(*) admissions,count(distinct Res_Number) distinct_people,count_if(episode_number>1) returns_with_prior_stay FROM e WHERE admit_date BETWEEN DATE '2026-01-01' AND DATE '2026-11-24' GROUP BY Facility ORDER BY Facility")
q('exact_flow',f"SELECT Facility,Facility_Name,count_if(admit_date BETWEEN DATE '2026-10-21' AND DATE '2026-11-03') prior_admissions,count_if(discharge_date BETWEEN DATE '2026-10-21' AND DATE '2026-11-03') prior_discharges,count_if(admit_date BETWEEN DATE '2026-11-04' AND DATE '2026-11-17') admissions,count_if(discharge_date BETWEEN DATE '2026-11-04' AND DATE '2026-11-17') discharges FROM {prefix}resident_episode_history WHERE {fac} GROUP BY Facility,Facility_Name")
q('monthly_flow',f"SELECT Facility,Facility_Name,month_bucket,admissions,discharges,net_change FROM {prefix}resident_flow_monthly_by_community WHERE {fac} AND month_bucket>=DATE '2026-01-01' AND month_bucket<DATE '2026-12-01' ORDER BY month_bucket,Facility")
q('weekly_flow',f"SELECT Facility,Facility_Name,week_start,admissions,discharges,net_change FROM {prefix}resident_flow_weekly_by_community WHERE {fac} AND week_start>=DATE '2026-10-12' AND week_start<DATE '2026-11-23' ORDER BY week_start,Facility")
q('counties_current',f"SELECT Facility,Facility_Name,client_county,resident_count,as_of_date,source_field FROM {prefix}current_resident_county_by_community WHERE {fac}")
q('counties_admitted',f"SELECT Facility,Facility_Name,admission_county,count(*) admission_episodes,count(distinct Res_Number) people FROM {prefix}resident_episode_history WHERE {fac} AND admit_date BETWEEN DATE '2026-01-01' AND DATE '2026-11-24' GROUP BY Facility,Facility_Name,admission_county")
q('discharge',f"SELECT Facility,Facility_Name,discharge_destination,discharge_reason,count(*) discharges,avg(datediff(discharge_date,admit_date)) mean_los,median(datediff(discharge_date,admit_date)) median_los FROM {prefix}resident_episode_history WHERE {fac} AND discharge_date BETWEEN DATE '2026-01-01' AND DATE '2026-11-24' GROUP BY Facility,Facility_Name,discharge_destination,discharge_reason")
q('discharge_portfolio',f"SELECT count(*) discharges,avg(datediff(discharge_date,admit_date)) mean_los,median(datediff(discharge_date,admit_date)) median_los FROM {prefix}resident_episode_history WHERE {fac} AND discharge_date BETWEEN DATE '2026-01-01' AND DATE '2026-11-24'")
q('daily_incidents',f"SELECT Facility,Facility_Name,cast(Incident_Date_parsed AS DATE) incident_date,count(*) incidents,count_if(lower(trim(cast(Sentinel_Event_YN AS STRING))) IN ('1','yes','true') OR lower(trim(cast(Notify_EmergSrvs_YN AS STRING))) IN ('1','yes','true')) high FROM {prefix}incident_detail_history WHERE {fac} AND cast(Incident_Date_parsed AS DATE) BETWEEN DATE '2026-11-16' AND DATE '2026-11-24' GROUP BY Facility,Facility_Name,cast(Incident_Date_parsed AS DATE) ORDER BY incident_date,Facility")
q('incident_history',f"SELECT Facility,Facility_Name,Incident_Category,count(*) incidents,count(distinct Unique_ID) unique_incidents FROM {prefix}incident_detail_history WHERE {fac} AND cast(Incident_Date_parsed AS DATE) BETWEEN DATE '2026-01-01' AND DATE '2026-03-31' GROUP BY Facility,Facility_Name,Incident_Category")
q('incident_monthly',f"SELECT Facility,Facility_Name,month_bucket,Incident_Category,incident_count,resident_count FROM {prefix}incident_monthly_by_community_category WHERE {fac} AND month_bucket BETWEEN DATE '2026-01-01' AND DATE '2026-11-01' ORDER BY month_bucket,Facility,Incident_Category")
q('repeat_incidents',f"SELECT r.Facility,r.Facility_Name,count(*) current_residents,count_if(coalesce(i.incident_count_30d,0)>1) repeated_30d,count_if(coalesce(i.incident_count_90d,0)>1) repeated_90d,count_if(i.Res_Number IS NULL) no_incident_summary FROM {prefix}resident_profile r LEFT JOIN {prefix}resident_incident_summary i ON r.Res_Number=i.Res_Number AND r.Facility=i.Facility WHERE r.{fac} GROUP BY r.Facility,r.Facility_Name")
q('mar_daily',f"SELECT * FROM {prefix}mar_daily_by_community_90d WHERE {marfac} AND administration_date {week} ORDER BY administration_date,facility_id")
q('mar_monthly',f"SELECT * FROM {prefix}medication_compliance_monthly WHERE {fac} AND month_bucket BETWEEN DATE '2026-08-01' AND DATE '2026-10-01' ORDER BY month_bucket,Facility")
q('refusals',f"SELECT Facility,Medication,total_scheduled,refusals,refusal_pct FROM {prefix}medication_refusal_summary WHERE {fac} ORDER BY refusals DESC LIMIT 30")
q('refusals_monthly',f"SELECT facility_id,month_bucket,medication_name,sum(scheduled_count) scheduled,sum(refusal_count) refusals FROM {prefix}mar_monthly_by_community_medication WHERE {marfac} AND month_bucket BETWEEN DATE '2026-09-01' AND DATE '2026-10-01' GROUP BY facility_id,month_bucket,medication_name ORDER BY refusals DESC LIMIT 100")
q('mar_late',f"SELECT facility_id,facility_name,outcome_category,count(*) rows,count(distinct administration_id) administrations,count_if(minutes_late>60) over_60_minutes_late FROM {prefix}mar_exception_detail_90d WHERE {marfac} AND administration_date {week} GROUP BY facility_id,facility_name,outcome_category")
q('prn',f"SELECT facility_id,facility_name,count(*) administrations,count(distinct administration_id) unique_administrations,count_if(has_effectiveness_followup=1) followed_up FROM {prefix}mar_prn_effectiveness_90d WHERE {marfac} AND administration_date {week} GROUP BY facility_id,facility_name")
q('notes',f"SELECT Facility,Facility_Name,count(*) matching_notes,count(distinct Res_Number) residents,min(note_date) first_date,max(note_date) last_date FROM {prefix}notes_summary WHERE {fac} AND cast(note_date AS DATE) BETWEEN DATE '2026-08-27' AND DATE '2026-11-24' AND lower(note_text) LIKE '%transportation%' GROUP BY Facility,Facility_Name")
q('documentation',f"SELECT Facility,Facility_Name,count(*) current_residents,count(last_note_date) known_last_note,count_if(last_note_date IS NULL) missing_last_note,count_if(days_since_last_note>7) older_than_seven_days FROM {prefix}resident_profile_enriched WHERE {fac} GROUP BY Facility,Facility_Name")
q('assessments',f"SELECT Facility,Facility_Name,assessment_type,assessment_status,count(*) assessments,count(assessment_score) scored,avg(assessment_score) average_score FROM {prefix}assessment_summary WHERE {fac} AND cast(assessment_date AS DATE) BETWEEN DATE '2026-10-01' AND DATE '2026-10-31' GROUP BY Facility,Facility_Name,assessment_type,assessment_status")
q('services',f"SELECT Facility,Facility_Name,service_type,service_status,count(*) events,sum(service_units) units,count(distinct Res_Number) recipients FROM {prefix}services_provided WHERE {fac} AND cast(service_date AS DATE) {week} GROUP BY Facility,Facility_Name,service_type,service_status")
q('moves',f"WITH u AS(SELECT *,lag(unit_number) OVER(PARTITION BY Facility,Res_Number ORDER BY start_date,end_date) previous_unit FROM {prefix}resident_unit_history WHERE {fac}) SELECT Facility,Facility_Name,count(*) occupancy_rows,count_if(previous_unit IS NOT NULL AND previous_unit<>unit_number) changed_unit FROM u WHERE cast(start_date AS DATE) BETWEEN DATE '2026-10-01' AND DATE '2026-10-31' GROUP BY Facility,Facility_Name")
q('operating',f"SELECT * FROM {prefix}community_operating_summary WHERE {fac}")

q('notes_coverage',f"SELECT Facility,Facility_Name,count(*) rows,count(Res_Number) with_resident_id,count(note_text) with_text,count_if(length(trim(coalesce(note_text,'')))>0) with_nonblank_text,min(note_date) first_date,max(note_date) last_date FROM {prefix}notes_summary WHERE {fac} GROUP BY Facility,Facility_Name")
q('assessment_coverage',f"SELECT Facility,Facility_Name,count(*) rows,count(Res_Number) with_resident_id,count(assessment_type) typed,count(assessment_status) with_status,count(assessment_score) with_score FROM {prefix}assessment_summary WHERE {fac} GROUP BY Facility,Facility_Name")
q('service_coverage',f"SELECT Facility,Facility_Name,count(*) rows,count(Res_Number) with_resident_id,count(service_units) with_units,count(service_status) with_status,count_if(service_type='Unspecified service') unspecified FROM {prefix}services_provided WHERE {fac} GROUP BY Facility,Facility_Name")
q('prn_coverage',f"SELECT facility_id,count(*) rows,count_if(has_effectiveness_followup=1) followup,count(prn_result) with_result,min(administration_date) first_date,max(administration_date) last_date FROM {prefix}mar_prn_effectiveness_90d WHERE {marfac} GROUP BY facility_id")
q('documentation_from_notes',f"WITH n AS(SELECT Facility,Res_Number,max(cast(note_date AS DATE)) last_note_date FROM {prefix}notes_summary WHERE {fac} AND cast(note_date AS DATE)<=DATE '2026-11-23' GROUP BY Facility,Res_Number) SELECT r.Facility,r.Facility_Name,count(*) current_residents,count(n.last_note_date) known_last_note,count_if(n.last_note_date IS NULL) unknown,count_if(datediff(DATE '2026-11-23',n.last_note_date)>7) older_than_seven_days FROM {prefix}resident_profile r LEFT JOIN n ON n.Facility=r.Facility AND n.Res_Number=r.Res_Number WHERE r.{fac} GROUP BY r.Facility,r.Facility_Name")
q('incident_priority_ytd',f"SELECT Facility,count(*) incidents,count_if(lower(trim(cast(Sentinel_Event_YN AS STRING))) IN ('1','yes','true') OR lower(trim(cast(Notify_EmergSrvs_YN AS STRING))) IN ('1','yes','true')) high FROM {prefix}incident_detail_history WHERE {fac} AND cast(Incident_Date_parsed AS DATE) BETWEEN DATE '2026-01-01' AND DATE '2026-11-24' GROUP BY Facility")
q('short_stays_ytd',f"SELECT Facility,count_if(datediff(discharge_date,admit_date)<=30) short_stays FROM {prefix}resident_episode_history WHERE {fac} AND discharge_date BETWEEN DATE '2026-01-01' AND DATE '2026-11-24' GROUP BY Facility")

if len(sys.argv)>2:
    requested=set(sys.argv[2].split(','));assert requested<=queries.keys()
    queries={key:sql for key,sql in queries.items()if key in requested}
(out/'queries.json').write_text(json.dumps({'createdAt':datetime.now(timezone.utc).isoformat(),'queries':queries},indent=2))
def api(method,url,body=None,key=''):
    command=['databricks','api',method,url,'-o','json']
    if body:
        f=out/(key+'-request.json');f.write_text(json.dumps(body));command+=['--json','@'+str(f)]
    result=subprocess.run(command,env=env,capture_output=True,text=True,timeout=65)
    if result.returncode:raise RuntimeError(result.stderr[:800])
    return json.loads(result.stdout)
def execute(key,sql):
    result={'key':key,'sqlHash':hashlib.sha256(sql.encode()).hexdigest(),'queriedAt':datetime.now(timezone.utc).isoformat()}
    try:
        response=api('post','/api/2.0/sql/statements',{'warehouse_id':'f7abfd1e8b6c6b4d','statement':sql,'wait_timeout':'10s','on_wait_timeout':'CONTINUE','row_limit':5000},key)
        deadline=time.monotonic()+100
        while response['status']['state'] in ['PENDING','RUNNING'] and time.monotonic()<deadline:
            time.sleep(1);response=api('get','/api/2.0/sql/statements/'+response['statement_id'])
        result['statementId']=response.get('statement_id')
        assert response['status']['state']=='SUCCEEDED',response['status']
        assert not response['manifest'].get('truncated'), 'Truncated expected facts'
        fields=[c['name'] for c in response['manifest']['schema']['columns']]
        rows=response.get('result',{}).get('data_array',[])
        assert len(rows)==response['manifest']['total_row_count'],'Missing query result chunk'
        result.update(status='verified',schema=response['manifest']['schema'],rows=[dict(zip(fields,r))for r in rows])
    except Exception as e:result.update(status='failed',error=str(e)[:1500])
    (out/(key+'.json')).write_text(json.dumps(result,indent=2))
    print(key+': '+result['status']+' '+str(len(result.get('rows',[])))+' rows',flush=True)
    return {k:v for k,v in result.items()if k not in ['rows','schema']}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(lambda pair:execute(*pair),queries.items()))
(out/'manifest.json').write_text(json.dumps({'capturedAt':datetime.now(timezone.utc).isoformat(),'independentOfAlly':True,'results':results},indent=2))
