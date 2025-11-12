# Data Flow and Table Relationships

This document explains how data flows through the Polymarket Dashboard application and how database tables are related.

## Overview

The application fetches blockchain events from Bitquery API and stores them in a SQLite database. The data is then linked together to create a complete view of markets, tokens, and trades.

## Database Tables

### 1. `question_initialized_events`

Stores market questions initialized on the UMA Oracle.

**Columns**:
- `question_id` (TEXT, PRIMARY KEY) - Unique question identifier
- `request_timestamp` (TEXT) - Timestamp of the request
- `creator` (TEXT) - Address that created the question
- `ancillary_data` (TEXT) - Hex-encoded market metadata
- `ancillary_data_decoded` (TEXT) - Decoded JSON metadata (title, description, etc.)
- `reward_token` (TEXT) - Token address for rewards
- `reward` (TEXT) - Reward amount
- `proposal_bond` (TEXT) - Bond amount required
- `block_time` (TEXT) - Block timestamp
- `block_number` (INTEGER) - Block number
- `transaction_hash` (TEXT) - Transaction hash

**Source**: `QuestionInitialized` events from UMA Adapter contract

---

### 2. `condition_preparation_events`

Links questions to conditions (outcome sets).

**Columns**:
- `condition_id` (TEXT, PRIMARY KEY) - Unique condition identifier
- `question_id` (TEXT, UNIQUE) - Links to `question_initialized_events.question_id`
- `outcome_slot_count` (TEXT) - Number of possible outcomes (usually 2)
- `oracle` (TEXT) - Oracle contract address
- `block_time` (TEXT) - Block timestamp
- `block_number` (INTEGER) - Block number
- `transaction_hash` (TEXT) - Transaction hash

**Source**: `ConditionPreparation` events from Main Polymarket contract

**Relationship**: `question_id` → `question_initialized_events.question_id`

---

### 3. `token_registered_events`

Stores outcome tokens created for each condition.

**Columns**:
- `condition_id` (TEXT, PRIMARY KEY) - Links to `condition_preparation_events.condition_id`
- `token0` (TEXT) - First outcome token ID (bigInteger, usually "No")
- `token1` (TEXT) - Second outcome token ID (bigInteger, usually "Yes")
- `block_time` (TEXT) - Block timestamp
- `block_number` (INTEGER) - Block number
- `transaction_hash` (TEXT) - Transaction hash

**Source**: `TokenRegistered` events from CTF Exchange contract

**Relationship**: `condition_id` → `condition_preparation_events.condition_id`

**Note**: token0 and token1 are ERC-1155 token IDs (big integers stored as strings).

---

### 4. `order_filled_events`

Stores all trades/orders executed on the CTF Exchange.

**Columns**:
- `order_hash` (TEXT, PRIMARY KEY) - Unique order identifier
- `maker` (TEXT) - Order maker address
- `taker` (TEXT) - Order taker address
- `maker_asset_id` (TEXT) - Asset ID being sold by maker
- `taker_asset_id` (TEXT) - Asset ID being sold by taker
- `maker_amount_filled` (TEXT) - Amount filled for maker (in token units, 6 decimals)
- `taker_amount_filled` (TEXT) - Amount filled for taker (in token units, 6 decimals)
- `fee` (TEXT) - Trading fee
- `block_time` (TEXT) - Block timestamp
- `block_number` (INTEGER) - Block number
- `transaction_hash` (TEXT) - Transaction hash

**Source**: `OrderFilled` events from CTF Exchange contract

**Relationship**: 
- `maker_asset_id` or `taker_asset_id` matches `token_registered_events.token0` or `token1`
- `0` (or `0x0`, `0x0000...`) represents USDC

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Bitquery API                             │
│  (Polygon/Matic Network Events)                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │  1. QuestionInitialized Events         │
        │     (UMA Adapter Contract)             │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │  question_initialized_events           │
        │  - question_id (PK)                    │
        │  - ancillary_data (hex)               │
        │  - ancillary_data_decoded (JSON)       │
        └───────────────────────────────────────┘
                            │
                            │ question_id
                            ▼
        ┌───────────────────────────────────────┐
        │  2. ConditionPreparation Events        │
        │     (Main Polymarket Contract)          │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │  condition_preparation_events         │
        │  - condition_id (PK)                  │
        │  - question_id (FK)                   │
        │  - outcome_slot_count                 │
        └───────────────────────────────────────┘
                            │
                            │ condition_id
                            ▼
        ┌───────────────────────────────────────┐
        │  3. TokenRegistered Events            │
        │     (CTF Exchange Contract)            │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │  token_registered_events               │
        │  - condition_id (PK)                  │
        │  - token0 (bigInteger)                 │
        │  - token1 (bigInteger)                │
        └───────────────────────────────────────┘
                            │
                            │ token0, token1
                            ▼
        ┌───────────────────────────────────────┐
        │  4. OrderFilled Events                 │
        │     (CTF Exchange Contract)            │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │  order_filled_events                   │
        │  - order_hash (PK)                    │
        │  - maker_asset_id                     │
        │  - taker_asset_id                     │
        │  - maker_amount_filled                │
        │  - taker_amount_filled               │
        └───────────────────────────────────────┘
```

## Relationship Chain

The complete relationship chain is:

```
question_initialized_events.question_id
    ↓
condition_preparation_events.question_id → condition_id
    ↓
token_registered_events.condition_id → token0, token1
    ↓
order_filled_events.maker_asset_id OR taker_asset_id matches token0 OR token1
```

## Matching Logic

### Market to Trades Matching

To find trades for a specific market:

1. Start with `question_id` from `question_initialized_events`
2. Find `condition_id` in `condition_preparation_events` where `question_id` matches
3. Find `token0` and `token1` in `token_registered_events` where `condition_id` matches
4. Find trades in `order_filled_events` where:
   - `maker_asset_id` matches `token0` OR `token1` OR is USDC (`0`)
   - `taker_asset_id` matches `token0` OR `token1` OR is USDC (`0`)
   - At least one side must be a token (not both USDC)

### USDC Handling

USDC is represented as:
- `"0"`
- `"0x0"`
- `"0x0000000000000000000000000000000000000000"`

A trade is valid for a market if:
- One side is USDC and the other is `token0` or `token1`
- OR both sides are `token0` and `token1` (token-to-token swap)

## Data Processing

### Ancillary Data Decoding

1. **Hex to UTF-8**: Convert `ancillary_data` (hex) to ASCII string
2. **Parse JSON**: Extract fields like:
   - `title` - Market title
   - `description` - Market description
   - `market_id` - Market identifier
   - `p1`, `p2`, `p3` - Outcome mappings (0=No, 1=Yes)

### Price Calculation

Prices are calculated from trades:
- **Price per YES token** = USDC amount / YES token amount
- **Price per NO token** = USDC amount / NO token amount

The calculation determines which token is YES/NO based on `p1`/`p2` values from ancillary data.

## Polling Schedule

| Event Type | Frequency | Purpose |
|------------|-----------|---------|
| QuestionInitialized | Every 15 min | New markets |
| ConditionPreparation | Every 15 min | Link questions to conditions |
| TokenRegistered | Every 5 min | Get outcome tokens |
| OrderFilled | Every 1 min | Latest trades |

## Initial Sync

On application startup:
- Checks if all tables are empty
- If empty, runs all event fetchers in parallel (with queue system)
- Populates database with recent data (last 72 hours)
- Then starts scheduled polling

## On-Demand Fetching

Users can trigger on-demand fetching:
- **Refresh Trades**: Fetches `TokenRegistered` (if missing) and `OrderFilled` events for a specific market
- **Token Holders**: Fetches `BalanceUpdates` for a market's tokens when viewing market details

