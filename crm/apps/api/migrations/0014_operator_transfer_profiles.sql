-- Perfis operacionais, WhatsApps e polos comerciais para transferencias.

create temp table operator_seed (
  email text primary key,
  display_name text not null,
  profile_title text not null,
  sales_function text not null,
  whatsapp_e164 text not null
) on commit drop;

insert into operator_seed(email,display_name,profile_title,sales_function,whatsapp_e164) values
  ('alessandro.takahashi@grupoabr.com.br','Alessandro Takahashi','Lider regional - Braganca','vendedor_externo','+553598748433'),
  ('dyovana.silva@grupoabr.com.br','Dyovana Silva','Lider regional - Jundiai','vendedor_externo','+553599440876'),
  ('gustavo.alvarenga@grupoabr.com.br','Gustavo Alvarenga','Lider regional - Extrema','vendedor_externo','+553598112307'),
  ('juliano.pereira@grupoabr.com.br','Juliano Pereira','Lider regional - Micro','vendedor_externo','+553599055943'),
  ('paola.santos@grupoabr.com.br','Paola Santos','Lider regional - Pouso Alegre','vendedor_externo','+553597600676'),
  ('jose.felipe@grupoabr.com.br','Jose Felipe','Lider regional - Pocos de Caldas','vendedor_externo','+553599229709'),
  ('jennifer.silva@grupoabr.com.br','Jennifer Silva','Lider regional - Itajuba','vendedor_externo','+553598117157'),
  ('peterson.sexias@grupoabr.com.br','Peterson Seixas','Lider regional - Varginha','vendedor_externo','+553598266466'),
  ('josiane.lima@grupoabr.com.br','Josiane Lima','VARE - Especialista','especialista','+553598098007'),
  ('leiz.torso@grupoabr.com.br','Leiz Torso','VARE - Especialista','especialista','+553598625986'),
  ('inayara.cunha@grupoabr.com.br','Inayara Cunha','VARE - Especialista','especialista','+553597708685'),
  ('edmila@grupoabr.com.br','Edmila Melo','VARE - Especialista','especialista','+553591170473'),
  ('rafaela.resende@grupoabr.com.br','Rafaela Resende','VARE - Especialista','especialista','+553599116049'),
  ('milena.vaz@grupoabr.com.br','Milena Vaz','VARE - Especialista','especialista','+553597709175'),
  ('gabriela.cunha@grupoabr.com.br','Gabriela Cunha','VARE - Especialista','especialista','+553599618455'),
  ('bruna.pereira@grupoabr.com.br','Bruna Pereira','VARE - Especialista','especialista','+553599814480'),
  ('kaylane@grupoabr.com.br','Kaylane','VCORP - Corporativo','corporativo','+553597375342'),
  ('heloa@grupoabr.com.br','Heloa Leite','VCORP - Corporativo','corporativo','+553598119308'),
  ('tainara.matilde@grupoabr.com.br','Tainara Matilde','VCORP - Corporativo','corporativo','+553599442324'),
  ('matheus.teixeira@grupoabr.com.br','Matheus Teixeira','VCORP - Corporativo','corporativo','+553597233624'),
  ('vitoria@grupoabr.com.br','Vitoria Tavares','VCORP - Corporativo','corporativo','+553599921374'),
  ('camila.guimenti@grupoabr.com.br','Camila Guimenti','VCORP - Corporativo','corporativo','+553598114712'),
  ('jessica.santos@grupoabr.com.br','Jessica Santos','VCORP - Corporativo','corporativo','+553598113144'),
  ('thais.oliveira@grupoabr.com.br','Thais Oliveira','VCORP - Corporativo','corporativo','+553597708841'),
  ('ariane.souza@grupoabr.com.br','Ariane Souza','Construcao civil - Micro','construcao_civil','+553597613958'),
  ('larissa.terra@grupoabr.com.br','Larissa Terra','Atacado - SP Capital','vendedor_externo','+5524999028203'),
  ('julio.melo@grupoabr.com.br','Julio Melo','Atacado - Sul','vendedor_externo','+553597707975'),
  ('wilson.bueno@grupoabr.com.br','Wilson Bueno','Atacado - SP Capital','vendedor_externo','+553599166203');

-- Corrige o cadastro historico do polo de Pocos sem perder fichas atribuidas.
update users u
set email='jose.felipe@grupoabr.com.br',display_name='Jose Felipe',status='active'
where lower(u.email)='jose.reis@grupoabr.com.br'
  and not exists (
    select 1 from users candidate
    where candidate.organization_id=u.organization_id
      and lower(candidate.email)='jose.felipe@grupoabr.com.br'
  );

with org as (
  select id from organizations order by created_at limit 1
)
insert into users(organization_id,email,display_name,role,status)
select org.id,s.email,s.display_name,'seller','active'
from org cross join operator_seed s
on conflict (organization_id,lower(email)) do update
set display_name=excluded.display_name,role='seller',status='active';

with org as (
  select id from organizations order by created_at limit 1
)
insert into seller_profiles(organization_id,user_id,profile_title,sales_function,whatsapp_e164,active)
select org.id,u.id,s.profile_title,s.sales_function,s.whatsapp_e164,true
from org
join users u on u.organization_id=org.id
join operator_seed s on lower(s.email)=lower(u.email)
on conflict (organization_id,user_id) do update
set profile_title=excluded.profile_title,
    sales_function=excluded.sales_function,
    whatsapp_e164=excluded.whatsapp_e164,
    active=true;

with org as (
  select id from organizations order by created_at limit 1
)
insert into whatsapp_accounts(organization_id,e164,label,kind,active)
select org.id,s.whatsapp_e164,s.display_name,'employee',true
from org cross join operator_seed s
on conflict (organization_id,e164) do update
set label=excluded.label,kind='employee',active=true;

with org as (
  select id from organizations order by created_at limit 1
)
insert into user_account_bindings(organization_id,user_id,account_id,verified_at)
select org.id,u.id,wa.id,now()
from org
join operator_seed s on true
join users u on u.organization_id=org.id and lower(u.email)=lower(s.email)
join whatsapp_accounts wa on wa.organization_id=org.id and wa.e164=s.whatsapp_e164
where not exists (
  select 1 from user_account_bindings binding
  where binding.account_id=wa.id and binding.revoked_at is null
);

create temp table operator_route_seed (
  email text not null,
  channel text not null,
  sales_function text not null,
  route_type text not null,
  route_value text not null,
  region text,
  priority int not null
) on commit drop;

insert into operator_route_seed(email,channel,sales_function,route_type,route_value,region,priority) values
  ('alessandro.takahashi@grupoabr.com.br','varejo','vendedor_externo','region','BRAGANCA','BRAGANCA',10),
  ('leiz.torso@grupoabr.com.br','varejo','especialista','region','BRAGANCA','BRAGANCA',10),
  ('heloa@grupoabr.com.br','varejo','corporativo','region','BRAGANCA','BRAGANCA',10),
  ('dyovana.silva@grupoabr.com.br','varejo','vendedor_externo','region','JUNDIAI','JUNDIAI',10),
  ('josiane.lima@grupoabr.com.br','varejo','especialista','region','JUNDIAI','JUNDIAI',10),
  ('kaylane@grupoabr.com.br','varejo','corporativo','region','JUNDIAI','JUNDIAI',10),
  ('gustavo.alvarenga@grupoabr.com.br','varejo','vendedor_externo','region','EXTREMA','EXTREMA',10),
  ('inayara.cunha@grupoabr.com.br','varejo','especialista','region','EXTREMA','EXTREMA',10),
  ('tainara.matilde@grupoabr.com.br','varejo','corporativo','region','EXTREMA','EXTREMA',10),
  ('juliano.pereira@grupoabr.com.br','varejo','vendedor_externo','region','CAMBUI','CAMBUI',10),
  ('edmila@grupoabr.com.br','varejo','especialista','region','CAMBUI','CAMBUI',10),
  ('matheus.teixeira@grupoabr.com.br','varejo','corporativo','region','CAMBUI','CAMBUI',10),
  ('ariane.souza@grupoabr.com.br','varejo','construcao_civil','region','CAMBUI','CAMBUI',10),
  ('paola.santos@grupoabr.com.br','varejo','vendedor_externo','region','POUSO ALEGRE','POUSO ALEGRE',10),
  ('rafaela.resende@grupoabr.com.br','varejo','especialista','region','POUSO ALEGRE','POUSO ALEGRE',10),
  ('vitoria@grupoabr.com.br','varejo','corporativo','region','POUSO ALEGRE','POUSO ALEGRE',10),
  ('jose.felipe@grupoabr.com.br','varejo','vendedor_externo','region','POCOS DE CALDAS','POCOS DE CALDAS',10),
  ('milena.vaz@grupoabr.com.br','varejo','especialista','region','POCOS DE CALDAS','POCOS DE CALDAS',10),
  ('camila.guimenti@grupoabr.com.br','varejo','corporativo','region','POCOS DE CALDAS','POCOS DE CALDAS',10),
  ('jennifer.silva@grupoabr.com.br','varejo','vendedor_externo','region','ITAJUBA','ITAJUBA',10),
  ('gabriela.cunha@grupoabr.com.br','varejo','especialista','region','ITAJUBA','ITAJUBA',10),
  ('jessica.santos@grupoabr.com.br','varejo','corporativo','region','ITAJUBA','ITAJUBA',10),
  ('peterson.sexias@grupoabr.com.br','varejo','vendedor_externo','region','VARGINHA','VARGINHA',10),
  ('bruna.pereira@grupoabr.com.br','varejo','especialista','region','VARGINHA','VARGINHA',10),
  ('thais.oliveira@grupoabr.com.br','varejo','corporativo','region','VARGINHA','VARGINHA',10),
  ('larissa.terra@grupoabr.com.br','atacado','vendedor_externo','region','SP CAPITAL','SP CAPITAL',10),
  ('wilson.bueno@grupoabr.com.br','atacado','vendedor_externo','region','SP CAPITAL','SP CAPITAL',10),
  ('julio.melo@grupoabr.com.br','atacado','vendedor_externo','region','SUL','SUL',10);

with org as (
  select id from organizations order by created_at limit 1
)
insert into seller_routes(organization_id,profile_id,channel,sales_function,route_type,route_value,region,priority,active)
select org.id,sp.id,r.channel,r.sales_function,r.route_type,r.route_value,r.region,r.priority,true
from org
join operator_route_seed r on true
join users u on u.organization_id=org.id and lower(u.email)=lower(r.email)
join seller_profiles sp on sp.organization_id=org.id and sp.user_id=u.id
where not exists (
  select 1 from seller_routes sr
  where sr.organization_id=org.id
    and sr.profile_id=sp.id
    and sr.channel=r.channel
    and sr.sales_function=r.sales_function
    and sr.route_type=r.route_type
    and lower(sr.route_value)=lower(r.route_value)
);

update seller_routes sr
set active=true
from seller_profiles sp
join users u on u.id=sp.user_id
join operator_route_seed r on lower(r.email)=lower(u.email)
where sr.profile_id=sp.id
  and sr.channel=r.channel
  and sr.sales_function=r.sales_function
  and sr.route_type=r.route_type
  and lower(sr.route_value)=lower(r.route_value);
