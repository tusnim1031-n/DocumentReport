-- Reconcile records that were first imported without a received date.
-- A possible match is never applied automatically; it is linked and queued for
-- an Administrator to approve or reject.

create or replace function public.ingest_import_batch(p_batch_id uuid,p_records jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  row jsonb; fp text; rec_id uuid; src_id uuid; candidate_id uuid;
  candidate_count integer; added integer:=0; review integer:=0; unchanged integer:=0;
  source_name text:='file'; new_record jsonb; before_record jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_records)<>'array' then raise exception 'invalid payload'; end if;
  perform 1 from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'batch not found'; end if;
  for row in select value from jsonb_array_elements(p_records) loop
    fp:=encode(extensions.digest(concat_ws('|',coalesce(row->>'register_no',''),coalesce(row->>'book_no',''),coalesce(row->>'document_date',''),coalesce(row->>'sender',''),coalesce(row->>'subject',''),coalesce(row->>'received_date',''),coalesce(row->>'note','')), 'sha256'),'hex');
    new_record:=jsonb_build_object('register_no',coalesce(row->>'register_no',''),'book_no',coalesce(row->>'book_no',''),'document_date',nullif(row->>'document_date',''),'sender',coalesce(row->>'sender',''),'subject',coalesce(row->>'subject',''),'received_date',nullif(row->>'received_date',''),'note',coalesce(row->>'note',''));
    select id,document_id into src_id,rec_id from public.source_records where source_system=source_name and fingerprint=fp limit 1;
    if src_id is not null then update public.source_records set last_seen_at=now(),import_batch_id=p_batch_id where id=src_id; unchanged:=unchanged+1; continue; end if;

    -- A newly supplied received date may complete one otherwise-identical
    -- record. Require all other mapped fields to match and exactly one candidate.
    if nullif(row->>'received_date','') is not null then
      select count(*),(array_agg(id))[1] into candidate_count,candidate_id
      from public.document_records d
      where d.received_date is null
        and d.register_no=coalesce(row->>'register_no','')
        and d.book_no=coalesce(row->>'book_no','')
        and d.document_date is not distinct from nullif(row->>'document_date','')::date
        and d.sender=coalesce(row->>'sender','') and d.subject=coalesce(row->>'subject','')
        and d.note=coalesce(row->>'note','');
      if candidate_count=1 then
        rec_id:=candidate_id;
        select to_jsonb(d) into before_record from public.document_records d where d.id=rec_id for update;
        insert into public.source_records(document_id,source_system,fingerprint,source_payload,import_batch_id)
        values(rec_id,source_name,fp,row,p_batch_id) returning id into src_id;
        insert into public.data_conflicts(document_id,source_record_id,conflict_type,before_value,proposed_value)
        values(rec_id,src_id,'missing_received_date',before_record,new_record);
        update public.document_records set status='review' where id=rec_id;
        review:=review+1; continue;
      elsif candidate_count>1 then
        raise exception 'ambiguous received-date match; row requires manual review';
      end if;
    end if;

    select id into rec_id from public.document_records
    where register_no=coalesce(row->>'register_no','') and book_no=coalesce(row->>'book_no','')
      and received_date is not distinct from nullif(row->>'received_date','')::date
      and sender=coalesce(row->>'sender','') and subject=coalesce(row->>'subject','') limit 1;
    if rec_id is null then
      insert into public.document_records(register_no,book_no,document_date,sender,subject,received_date,note)
      values(coalesce(row->>'register_no',''),coalesce(row->>'book_no',''),nullif(row->>'document_date','')::date,coalesce(row->>'sender',''),coalesce(row->>'subject',''),nullif(row->>'received_date','')::date,coalesce(row->>'note','')) returning id into rec_id;
      added:=added+1;
    else
      select to_jsonb(d) into before_record from public.document_records d where d.id=rec_id;
      insert into public.data_conflicts(document_id,conflict_type,before_value,proposed_value)
      values(rec_id,'possible_duplicate',before_record,new_record);
      update public.document_records set status='review' where id=rec_id; review:=review+1;
    end if;
    insert into public.source_records(document_id,source_system,fingerprint,source_payload,import_batch_id)
    values(rec_id,source_name,fp,row,p_batch_id);
  end loop;
  update public.import_batches set status='completed',inserted_count=added,review_count=review,row_count=jsonb_array_length(p_records) where id=p_batch_id;
  insert into public.audit_logs(actor_id,action,table_name,record_id,after_value)
  values(auth.uid(),'import_completed','import_batches',p_batch_id,jsonb_build_object('added',added,'review',review,'unchanged',unchanged));
  return jsonb_build_object('added',added,'review',review,'unchanged',unchanged);
end $$;

create or replace function public.ingest_import_batch_from_source(p_batch_id uuid,p_records jsonb,p_source_system text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  row jsonb; fp text; rec_id uuid; src_id uuid; candidate_id uuid;
  candidate_count integer; added integer:=0; review integer:=0; unchanged integer:=0;
  source_name text:=p_source_system; new_record jsonb; before_record jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_records)<>'array' then raise exception 'invalid payload'; end if;
  perform 1 from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'batch not found'; end if;
  for row in select value from jsonb_array_elements(p_records) loop
    fp:=encode(extensions.digest(concat_ws('|',coalesce(row->>'register_no',''),coalesce(row->>'book_no',''),coalesce(row->>'document_date',''),coalesce(row->>'sender',''),coalesce(row->>'subject',''),coalesce(row->>'received_date',''),coalesce(row->>'note','')), 'sha256'),'hex');
    new_record:=jsonb_build_object('register_no',coalesce(row->>'register_no',''),'book_no',coalesce(row->>'book_no',''),'document_date',nullif(row->>'document_date',''),'sender',coalesce(row->>'sender',''),'subject',coalesce(row->>'subject',''),'received_date',nullif(row->>'received_date',''),'note',coalesce(row->>'note',''));
    select id,document_id into src_id,rec_id from public.source_records where source_system=source_name and fingerprint=fp limit 1;
    if src_id is not null then update public.source_records set last_seen_at=now(),import_batch_id=p_batch_id where id=src_id; unchanged:=unchanged+1; continue; end if;

    if nullif(row->>'received_date','') is not null then
      select count(*),(array_agg(id))[1] into candidate_count,candidate_id
      from public.document_records d
      where d.received_date is null and d.register_no=coalesce(row->>'register_no','')
        and d.book_no=coalesce(row->>'book_no','')
        and d.document_date is not distinct from nullif(row->>'document_date','')::date
        and d.sender=coalesce(row->>'sender','') and d.subject=coalesce(row->>'subject','')
        and d.note=coalesce(row->>'note','');
      if candidate_count=1 then
        rec_id:=candidate_id;
        select to_jsonb(d) into before_record from public.document_records d where d.id=rec_id for update;
        insert into public.source_records(document_id,source_system,fingerprint,source_payload,import_batch_id)
        values(rec_id,source_name,fp,row,p_batch_id) returning id into src_id;
        insert into public.data_conflicts(document_id,source_record_id,conflict_type,before_value,proposed_value)
        values(rec_id,src_id,'missing_received_date',before_record,new_record);
        update public.document_records set status='review' where id=rec_id;
        review:=review+1; continue;
      elsif candidate_count>1 then
        raise exception 'ambiguous received-date match; row requires manual review';
      end if;
    end if;

    select id into rec_id from public.document_records where register_no=coalesce(row->>'register_no','')
      and book_no=coalesce(row->>'book_no','') and received_date is not distinct from nullif(row->>'received_date','')::date
      and sender=coalesce(row->>'sender','') and subject=coalesce(row->>'subject','') limit 1;
    if rec_id is null then
      insert into public.document_records(register_no,book_no,document_date,sender,subject,received_date,note)
      values(coalesce(row->>'register_no',''),coalesce(row->>'book_no',''),nullif(row->>'document_date','')::date,coalesce(row->>'sender',''),coalesce(row->>'subject',''),nullif(row->>'received_date','')::date,coalesce(row->>'note','')) returning id into rec_id;
      added:=added+1;
    else
      select to_jsonb(d) into before_record from public.document_records d where d.id=rec_id;
      insert into public.data_conflicts(document_id,conflict_type,before_value,proposed_value)
      values(rec_id,'possible_duplicate',before_record,new_record);
      update public.document_records set status='review' where id=rec_id; review:=review+1;
    end if;
    insert into public.source_records(document_id,source_system,fingerprint,source_payload,import_batch_id)
    values(rec_id,source_name,fp,row,p_batch_id);
  end loop;
  update public.import_batches set status='completed',inserted_count=added,review_count=review,row_count=jsonb_array_length(p_records) where id=p_batch_id;
  insert into public.audit_logs(actor_id,action,table_name,record_id,after_value)
  values(auth.uid(),'import_completed','import_batches',p_batch_id,jsonb_build_object('added',added,'review',review,'unchanged',unchanged));
  return jsonb_build_object('added',added,'review',review,'unchanged',unchanged);
end $$;

create or replace function public.resolve_received_date_conflict(p_conflict_id uuid,p_approve boolean)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.data_conflicts%rowtype; d public.document_records%rowtype; received date;
begin
  if public.current_role()<>'Administrator' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into c from public.data_conflicts where id=p_conflict_id and conflict_type='missing_received_date' for update;
  if not found or c.status<>'pending' then raise exception 'conflict not found or already reviewed'; end if;
  select * into d from public.document_records where id=c.document_id for update;
  if not found then raise exception 'document not found'; end if;
  if p_approve then
    received:=nullif(c.proposed_value->>'received_date','')::date;
    if received is null then raise exception 'proposed received date is invalid'; end if;
    if d.received_date is not null then raise exception 'record already has a received date; resolve manually'; end if;
    update public.document_records set received_date=received,status='active',updated_at=now() where id=d.id;
    update public.data_conflicts set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=c.id;
    insert into public.audit_logs(actor_id,action,table_name,record_id,before_value,after_value)
    values(auth.uid(),'received_date_approved','document_records',d.id,to_jsonb(d),to_jsonb(d)||jsonb_build_object('received_date',received,'status','active'));
  else
    update public.data_conflicts set status='rejected',reviewed_by=auth.uid(),reviewed_at=now() where id=c.id;
    update public.document_records set status='active',updated_at=now() where id=d.id and status='review'
      and not exists(select 1 from public.data_conflicts other where other.document_id=d.id and other.status='pending' and other.id<>c.id);
    insert into public.audit_logs(actor_id,action,table_name,record_id,before_value,after_value)
    values(auth.uid(),'received_date_rejected','document_records',d.id,to_jsonb(d),jsonb_build_object('conflict_id',c.id,'decision','rejected'));
  end if;
  return jsonb_build_object('ok',true,'status',case when p_approve then 'approved' else 'rejected' end);
end $$;
revoke all on function public.resolve_received_date_conflict(uuid,boolean) from public;
grant execute on function public.resolve_received_date_conflict(uuid,boolean) to authenticated;

