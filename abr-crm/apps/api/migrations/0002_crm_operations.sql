-- Operacoes CRM MVP: etapas dos demais funis, tarefas, notas e fechamento.

alter table cases add column if not exists won_at timestamptz;
alter table cases add column if not exists lost_at timestamptz;
alter table cases add column if not exists closed_at timestamptz;

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  case_id uuid not null references cases(id),
  author_user_id uuid references users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists notes_case_created on notes (case_id, created_at desc);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  case_id uuid not null references cases(id),
  assignee_user_id uuid references users(id),
  title text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tasks_assignee_due on tasks (organization_id, assignee_user_id, status, due_at);
create index if not exists tasks_case_created on tasks (case_id, created_at desc);

insert into pipeline_stages (pipeline_id, name, position, internal_only, ai_may_move)
select p.id, s.name, s.pos, s.internal_only, s.ai_may_move
from pipelines p
cross join (values
  ('Novo lead', 1, false, true),
  ('Contato inicial', 2, false, true),
  ('Qualificacao', 3, false, true),
  ('Cotacao', 4, false, false),
  ('Negociacao', 5, false, false),
  ('Venda ganha', 6, false, false),
  ('Venda perdida', 7, false, false)
) as s(name,pos,internal_only,ai_may_move)
where p.name = 'ATACADO'
  and not exists (select 1 from pipeline_stages ps where ps.pipeline_id = p.id);

insert into pipeline_stages (pipeline_id, name, position, internal_only, ai_may_move)
select p.id, s.name, s.pos, s.internal_only, s.ai_may_move
from pipelines p
cross join (values
  ('Entrada pos-venda', 1, false, true),
  ('Diagnostico', 2, false, true),
  ('Em tratativa', 3, false, false),
  ('Aguardando cliente', 4, false, false),
  ('Resolvido', 5, false, false),
  ('Encerrado sem solucao', 6, false, false)
) as s(name,pos,internal_only,ai_may_move)
where lower(p.name) like 'p%s-venda%'
  and not exists (select 1 from pipeline_stages ps where ps.pipeline_id = p.id);

insert into pipeline_stages (pipeline_id, name, position, internal_only, ai_may_move)
select p.id, s.name, s.pos, s.internal_only, s.ai_may_move
from pipelines p
cross join (values
  ('Conta a reativar', 1, false, true),
  ('Tentativa de contato', 2, false, true),
  ('Interesse identificado', 3, false, true),
  ('Proposta enviada', 4, false, false),
  ('Reativado', 5, false, false),
  ('Sem interesse', 6, false, false)
) as s(name,pos,internal_only,ai_may_move)
where lower(p.name) like 'reativa%'
  and not exists (select 1 from pipeline_stages ps where ps.pipeline_id = p.id);

insert into pipeline_stages (pipeline_id, name, position, internal_only, ai_may_move)
select p.id, s.name, s.pos, s.internal_only, s.ai_may_move
from pipelines p
cross join (values
  ('Comunicado recebido', 1, true, false),
  ('Em analise', 2, true, false),
  ('Encaminhado', 3, true, false),
  ('Resolvido', 4, true, false),
  ('Arquivado', 5, true, false)
) as s(name,pos,internal_only,ai_may_move)
where lower(p.name) like 'lideran%'
  and not exists (select 1 from pipeline_stages ps where ps.pipeline_id = p.id);
