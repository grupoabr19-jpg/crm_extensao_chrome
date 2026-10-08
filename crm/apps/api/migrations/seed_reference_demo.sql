-- SEED DEMONSTRATIVO (valores de referência do CRM atual). Sem funcionários, números ou regiões→cidades reais.
-- Uso: psql -v org_id=<uuid> -f seed_reference_demo.sql   (no teste, :org_id é substituído)
insert into segments (organization_id, label) select :'org_id', x from unnest(array[
 'Calheiros','Cliente Final','Construtoras','Depósito (Armadores)','Distribuidores','Entidades Públicas','Estruturistas',
 'Indústria de Transformação','Indústrias','Investidor','Lajeiros','Loja de Materiais de Construção','Produtor Rural',
 'Revendedores','Serralheiros','Revendas','Construção Civil','Aplicadores','Arquitetura','Pedreiro']) x;   -- Revendedores ≠ Revendas até revisão
insert into acquisition_sources (organization_id, name) select :'org_id', x from unnest(array['Instagram','Facebook','LinkedIn','Google','Feiras/Eventos','Não informado']) x;
insert into commercial_regions (organization_id, name) select :'org_id', x from unnest(array['Jundiaí','Bragança','Extrema','Microrregião','Pouso Alegre','Poços/Alfenas','Itajubá','Varginha']) x;
insert into commercial_channels (organization_id, name) select :'org_id', x from unnest(array['Varejo','Corporativo','Atacado']) x;   -- Atacado = canal, não região
insert into loss_reasons (organization_id, name, requires_detail) select :'org_id', x, x = 'Outro' from unnest(array['Preço','Disponibilidade de Estoque','Condição de Pagamento','Logística','Burocracia no Cadastro','Pedido Mínimo','Limite de Crédito','Restrição','Outro']) x;
insert into pipelines (organization_id, name) select :'org_id', x from unnest(array['VAREJO','ATACADO','Pós-Venda (Recorrência)','Reativação','Lideranças']) x;
insert into pipeline_stages (pipeline_id, name, position, internal_only, ai_may_move)
select p.id, s.name, s.pos, s.internal, s.ai from pipelines p, (values
 ('Novo Lead',1,false,true),('COMUNICAÇÃO INTERNA',2,true,false),('Contato',3,false,true),('Qualificação',4,false,true),
 ('Cotação',5,false,false),('Venda ganha',6,false,false),('Venda perdida',7,false,false)) as s(name,pos,internal,ai)
where p.organization_id = :'org_id' and p.name = 'VAREJO';   -- só VAREJO tem etapas conhecidas; demais funis: configurar
