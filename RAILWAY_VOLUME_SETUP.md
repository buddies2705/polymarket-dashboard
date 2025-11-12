# Railway Volume Setup for Database Persistence

## Problem

By default, Railway uses an **ephemeral filesystem** that gets wiped on every deploy. This means your SQLite database stored in `data/polymarket.db` will be lost on each deployment.

## Solution: Use Railway Volumes

Railway provides **persistent volumes** that survive deployments. You need to:

1. **Create a Volume** in your Railway project
2. **Mount it** to your service at `/data`
3. The application will automatically detect and use `/data/polymarket.db`

## Steps

### 1. Create a Volume

1. Go to your Railway project dashboard
2. Click **"New"** → **"Volume"**
3. Name it (e.g., `polymarket-db`)
4. Set the mount path to `/data`
5. Attach it to your service

### 2. Verify Environment

The application automatically detects if `/data` exists and uses it. You can also explicitly set:

```bash
DB_PATH=/data/polymarket.db
```

### 3. Verify It's Working

After setting up the volume, check the debug endpoint:

```bash
curl https://polymarket-dashboard-production.up.railway.app/api/debug
```

The `database.path` should show `/data/polymarket.db`.

## Important Notes

- **Data persists across deploys**: Once the volume is set up, your database will survive rebuilds
- **INSERT OR IGNORE**: The application uses `INSERT OR IGNORE` for all inserts, so duplicates are automatically handled
- **No data loss**: Existing data in the volume will be preserved on new deployments

## Troubleshooting

If you see empty tables after setting up the volume:

1. Check that the volume is mounted: `database.path` should be `/data/polymarket.db`
2. Check Railway logs for database initialization messages
3. Wait for initial sync to complete (may take a few minutes)
4. Verify the volume has write permissions

