# Logging Configuration

## Getting More Verbose Logs

### Railway Environment Variables

To get more detailed logs on Railway, you can set these environment variables:

1. **NPM Log Level** (for npm install/build logs):
   ```
   NPM_CONFIG_LOGLEVEL=verbose
   ```
   Options: `error`, `warn`, `notice`, `http`, `timing`, `info`, `verbose`, `silly`

2. **Node.js Debug Logs**:
   ```
   NODE_OPTIONS=--trace-warnings
   ```
   Or for even more detail:
   ```
   NODE_OPTIONS=--trace-warnings --trace-deprecation
   ```

3. **Next.js Debug Logs**:
   ```
   DEBUG=next:*
   ```

### Application Logging

The application uses different log levels:

- **Error logs** (`console.error`): Always shown - critical errors
- **Warning logs** (`console.warn`): Important warnings
- **Info logs** (`console.log`): Reduced in production to avoid rate limits

### Viewing Logs

#### Railway Dashboard
1. Go to your Railway project
2. Click on your service
3. Go to **"Logs"** tab
4. Use filters to search for specific terms

#### Railway CLI
```bash
# View recent logs
railway logs

# Follow logs in real-time
railway logs --follow

# Filter logs
railway logs | grep "error"
railway logs | grep "DB\|Query\|Markets"
```

#### SSH into Server
```bash
railway ssh --project=YOUR_PROJECT_ID --service=YOUR_SERVICE_ID

# Then check logs
tail -f /var/log/railway/*.log
# Or check application output
ps aux | grep node
```

### Debug Endpoints

The application provides debug endpoints:

- `/api/debug` - Database status, table counts, sync status
- `/api/db-check` - Detailed database and filesystem information
- `/api/health` - Simple health check

### Reducing Log Noise

If logs are too verbose, you can:

1. Remove debug logging from code
2. Set log level to `error` only:
   ```
   NPM_CONFIG_LOGLEVEL=error
   ```

### Common Log Patterns

**Database operations:**
```
[DB] ✅ Inserted...
[DB] Query stats...
```

**API calls:**
```
[API] ✅ Found X markets
[API] ⚠️ No markets returned...
```

**Polling:**
```
[Initial Sync] Progress: X/Y processed...
[Polling] ✅ Fetched X events...
```

**Errors:**
```
[DB] ❌ Error...
[API] ❌ Error...
[Init] ❌ Failed...
```

