#!/usr/bin/env bash
set -euo pipefail

TARGET="/swapfile"
SIZE_GB="13"
SIZE_BYTES=$((SIZE_GB * 1024 * 1024 * 1024))

is_active_swap() {
  swapon --show=NAME --noheadings | awk '{print $1}' | grep -Fxq "$1"
}

disable_and_remove_swap() {
  local path="$1"
  if is_active_swap "$path"; then
    swapoff "$path"
  fi
  if [ -e "$path" ]; then
    rm -f "$path"
  fi
}

echo "BEFORE"
free -h
swapon --show || true
df -h /

# Free space from older swap files first while keeping the small legacy swap
# active until the new 13 GB swap is ready.
disable_and_remove_swap "/swapfile-evolution"
disable_and_remove_swap "/swapfile-abr"

if is_active_swap "$TARGET"; then
  swapoff "$TARGET"
fi
rm -f "$TARGET"

available_bytes=$(df --output=avail -B1 / | tail -1 | tr -d ' ')
if [ "$available_bytes" -lt "$SIZE_BYTES" ]; then
  echo "ERROR: not enough free space for ${SIZE_GB}G swap. Available bytes: ${available_bytes}" >&2
  exit 1
fi

if ! fallocate -l "${SIZE_GB}G" "$TARGET"; then
  dd if=/dev/zero of="$TARGET" bs=1M count=$((SIZE_GB * 1024)) status=progress
fi

chmod 600 "$TARGET"
mkswap "$TARGET"
swapon "$TARGET"

disable_and_remove_swap "/.swapfile"

cp /etc/fstab "/etc/fstab.bak.$(date +%Y%m%d%H%M%S)"
awk 'BEGIN { remove["/.swapfile"]=1; remove["/swapfile"]=1; remove["/swapfile-abr"]=1; remove["/swapfile-evolution"]=1 }
  /^[[:space:]]*#/ || NF == 0 { print; next }
  !($1 in remove) { print }
' /etc/fstab > /etc/fstab.new
printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab.new
cat /etc/fstab.new > /etc/fstab
rm -f /etc/fstab.new

echo "AFTER"
free -h
swapon --show
df -h /
