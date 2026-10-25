# Databricks notebook source
"""Carebook's bounded, explicit source contract. Pure functions; no resident content is logged."""
import hashlib
import json
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

FACILITIES = ['337', '342', '343', '344', '345']
PROFILE = {'Diet':'diet','Evacuation_Status':'evacuationStatus','Code_Status_1':'codeStatus','Resuscitate':'resuscitate',
           'Primary_Language':'primaryLanguage','Gender':'gender','Admit_Date_dt':'admitDate','Physician_Name':'physician',
           'Physician_Phone':'physicianPhone','Hospital_of_Preference':'hospitalOfPreference','Advance_Directives':'advanceDirectives','TB_Status':'tbStatus'}
PLAN_FIELDS = 'Service_Type Provider Service_Date Effective_Date End_Date Last_Updated Last_Updated_By Instructions Location Equip_Needed Minutes_Service Day_Sun Day_Mon Day_Tue Day_Wed Day_Thr Day_Fri Day_Sat Service_Times Service_Time_Sort Repeat_Every PRN On_Hold On_Hold_List ON_Schedule_Only Recurring_Task_Data Res_Problem_ID Service_Agreement_Note Needs_Attention Create_Date LastMod_Stamp'.split()
REFERENCES = {
 'service_plan': ('ServicePlan', 'Service_Plan_ID', 'Effective_Date', PLAN_FIELDS),
 'res_admittance_history': ('Admission','Unique_ID','Admit_Date','Admit_Date Discharge_Date Discharge_Date_Future Previous_Living_Status Discharge_Reason Discharge_To Unit_Number Initial_Unit Create_Date LastMod_Stamp'.split()),
 'res_leave_of_absence': ('Absence','Unique_ID','From_Date','From_Date To_Date To_Date_Future Reason Who_Requested Last_Updated Last_Updated_By Service_On_Hold On_Leave Hospital_Visit_Location Hospital_Visit_Reason Hospital_Visit_Outcome Hospital_Discharge_Diagnosis Create_Date Created_By Canceled LastMod_Stamp'.split()),
 'res_unit_history': ('RoomMove','Unique_ID','Move_In','Unit_Number Move_In Move_Out Move_Out_Future Facility_Unit Is_Second_Occupant Move_in_is_Transfer Move_out_is_Transfer Current_Living Physical_Move_In_Date Physical_Move_Out_Date Create_Date LastMod_Stamp'.split()),
 'res_immunization': ('Immunization','UUID','Date_Received','UUID Date_Received Vaccine_Name Manufacturer_Name Route Injection_Site Vaccine_Lot_Number Adverse_Reaction Administered_By Create_Date Create_By ProductName_ShortDescription Declined CVX_Code Booster LastMod_Stamp'.split()),
}
TABLE_FIELDS = {
 'resident': ['Res_Number','Facility','First_Name','Last_Name','Preferred_Name','BirthDate_dt','Unit_Number','is_countable_resident','is_active_final','Discharge_Date_dt',*PROFILE],
 'allergies': 'Unique_ID Res_Number Facility Allergy Allergy_Type Reaction Severity Status Onset_Date_dt is_active'.split(),
 'res_diagnosis': 'Unique_ID Res_Number Diagnosis Code_ICD9 Is_Primary Rank Onset_Date_dt Resolve_Date_dt Note'.split(),
 'res_contacts': 'Unique_ID Res_Number Facility First_Name Last_Name Relationship Phone_1 Phone_2 Email Emergency Responsible_Party Conservator_of_Person Conservator_of_Estate Guardian Power_of_Attorney Priority'.split(),
 'notes': 'Note_ID Res_Number Facility Entry_Date_dt Entry_Time Note_Type Comment Entry_By_User_ID Late_Entry Location FollowUp_Notes'.split(),
 'res_incident': 'Unique_ID Res_Number Facility Incident_Date_dt Incident_Time Type_of_Incident Incident_Category Location_of_Incident_General Location_of_Incident_Specific What_Staff_Saw Comments Injuires_YN Injuires_List Received_Medical_Care_YN Received_Medical_Care_Desc Sentinel_Event_YN Notify_Family_YN Notify_Physician_YN Notify_LicensingPerson_YN Notify_EmergSrvs_YN Person_Completing_Report_Name Res_Followup_Prevention'.split(),
 'service_archive': 'Unique_ID Res_Number Facility Service_Month Service_Type Visits Minutes_of_Service'.split(),
 'service_type': ['Facility','Code','Description'],
}
for table, (_, key, _, fields) in REFERENCES.items():
 TABLE_FIELDS[table] = [key,'Res_Number',*fields] + ([] if table=='res_immunization' else ['Facility'])
TABLE_FIELDS = {key:list(dict.fromkeys(value)) for key,value in TABLE_FIELDS.items()}
# These source domains are not refreshed by the existing daily extract. Their retained originals remain readable.
UNAVAILABLE = ['Photo','ServiceEvent','AssessmentBinary','Vital','CareTeam']
DOMAINS = ['Profile','Allergy','Diagnosis','Contact','Note','Incident','ServiceSummary',*[x[0] for x in REFERENCES.values()]]

def text(value):
 if value is None: return None
 if isinstance(value,(date,datetime)): return value.isoformat()
 if isinstance(value,bool): return 'True' if value else 'False'
 value=str(value).strip()
 return value or None

def identity(value):
 v=text(value)
 if not v or not v.isascii() or not v.isdigit() or v[0]=='0' or len(v)>20: raise ValueError('source_identity_invalid')
 return v

def flag(value):
 if str(value).strip().lower() in ['1','true','yes','y']: return True
 if str(value).strip().lower() in ['0','false','no','n']: return False
 if value is None or str(value).strip()=='': return None
 raise ValueError('source_flag_invalid')

def day(value):
 v=text(value)
 if v is None or v in ['0!0!0000','00!00!0000','0!0!0','0000-00-00']: return None
 try:
  if '!' in v:
   d,m,y=v.split('!'); return date(int(y),int(m),int(d)).isoformat()
  return date.fromisoformat(v[:10]).isoformat()
 except (ValueError,TypeError): raise ValueError('source_date_invalid') from None

def at(value, clock=None):
 d=day(value)
 if d is None: return None
 t=time(12)
 c=text(clock)
 if c:
  try:
   if c.isdigit():
    ms=int(c)
    if not 0<=ms<86400000: raise ValueError()
    t=(datetime(2000,1,1)+timedelta(milliseconds=ms)).time()
   else:
    for fmt in ['%H:%M:%S','%H:%M','%H:%M:%S.%f','%I:%M %p','%I:%M:%S %p','%I:%M%p','%I:%M:%S%p']:
     try:t=datetime.strptime(c,fmt).time();break
     except ValueError:pass
    else: raise ValueError()
  except ValueError: raise ValueError('source_time_invalid') from None
 return datetime.combine(date.fromisoformat(d),t,ZoneInfo('America/Los_Angeles')).isoformat()

def source_at(value,clock,data):
 d=day(value)
 data['sourceDate']=d
 if not text(clock):
  data['timePrecision']='date'
  return at(value)
 try:return at(value,clock)
 except ValueError:
  data['sourceTime']=text(clock)
  data['timePrecision']='unavailable'
  return None # An invalid historical clock is never replaced with an invented time.

def canonical(obj): return json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')
def digest(data): return hashlib.sha256(data).hexdigest()
def fields(row,mapping): return {out:text(row.get(src)) for src,out in mapping.items() if text(row.get(src)) is not None}
def bool_fields(row,mapping):
 result={}
 for src,out in mapping.items():
  value=text(row.get(src))
  if value is None:continue
  try:result[out]='yes' if flag(value) else 'no'
  except ValueError:result[out]=value # Some historical optional flags are N/A or qualified source text; never turn these into 'no'.
 return result

def record(kind,key,occurred=None,category=None,author=None,title=None,narrative=None,data=None):
 r=dict(kind=kind,externalId=identity(key),occurredAt=occurred,category=text(category),author=text(author),title=text(title),text=text(narrative),data=data or None)
 for key,limit in [('category',200),('author',200),('title',400),('text',40000)]:
  if r[key] is not None and len(r[key])>limit: raise ValueError('source_text_exceeds_contract')
 return r

def make_bundles(tables,as_of):
 today=date.fromisoformat(as_of); bundles={}; by_number={}
 for r in tables['resident']:
  facility=text(r.get('Facility'))
  if facility not in FACILITIES or flag(r.get('is_countable_resident')) is not True: continue
  active=flag(r.get('is_active_final'))
  if active is None:raise ValueError('resident_status_unknown')
  discharged=day(r.get('Discharge_Date_dt'))
  if not active and (discharged is None or date.fromisoformat(discharged)<today-timedelta(days=60)):continue
  rid=identity(r['Res_Number']); key=(facility,rid)
  if key in bundles or rid in by_number:raise ValueError('ambiguous_source_identity')
  by_number[rid]=facility
  bundles[key]={'contractVersion':1,'facilityId':facility,'residentId':rid,'identity':{
    'firstName':text(r.get('First_Name')) or '', 'lastName':text(r.get('Last_Name')) or '', 'preferredName':text(r.get('Preferred_Name')),
    'dateOfBirth':day(r.get('BirthDate_dt')),'room':text(r.get('Unit_Number')),'active':active,'admittedOn':day(r.get('Admit_Date_dt')),'dischargedOn':discharged},
    'records':[record('Profile',rid,title='Profile',data=fields(r,PROFILE))], 'references':[]}
 descriptions={}
 for r in tables['service_type']:
  code=(text(r['Facility']),text(r['Code']));desc=text(r['Description'])
  if code in descriptions and descriptions[code]!=desc:raise ValueError('ambiguous_service_type')
  descriptions[code]=desc
 for table,rows in tables.items():
  if table in ['resident','service_type']:continue
  for r in rows:
   rid=text(r.get('Res_Number'))
   if rid not in by_number:continue
   facility=text(r.get('Facility')) or by_number[rid]
   b=bundles.get((facility,rid))
   if b is None:raise ValueError('source_facility_mismatch')
   if table=='allergies':
    data=fields(r,{'Severity':'severity','Status':'status'});data['sourceActive']=str(flag(r.get('is_active'))).lower()
    item=record('Allergy',r['Unique_ID'],at(r.get('Onset_Date_dt')),r.get('Allergy_Type'),title=r.get('Allergy'),narrative=r.get('Reaction'),data=data)
   elif table=='res_diagnosis':
    item=record('Diagnosis',r['Unique_ID'],at(r.get('Onset_Date_dt')),'Primary' if flag(r.get('Is_Primary')) else None,title=r.get('Diagnosis'),narrative=r.get('Note'),data=fields(r,{'Code_ICD9':'code','Rank':'rank','Resolve_Date_dt':'resolvedOn'}))
   elif table=='res_contacts':
    data=fields(r,{'Phone_1':'phone','Phone_2':'phone2','Email':'email','Priority':'priority'})
    data.update(bool_fields(r,{'Emergency':'emergency','Responsible_Party':'responsibleParty','Conservator_of_Person':'conservatorOfPerson','Conservator_of_Estate':'conservatorOfEstate','Guardian':'guardian','Power_of_Attorney':'powerOfAttorney'}))
    item=record('Contact',r['Unique_ID'],category=r.get('Relationship'),title=' '.join(x for x in [text(r.get('First_Name')),text(r.get('Last_Name'))] if x),data=data)
   elif table=='notes':
    data=fields(r,{'Location':'location','FollowUp_Notes':'followUp'});data.update(bool_fields(r,{'Late_Entry':'lateEntry'}))
    occurred=source_at(r.get('Entry_Date_dt'),r.get('Entry_Time'),data)
    if data['sourceDate'] and data['sourceDate']<'2018-01-01':continue
    item=record('Note',r['Note_ID'],occurred,r.get('Note_Type'),r.get('Entry_By_User_ID'),r.get('Note_Type'),r.get('Comment'),data)
   elif table=='res_incident':
    data=fields(r,{'Location_of_Incident_General':'location','Location_of_Incident_Specific':'locationDetail','Injuires_List':'injuryList','Received_Medical_Care_Desc':'medicalCare','Res_Followup_Prevention':'followUp'})
    data.update(bool_fields(r,{'Injuires_YN':'injuries','Received_Medical_Care_YN':'receivedMedicalCare','Sentinel_Event_YN':'sentinelEvent','Notify_Family_YN':'familyNotified','Notify_Physician_YN':'physicianNotified','Notify_LicensingPerson_YN':'licensingNotified','Notify_EmergSrvs_YN':'emergencyServicesNotified'}))
    item=record('Incident',r['Unique_ID'],source_at(r.get('Incident_Date_dt'),r.get('Incident_Time'),data),r.get('Incident_Category') or r.get('Type_of_Incident'),r.get('Person_Completing_Report_Name'),r.get('Type_of_Incident'),'\n\n'.join(text(r[k]) for k in ['What_Staff_Saw','Comments'] if text(r.get(k))),data)
   elif table=='service_archive':
    description=descriptions.get((facility,text(r.get('Service_Type')))) or ('Service '+str(r.get('Service_Type')))
    item=record('ServiceSummary',r['Unique_ID'],at(r.get('Service_Month')),description,title=description,data=fields(r,{'Visits':'visits','Minutes_of_Service':'minutes','Service_Type':'serviceCode'}))
   elif table in REFERENCES:
    kind,key,date_field,allowed=REFERENCES[table]
    data={k:text(r[k]) for k in allowed if k in r and r[k] is not None}
    if kind=='ServicePlan':data['Service_Description']=descriptions.get((facility,text(r.get('Service_Type'))))
    sid=text(r[key])
    if kind!='Immunization':sid=identity(sid)
    else:
     import uuid
     sid=str(uuid.UUID(sid))
    b['references'].append({'kind':kind,'sourceId':sid,'sourceDate':day(r.get(date_field)),'fields':data});continue
   else:raise ValueError('source_table_not_supported')
   b['records'].append(item)
 if not bundles or set(f for f,_ in bundles)!=set(FACILITIES):raise ValueError('incomplete_facility_coverage')
 for b in bundles.values():
  b['records'].sort(key=lambda x:(x['kind'],x['externalId'])); b['references'].sort(key=lambda x:(x['kind'],x['sourceId']))
  for collection,key in [('records','externalId'),('references','sourceId')]:
   ids=[(r['kind'],r[key]) for r in b[collection]]
   if len(ids)!=len(set(ids)):raise ValueError('duplicate_source_record')
  if len(canonical(b))>32*1024*1024:raise ValueError('resident_payload_too_large')
 return bundles
