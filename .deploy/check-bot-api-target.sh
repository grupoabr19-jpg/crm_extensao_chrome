#!/usr/bin/env sh
set -eu

value="${CRM_API_BASE_URL:-}${ABR_API_BASE_URL:-}${API_BASE_URL:-}"
case "$value" in
  *164.152.38.135*) echo "points_to_vm" ;;
  *onrender*) echo "points_to_render" ;;
  *) echo "no_known_endpoint" ;;
esac
