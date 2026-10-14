from pathlib import Path

env_path = Path("/opt/abr-crm/.env")

updates = {
    "WHATSAPP_BOT_MODE": "auto",
    "WHATSAPP_BOT_HEADLESS": "true",
    "WHATSAPP_BOT_HIDE_WINDOW": "true",
    "WHATSAPP_BOT_ACTIVE_CHAT_ONLY": "false",
    "WHATSAPP_BOT_KEEP_UNREAD_FILTER": "true",
    "WHATSAPP_BOT_ALLOWED_CONTACT_PHONES": "+5512983205605,+5535997709232,+5512996103765",
    "WHATSAPP_BOT_CONTACT_PHONE_ALIASES": "Meu Number=+5512996103765",
}

lines = env_path.read_text(encoding="utf-8").splitlines()
filtered = []
for line in lines:
    key = line.split("=", 1)[0] if "=" in line else ""
    if key not in updates and not key.startswith("nWHATSAPP_BOT_"):
        filtered.append(line)

if filtered and filtered[-1].strip():
    filtered.append("")

for key, value in updates.items():
    filtered.append(f"{key}={value}")

env_path.write_text("\n".join(filtered) + "\n", encoding="utf-8")
