create table if not exists aster_sales_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  reference_date date not null,
  vendor_name text not null,
  vendor_key text not null,
  sales_type text,
  region text,
  segment text,
  weight_kg numeric(18,2) not null default 0,
  value_brl numeric(18,2) not null default 0,
  source text not null default 'aster_resumo_comercial',
  synced_at timestamptz not null default now(),
  unique (organization_id, reference_date, vendor_key)
);

create index if not exists aster_sales_snapshots_org_date_idx
  on aster_sales_snapshots (organization_id, reference_date desc);
