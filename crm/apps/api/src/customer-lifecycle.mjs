export const REACTIVATION_REMINDER_DAYS = 60;

export function reactivationReminderAt(lastContactAt) {
  const lastContact = new Date(lastContactAt);
  if (Number.isNaN(lastContact.getTime())) throw new Error("invalid_contact_date");
  return new Date(lastContact.getTime() + REACTIVATION_REMINDER_DAYS * 86400000);
}
