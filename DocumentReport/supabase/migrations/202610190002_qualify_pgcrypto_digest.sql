-- Supabase may install pgcrypto in the `extensions` schema. The import RPC
-- has a restricted search_path, so qualify digest() explicitly.
create or replace function public.ingest_import_batch(p_batch_id uuid,p_records jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  row jsonb;
  fp text;
  rec_id uuid;
  src_id uuid;
  added int:=0;
  review int:=0;
  unchanged int:=0;
  source_name text:='file';
  new_record jsonb;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if jsonb_typeof(p_records)<>'array' then
    raise exception 'invalid payload';
  end if;
  perform 1 from public.import_batches where id=p_batch_id for update;
  if not found then
    raise exception 'batch not found';
  end if;
  for row in select value from jsonb_array_elements(p_records) loop
    fp:=encode(extensions.digest(concat_ws('|',coalesce(row->>'register_no',''),coalesce(row->>'book_no',''),coalesce(row->>'document_date',''),coalesce(row->>'sender',''),coalesce(row->>'subject',''),coalesce(row->>'received_date',''),coalesce(row->>'note','')), 'sha256'),'hex');
    new_record:=jsonb_build_object('register_no',coalesce(row->>'register_no',''),'book_no',coalesce(row->>'book_no',''),'document_date',nullif(row->>'document_date',''),'sender',coalesce(row->>'sender',''),'subject',coalesce(row->>'subject',''),'received_date',nullif(row->>'received_date',''),'note',coalesce(row->>'note',''));
    select id,document_id into src_id,rec_id from public.source_records where source_system=source_name and fingerprint=fp limit 1;
    if src_id is not null then
      unchanged:=unchanged+1;
      update public.source_records set last_seen_at=now(),import_batch_id=p_batch_id where id=src_id;
      continue;
    end if;
    select id into rec_id from public.document_records where register_no=coalesce(row->>'register_no','') and book_no=coalesce(row->>'book_no','') and received_date=nullif(row->>'received_date','')::date and sender=coalesce(row->>'sender','') and subject=coalesce(row->>'subject','') limit 1;
    if rec_id is null then
      insert into public.document_records(register_no,book_no,document_date,sender,subject,received_date,note)
      values(coalesce(row->>'register_no',''),coalesce(row->>'book_no',''),nullif(row->>'document_date','')::date,coalesce(row->>'sender',''),coalesce(row->>'subject',''),nullif(row->>'received_date','')::date,coalesce(row->>'note','')) returning id into rec_id;
      added:=added+1;
    else
      insert into public.data_conflicts(document_id,conflict_type,before_value,proposed_value)
      select rec_id,'possible_duplicate',to_jsonb(d),new_record from public.document_records d where d.id=rec_id;
      update public.document_records set status='review' where id=rec_id;
      review:=review+1;
    end if;
    insert into public.source_records(document_id,source_system,fingerprint,source_payload,import_batch_id)
    values(rec_id,source_name,fp,row,p_batch_id);
  end loop;
  update public.import_batches set status='completed',inserted_count=added,review_count=review,row_count=jsonb_array_length(p_records) where id=p_batch_id;
  insert into public.audit_logs(actor_id,action,table_name,record_id,after_value)
  values(auth.uid(),'import_completed','import_batches',p_batch_id,jsonb_build_object('added',added,'review',review,'unchanged',unchanged));
  return jsonb_build_object('added',added,'review',review,'unchanged',unchanged);
end $$;

revoke all on function public.ingest_import_batch(uuid,jsonb) from public;
grant execute on function public.ingest_import_batch(uuid,jsonb) to authenticated;

