# Polymarket Dashboard

A Next.js dashboard application for displaying Polymarket prediction market data, trades, and token holders using Bitquery APIs.

## 🚀 Quick Run

```bash
# 1. Install dependencies
npm install

# 2. Create .env.local file
cp .env.example .env.local

# 3. Add your Bitquery OAuth token to .env.local
# Edit .env.local and set: BITQUERY_OAUTH_TOKEN=your_token_here

# 4. Run the application
npm run dev

# 5. Open http://localhost:3001 in your browser
```

**See [Quick Start](#quick-start) section below for detailed instructions.**

## Features

- 📊 **Real-time Market Data** - View all Polymarket markets with decoded metadata
- 💹 **Trade History** - See all trades for each market with price calculations
- 👥 **Token Holders** - View who holds YES/NO tokens for each market
- 🔄 **Auto-Sync** - Automatic data synchronization from blockchain
- 💰 **Price Display** - Real-time YES/NO token prices in USDC and cents
- 🎯 **On-Demand Refresh** - Fetch trades and holders on demand

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Database**: SQLite (better-sqlite3)
- **APIs**: Bitquery GraphQL API
- **Scheduling**: node-cron
- **Language**: TypeScript

## Prerequisites

- Node.js 20 or higher
- npm or yarn
- Bitquery OAuth token ([Get one here](https://bitquery.io))

## Quick Start

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd Polymarket
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages including Next.js, React, SQLite, and other dependencies.

### Step 3: Get Your Bitquery OAuth Token

1. Go to [https://bitquery.io](https://bitquery.io)
2. Sign up or log in
3. Navigate to API settings
4. Generate an OAuth token (starts with `ory_at_`)

### Step 4: Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Bitquery OAuth token:

```bash
# Open .env.local in your editor
nano .env.local
# or
code .env.local
```

Add your token (no quotes needed):
```
BITQUERY_OAUTH_TOKEN=ory_at_your_actual_token_here
```

**Important**: 
- Do NOT add quotes around the token value
- The token should start with `ory_at_`
- Make sure there are no spaces around the `=` sign

### Step 5: Run the Application

Start the development server:

```bash
npm run dev
```

You should see output like:
```
✓ Ready in 2.3s
○ Local:        http://localhost:3001
```

### Step 6: Access the Application

Open your browser and navigate to:
```
http://localhost:3001
```

### What Happens on First Run?

1. **Database Creation**: SQLite database is created at `data/polymarket.db`
2. **Initial Data Sync**: If tables are empty, the app fetches data from Bitquery:
   - Last 72 hours of events
   - Markets, conditions, tokens, and trades
   - This may take a few minutes
3. **Background Polling**: Scheduled jobs start to keep data updated:
   - QuestionInitialized: Every 15 minutes
   - ConditionPreparation: Every 15 minutes
   - TokenRegistered: Every 5 minutes
   - OrderFilled: Every 1 minute

### Verify It's Working

1. Check the terminal for logs:
   - `[Env] ✅ Found OAuth token...`
   - `[Bitquery] ✅ Client initialized...`
   - `[DB] ✅ Database initialized`
   - `[Polling] ✅ Initial sync complete`

2. Open `http://localhost:3001` in your browser
3. You should see a list of markets
4. Click on any market to see details, trades, and holders

### Troubleshooting First Run

**No markets showing?**
- Wait for initial sync to complete (check terminal logs)
- Verify your OAuth token is correct in `.env.local`
- Check for error messages in terminal

**401 Unauthorized errors?**
- Verify token in `.env.local` is correct
- Token should start with `ory_at_`
- No quotes around token value
- Restart server after changing token

**Database errors?**
- Make sure `data/` directory is writable
- Check disk space
- Delete `data/polymarket.db*` files and restart if corrupted

## Project Structure

```
├── app/                      # Next.js app directory
│   ├── api/                 # API routes
│   │   ├── markets/         # Market endpoints
│   │   └── sync-status/    # Sync status endpoint
│   ├── components/          # React components
│   │   ├── LoadingSpinner.tsx
│   │   ├── MarketCard.tsx
│   │   └── TradeList.tsx
│   ├── markets/             # Market detail pages
│   │   └── [questionId]/
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Home page (markets list)
│   └── globals.css          # Global styles
├── lib/                     # Core libraries
│   ├── bitquery.ts         # Bitquery API client
│   ├── db.ts               # Database operations
│   ├── decoder.ts          # Ancillary data decoder
│   ├── env.ts              # Environment variable loader
│   ├── init.ts             # Application initialization
│   ├── polling.ts          # Scheduled data fetching
│   ├── price-calculator.ts # Price calculation logic
│   └── db-watcher.ts       # Database file watcher
├── docs/                    # Documentation
│   ├── BITQUERY_QUERIES.md # All Bitquery queries
│   └── DATA_FLOW.md        # Table relationships
├── data/                    # Database storage (gitignored)
├── .env.local              # Environment variables (gitignored)
└── package.json            # Dependencies
```

## How It Works

### Data Flow

1. **QuestionInitialized** events create market questions
2. **ConditionPreparation** events link questions to conditions
3. **TokenRegistered** events create YES/NO tokens for each condition
4. **OrderFilled** events record trades between tokens and USDC

See [docs/DATA_FLOW.md](./docs/DATA_FLOW.md) for detailed relationships.

### Polling Schedule

- **QuestionInitialized**: Every 15 minutes
- **ConditionPreparation**: Every 15 minutes
- **TokenRegistered**: Every 5 minutes
- **OrderFilled**: Every 1 minute

### Database

SQLite database stores all events with relationships:
- `question_initialized_events` - Market questions
- `condition_preparation_events` - Question to condition mapping
- `token_registered_events` - Condition to tokens mapping
- `order_filled_events` - All trades

Database file: `data/polymarket.db` (automatically created)

## API Endpoints

### GET `/api/markets`

Returns list of all markets with trade counts and prices.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "question_id": "...",
      "ancillary_data_decoded": "{...}",
      "condition_id": "...",
      "token0": "...",
      "token1": "...",
      "trade_count": 42,
      "prices": {
        "yes": { "formatted": "0.5234 USDC", "formattedCents": "52.3¢" },
        "no": { "formatted": "0.4766 USDC", "formattedCents": "47.7¢" }
      }
    }
  ]
}
```

### GET `/api/markets/[questionId]`

Returns market details with trades and prices.

### POST `/api/markets/[questionId]/refresh`

On-demand fetch of tokens and trades for a specific market.

### GET `/api/markets/[questionId]/holders`

Returns token holders for a market's YES/NO tokens.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BITQUERY_OAUTH_TOKEN` | Yes | - | Bitquery OAuth token |
| `BITQUERY_API_KEY` | No | - | Alternative token variable name |
| `BITQUERY_ENDPOINT` | No | `https://streaming.bitquery.io/graphql` | API endpoint |
| `PORT` | No | `3001` | Server port |
| `DB_PATH` | No | `data/polymarket.db` | Database file path |

### Production Build

```bash
npm run build
npm start
```

Make sure your production environment has `BITQUERY_OAUTH_TOKEN` set.

## Documentation

- **[Bitquery Queries](./docs/BITQUERY_QUERIES.md)** - All GraphQL queries used
- **[Data Flow](./docs/DATA_FLOW.md)** - Table relationships and data flow

## Development

### Adding New Features

1. **New API Query**: Add to `lib/bitquery.ts`
2. **New Database Table**: Add to `lib/db.ts` initialization
3. **New API Route**: Add to `app/api/`
4. **New UI Component**: Add to `app/components/`

### Database Schema

All tables use `INSERT OR IGNORE` for deduplication based on primary keys.

## Deployment

The application can be deployed to:
- **Railway** (Recommended) - Easy setup with persistent storage
- **Render** - Free tier available
- **Fly.io** - Global edge deployment
- **VPS** - Self-hosted with PM2

See deployment platform documentation for environment variable setup.

## Troubleshooting

### No Data Showing

1. Check `.env.local` has valid `BITQUERY_OAUTH_TOKEN`
2. Check server logs for API errors
3. Verify database file exists in `data/polymarket.db`
4. Check initial sync completed (see `/api/sync-status`)

### 401 Unauthorized Errors

- Verify token is correct in `.env.local`
- Token should start with `ory_at_`
- No quotes around token value
- Restart server after changing token

### Database Issues

- Database file is locked: Stop the server before accessing
- Database corrupted: Delete `data/polymarket.db*` files and restart
- Missing data: Check polling logs, may need to wait for sync

## License

[Your License Here]

## Contributing

[Contributing guidelines]

## Support

For issues and questions:
- Check [docs/BITQUERY_QUERIES.md](./docs/BITQUERY_QUERIES.md) for API details
- Check [docs/DATA_FLOW.md](./docs/DATA_FLOW.md) for data relationships
- Review server logs for error messages
