#!/bin/bash

# Development script for Product Creator
# Starts the development server on port 3067

set -e

echo "Starting Product Creator in development mode..."
cd "$(dirname "$0")/.."

# Run development server
pnpm dev
