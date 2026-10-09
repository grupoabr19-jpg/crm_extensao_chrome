with org as (
  select id from organizations order by created_at limit 1
), seed_users(email, display_name, profile_title, sales_function) as (
  values
    ('heloa@grupoabr.com.br','Heloa','Corporativo','corporativo'),
    ('kaylane@grupoabr.com.br','Kaylane','Corporativo','corporativo'),
    ('vitoria@grupoabr.com.br','Vitoria','Corporativo','corporativo'),
    ('edmila@grupoabr.com.br','Edmila','Especialista','especialista')
), upsert_users as (
  insert into users(organization_id, email, display_name, role)
  select org.id, seed_users.email, seed_users.display_name, 'seller'
  from org cross join seed_users
  on conflict (organization_id, lower(email)) do update
    set display_name=excluded.display_name,
        role='seller',
        status='active'
  returning id, organization_id, email
), upsert_profiles as (
  insert into seller_profiles(organization_id, user_id, profile_title, sales_function, active)
  select u.organization_id, u.id, s.profile_title, s.sales_function, true
  from upsert_users u
  join seed_users s on lower(s.email)=lower(u.email)
  on conflict (organization_id, user_id) do update
    set profile_title=excluded.profile_title,
        sales_function=excluded.sales_function,
        active=true
  returning id, organization_id, user_id
), routes(email, channel, sales_function, route_type, route_value, region, priority) as (
  values
    ('heloa@grupoabr.com.br','varejo','corporativo','region','BRAGANCA','BRAGANCA',10),
    ('kaylane@grupoabr.com.br','varejo','corporativo','region','JUNDIAI','JUNDIAI',10),
    ('vitoria@grupoabr.com.br','varejo','corporativo','region','POUSO ALEGRE','POUSO ALEGRE',10),
    ('edmila@grupoabr.com.br','varejo','especialista','region','CAMBUI','CAMBUI',10)
)
insert into seller_routes(organization_id, profile_id, channel, sales_function, route_type, route_value, region, priority, active)
select u.organization_id, sp.id, r.channel, r.sales_function, r.route_type, r.route_value, r.region, r.priority, true
from routes r
join upsert_users u on lower(u.email)=lower(r.email)
join upsert_profiles sp on sp.organization_id=u.organization_id and sp.user_id=u.id
where not exists (
  select 1 from seller_routes sr
  where sr.organization_id=u.organization_id
    and sr.profile_id=sp.id
    and sr.channel=r.channel
    and sr.sales_function=r.sales_function
    and sr.route_type=r.route_type
    and lower(sr.route_value)=lower(r.route_value)
);
