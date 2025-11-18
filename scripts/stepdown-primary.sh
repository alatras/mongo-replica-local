#!/bin/bash

set -e

echo "Finding current primary..."

# Find the primary from replica set status
PRIMARY_HOST=$(docker exec mongo1 mongosh --quiet --eval "rs.status().members.find(m => m.stateStr === 'PRIMARY')?.name" | tr -d "'\"")

if [ -z "$PRIMARY_HOST" ]; then
  echo "Error: Could not find primary member"
  exit 1
fi

echo "Primary found: $PRIMARY_HOST"
echo "Forcing primary to step down for 60 seconds..."

# Connect to the primary and step down
docker exec mongo1 mongosh --host "$PRIMARY_HOST" --quiet --eval 'db.adminCommand({ replSetStepDown: 60 })' || true

echo ""
echo "Primary step down initiated!"
echo ""
echo "Waiting for new primary election..."
sleep 3

echo ""
echo "Current replica set status:"
docker exec mongo1 mongosh --quiet --eval '
rs.status().members.map(m => ({
  name: m.name,
  state: m.stateStr
}))
' | grep -v 'Current Mongosh' || true
