#!/bin/bash

# Network partition script - blocks network traffic to simulate network partition
# This is different from stopping containers - containers stay running but can't communicate

set -e

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <member1> [member2] [member3]"
  echo "Example: $0 mongo2 mongo3"
  echo ""
  echo "This simulates a network partition by blocking traffic to specified members"
  echo "Members stay running but become unreachable (like a production network partition)"
  exit 1
fi

echo "============================================================"
echo "Simulating Network Partition"
echo "============================================================"
echo ""

for member in "$@"; do
  echo "Partitioning $member (blocking network traffic)..."

  # Block all incoming and outgoing traffic for this container
  # This simulates a network partition better than stopping the container
  docker exec "$member" sh -c '
    # Install iptables if not available
    apt-get update -qq 2>/dev/null || true
    apt-get install -y iptables 2>/dev/null || true

    # Drop all incoming traffic except loopback
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -j DROP

    # Drop all outgoing traffic except loopback
    iptables -A OUTPUT -o lo -j ACCEPT
    iptables -A OUTPUT -j DROP

    echo "Network traffic blocked"
  ' 2>/dev/null || {
    echo "  ⚠️  Could not use iptables, using pause instead..."
    docker pause "$member"
  }

  echo "  ✓ $member partitioned"
done

echo ""
echo "============================================================"
echo "Network partition active!"
echo ""
echo "The specified members are still running but network traffic"
echo "is blocked. This simulates a real network partition."
echo ""
echo "To restore: bash ./scripts/restore-members.sh $@"
echo "============================================================"
