#!/usr/bin/env bash
# GET /changes?after=N — fetch change log
AFTER=${1:-0}
HOST=${HOST:-http://localhost:3000}

curl -s "$HOST/changes?after=$AFTER" | jq .
