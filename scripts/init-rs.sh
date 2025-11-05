#!/bin/bash

set -e

echo "Waiting for MongoDB members to be ready..."

# Wait for each member to be healthy
for port in 27017 27018 27019; do
  echo "Checking mongo on port $port..."
  max_attempts=30
  attempt=0
  until mongosh --host localhost:$port --quiet --eval "db.adminCommand('ping').ok" &>/dev/null; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
      echo "Failed to connect to MongoDB on port $port after $max_attempts attempts"
      exit 1
    fi
    echo "Waiting for MongoDB on port $port... (attempt $attempt/$max_attempts)"
    sleep 2
  done
  echo "MongoDB on port $port is ready!"
done

echo ""
echo "All members are ready. Initiating replica set..."

# Initiate replica set (run from inside container with Docker network names)
docker exec mongo1 mongosh --quiet --eval '
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo1:27017", priority: 1 },
    { _id: 1, host: "mongo2:27017", priority: 0.5 },
    { _id: 2, host: "mongo3:27017", priority: 0.5 }
  ]
})
'

echo ""
echo "Waiting for replica set to elect primary..."
sleep 5

# Show replica set status
echo ""
echo "Replica set status:"
docker exec mongo1 mongosh --quiet --eval '
rs.status().members.map(m => ({
  name: m.name,
  state: m.stateStr,
  health: m.health
}))
' | grep -v 'Current Mongosh' || true

echo ""
echo "Replica set initialization complete!"
echo ""
echo "IMPORTANT: Add the following line to your /etc/hosts file:"
echo "127.0.0.1 mongo1 mongo2 mongo3"
