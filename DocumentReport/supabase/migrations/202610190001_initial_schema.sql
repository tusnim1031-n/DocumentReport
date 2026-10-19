create extension if not exists pgcrypto;
create type public.app_role as enum ('Administrator','Officer','Viewer');
create type public.record_status as enum ('active','review','merged','archived');
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, display_name text not null default '', role public.app_role, created_at timestamptz not null default now());
create table public.document_records(id uuid primary key default gen_random_uuid(), register_no text not null default '', book_no text not null default '', document_date date, sender text not null default '', subject text not null default '', received_date date, note text not null default '', status public.record_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index document_records_received_idx on public.document_records(received_date desc);
create index document_records_register_idx on public.document_records(register_no);
create table public.sync_jobs(id uuid primary key default gen_random_uuid(), source_system text not null, started_at timestamptz not null default now(), finished_at timestamptz, status text not null check(status in ('running','success','partial','failed')), rows_read int not null default 0, rows_added int not null default 0, rows_changed int not null default 0, rows_unchanged int not null default 0, rows_duplicate int not null default 0, rows_error int not null default 0, before_count int not null default 0, after_count int not null default 0, details jsonb not null default '{}'::jsonb, started_by uuid references auth.users(id));
create unique index sync_jobs_single_running on public.sync_jobs((status)) where status='running';
create table public.import_batches(id uuid primary key default gen_random_uuid(), filename text not null, uploaded_by uuid not null references auth.users(id), uploaded_at timestamptz not null default now(), status text not null default 'uploaded', row_count int not null default 0, inserted_count int not null default 0, review_count int not null default 0, headers jsonb not null default '[]', issues jsonb not null default '[]', missing_note_column boolean not null default false);
create table public.source_records(id uuid primary key default gen_random_uuid(), document_id uuid references public.document_records(id), source_system text not null, source_record_id text, fingerprint text not null, source_payload jsonb not null default '{}', last_seen_at timestamptz not null default now(), import_batch_id uuid references public.import_batches(id), created_at timestamptz not null default now(), unique(source_system,source_record_id));
create index source_records_fingerprint_idx on public.source_records(fingerprint);
create table public.data_conflicts(id uuid primary key default gen_random_uuid(), document_id uuid references public.document_records(id), source_record_id uuid references public.source_records(id), conflict_type text not null, before_value jsonb not null, proposed_value jsonb not null, status text not null default 'pending' check(status in ('pending','approved','rejected','merged')), reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id), action text not null, table_name text not null, record_id uuid, before_value jsonb, after_value jsonb, created_at timestamptz not null default now());
create table public.source_settings(id boolean primary key default true check(id), primary_source text not null default 'file', secondary_source text default 'google_sheets', google_sheet_gid text default '1739027634', schedule_cron text, scheduler_enabled boolean not null default false, updated_by uuid references auth.users(id), updated_at timestamptz not null default now());
insert into public.source_settings(id) values(true);
create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.current_role() in ('Administrator','Officer'),false) $$;
alter table public.profiles enable row level security; alter table public.document_records enable row level security; alter table public.source_records enable row level security; alter table public.sync_jobs enable row level security; alter table public.import_batches enable row level security; alter table public.data_conflicts enable row level security; alter table public.audit_logs enable row level security; alter table public.source_settings enable row level security;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated using(id=auth.uid() or public.current_role()='Administrator');
create policy profiles_admin_update on public.profiles for update to authenticated using(public.current_role()='Administrator') with check(public.current_role()='Administrator');
create policy documents_staff_read on public.document_records for select to authenticated using(public.current_role() is not null);
create policy documents_staff_write on public.document_records for all to authenticated using(public.is_staff()) with check(public.is_staff());
create policy sources_staff_read on public.source_records for select to authenticated using(public.current_role() is not null);
create policy sources_staff_write on public.source_records for all to authenticated using(public.current_role() in ('Administrator','Officer')) with check(public.current_role() in ('Administrator','Officer'));
create policy sync_admin_read on public.sync_jobs for select to authenticated using(public.current_role()='Administrator');
create policy sync_admin_write on public.sync_jobs for all to authenticated using(public.current_role()='Administrator') with check(public.current_role()='Administrator');
create policy batches_staff_read on public.import_batches for select to authenticated using(public.current_role() in ('Administrator','Officer'));
create policy batches_staff_insert on public.import_batches for insert to authenticated with check(public.current_role() in ('Administrator','Officer') and uploaded_by=auth.uid());
create policy batches_staff_update on public.import_batches for update to authenticated using(public.current_role() in ('Administrator','Officer')) with check(public.current_role() in ('Administrator','Officer'));
create policy conflicts_staff_read on public.data_conflicts for select to authenticated using(public.current_role() in ('Administrator','Officer'));
create policy conflicts_staff_insert on public.data_conflicts for insert to authenticated with check(public.current_role() in ('Administrator','Officer'));
create policy conflicts_admin_update on public.data_conflicts for update to authenticated using(public.current_role()='Administrator') with check(public.current_role()='Administrator');
create policy conflicts_admin_delete on public.data_conflicts for delete to authenticated using(public.current_role()='Administrator');
create policy audit_admin_read on public.audit_logs for select to authenticated using(public.current_role()='Administrator');
create policy audit_staff_insert on public.audit_logs for insert to authenticated with check(actor_id=auth.uid() and public.current_role() in ('Administrator','Officer'));
create policy settings_admin_all on public.source_settings for all to authenticated using(public.current_role()='Administrator') with check(public.current_role()='Administrator');
create or replace function public.ingest_import_batch(p_batch_id uuid,p_records jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare row jsonb; fp text; rec_id uuid; src_id uuid; added int:=0; review int:=0; unchanged int:=0; source_name text:='file'; new_record jsonb;
begin
 if not public.is_staff() then raise exception 'forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_records)<>'array' then raise exception 'invalid payload'; end if;
 perform 1 from public.import_batches where id=p_batch_id for update;
 if not found then raise exception 'batch not found'; end if;
 for row in select value from jsonb_array_elements(p_records) loop
  fp:=encode(extensions.digest(concat_ws('|',coalesce(row->>'register_no',''),coalesce(row->>'book_no',''),coalesce(row->>'document_date',''),coalesce(row->>'sender',''),coalesce(row->>'subject',''),coalesce(row->>'received_date',''),coalesce(row->>'note','')), 'sha256'),'hex');
  new_record:=jsonb_build_object('register_no',coalesce(row->>'register_no',''),'book_no',coalesce(row->>'book_no',''),'document_date',nullif(row->>'document_date',''),'sender',coalesce(row->>'sender',''),'subject',coalesce(row->>'subject',''),'received_date',nullif(row->>'received_date',''),'note',coalesce(row->>'note',''));
  select id,document_id into src_id,rec_id from public.source_records where source_system=source_name and fingerprint=fp limit 1;
  if src_id is not null then unchanged:=unchanged+1; update public.source_records set last_seen_at=now(),import_batch_id=p_batch_id where id=src_id; continue; end if;
  select id into rec_id from public.document_records where register_no=coalesce(row->>'register_no','') and book_no=coalesce(row->>'book_no','') and received_date=nullif(row->>'received_date','')::date and sender=coalesce(row->>'sender','') and subject=coalesce(row->>'subject','') limit 1;
  if rec_id is null then
   insert into public.document_records(register_no,book_no,document_date,sender,subject,received_date,note) values(coalesce(row->>'register_no',''),coalesce(row->>'book_no',''),nullif(row->>'document_date','')::date,coalesce(row->>'sender',''),coalesce(row->>'subject',''),nullif(row->>'received_date','')::date,coalesce(row->>'note','')) returning id into rec_id; added:=added+1;
  else
   insert into public.data_conflicts(document_id,conflict_type,before_value,proposed_value) select rec_id,'possible_duplicate',to_jsonb(d),new_record from public.document_records d where d.id=rec_id;
   update public.document_records set status='review' where id=rec_id; review:=review+1;
  end if;
  insert into public.source_records(document_id,source_system,fingerprint,source_payload,import_batch_id) values(rec_id,source_name,fp,row,p_batch_id);
 end loop;
 update public.import_batches set status='completed',inserted_count=added,review_count=review,row_count=jsonb_array_length(p_records) where id=p_batch_id;
 insert into public.audit_logs(actor_id,action,table_name,record_id,after_value) values(auth.uid(),'import_completed','import_batches',p_batch_id,jsonb_build_object('added',added,'review',review,'unchanged',unchanged));
 return jsonb_build_object('added',added,'review',review,'unchanged',unchanged);
end $$;
revoke all on function public.ingest_import_batch(uuid,jsonb) from public; grant execute on function public.ingest_import_batch(uuid,jsonb) to authenticated;

