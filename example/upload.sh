#!/usr/bin/env bash
# POST /upload — upload a file via multipart form
FILE=$1
HOST=${HOST:-http://localhost:3000}

if [ -z "$FILE" ]; then
  echo "Usage: $0 <filepath>"
  echo "  Uploads a file to the server (creates a new entry)."
  exit 1
fi

curl -s -X POST "$HOST/upload" \
  -F "file=@$FILE" | jq .
