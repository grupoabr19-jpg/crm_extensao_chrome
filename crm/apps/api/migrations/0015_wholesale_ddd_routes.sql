-- Cobertura do atacado por DDD e cidade-polo.

update users u
set email='wilson.neto@grupoabr.com.br',display_name='Wilson Neto',status='active'
where lower(u.email)='wilson.bueno@grupoabr.com.br'
  and not exists (
    select 1 from users candidate
    where candidate.organization_id=u.organization_id
      and lower(candidate.email)='wilson.neto@grupoabr.com.br'
  );

update users
set display_name='Wilson Neto',status='active'
where lower(email)='wilson.neto@grupoabr.com.br';

update seller_profiles sp
set profile_title='Atacado - DDD 14, 16, 17 e 18',
    whatsapp_e164='+553599166203',
    active=true
from users u
where u.id=sp.user_id
  and lower(u.email)='wilson.neto@grupoabr.com.br';

update whatsapp_accounts
set label='Wilson Neto',active=true
where e164='+553599166203';

-- Remove a classificacao provisoria usada antes da divisao oficial por DDD.
update seller_routes sr
set active=false
from seller_profiles sp
join users u on u.id=sp.user_id
where sr.profile_id=sp.id
  and lower(u.email)='wilson.neto@grupoabr.com.br'
  and sr.channel='atacado'
  and sr.route_type='region';

create temp table wholesale_route_seed (
  email text not null,
  ddd text not null,
  pole text not null,
  priority int not null default 10
) on commit drop;

insert into wholesale_route_seed(email,ddd,pole,priority) values
  ('larissa.terra@grupoabr.com.br','11','SAO PAULO',10),
  ('larissa.terra@grupoabr.com.br','12','SAO JOSE DOS CAMPOS',10),
  ('larissa.terra@grupoabr.com.br','13','SANTOS',10),
  ('julio.melo@grupoabr.com.br','15','SOROCABA',10),
  ('julio.melo@grupoabr.com.br','19','CAMPINAS',10),
  ('wilson.neto@grupoabr.com.br','14','BAURU',10),
  ('wilson.neto@grupoabr.com.br','16','RIBEIRAO PRETO',10),
  ('wilson.neto@grupoabr.com.br','17','SAO JOSE DO RIO PRETO',10),
  ('wilson.neto@grupoabr.com.br','18','PRESIDENTE PRUDENTE',10);

with org as (
  select id from organizations order by created_at limit 1
)
insert into seller_routes(organization_id,profile_id,channel,sales_function,route_type,route_value,region,priority,active)
select org.id,sp.id,'atacado','vendedor_externo','ddd',r.ddd,r.pole,r.priority,true
from org
join wholesale_route_seed r on true
join users u on u.organization_id=org.id and lower(u.email)=lower(r.email)
join seller_profiles sp on sp.organization_id=org.id and sp.user_id=u.id
where not exists (
  select 1 from seller_routes sr
  where sr.organization_id=org.id
    and sr.profile_id=sp.id
    and sr.channel='atacado'
    and sr.sales_function='vendedor_externo'
    and sr.route_type='ddd'
    and sr.route_value=r.ddd
);

update seller_routes sr
set region=r.pole,priority=r.priority,active=true
from seller_profiles sp
join users u on u.id=sp.user_id
join wholesale_route_seed r on lower(r.email)=lower(u.email)
where sr.profile_id=sp.id
  and sr.channel='atacado'
  and sr.sales_function='vendedor_externo'
  and sr.route_type='ddd'
  and sr.route_value=r.ddd;
