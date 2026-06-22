#!/usr/bin/env bash
# PUT /files/<path> — create or replace a file
FILE=$1
REMOTE_PATH=$2
HOST=${HOST:-http://localhost:3000}

if [ -z "$FILE" ] || [ -z "$REMOTE_PATH" ]; then
  echo "Usage: $0 <local_file> <remote_path>"
  echo "  Uploads <local_file> to <remote_path> on the server (replaces existing content)."
  exit 1
fi

curl -s -X PUT "$HOST/files/$REMOTE_PATH" \
  --data-binary "@$FILE" | jq .
