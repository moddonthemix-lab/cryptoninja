#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  DATABASE_URL not set — skipping prisma db push"
  echo "   Add a PostgreSQL service in Railway and link DATABASE_URL"
else
  echo "✅ Running prisma db push..."
  npx prisma db push --accept-data-loss
fi

exec npm start
