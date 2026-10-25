# Databricks notebook source
# MAGIC %pip install azure-identity==1.25.1 azure-storage-blob==12.27.1

# COMMAND ----------
dbutils.library.restartPython()

# COMMAND ----------
# MAGIC %run /Workspace/Shared/alamo-platform/carebook_source_contract

# COMMAND ----------
# A downstream task of the existing successful snapshot publication. Never invokes Eldermark.
for name,default in [('date_partition',''),('storage_account','alamodatalake'),('container','alamo-platform-snapshots'),
 ('entra_tenant_id',''),('entra_client_id',''),('entra_secret_scope',''),('entra_client_secret_key','')]:
 dbutils.widgets.text(name,default)

# COMMAND ----------
import gzip
from datetime import timezone
from azure.identity import ClientSecretCredential
from azure.storage.blob import BlobServiceClient, ContentSettings
from azure.core import MatchConditions
from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from pyspark.sql import functions as F

try:
 options={name:dbutils.widgets.get(name).strip() for name in ['date_partition','storage_account','container','entra_tenant_id','entra_client_id','entra_secret_scope','entra_client_secret_key']}
 if not all(options.values()):raise ValueError('publisher_configuration_missing')
 as_of=date.fromisoformat(options['date_partition'])
 today=datetime.now(ZoneInfo('America/Los_Angeles')).date()
 if not today-timedelta(days=3)<=as_of<=today:raise ValueError('source_partition_stale')
 tables={};coverage={}
 source=spark.table('alamohealth.silver.resident')
 selected_residents=source.where(F.col('Facility').cast('string').isin(FACILITIES) & (F.col('is_countable_resident')==1) & ((F.col('is_active_final')==1) | (F.col('Discharge_Date_dt')>=F.lit((as_of-timedelta(days=60)).isoformat())))).select('Res_Number').distinct()
 for table,columns in TABLE_FIELDS.items():
  df=spark.table('alamohealth.silver.'+table)
  if '_transform_partition' not in df.columns or '_date_partition' not in df.columns:raise ValueError('source_partition_unverifiable')
  meta=df.agg(F.min('_transform_partition').alias('lo'),F.max('_transform_partition').alias('hi'),F.min('_date_partition').alias('raw_lo'),F.max('_date_partition').alias('raw_hi'),F.count('*').alias('rows')).first().asDict()
  if meta['rows'] and any(str(meta[k])[:10]!=as_of.isoformat() for k in ['lo','hi','raw_lo','raw_hi']):raise ValueError('source_partition_mismatch')
  if not meta['rows']:raise ValueError('source_table_without_partition_receipt')
  missing=set(columns)-set(df.columns)
  if missing:raise ValueError('source_schema_mismatch')
  selected=df.select(*columns)
  if 'Res_Number' in columns:selected=selected.join(selected_residents,'Res_Number','left_semi')
  if 'Facility' in columns:selected=selected.where(F.col('Facility').cast('string').isin(FACILITIES))
  if 'Res_Number' in columns:selected=selected.where(F.col('Res_Number').isNotNull())
  tables[table]=[r.asDict(recursive=True) for r in selected.toLocalIterator()]
  coverage[table]={'asOf':as_of.isoformat(),'rows':len(tables[table])}
 bundles=make_bundles(tables,as_of.isoformat())
 credential=ClientSecretCredential(options['entra_tenant_id'],options['entra_client_id'],dbutils.secrets.get(options['entra_secret_scope'],options['entra_client_secret_key']))
 container=BlobServiceClient('https://'+options['storage_account']+'.blob.core.windows.net',credential=credential).get_container_client(options['container'])
 # This dependency must describe the same business date as the completed governed Platform snapshot.
 published=json.loads(container.get_blob_client('snapshots/daily/latest.json').download_blob().readall())
 if published.get('snapshot',{}).get('as_of_date')!=as_of.isoformat():raise ValueError('platform_publication_mismatch')
 pointer=container.get_blob_client('snapshots/carebook/v1/latest.json');etag=None
 try:
  download=pointer.download_blob();previous=json.loads(download.readall());etag=download.properties.etag
  if previous['asOf']>as_of.isoformat():raise ValueError('source_publication_regression')
 except ResourceNotFoundError:pass
 members=[]
 for (facility,rid),bundle in sorted(bundles.items()):
  raw=canonical(bundle);sha=digest(raw);compressed=gzip.compress(raw,mtime=0)
  if len(compressed)>8*1024*1024:raise ValueError('resident_compressed_payload_too_large')
  try:container.get_blob_client('snapshots/carebook/v1/residents/'+sha+'.json.gz').upload_blob(compressed,overwrite=False,content_settings=ContentSettings(content_type='application/gzip'))
  except ResourceExistsError:pass
  members.append({'facilityId':facility,'residentId':rid,'sha256':sha})
 manifest={'contractVersion':1,'asOf':as_of.isoformat(),'publishedAt':datetime.now(timezone.utc).isoformat(),'facilities':FACILITIES,'members':members,'domains':DOMAINS,'unavailable':UNAVAILABLE,'coverage':coverage}
 raw=canonical(manifest);sha=digest(raw)
 container.get_blob_client('snapshots/carebook/v1/snapshots/'+sha+'.json').upload_blob(raw,overwrite=False,content_settings=ContentSettings(content_type='application/json'))
 latest=canonical({'snapshotId':sha,'asOf':manifest['asOf'],'publishedAt':manifest['publishedAt']})
 if etag:pointer.upload_blob(latest,overwrite=True,etag=etag,match_condition=MatchConditions.IfNotModified,content_settings=ContentSettings(content_type='application/json'))
 else:pointer.upload_blob(latest,overwrite=False,content_settings=ContentSettings(content_type='application/json'))
 print(json.dumps({'carebookPublished':True,'asOf':manifest['asOf'],'residents':len(members),'facilities':len(FACILITIES),'snapshotId':sha,'domains':DOMAINS,'unavailable':UNAVAILABLE}))
except Exception as error:
 # Do not emit source values, SQL results, storage URLs or credential-bearing SDK exceptions.
 print(json.dumps({'carebookPublished':False,'errorType':type(error).__name__,'code':str(error) if isinstance(error,ValueError) and str(error).replace('_','').isascii() and str(error).replace('_','').isalpha() else 'publication_failed'}))
 code=str(error) if isinstance(error,ValueError) and str(error).replace('_','').isascii() and str(error).replace('_','').isalpha() else 'publication_failed'
 raise RuntimeError('Carebook publication failed: '+code) from None
