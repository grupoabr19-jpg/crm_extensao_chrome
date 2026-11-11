create table if not exists ai_configurations (
  organization_id uuid primary key references organizations(id),
  enabled boolean not null default false,
  mode text not null default 'supervised' check (mode in ('supervised','automatic')),
  personality text not null default 'Atendente cordial, objetivo e profissional do Grupo ABR.',
  instructions text not null default '',
  prohibited_topics text not null default 'preços, prazos, estoque, descontos e promessas comerciais',
  transfer_rule text not null default 'Após a triagem mínima, transferir para o vendedor responsável pela região.',
  business_hours jsonb not null default '{"enabled":false,"start":"08:00","end":"18:00","days":[1,2,3,4,5]}'::jsonb,
  reply_delay_min_ms integer not null default 3500,
  reply_delay_max_ms integer not null default 7500,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);
