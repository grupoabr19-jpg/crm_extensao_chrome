create sequence if not exists customer_code_seq start with 10000000;

alter table contacts add column if not exists customer_code text;
alter table contacts add column if not exists customer_profile jsonb not null default '{}'::jsonb;

create or replace function next_customer_code()
returns text
language plpgsql
as $$
declare
  code_number bigint := nextval('customer_code_seq');
begin
  if code_number > 99999999 then
    raise exception 'customer_code_sequence_exhausted';
  end if;
  return 'C' || lpad(code_number::text, 8, '0');
end;
$$;

update contacts
set customer_code = next_customer_code()
where customer_code is null;

select setval(
  'customer_code_seq',
  greatest(10000000, coalesce(max(substring(customer_code from 2)::bigint), 9999999) + 1),
  false
)
from contacts;

alter table contacts
  alter column customer_code set default next_customer_code(),
  alter column customer_code set not null;

alter table contacts
  add constraint contacts_customer_code_format
  check (customer_code ~ '^C[0-9]{8}$');

create unique index contacts_organization_customer_code
  on contacts (organization_id, customer_code);
