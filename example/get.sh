#!/usr/bin/env bash
# GET /files/<path> — download a file
REMOTE_PATH=$1
HOST=${HOST:-http://localhost:3000}

if [ -z "$REMOTE_PATH" ]; then
  echo "Usage: $0 <remote_path>"
  echo "  Downloads a file from the server and prints it to stdout."
  exit 1
fi

curl -s "$HOST/files/$REMOTE_PATH"
