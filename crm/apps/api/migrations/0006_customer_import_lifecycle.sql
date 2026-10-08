create table if not exists customer_source_keys (
  organization_id uuid not null references organizations(id),
  source_system text not null,
  source_key text not null,
  contact_id uuid not null references contacts(id),
  imported_at timestamptz not null default now(),
  primary key (organization_id, source_system, source_key)
);

create table if not exists customer_purchase_summaries (
  organization_id uuid not null references organizations(id),
  contact_id uuid not null references contacts(id),
  item_count integer not null default 0 check (item_count >= 0),
  order_count integer not null default 0 check (order_count >= 0),
  total_sales numeric(16,2) not null default 0,
  last_purchase_at timestamptz,
  imported_at timestamptz not null default now(),
  primary key (organization_id, contact_id)
);

alter table cases add column if not exists last_contact_at timestamptz;
alter table cases add column if not exists reactivation_reference_at timestamptz;
alter table cases add column if not exists reactivation_reference_source text
  check (reactivation_reference_source in ('contact', 'purchase'));
alter table tasks add column if not exists kind text not null default 'follow_up';
alter table tasks add constraint tasks_kind_check check (kind in ('follow_up', 'reactivation'));
create unique index if not exists tasks_one_open_reactivation_per_case
  on tasks (case_id)
  where status = 'open' and kind = 'reactivation';
create index if not exists customer_purchase_summaries_latest
  on customer_purchase_summaries (organization_id, last_purchase_at desc);
