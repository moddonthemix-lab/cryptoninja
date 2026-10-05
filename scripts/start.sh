#!/bin/sh
# Resilient startup: a DB problem must never stop the web server from booting.
# The app has a localStorage fallback and runs fine without a database.

if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  DATABASE_URL not set — skipping prisma db push (localStorage fallback)"
else
  echo "✅ Running prisma db push..."
  npx prisma db push --accept-data-loss || echo "⚠️  prisma db push failed — continuing without DB sync"
fi

exec npm start
