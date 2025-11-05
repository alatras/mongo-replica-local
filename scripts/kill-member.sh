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

echo "Hard-killing $MEMBER (simulating abrupt failure)..."
docker compose kill $MEMBER

echo ""
echo "$MEMBER killed successfully!"
docker compose ps
