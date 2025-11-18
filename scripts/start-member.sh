#!/bin/bash

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <member-name>"
  echo "Example: $0 mongo1"
  echo "Valid members: mongo1, mongo2, mongo3"
  exit 1
fi

MEMBER=$1

if [[ ! "$MEMBER" =~ ^mongo[1-3]$ ]]; then
  echo "Error: Invalid member name '$MEMBER'"
  echo "Valid members: mongo1, mongo2, mongo3"
  exit 1
fi

echo "Starting $MEMBER..."
docker compose start $MEMBER

echo ""
echo "Waiting for $MEMBER to become healthy..."

# Get the port for the member
case $MEMBER in
  mongo1) PORT=27017 ;;
  mongo2) PORT=27018 ;;
  mongo3) PORT=27019 ;;
esac

max_attempts=30
attempt=0
until docker compose ps $MEMBER | grep -q "healthy" || mongosh --host localhost:$PORT --quiet --eval "db.adminCommand('ping').ok" &>/dev/null; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    echo "Warning: $MEMBER may not be fully healthy yet"
    break
  fi
  echo "Waiting for $MEMBER to be healthy... (attempt $attempt/$max_attempts)"
  sleep 2
done

echo ""
echo "$MEMBER started successfully!"
docker compose ps
