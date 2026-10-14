#!/usr/bin/env bash
set -euo pipefail
CLIENT_JSON=/home/ubuntu/.config/gws/client_secret.json
export GOOGLE_WORKSPACE_CLI_CLIENT_ID="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); k="installed" if "installed" in d else "web"; print(d[k]["client_id"])' "$CLIENT_JSON")"
export GOOGLE_WORKSPACE_CLI_CLIENT_SECRET="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); k="installed" if "installed" in d else "web"; print(d[k]["client_secret"])' "$CLIENT_JSON")"
exec gws auth login --readonly --services drive,sheets
