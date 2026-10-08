-- Fatia vertical: identidade, contas/lease, contatos, regras, ficha, transferência, observações, outbox, jobs.
-- Tudo timestamptz (UTC). Dinheiro: numeric, NULL = desconhecido (nunca 0). Organização em todas as tabelas de negócio.

create table organizations (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());

create table users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  email text not null, display_name text not null,
  role text not null check (role in ('admin','supervisor','sdr','seller','department_staff')),
  status text not null default 'active' check (status in ('active','disabled')),
  password_hash text,  -- autenticação: etapa seguinte (argon2id); sem usuários/senhas fixas
  created_at timestamptz not null default now()
);
create unique index users_org_email on users (organization_id, lower(email));

create table departments (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  name text not null, active boolean not null default true, unique (organization_id, name));
create table user_departments (user_id uuid references users(id), department_id uuid references departments(id), primary key (user_id, department_id));

create table whatsapp_accounts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  e164 text not null check (e164 ~ '^\+[0-9]{8,15}$'), label text not null,
  kind text not null check (kind in ('main','employee')), active boolean not null default true,
  unique (organization_id, e164)
);
create table user_account_bindings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id), account_id uuid not null references whatsapp_accounts(id),
  verified_at timestamptz, revoked_at timestamptz
);
create unique index one_active_binding_per_account on user_account_bindings (account_id) where revoked_at is null;

create table extension_devices (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id), label text, last_observation_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now()
);
-- Lease por conta com fencing token monotônico: ação com token antigo é recusada.
create table account_leases (
  account_id uuid primary key references whatsapp_accounts(id), device_id uuid not null references extension_devices(id),
  fencing_token bigint not null, expires_at timestamptz not null
);

create table contacts (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  display_name text, created_at timestamptz not null default now());
create table contact_identifiers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  contact_id uuid not null references contacts(id), kind text not null check (kind in ('phone')),
  e164 text not null check (e164 ~ '^\+[0-9]{8,15}$'), original text not null, source text not null,
  reliable boolean not null default false, shared boolean not null default false,
  unique (organization_id, contact_id, e164)
);
create index contact_identifiers_phone on contact_identifiers (organization_id, e164);  -- NÃO único: telefone compartilhado/reciclado

create table municipalities (id uuid primary key default gen_random_uuid(), ibge_code text unique, name text not null, uf char(2) not null);
create table commercial_regions (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name text not null, unique (organization_id, name));
create table region_municipalities (region_id uuid references commercial_regions(id), municipality_id uuid references municipalities(id), primary key (region_id, municipality_id));
create table segments (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), label text not null, aliases text[] not null default '{}', active boolean not null default true, unique (organization_id, label));
create table commercial_channels (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name text not null, unique (organization_id, name));
create table acquisition_sources (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name text not null, unique (organization_id, name));
create table loss_reasons (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name text not null, requires_detail boolean not null default false, unique (organization_id, name));
create table pipelines (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name text not null, unique (organization_id, name));
create table pipeline_stages (id uuid primary key default gen_random_uuid(), pipeline_id uuid not null references pipelines(id), name text not null, position int not null,
  internal_only boolean not null default false, ai_may_move boolean not null default false, unique (pipeline_id, position));

create table routing_rules (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name text not null, active boolean not null default true);
create table routing_rule_versions (
  id uuid primary key default gen_random_uuid(), rule_id uuid not null references routing_rules(id), version int not null,
  priority int not null, valid_from timestamptz, valid_to timestamptz, definition jsonb not null,
  created_by uuid references users(id), created_at timestamptz not null default now(), unique (rule_id, version)
);
create table customer_ownerships (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  contact_id uuid not null references contacts(id), owner_user_id uuid not null references users(id),
  exception_segment_ids uuid[] not null default '{}', active boolean not null default true);

create table cases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  contact_id uuid not null references contacts(id), version int not null default 1,
  status text not null default 'new' check (status in ('new','in_triage','awaiting_customer','triage_incomplete','no_rule','awaiting_arrival','association_pending','awaiting_staff','in_service','closed')),
  department_id uuid references departments(id), owner_user_id uuid references users(id),
  company_name text, city text, uf char(2), municipality_id uuid references municipalities(id), region_id uuid references commercial_regions(id),
  segment_id uuid references segments(id), channel_id uuid references commercial_channels(id), source_id uuid references acquisition_sources(id),
  need text, products text, quantity_text text, triage_summary text,
  potential text check (potential in ('low','medium','high','key_account')), temperature text check (temperature in ('hot','warm','cold')),
  sale_value numeric(14,2) check (sale_value is null or sale_value >= 0), quote_number text, order_number text,
  loss_reason_id uuid references loss_reasons(id), loss_detail text, next_follow_up_at timestamptz,
  pipeline_id uuid references pipelines(id), stage_id uuid references pipeline_stages(id),
  ai_paused boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (loss_reason_id is null or true)
);
create index cases_owner_status on cases (organization_id, owner_user_id, status);
create table stage_history (id bigserial primary key, case_id uuid not null references cases(id), stage_id uuid not null references pipeline_stages(id), actor_user_id uuid references users(id), by_ai boolean not null default false, at timestamptz not null default now());
create table case_field_provenance (
  id bigserial primary key, case_id uuid not null references cases(id), field text not null, value_json jsonb,
  source text not null check (source in ('customer','inference','human_confirmed','manual')),
  author_user_id uuid references users(id), evidence_message_ids text[] not null default '{}', confidence numeric(4,3),
  case_version int not null, set_at timestamptz not null default now()
);
create index provenance_latest on case_field_provenance (case_id, field, set_at desc);
create table case_assignments (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id), user_id uuid not null references users(id),
  rule_id uuid references routing_rules(id), rule_version int, inputs jsonb not null, reason text not null,
  manual_override boolean not null default false, override_reason text, created_at timestamptz not null default now(), ended_at timestamptz,
  check (not manual_override or override_reason is not null)
);

create table conversations (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  account_id uuid not null references whatsapp_accounts(id), contact_id uuid not null references contacts(id), case_id uuid references cases(id),
  unique (account_id, contact_id));
create table observed_messages (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  conversation_id uuid not null references conversations(id), case_id uuid references cases(id),
  message_key text not null, key_verifiable boolean not null, direction text not null check (direction in ('in','out','unknown')),
  content_kind text not null check (content_kind in ('text','media','system','unknown')), body text, first_observed_at timestamptz not null,
  unique (organization_id, message_key)
);
create table message_observations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  message_id uuid not null references observed_messages(id), device_id uuid not null references extension_devices(id),
  observation_key text not null, confidence text not null check (confidence in ('high','medium','low')), observed_at timestamptz not null,
  unique (organization_id, observation_key)
);

create table handoffs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  case_id uuid not null references cases(id), source_account_id uuid not null references whatsapp_accounts(id),
  destination_account_id uuid not null references whatsapp_accounts(id), destination_user_id uuid not null references users(id),
  protocol text not null unique check (protocol ~ '^ABR-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
  rule_id uuid references routing_rules(id), rule_version int, routing_inputs jsonb not null, summary_snapshot text,
  supersedes_handoff_id uuid references handoffs(id), expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index handoffs_destination_pending on handoffs (destination_user_id, created_at desc);
create table handoff_events (
  id bigserial primary key, handoff_id uuid not null references handoffs(id),
  type text not null check (type in ('created','send_requested','send_observed','send_uncertain','arrival_observed','association_pending','association_confirmed','claimed','cancelled','superseded')),
  payload jsonb not null default '{}', actor_user_id uuid references users(id), device_id uuid references extension_devices(id),
  idempotency_key text, at timestamptz not null default now(), unique (handoff_id, idempotency_key)
);
create index handoff_events_by_handoff on handoff_events (handoff_id, id);

create table outbox_commands (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
  account_id uuid not null references whatsapp_accounts(id), case_id uuid not null references cases(id), handoff_id uuid references handoffs(id),
  kind text not null, payload jsonb not null,
  state text not null default 'created' check (state in ('created','reserved','prepared','executing','observed','uncertain','cancelled','failed')),
  case_version int not null, context_id text not null, expected_user_id uuid not null, fencing_token bigint, expires_at timestamptz not null,
  attempts int not null default 0, execution_started boolean not null default false, leased_by_device uuid references extension_devices(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (state <> 'uncertain' or execution_started)  -- incerto só existe depois de iniciar execução
);
create index outbox_account_state on outbox_commands (account_id, state);

create table jobs (id uuid primary key default gen_random_uuid(), organization_id uuid references organizations(id), kind text not null, payload jsonb not null,
  state text not null default 'queued' check (state in ('queued','running','done','failed')), run_at timestamptz not null default now(),
  locked_until timestamptz, attempts int not null default 0, max_attempts int not null default 5, last_error text);
create index jobs_available on jobs (run_at) where state in ('queued','running');   -- claim: select ... for update skip locked
create table idempotency_records (organization_id uuid not null, key text not null, request_hash text not null, response jsonb, created_at timestamptz not null default now(), primary key (organization_id, key));
create table audit_events (id bigserial primary key, organization_id uuid not null, actor_user_id uuid, action text not null, entity text not null, entity_id text, data jsonb not null default '{}', at timestamptz not null default now());
