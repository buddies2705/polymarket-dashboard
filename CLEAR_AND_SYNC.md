# Clear Database and Fresh Sync

This document describes how to clear all database data and trigger a fresh data synchronization.

## Overview

The `/api/clear-and-sync` endpoint allows you to:
1. **Clear all data** from all database tables
2. **Trigger a fresh sync** to repopulate the database with new data from Bitquery

This is useful when:
- You want to start with a clean slate
- Data appears corrupted or incomplete
- You need to test the sync process
- You want to refresh all data after making changes to the data fetching logic

## API Endpoint

**Endpoint:** `POST /api/clear-and-sync`

**Method:** POST

**Content-Type:** `application/json`

**Authentication:** None required (local development only)

## Usage

### Using cURL

```bash
curl -X POST http://localhost:3001/api/clear-and-sync \
  -H "Content-Type: application/json"
```

### Using JavaScript/Fetch

```javascript
const response = await fetch('http://localhost:3001/api/clear-and-sync', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log(data);
```

### Response

**Success Response (200):**
```json
{
  "success": true,
  "message": "Database cleared and sync started",
  "counts": {
    "token_registered_events": 0,
    "order_filled_events": 0,
    "condition_preparation_events": 0,
    "question_initialized_events": 0
  }
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Error message here"
}
```

## What It Does

### 1. Clears All Tables

The endpoint deletes all records from:
- `token_registered_events`
- `order_filled_events`
- `condition_preparation_events`
- `question_initialized_events`

### 2. Resets Auto-Increment Counters

Resets SQLite's auto-increment sequence for all tables, ensuring clean IDs start from 1.

### 3. Forces Database Checkpoint

Performs a WAL (Write-Ahead Logging) checkpoint to ensure all deletions are immediately visible.

### 4. Triggers Fresh Sync

Automatically calls `startPolling()`, which:
- Detects that tables are empty
- Triggers `runInitialSync()`
- Fetches fresh data from Bitquery for the last 72 hours
- Populates all tables sequentially

## Monitoring Sync Progress

After calling the endpoint, you can monitor the sync progress:

### Check Sync Status

```bash
curl http://localhost:3001/api/sync-status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "inProgress": true,
    "duration": 45,
    "tablesEmpty": true,
    "needsSync": false
  }
}
```

### Check Database Counts

```bash
curl http://localhost:3001/api/debug
```

**Response includes:**
```json
{
  "success": true,
  "data": {
    "tables": {
      "token_registered_events": 0,
      "order_filled_events": 0,
      "condition_preparation_events": 0,
      "question_initialized_events": 0
    },
    "sync": {
      "inProgress": true,
      "duration": 45,
      "tablesEmpty": true,
      "allTablesFilled": false,
      "needsSync": false
    }
  }
}
```

## Sync Process

The fresh sync follows this sequence:

1. **TokenRegistered Events** - Fetches token registration events from CTF Exchange
2. **OrderFilled Events** - Fetches trade/order events from CTF Exchange
3. **ConditionPreparation Events** - Fetches condition preparation events from Main Polymarket
4. **QuestionInitialized Events** - Fetches question initialization events from UMA Adapter

Each query:
- Fetches data from the last 72 hours
- Has a limit of 10,000 events per call
- Executes sequentially (one at a time) to avoid rate limiting
- Has retry logic (up to 3 retries with exponential backoff)
- Uses `INSERT OR IGNORE` to prevent duplicates

## Time to Complete

The sync typically takes:
- **2-5 minutes** for initial data fetch
- **5-10 minutes** total for all 4 queries to complete

The exact time depends on:
- Number of events in the last 72 hours
- Bitquery API response times
- Network conditions

## Important Notes

### Data Loss Warning

⚠️ **This operation permanently deletes all existing data.** Make sure you want to clear everything before calling this endpoint.

### Duplicate Prevention

The sync uses `INSERT OR IGNORE` for all inserts, so if you accidentally call the endpoint multiple times, it won't create duplicates.

### WAL Mode

The database uses WAL (Write-Ahead Logging) mode for better concurrency. The endpoint forces a checkpoint to ensure all deletions are immediately visible.

### Railway Deployment

On Railway, this endpoint works the same way. However, if you have a persistent volume mounted at `/data`, the database file will persist across deployments, but calling this endpoint will still clear all data.

## Example Workflow

```bash
# 1. Clear database and start fresh sync
curl -X POST http://localhost:3001/api/clear-and-sync

# 2. Wait a few seconds, then check sync status
curl http://localhost:3001/api/sync-status

# 3. Monitor progress (check every 10-20 seconds)
watch -n 10 'curl -s http://localhost:3001/api/sync-status | jq'

# 4. Once sync completes, check final counts
curl http://localhost:3001/api/debug | jq '.data.tables'
```

## Troubleshooting

### Sync Not Starting

If the sync doesn't start after clearing:
1. Check that polling is enabled: `curl http://localhost:3001/api/init`
2. Check server logs for errors
3. Verify Bitquery token is valid: `curl http://localhost:3001/api/debug | jq '.data.environment'`

### Sync Stuck

If sync appears stuck:
1. Check server logs for errors
2. Verify Bitquery API is accessible
3. Check if there are too many events (may need to increase limits)
4. Restart the application

### Data Not Appearing

If data doesn't appear after sync:
1. Wait a few more minutes (sync can take 5-10 minutes)
2. Check WAL checkpoint status: `curl http://localhost:3001/api/debug | jq '.data.database.checkpointStatus'`
3. Force a checkpoint by calling the debug endpoint
4. Check if tables are actually empty: `curl http://localhost:3001/api/debug | jq '.data.tables'`

## Related Endpoints

- **`GET /api/sync-status`** - Check if sync is in progress
- **`GET /api/debug`** - Get detailed database and sync information
- **`GET /api/init`** - Manually trigger polling (if not auto-started)
- **`GET /api/markets`** - Get all markets (after sync completes)

## See Also

- [Initial Sync APIs](./INITIAL_SYNC_APIS.md) - Detailed information about the sync queries
- [Data Flow](./docs/DATA_FLOW.md) - How data flows through the system
- [Railway Deployment](./RAILWAY_DEPLOYMENT.md) - Deployment-specific information

