-- Usuarios reais e perfis comerciais iniciais.
-- Senha padrao solicitada: ABR@2026, gravada como hash via pgcrypto/crypt.

create extension if not exists pgcrypto;

with org as (
  select id from organizations order by created_at limit 1
), collaborators(login, display_name, app_role, profile_title, sales_function) as (
  values
    ('marcelo.silva','Marcelo Silva','supervisor','Supervisor','adm_sdr'),
    ('thiago.almeida','Thiago Almeida','admin','ADM - SDR','adm_sdr'),
    ('pietra.leite','Pietra Leite','supervisor','Supervisor','adm_sdr'),
    ('rafael.pereira','Rafael Pereira','supervisor','Supervisor','adm_sdr'),
    ('dyovana.silva','Dyovana Silva','seller','Vendedor externo','vendedor_externo'),
    ('milena.vaz','Milena Vaz','seller','VARE - Especialista','especialista'),
    ('bruna.pereira','Bruna Pereira','seller','VARE - Especialista','especialista'),
    ('rafaela.resende','Rafaela Resende','seller','VARE - Especialista','especialista'),
    ('camila.guimenti','Camila Guimenti','seller','VCORP - Corporativo','corporativo'),
    ('thais.oliveira','Thais Oliveira','seller','VCORP - Corporativo','corporativo'),
    ('josiane.lima','Josiane Lima','seller','VARE - Especialista','especialista'),
    ('leiz.torso','Leiz Torso','seller','VARE - Especialista','especialista'),
    ('jessica.santos','Jessica Santos','seller','VCORP - Corporativo','corporativo'),
    ('tainara.matilde','Tainara Matilde','seller','VCORP - Corporativo','corporativo'),
    ('inayara.cunha','Inayara Cunha','seller','VARE - Especialista','especialista'),
    ('gabriela.cunha','Gabriela Cunha','seller','VARE - Especialista','especialista'),
    ('larissa.terra','Larissa Terra','seller','VEXT - Atacado','vendedor_externo'),
    ('julio.melo','Julio Melo','seller','VEXT - Atacado','vendedor_externo'),
    ('ariane.souza','Ariane Souza','seller','Construcao civil','construcao_civil'),
    ('matheus.teixeira','Matheus Teixeira','seller','VCORP - Corporativo','corporativo'),
    ('juliano.pereira','Juliano Pereira','seller','Vendedor externo','vendedor_externo'),
    ('peterson.sexias','Peterson Sexias','seller','Vendedor externo','vendedor_externo'),
    ('jose.reis','Jose Reis','seller','Vendedor externo','vendedor_externo'),
    ('paola.santos','Paola Santos','seller','Vendedor externo','vendedor_externo'),
    ('jennifer.silva','Jennifer Silva','seller','Vendedor externo','vendedor_externo')
), upsert_users as (
  insert into users(organization_id, email, display_name, role, password_hash, status)
  select org.id, c.login || '@grupoabr.com.br', c.display_name, c.app_role, crypt('ABR@2026', gen_salt('bf')), 'active'
  from org cross join collaborators c
  on conflict (organization_id, lower(email)) do update
    set display_name=excluded.display_name,
        role=excluded.role,
        status='active',
        password_hash=coalesce(users.password_hash, excluded.password_hash)
  returning id, organization_id, email
)
insert into seller_profiles(organization_id, user_id, profile_title, sales_function, active)
select u.organization_id, u.id, c.profile_title, c.sales_function, true
from upsert_users u
join collaborators c on lower(u.email)=lower(c.login || '@grupoabr.com.br')
on conflict (organization_id, user_id) do update
  set profile_title=excluded.profile_title,
      sales_function=excluded.sales_function,
      active=true;

-- Desativa os perfis @abr.local usados no seed tecnico, preservando historico.
update seller_profiles sp
set active=false
from users u
where u.id=sp.user_id
  and u.email like '%@abr.local';

with org as (
  select id from organizations order by created_at limit 1
), routes(login, channel, sales_function, route_type, route_value, region, priority) as (
  values
    ('dyovana.silva','varejo','vendedor_externo','region','JUNDIAI','JUNDIAI',10),
    ('juliano.pereira','varejo','vendedor_externo','region','CAMBUI','CAMBUI',10),
    ('peterson.sexias','varejo','vendedor_externo','region','VARGINHA','VARGINHA',10),
    ('jose.reis','varejo','vendedor_externo','region','POCOS DE CALDAS','POCOS DE CALDAS',10),
    ('paola.santos','varejo','vendedor_externo','region','POUSO ALEGRE','POUSO ALEGRE',10),
    ('jennifer.silva','varejo','vendedor_externo','region','ITAJUBA','ITAJUBA',10),
    ('leiz.torso','varejo','especialista','region','BRAGANCA','BRAGANCA',10),
    ('josiane.lima','varejo','especialista','region','JUNDIAI','JUNDIAI',10),
    ('bruna.pereira','varejo','especialista','region','VARGINHA','VARGINHA',10),
    ('rafaela.resende','varejo','especialista','region','POUSO ALEGRE','POUSO ALEGRE',10),
    ('milena.vaz','varejo','especialista','region','POCOS DE CALDAS','POCOS DE CALDAS',10),
    ('gabriela.cunha','varejo','especialista','region','ITAJUBA','ITAJUBA',10),
    ('inayara.cunha','varejo','especialista','region','EXTREMA','EXTREMA',10),
    ('camila.guimenti','varejo','corporativo','region','POCOS DE CALDAS','POCOS DE CALDAS',10),
    ('thais.oliveira','varejo','corporativo','region','VARGINHA','VARGINHA',10),
    ('jessica.santos','varejo','corporativo','region','ITAJUBA','ITAJUBA',10),
    ('tainara.matilde','varejo','corporativo','region','EXTREMA','EXTREMA',10),
    ('matheus.teixeira','varejo','corporativo','region','CAMBUI','CAMBUI',10),
    ('ariane.souza','varejo','construcao_civil','region','CAMBUI','CAMBUI',10),
    ('larissa.terra','atacado','vendedor_externo','ddd','11','SP DDD 11',10),
    ('larissa.terra','atacado','vendedor_externo','ddd','12','SP DDD 12',10),
    ('larissa.terra','atacado','vendedor_externo','ddd','13','SP DDD 13',10),
    ('julio.melo','atacado','vendedor_externo','ddd','15','SP DDD 15',10),
    ('julio.melo','atacado','vendedor_externo','ddd','19','SP DDD 19',10)
)
insert into seller_routes(organization_id, profile_id, channel, sales_function, route_type, route_value, region, priority, active)
select org.id, sp.id, r.channel, r.sales_function, r.route_type, r.route_value, r.region, r.priority, true
from org
join users u on u.organization_id=org.id
join seller_profiles sp on sp.user_id=u.id
join routes r on lower(u.email)=lower(r.login || '@grupoabr.com.br')
where not exists (
  select 1 from seller_routes sr
  where sr.organization_id=org.id
    and sr.profile_id=sp.id
    and sr.channel=r.channel
    and sr.sales_function=r.sales_function
    and sr.route_type=r.route_type
    and lower(sr.route_value)=lower(r.route_value)
);
