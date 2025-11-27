#!/bin/bash

# Start script for Product Creator
# Runs the production server on port 3067

set -e

echo "Starting Product Creator in production mode..."
cd "$(dirname "$0")/.."

# Check if build exists
if [ ! -d "apps/pc/.next" ]; then
  echo "Error: Build not found. Please run 'pnpm build' first."
  exit 1
fi

# Start production server
pnpm start
