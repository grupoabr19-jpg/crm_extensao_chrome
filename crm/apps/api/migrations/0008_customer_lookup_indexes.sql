create index if not exists contacts_customer_email_lookup
  on contacts (organization_id, lower(coalesce(customer_profile->>'email','')));

create index if not exists contact_identifiers_phone_lookup
  on contact_identifiers (organization_id, e164)
  where kind='phone';
