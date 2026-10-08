-- Cadastro comercial ABR: perfis, funcoes e rotas de atendimento.

create table if not exists seller_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  profile_title text not null,
  sales_function text not null check (sales_function in ('adm_sdr','vendedor_externo','especialista','corporativo','construcao_civil')),
  whatsapp_e164 text check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+[0-9]{8,15}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists seller_profiles_function on seller_profiles (organization_id, sales_function, active);

create table if not exists seller_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  profile_id uuid not null references seller_profiles(id),
  channel text not null check (channel in ('varejo','atacado')),
  sales_function text not null check (sales_function in ('vendedor_externo','especialista','corporativo','construcao_civil')),
  route_type text not null check (route_type in ('region','city','ddd')),
  route_value text not null,
  region text,
  priority int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists seller_routes_lookup on seller_routes (organization_id, channel, sales_function, route_type, lower(route_value), active);

with org as (
  select id from organizations order by created_at limit 1
), seed_users(email, display_name, app_role, profile_title, sales_function) as (
  values
    ('thiago.almeida@grupoabr.com.br','Thiago Almeida','admin','ADM - SDR','adm_sdr'),
    ('alessandro@abr.local','ALESSANDRO','seller','Vendedor externo','vendedor_externo'),
    ('dyovana@abr.local','DYOVANA','seller','Vendedor externo','vendedor_externo'),
    ('peterson@abr.local','PETERSON','seller','Vendedor externo','vendedor_externo'),
    ('paola@abr.local','PAOLA','seller','Vendedor externo','vendedor_externo'),
    ('jose.felipe@abr.local','JOSE FELIPE','seller','Vendedor externo','vendedor_externo'),
    ('jennifer@abr.local','JENNIFER','seller','Vendedor externo','vendedor_externo'),
    ('gustavo@abr.local','GUSTAVO','seller','Vendedor externo','vendedor_externo'),
    ('juliano@abr.local','JULIANO','seller','Vendedor externo','vendedor_externo'),
    ('leiz@abr.local','LEIZ','seller','Especialista','especialista'),
    ('josiane.frazao@abr.local','JOSIANE FRAZAO','seller','Especialista','especialista'),
    ('bruna@abr.local','BRUNA','seller','Especialista','especialista'),
    ('rafaela@abr.local','RAFAELA','seller','Especialista','especialista'),
    ('milena@abr.local','MILENA','seller','Especialista','especialista'),
    ('gabriela@abr.local','GABRIELA','seller','Especialista','especialista'),
    ('inayara@abr.local','INAYARA','seller','Especialista','especialista'),
    ('edmila@abr.local','EDMILA','seller','Especialista','especialista'),
    ('heloa@abr.local','HELOA','seller','Corporativo','corporativo'),
    ('kaylane@abr.local','KAYLANE','seller','Corporativo','corporativo'),
    ('thais@abr.local','THAIS','seller','Corporativo','corporativo'),
    ('vitoria@abr.local','VITORIA','seller','Corporativo','corporativo'),
    ('camila.guimenti@abr.local','CAMILA GUIMENTI','seller','Corporativo','corporativo'),
    ('jessica.s@abr.local','JESSICA.S','seller','Corporativo','corporativo'),
    ('tainara@abr.local','TAINARA','seller','Corporativo','corporativo'),
    ('matheus.teixeira@abr.local','MATHEUS TEIXEIRA','seller','Corporativo','corporativo'),
    ('ariane@abr.local','ARIANE','seller','Construcao civil','construcao_civil'),
    ('larissa.terra@abr.local','LARISSA TERRA','seller','Vendedor externo atacado','vendedor_externo'),
    ('julio.melo@abr.local','JULIO MELO','seller','Vendedor externo atacado','vendedor_externo'),
    ('wilson.neto@abr.local','WILSON NETO','seller','Vendedor externo atacado','vendedor_externo')
), upsert_users as (
  insert into users(organization_id, email, display_name, role)
  select org.id, seed_users.email, seed_users.display_name, seed_users.app_role
  from org cross join seed_users
  on conflict (organization_id, lower(email)) do update
    set display_name=excluded.display_name,
        role=excluded.role,
        status='active'
  returning id, organization_id, email
)
insert into seller_profiles(organization_id, user_id, profile_title, sales_function)
select u.organization_id, u.id, s.profile_title, s.sales_function
from upsert_users u
join seed_users s on lower(s.email)=lower(u.email)
on conflict (organization_id, user_id) do update
  set profile_title=excluded.profile_title,
      sales_function=excluded.sales_function,
      active=true;

with org as (
  select id from organizations order by created_at limit 1
), routes(email, channel, sales_function, route_type, route_value, region, priority) as (
  values
    ('alessandro@abr.local','varejo','vendedor_externo','region','BRAGANCA','BRAGANCA',10),
    ('dyovana@abr.local','varejo','vendedor_externo','region','JUNDIAI','JUNDIAI',10),
    ('peterson@abr.local','varejo','vendedor_externo','region','VARGINHA','VARGINHA',10),
    ('paola@abr.local','varejo','vendedor_externo','region','POUSO ALEGRE','POUSO ALEGRE',10),
    ('jose.felipe@abr.local','varejo','vendedor_externo','region','POCOS DE CALDAS','POCOS DE CALDAS',10),
    ('jennifer@abr.local','varejo','vendedor_externo','region','ITAJUBA','ITAJUBA',10),
    ('gustavo@abr.local','varejo','vendedor_externo','region','EXTREMA','EXTREMA',10),
    ('juliano@abr.local','varejo','vendedor_externo','region','CAMBUI','CAMBUI',10),
    ('leiz@abr.local','varejo','especialista','region','BRAGANCA','BRAGANCA',10),
    ('josiane.frazao@abr.local','varejo','especialista','region','JUNDIAI','JUNDIAI',10),
    ('bruna@abr.local','varejo','especialista','region','VARGINHA','VARGINHA',10),
    ('rafaela@abr.local','varejo','especialista','region','POUSO ALEGRE','POUSO ALEGRE',10),
    ('milena@abr.local','varejo','especialista','region','POCOS DE CALDAS','POCOS DE CALDAS',10),
    ('gabriela@abr.local','varejo','especialista','region','ITAJUBA','ITAJUBA',10),
    ('inayara@abr.local','varejo','especialista','region','EXTREMA','EXTREMA',10),
    ('edmila@abr.local','varejo','especialista','region','CAMBUI','CAMBUI',10),
    ('heloa@abr.local','varejo','corporativo','region','BRAGANCA','BRAGANCA',10),
    ('kaylane@abr.local','varejo','corporativo','region','JUNDIAI','JUNDIAI',10),
    ('thais@abr.local','varejo','corporativo','region','VARGINHA','VARGINHA',10),
    ('vitoria@abr.local','varejo','corporativo','region','POUSO ALEGRE','POUSO ALEGRE',10),
    ('camila.guimenti@abr.local','varejo','corporativo','region','POCOS DE CALDAS','POCOS DE CALDAS',10),
    ('jessica.s@abr.local','varejo','corporativo','region','ITAJUBA','ITAJUBA',10),
    ('tainara@abr.local','varejo','corporativo','region','EXTREMA','EXTREMA',10),
    ('matheus.teixeira@abr.local','varejo','corporativo','region','CAMBUI','CAMBUI',10),
    ('ariane@abr.local','varejo','construcao_civil','region','CAMBUI','CAMBUI',10),
    ('larissa.terra@abr.local','atacado','vendedor_externo','ddd','11','SP DDD 11',10),
    ('larissa.terra@abr.local','atacado','vendedor_externo','ddd','12','SP DDD 12',10),
    ('larissa.terra@abr.local','atacado','vendedor_externo','ddd','13','SP DDD 13',10),
    ('julio.melo@abr.local','atacado','vendedor_externo','ddd','15','SP DDD 15',10),
    ('julio.melo@abr.local','atacado','vendedor_externo','ddd','19','SP DDD 19',10),
    ('wilson.neto@abr.local','atacado','vendedor_externo','ddd','14','SP DDD 14',10),
    ('wilson.neto@abr.local','atacado','vendedor_externo','ddd','16','SP DDD 16',10),
    ('wilson.neto@abr.local','atacado','vendedor_externo','ddd','17','SP DDD 17',10),
    ('wilson.neto@abr.local','atacado','vendedor_externo','ddd','18','SP DDD 18',10)
)
insert into seller_routes(organization_id, profile_id, channel, sales_function, route_type, route_value, region, priority)
select org.id, sp.id, r.channel, r.sales_function, r.route_type, r.route_value, r.region, r.priority
from org
join users u on u.organization_id=org.id
join seller_profiles sp on sp.user_id=u.id
join routes r on lower(r.email)=lower(u.email)
where not exists (
  select 1 from seller_routes sr
  where sr.organization_id=org.id
    and sr.profile_id=sp.id
    and sr.channel=r.channel
    and sr.sales_function=r.sales_function
    and sr.route_type=r.route_type
    and lower(sr.route_value)=lower(r.route_value)
);
