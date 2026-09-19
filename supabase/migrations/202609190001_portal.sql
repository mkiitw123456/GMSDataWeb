-- All application data is private. Only authenticated Edge Functions may query it.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id), name text not null check(length(name) between 1 and 60),
 role text not null default 'member' check(role in ('owner','member')), enabled boolean not null default true
);
create table public.experience_versions (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 60), created_at timestamptz not null default now());
create table public.experience_levels (version_id uuid not null references public.experience_versions, level integer not null check(level between 1 and 1000), exp numeric(25,0) not null check(exp>0), primary key(version_id,level));
create table public.licenses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles,
 code_hash text not null unique, suffix text not null, enabled boolean not null default true,
 public_key text, machine_hash text, generation integer not null default 0,
 created_at timestamptz not null default now(), last_seen timestamptz
);
create index licenses_user_idx on public.licenses(user_id);
create table public.challenges(id uuid primary key default gen_random_uuid(), license_id uuid not null references public.licenses, nonce text not null, expires_at timestamptz not null default now()+interval '2 minutes');
create index challenges_expiry_idx on public.challenges(expires_at);
create table public.device_sessions(token_hash text primary key,license_id uuid not null references public.licenses,generation integer not null, expires_at timestamptz not null default now()+interval '15 minutes');
create index device_sessions_expiry_idx on public.device_sessions(expires_at);
create index device_sessions_license_idx on public.device_sessions(license_id);
create table public.security_events(id bigint generated always as identity primary key, created_at timestamptz not null default now(),actor_id uuid, license_id uuid, kind text not null, detail text not null default '');
create index security_events_license_time on public.security_events(license_id,created_at desc);
create table public.api_limits(key text primary key,bucket timestamptz not null,hits integer not null);
create table public.sessions (
 id uuid primary key, user_id uuid not null references public.profiles, map text not null check(length(map) between 1 and 100),
 profession text not null check(length(profession) between 1 and 60), seconds numeric(12,3) not null check(seconds>0 and seconds<=2678400),
 start_level integer not null check(start_level between 1 and 1000), end_level integer not null check(end_level between 1 and 1000),
 start_percent numeric(10,6) not null check(start_percent>=0 and start_percent<100), end_percent numeric(10,6) not null check(end_percent>=0 and end_percent<100),
 start_mesos numeric(25,0) not null check(start_mesos>=0), end_mesos numeric(25,0) not null check(end_mesos>=0),
 exp numeric(35,6) not null, mesos numeric(25,0) generated always as (end_mesos-start_mesos) stored,
 version_id uuid not null references public.experience_versions, notes text not null default '' check(length(notes)<=2000),
 ended_at timestamptz not null default now(), payload_hash text not null
);
create index sessions_map_time_idx on public.sessions(map,ended_at desc,id);
create index sessions_user_idx on public.sessions(user_id);
create table public.session_items(session_id uuid not null references public.sessions, item_id uuid not null, name text not null check(length(name) between 1 and 80), start_count numeric(25,0) not null check(start_count>=0), end_count numeric(25,0) not null check(end_count>=0), delta numeric(25,0) generated always as (end_count-start_count) stored,primary key(session_id,item_id),unique(session_id,name));
create table public.map_totals(map text primary key, count bigint not null, seconds numeric not null,exp numeric not null,mesos numeric not null);

-- No browser SELECT policies: private data is returned only after API authorization.
do $$ declare t text; begin
 foreach t in array array['profiles','experience_versions','experience_levels','licenses','challenges','device_sessions','security_events','api_limits','sessions','session_items','map_totals'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.security_events_id_seq to service_role;

create function public.portal_limit(p_key text,p_max integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; begin
 insert into public.api_limits values(p_key,date_trunc('minute',now()),1)
 on conflict(key) do update set bucket=excluded.bucket,hits=case when api_limits.bucket=excluded.bucket then api_limits.hits+1 else 1 end returning hits into n;
 return n<=p_max;
end $$;

create function public.bind_license(p_hash text,p_key text,p_machine text) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.licenses; begin
 select * into l from public.licenses where code_hash=p_hash for update;
 if not found or not l.enabled then return jsonb_build_object('error','授權碼無效或已停用');end if;
 if not exists(select 1 from public.profiles where id=l.user_id and enabled) then return jsonb_build_object('error','帳號已停用');end if;
 if l.public_key is not null and (l.public_key<>p_key or l.machine_hash<>p_machine) then
   insert into public.security_events(license_id,kind) values(l.id,'device_mismatch');
   return jsonb_build_object('error','此授權碼已綁定其他設備','license_id',l.id);
 end if;
 update public.licenses set public_key=p_key,machine_hash=p_machine,last_seen=now() where id=l.id;
 return jsonb_build_object('license_id',l.id);
end $$;

create function public.issue_device_session(p_challenge uuid,p_license uuid,p_generation integer,p_token text) returns boolean language plpgsql security definer set search_path='' as $$
declare l public.licenses; begin
 select * into l from public.licenses where id=p_license for update;
 if not found or not l.enabled or l.generation<>p_generation or not exists(select 1 from public.profiles where id=l.user_id and enabled) then return false;end if;
 delete from public.challenges where id=p_challenge and license_id=p_license and expires_at>now();
 if not found then return false;end if;
 insert into public.device_sessions(token_hash,license_id,generation) values(p_token,p_license,p_generation);
 update public.licenses set last_seen=now() where id=p_license;
 delete from public.challenges where expires_at<now(); delete from public.device_sessions where expires_at<now();
 delete from public.api_limits where bucket<now()-interval '1 day';
 delete from public.security_events where created_at<now()-interval '90 days';
 return true;
end $$;

create function public.unbind_license(p_id uuid,p_actor uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.licenses set public_key=null,machine_hash=null,generation=generation+1 where id=p_id;
 delete from public.device_sessions where license_id=p_id;delete from public.challenges where license_id=p_id;
 insert into public.security_events(actor_id,license_id,kind,detail) values(p_actor,p_id,'unbind',left(p_reason,300));
end $$;

create function public.save_experience(p_name text,p_levels jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid; begin
 if jsonb_typeof(p_levels)<>'object' or (select count(*) from jsonb_object_keys(p_levels)) not between 1 and 1000 then raise exception '經驗表格式無效';end if;
 insert into public.experience_versions(name) values(p_name) returning id into v;
 insert into public.experience_levels select v,key::integer,value::numeric from jsonb_each_text(p_levels);
 if (select max(level)-min(level)+1<>count(*) from public.experience_levels where version_id=v) then raise exception '等級不可缺號';end if;
 return v;
end $$;

create function public.submit_session(p_user uuid,p jsonb,p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p->>'id')::uuid; old public.sessions; a int:=(p->>'start_level')::int;b int:=(p->>'end_level')::int;v uuid:=(p->>'version_id')::uuid; e numeric:=0;ea numeric;eb numeric;level_count int;item jsonb;row public.sessions;
begin
 -- Serialize retries of the same UUID; a changed payload is never silently accepted.
 perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
 select * into old from public.sessions where id=sid;
 if found then if old.user_id<>p_user or old.payload_hash<>p_hash then raise exception '紀錄識別碼衝突';end if;return sid;end if;
 if not exists(select 1 from public.profiles where id=p_user and enabled) then raise exception '帳號不可用';end if;
 if jsonb_typeof(p->'items')<>'array' or jsonb_array_length(p->'items')>100 then raise exception '道具列表無效';end if;
 select count(*),sum(case when level<greatest(a,b) then exp else 0 end) into level_count,e from public.experience_levels where version_id=v and level between least(a,b) and greatest(a,b);
 if level_count<>abs(b-a)+1 then raise exception '缺少跨級所需經驗表';end if;
 select exp into ea from public.experience_levels where version_id=v and level=a;
 select exp into eb from public.experience_levels where version_id=v and level=b;
 if b<a then e:=-e;end if;e:=e+eb*(p->>'end_percent')::numeric/100-ea*(p->>'start_percent')::numeric/100;
 insert into public.sessions(id,user_id,map,profession,seconds,start_level,end_level,start_percent,end_percent,start_mesos,end_mesos,exp,version_id,notes,payload_hash)
 values(sid,p_user,trim(p->>'map'),trim(p->>'profession'),(p->>'seconds')::numeric,a,b,(p->>'start_percent')::numeric,(p->>'end_percent')::numeric,(p->>'start_mesos')::numeric,(p->>'end_mesos')::numeric,e,v,coalesce(p->>'notes',''),p_hash) returning * into row;
 for item in select * from jsonb_array_elements(p->'items') loop
 insert into public.session_items(session_id,item_id,name,start_count,end_count) values(sid,(item->>'id')::uuid,trim(item->>'name'),(item->>'start')::numeric,(item->>'end')::numeric);
 end loop;
 insert into public.map_totals values(row.map,1,row.seconds,row.exp,row.mesos) on conflict(map) do update set count=map_totals.count+1,seconds=map_totals.seconds+excluded.seconds,exp=map_totals.exp+excluded.exp,mesos=map_totals.mesos+excluded.mesos;
 return sid;
end $$;
-- Preserve arbitrary-size numeric JSON values as strings, never JS floating point.
create view public.portal_summaries as select map,count,seconds::double precision,exp::text,mesos::text from public.map_totals;
create view public.portal_sessions as select s.id,s.map,s.profession,s.end_level,s.ended_at,s.seconds::double precision,s.exp::text,s.mesos::text,s.notes,coalesce((select jsonb_agg(jsonb_build_object('name',i.name,'delta',i.delta::text)) from public.session_items i where i.session_id=s.id),'[]'::jsonb) items from public.sessions s;
revoke all on public.portal_summaries,public.portal_sessions from anon,authenticated;
grant select on public.portal_summaries,public.portal_sessions to service_role;
do $$ declare r record; begin for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('portal_limit','bind_license','issue_device_session','unbind_license','save_experience','submit_session') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);execute format('grant execute on function %s to service_role',r.signature);end loop;end $$;
commit;
