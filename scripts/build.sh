#!/bin/bash

# Build script for Product Creator
# Builds the Next.js application for production

set -e

echo "Building Product Creator for production..."
cd "$(dirname "$0")/.."

# Build the application
pnpm build

echo "Build completed successfully!"
echo "To start the production server, run: pnpm start"
