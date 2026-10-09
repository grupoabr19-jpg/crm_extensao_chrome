-- Garante supervisores principais ativos sem sobrescrever senhas existentes.

create extension if not exists pgcrypto;

with org as (
  select id from organizations order by created_at limit 1
), supervisors(login, display_name) as (
  values
    ('pietra.leite', 'Pietra Leite'),
    ('marcelo.silva', 'Marcelo Silva'),
    ('rafael.pereira', 'Rafael Pereira')
), upsert_users as (
  insert into users(organization_id, email, display_name, role, password_hash, status)
  select org.id, supervisors.login || '@grupoabr.com.br', supervisors.display_name, 'supervisor', crypt('ABR@2026', gen_salt('bf')), 'active'
  from org cross join supervisors
  on conflict (organization_id, lower(email)) do update
    set display_name=excluded.display_name,
        role='supervisor',
        status='active',
        password_hash=coalesce(users.password_hash, excluded.password_hash)
  returning id, organization_id, email
)
insert into seller_profiles(organization_id, user_id, profile_title, sales_function, active)
select organization_id, id, 'Supervisor', 'adm_sdr', true
from upsert_users
on conflict (organization_id, user_id) do update
  set profile_title='Supervisor',
      sales_function='adm_sdr',
      active=true;
