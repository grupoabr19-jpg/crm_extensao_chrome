with org as (
  select id from organizations order by created_at limit 1
), routes(email, channel, sales_function, route_type, route_value, region, priority) as (
  values
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
    ('ariane@abr.local','varejo','construcao_civil','region','CAMBUI','CAMBUI',10)
)
insert into seller_routes(organization_id, profile_id, channel, sales_function, route_type, route_value, region, priority, active)
select org.id, sp.id, r.channel, r.sales_function, r.route_type, r.route_value, r.region, r.priority, true
from org
join routes r on true
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
