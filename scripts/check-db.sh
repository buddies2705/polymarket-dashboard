#!/bin/bash
# Database diagnostic script for Railway
# Run this on the server to check database status

echo "=== Database Diagnostic ==="
echo ""

# Check if /data exists (Railway volume)
if [ -d "/data" ]; then
  echo "✅ /data directory exists (Railway volume mounted)"
  ls -lah /data/
else
  echo "❌ /data directory does NOT exist (no volume mounted)"
fi

echo ""
echo "=== Database Path Check ==="
if [ -f "/data/polymarket.db" ]; then
  echo "✅ Database file exists at /data/polymarket.db"
  ls -lh /data/polymarket.db
  echo ""
  echo "Database size: $(du -h /data/polymarket.db | cut -f1)"
elif [ -f "data/polymarket.db" ]; then
  echo "⚠️  Database file exists at data/polymarket.db (ephemeral)"
  ls -lh data/polymarket.db
  echo ""
  echo "Database size: $(du -h data/polymarket.db | cut -f1)"
else
  echo "❌ Database file not found"
fi

echo ""
echo "=== Environment Variables ==="
echo "DATABASE_PATH: ${DATABASE_PATH:-not set}"
echo "DB_PATH: ${DB_PATH:-not set}"
echo "RAILWAY_ENVIRONMENT: ${RAILWAY_ENVIRONMENT:-not set}"

echo ""
echo "=== SQLite Check ==="
if command -v sqlite3 &> /dev/null; then
  DB_FILE="/data/polymarket.db"
  if [ ! -f "$DB_FILE" ]; then
    DB_FILE="data/polymarket.db"
  fi
  
  if [ -f "$DB_FILE" ]; then
    echo "✅ SQLite3 available, checking tables..."
    echo ""
    echo "Table counts:"
    sqlite3 "$DB_FILE" <<EOF
SELECT 
  'question_initialized_events' as table_name, COUNT(*) as count FROM question_initialized_events
UNION ALL
SELECT 'condition_preparation_events', COUNT(*) FROM condition_preparation_events
UNION ALL
SELECT 'token_registered_events', COUNT(*) FROM token_registered_events
UNION ALL
SELECT 'order_filled_events', COUNT(*) FROM order_filled_events;
EOF
  else
    echo "⚠️  Database file not found, cannot check tables"
  fi
else
  echo "⚠️  sqlite3 command not available"
fi

echo ""
echo "=== Process Check ==="
ps aux | grep -E "node|next" | grep -v grep || echo "No Node processes found"

