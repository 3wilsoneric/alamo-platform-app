import sys,unittest,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'databricks/notebooks'))
from carebook_source_contract import *
def fixture():
 t={k:[] for k in TABLE_FIELDS}
 t['resident']=[{'Res_Number':str(i+100),'Facility':f,'First_Name':'Synthetic','Last_Name':f,'is_countable_resident':1,'is_active_final':True,'BirthDate_dt':'1970-01-01'} for i,f in enumerate(FACILITIES)]
 t['allergies']=[{'Unique_ID':'800','Res_Number':'100','Facility':'337','Allergy':'Invented allergy','is_active':False}]
 t['res_contacts']=[{'Unique_ID':'801','Res_Number':'100','Facility':'337','First_Name':'Invented','Emergency':False}]
 t['service_type']=[{'Facility':'337','Code':'5','Description':'Invented one'},{'Facility':'342','Code':'5','Description':'Invented two'}]
 t['service_plan']=[{'Service_Plan_ID':'901','Res_Number':'100','Facility':'337','Service_Type':'5','On_Hold':False,'Instructions':'Invented','Dose':'excluded'}]
 return t
class ContractTests(unittest.TestCase):
 def test_explicit_false_and_facility_service_keys(self):
  b=make_bundles(fixture(),'2026-10-25')[('337','100')]
  self.assertEqual('false',next(r for r in b['records'] if r['kind']=='Allergy')['data']['sourceActive'])
  self.assertEqual({'optional':'N/A'},bool_fields({'field':'N/A'},{'field':'optional'}))
  self.assertEqual('no',next(r for r in b['records'] if r['kind']=='Contact')['data']['emergency'])
  self.assertEqual('Invented one',b['references'][0]['fields']['Service_Description'])
  self.assertNotIn('Dose',b['references'][0]['fields'])
 def test_stable_hash_order_and_no_extraneous_fields(self):
  a=fixture();b=copy.deepcopy(a)
  for rows in b.values():rows.reverse()
  for r in b['resident']:r['billingAccount']='excluded'
  self.assertEqual(canonical(make_bundles(a,'2026-10-25')[('337','100')]),canonical(make_bundles(b,'2026-10-25')[('337','100')]))
 def test_missing_facility_duplicate_ids_or_ambiguous_resident_fail_closed(self):
  for mutate in [lambda t:t['resident'].pop(),lambda t:t['resident'].append(t['resident'][0]),lambda t:t['resident'][1].update(Res_Number='100'),lambda t:t['allergies'].append(t['allergies'][0])]:
   t=fixture();mutate(t)
   with self.assertRaises(ValueError):make_bundles(t,'2026-10-25')
 def test_invalid_historical_time_preserves_original_without_fabricating_a_timestamp(self):
  data={}
  self.assertIsNone(source_at('2026-10-25','not a clock',data))
  self.assertEqual({'sourceDate':'2026-10-25','sourceTime':'not a clock','timePrecision':'unavailable'},data)
 def test_dates_times_flags_and_bounds(self):
  self.assertEqual('2026-10-25',day('25!10!2026'));self.assertIsNone(day('0!0!0000'))
  self.assertEqual('2026-10-25T15:00:00-07:00',at('2026-10-25','54000000'))
  self.assertEqual('2026-12-25T15:00:00-08:00',at('2026-12-25','3:00 PM'))
  for fn in [lambda:day('invalid'),lambda:flag('unknown'),lambda:at('2026-10-25','86400000'),lambda:record('Note','1',narrative='x'*40001)]:
   with self.assertRaises(ValueError):fn()
 def test_old_discharges_excluded_recent_retained_and_notes_start_2018(self):
  t=fixture();t['resident'] += [dict(t['resident'][0],Res_Number='900',is_active_final=False,Discharge_Date_dt='2026-01-01'),dict(t['resident'][0],Res_Number='901',is_active_final=False,Discharge_Date_dt='2026-10-24')]
  t['notes']=[{'Note_ID':'1','Res_Number':'100','Facility':'337','Entry_Date_dt':'2017-01-01'},{'Note_ID':'2','Res_Number':'100','Facility':'337','Entry_Date_dt':'2018-01-01'}]
  b=make_bundles(t,'2026-10-25');self.assertNotIn(('337','900'),b);self.assertIn(('337','901'),b)
  self.assertEqual(['2'],[r['externalId'] for r in b[('337','100')]['records'] if r['kind']=='Note'])
if __name__=='__main__':unittest.main()
