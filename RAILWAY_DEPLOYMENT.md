# Railway Deployment Guide

This guide will help you deploy the Polymarket Dashboard to Railway.

## Prerequisites

1. A GitHub account
2. A Railway account (sign up at [railway.app](https://railway.app))
3. Your Bitquery OAuth token

## Step-by-Step Deployment

### Step 1: Push to GitHub

1. **Create a new repository on GitHub**:
   - Go to [github.com](https://github.com) and create a new repository
   - Name it `polymarket-dashboard` (or any name you prefer)
   - **Do NOT** initialize with README, .gitignore, or license (we already have these)

2. **Push your code to GitHub**:
   ```bash
   # Add your GitHub repository as remote (replace YOUR_USERNAME and REPO_NAME)
   git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
   
   # Push to GitHub
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy on Railway

1. **Sign in to Railway**:
   - Go to [railway.app](https://railway.app)
   - Sign in with your GitHub account

2. **Create a New Project**:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Authorize Railway to access your GitHub repositories
   - Select your `polymarket-dashboard` repository

3. **Configure Environment Variables**:
   - Click on your project
   - Go to the "Variables" tab
   - Add the following variable:
     ```
     BITQUERY_OAUTH_TOKEN = your_actual_token_here
     ```
   - **Important**: Replace `your_actual_token_here` with your actual Bitquery OAuth token
   - No quotes needed around the token value

4. **Add Persistent Volume (for SQLite Database)**:
   - Go to your service → Settings → Volumes
   - Click "Add Volume"
   - Name: `data`
   - Mount Path: `/app/data`
   - Size: 1 GB (or more if needed)

5. **Configure Build Settings** (if needed):
   - Railway should auto-detect Next.js from `package.json`
   - Build Command: `npm install && npm run build` (already in `railway.json`)
   - Start Command: `npm start` (already in `railway.json`)

6. **Deploy**:
   - Railway will automatically start building and deploying
   - You can watch the build logs in the Railway dashboard
   - The deployment will take a few minutes

### Step 3: Get Your Application URL

1. Once deployment is complete:
   - Go to your service → Settings → Networking
   - Railway will provide a public URL like: `https://polymarket-dashboard-production.up.railway.app`
   - You can also set a custom domain if you have one

2. **Test Your Application**:
   - Open the URL in your browser
   - The application should load and start syncing data
   - Check the logs in Railway dashboard to see initialization progress

## Post-Deployment

### Monitor Logs

- Go to your service → Logs tab
- You should see:
  - `[Env] ✅ Found OAuth token...`
  - `[DB] ✅ Database initialized`
  - `[Polling] ✅ Initial sync complete`

### Check Database

- The database will be created at `/app/data/polymarket.db` in the Railway volume
- Data persists across deployments thanks to the volume

### Update Environment Variables

- Go to Variables tab
- Edit `BITQUERY_OAUTH_TOKEN` if you need to update it
- Railway will automatically restart the service

## Troubleshooting

### Build Fails

- Check build logs in Railway dashboard
- Common issues:
  - Missing dependencies: Check `package.json`
  - TypeScript errors: Fix before deploying
  - Build timeout: Increase build timeout in Railway settings

### Application Crashes

- Check application logs
- Common issues:
  - Missing `BITQUERY_OAUTH_TOKEN`: Add it in Variables
  - Database permission errors: Check volume mount path
  - Port issues: Railway sets `PORT` automatically, don't override

### No Data Showing

- Wait for initial sync (may take 5-10 minutes)
- Check logs for API errors
- Verify `BITQUERY_OAUTH_TOKEN` is correct
- Check if database volume is mounted correctly

### Database Not Persisting

- Ensure volume is mounted at `/app/data`
- Check volume size (may need to increase)
- Verify `DB_PATH` environment variable points to volume path

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BITQUERY_OAUTH_TOKEN` | ✅ Yes | - | Your Bitquery OAuth token |
| `BITQUERY_ENDPOINT` | No | `https://streaming.bitquery.io/graphql` | API endpoint |
| `PORT` | No | Auto-set by Railway | Server port (don't override) |
| `DB_PATH` | No | `data/polymarket.db` | Database path (use volume path) |

## Cost Estimate

- **Railway Free Tier**: $5/month credit
- **Estimated Cost**: ~$5-10/month for small deployments
- **Volume Storage**: Included in plan

## Next Steps

- Set up a custom domain (optional)
- Configure monitoring and alerts
- Set up automatic deployments from main branch
- Add additional environment variables if needed

## Support

If you encounter issues:
1. Check Railway logs
2. Review application logs in terminal
3. Verify environment variables are set correctly
4. Check Railway status page for service issues

