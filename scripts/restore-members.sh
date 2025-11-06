#!/bin/bash

# Restore partitioned members by clearing iptables rules or unpausing

set -e

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <member1> [member2] [member3]"
  echo "Example: $0 mongo2 mongo3"
  exit 1
fi

echo "============================================================"
echo "Restoring Network Connectivity"
echo "============================================================"
echo ""

for member in "$@"; do
  echo "Restoring $member..."

  # Try to unpause first (in case we used pause as fallback)
  docker unpause "$member" 2>/dev/null && echo "  ✓ $member unpaused" && continue

  # Try to clear iptables rules
  docker exec "$member" sh -c '
    # Flush all iptables rules
    iptables -F
    iptables -X
    iptables -P INPUT ACCEPT
    iptables -P OUTPUT ACCEPT
    iptables -P FORWARD ACCEPT
    echo "Network rules cleared"
  ' 2>/dev/null && echo "  ✓ $member network restored" || echo "  ⚠️  Could not restore $member (might already be restored)"
done

echo ""
echo "============================================================"
echo "Network connectivity restored!"
echo "============================================================"
