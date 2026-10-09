-- Operador unico da IA e conta principal do WhatsApp ABR.

with org as (
  select id from organizations order by created_at limit 1
), thiago as (
  select u.id, u.organization_id
  from users u
  join org on org.id=u.organization_id
  where lower(u.email)=lower('thiago.almeida@grupoabr.com.br')
  limit 1
), account as (
  insert into whatsapp_accounts(organization_id,e164,label,kind,active)
  select org.id, '+5535997709232', 'Thiago Almeida - IA ABR', 'main', true
  from org
  on conflict (organization_id,e164) do update
    set label=excluded.label,
        kind='main',
        active=true
  returning id, organization_id
)
insert into user_account_bindings(organization_id,user_id,account_id,verified_at)
select account.organization_id, thiago.id, account.id, now()
from account
join thiago on thiago.organization_id=account.organization_id
where not exists (
  select 1
  from user_account_bindings b
  where b.account_id=account.id
    and b.revoked_at is null
);

with org as (
  select id from organizations order by created_at limit 1
), thiago as (
  select u.id, u.organization_id
  from users u
  join org on org.id=u.organization_id
  where lower(u.email)=lower('thiago.almeida@grupoabr.com.br')
  limit 1
)
insert into seller_profiles(organization_id,user_id,profile_title,sales_function,whatsapp_e164,active)
select thiago.organization_id, thiago.id, 'ADM - SDR / Operador IA', 'adm_sdr', '+5535997709232', true
from thiago
on conflict (organization_id,user_id) do update
  set profile_title='ADM - SDR / Operador IA',
      sales_function='adm_sdr',
      whatsapp_e164='+5535997709232',
      active=true;
