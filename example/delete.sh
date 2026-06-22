#!/usr/bin/env bash
# DELETE /files/<path> — delete a file
REMOTE_PATH=$1
HOST=${HOST:-http://localhost:3000}

if [ -z "$REMOTE_PATH" ]; then
  echo "Usage: $0 <remote_path>"
  echo "  Deletes a file from the server."
  exit 1
fi

curl -s -X DELETE "$HOST/files/$REMOTE_PATH" | jq .
