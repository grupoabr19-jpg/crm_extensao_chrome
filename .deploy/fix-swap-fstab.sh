#!/usr/bin/env bash
set -euo pipefail

cp /etc/fstab "/etc/fstab.bak.$(date +%Y%m%d%H%M%S)"
awk 'BEGIN {
    remove["/.swapfile"]=1
    remove["/swapfile"]=1
    remove["/swapfile-abr"]=1
    remove["/swapfile-evolution"]=1
  }
  /^[[:space:]]*#/ || NF == 0 { print; next }
  !($1 in remove) { print }
' /etc/fstab > /etc/fstab.new
printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab.new
cat /etc/fstab.new > /etc/fstab
rm -f /etc/fstab.new

grep swapfile /etc/fstab
free -h
swapon --show
