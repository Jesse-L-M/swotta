#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"

echo "Ensuring pgvector extension exists..."
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "Running Drizzle migrations..."
npx drizzle-kit migrate
