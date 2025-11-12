# Deployment Guide

This guide covers deploying the Polymarket Dashboard to various platforms.

## Quick Deploy: Railway (Recommended)

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/polymarket-dashboard.git
   git push -u origin main
   ```

2. **Deploy on Railway**:
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

3. **Configure Environment Variables**:
   - Go to your project → Variables
   - Add: `BITQUERY_OAUTH_TOKEN=your_token_here`

4. **Add Persistent Volume** (for SQLite):
   - Go to your service → Settings → Volumes
   - Add volume: `/app/data` (mounts to `/app/data`)

5. **Done!** Railway will provide a URL like: `https://polymarket-dashboard-production.up.railway.app`

## Other Platforms

### Render

1. Push to GitHub
2. Go to [render.com](https://render.com)
3. New → Web Service → Connect GitHub repo
4. Set environment variables
5. Add persistent disk: `/opt/render/project/src/data`

### Fly.io

1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Run: `fly launch`
3. Create volume: `fly volumes create data --size 1`
4. Set secrets: `fly secrets set BITQUERY_OAUTH_TOKEN=your_token`
5. Deploy: `fly deploy`

## Environment Variables

Required:
- `BITQUERY_OAUTH_TOKEN` - Your Bitquery OAuth token

Optional:
- `BITQUERY_ENDPOINT` - API endpoint (defaults to streaming endpoint)
- `PORT` - Server port (defaults to 3001)
- `DB_PATH` - Database path (defaults to `data/polymarket.db`)

## Database Persistence

For production, ensure the database path is in a persistent volume:
- Railway: Mount volume to `/app/data`
- Render: Mount disk to `/opt/render/project/src/data`
- Fly.io: Mount volume to `/app/data`

## Build & Start Commands

- **Build**: `npm install && npm run build`
- **Start**: `npm start`

The application will automatically:
- Create database on first run
- Fetch initial data if tables are empty
- Start background polling

