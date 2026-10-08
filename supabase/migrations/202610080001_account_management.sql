begin;

-- Nullable for existing email users: do not rename or reset existing accounts.
alter table public.profiles add column username text;
alter table public.profiles add constraint profiles_username_length
  check (username is null or (length(username) between 1 and 40 and username = lower(username)));
create unique index profiles_username_unique on public.profiles(username) where username is not null;
create index challenges_license_idx on public.challenges(license_id);

-- Same row lock as bind_license / issue_device_session prevents a session
-- from being issued concurrently with deletion. Historical statistics survive.
create function public.delete_license(p_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare l public.licenses;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='owner' and enabled) then
    raise exception '只有擁有者可刪除授權碼';
  end if;
  select * into l from public.licenses where id=p_id for update;
  if not found then raise exception '授權碼不存在或已刪除'; end if;
  delete from public.device_sessions where license_id=p_id;
  delete from public.challenges where license_id=p_id;
  delete from public.licenses where id=p_id;
  insert into public.security_events(actor_id,license_id,kind,detail)
    values(p_actor,p_id,'delete_license','授權碼末碼 ' || l.suffix || ' 已刪除；設備連線已撤銷');
end $$;
revoke all on function public.delete_license(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_license(uuid,uuid) to service_role;
commit;
