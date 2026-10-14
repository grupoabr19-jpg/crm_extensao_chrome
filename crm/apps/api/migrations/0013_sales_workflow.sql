-- Exclusão recuperável de fichas e suporte aos relatórios comerciais.

alter table cases add column if not exists deleted_at timestamptz;

create index if not exists cases_active_pipeline_stage
  on cases (organization_id, pipeline_id, stage_id, updated_at desc)
  where deleted_at is null;

create index if not exists cases_won_sales
  on cases (organization_id, won_at desc)
  where won_at is not null and deleted_at is null;
