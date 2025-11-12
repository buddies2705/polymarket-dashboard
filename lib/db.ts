import Database from 'better-sqlite3';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync } from 'fs';

// Use DATABASE_PATH env var, or default to data/polymarket.db
// For production, ensure this path is in a persistent volume
const dbPath = process.env.DATABASE_PATH || process.env.DB_PATH || resolve(process.cwd(), 'data/polymarket.db');
const copyPath = resolve(process.cwd(), 'data/polymarket.db.copy');
let db: Database.Database | null = null;
let lastCopyTime = 0;
const COPY_THROTTLE_MS = 2000; // Copy at most once every 2 seconds

function copyDatabaseIfNeeded() {
  const now = Date.now();
  // Throttle copies to avoid excessive file I/O
  if (now - lastCopyTime < COPY_THROTTLE_MS) {
    return;
  }
  
  try {
    if (existsSync(dbPath)) {
      copyFileSync(dbPath, copyPath);
      lastCopyTime = now;
      // Only log occasionally to avoid spam
      if (Math.random() < 0.1) { // 10% chance to log
        const stats = require('fs').statSync(copyPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`[DB] 📋 Database copy updated: ${sizeMB} MB`);
      }
    }
  } catch (error) {
    // Silently fail to avoid spam in logs
  }
}

export function getDb(): Database.Database {
  if (!db) {
    console.log(`[DB] 📂 Initializing database at: ${dbPath}`);
    
    // Ensure data directory exists
    const dbDir = resolve(dbPath, '..');
    if (!existsSync(dbDir)) {
      console.log(`[DB] 📁 Creating data directory: ${dbDir}`);
      mkdirSync(dbDir, { recursive: true });
    }
    
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = OFF');
    initializeDatabase(db);
    console.log('[DB] ✅ Database initialized');
  }
  return db;
}

function initializeDatabase(database: Database.Database) {
  console.log('[DB] 🔧 Creating database tables...');
  // TokenRegistered events table
  database.exec(`
    CREATE TABLE IF NOT EXISTS token_registered_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      condition_id TEXT NOT NULL,
      token0 TEXT,
      token1 TEXT,
      block_time TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      transaction_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(transaction_hash, condition_id)
    )
  `);
  console.log('[DB] ✅ Created table: token_registered_events');
  
  // Migration: Add token0 and token1 columns if they don't exist
  try {
    database.exec(`
      ALTER TABLE token_registered_events ADD COLUMN token0 TEXT;
    `);
    console.log('[DB] ✅ Added column: token0');
  } catch (e: any) {
    // Column already exists, ignore
    if (!e.message?.includes('duplicate column')) {
      console.log('[DB] ⚠️  token0 column may already exist');
    }
  }
  
  try {
    database.exec(`
      ALTER TABLE token_registered_events ADD COLUMN token1 TEXT;
    `);
    console.log('[DB] ✅ Added column: token1');
  } catch (e: any) {
    // Column already exists, ignore
    if (!e.message?.includes('duplicate column')) {
      console.log('[DB] ⚠️  token1 column may already exist');
    }
  }
  
  // Migration: Remove asset_id column (SQLite doesn't support DROP COLUMN, so we recreate the table)
  try {
    const tableInfo = database.prepare("PRAGMA table_info(token_registered_events)").all();
    const hasAssetId = tableInfo.some((col: any) => col.name === 'asset_id');
    
    if (hasAssetId) {
      console.log('[DB] 🔄 Removing asset_id column (recreating table)...');
      // Create new table without asset_id
      database.exec(`
        CREATE TABLE token_registered_events_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          condition_id TEXT NOT NULL,
          token0 TEXT,
          token1 TEXT,
          block_time TEXT NOT NULL,
          block_number INTEGER NOT NULL,
          transaction_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(transaction_hash, condition_id)
        )
      `);
      
      // Copy data (excluding asset_id)
      database.exec(`
        INSERT INTO token_registered_events_new 
        (id, condition_id, token0, token1, block_time, block_number, transaction_hash, created_at)
        SELECT id, condition_id, token0, token1, block_time, block_number, transaction_hash, created_at
        FROM token_registered_events
      `);
      
      // Drop old table and rename new one
      database.exec(`DROP TABLE token_registered_events`);
      database.exec(`ALTER TABLE token_registered_events_new RENAME TO token_registered_events`);
      
      // Recreate indexes
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_token_registered_condition_id ON token_registered_events(condition_id);
      `);
      
      console.log('[DB] ✅ Removed asset_id column');
    }
  } catch (e: any) {
    console.log('[DB] ⚠️  Error removing asset_id column:', e.message);
  }

  // OrderFilled events table
  database.exec(`
    CREATE TABLE IF NOT EXISTS order_filled_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_hash TEXT UNIQUE NOT NULL,
      maker TEXT NOT NULL,
      taker TEXT NOT NULL,
      maker_asset_id TEXT NOT NULL,
      taker_asset_id TEXT NOT NULL,
      maker_amount_filled TEXT NOT NULL,
      taker_amount_filled TEXT NOT NULL,
      fee TEXT,
      block_time TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      transaction_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('[DB] ✅ Created table: order_filled_events');

  // ConditionPreparation events table
  database.exec(`
    CREATE TABLE IF NOT EXISTS condition_preparation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      condition_id TEXT UNIQUE NOT NULL,
      question_id TEXT NOT NULL,
      outcome_slot_count TEXT,
      oracle TEXT,
      block_time TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      transaction_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('[DB] ✅ Created table: condition_preparation_events');

  // QuestionInitialized events table
  database.exec(`
    CREATE TABLE IF NOT EXISTS question_initialized_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id TEXT UNIQUE NOT NULL,
      request_timestamp TEXT,
      creator TEXT,
      ancillary_data TEXT,
      ancillary_data_decoded TEXT,
      reward_token TEXT,
      reward TEXT,
      proposal_bond TEXT,
      block_time TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      transaction_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('[DB] ✅ Created table: question_initialized_events');

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_token_registered_condition_id ON token_registered_events(condition_id);
    CREATE INDEX IF NOT EXISTS idx_order_filled_maker_asset ON order_filled_events(maker_asset_id);
    CREATE INDEX IF NOT EXISTS idx_order_filled_taker_asset ON order_filled_events(taker_asset_id);
    CREATE INDEX IF NOT EXISTS idx_condition_prep_question_id ON condition_preparation_events(question_id);
    CREATE INDEX IF NOT EXISTS idx_condition_prep_condition_id ON condition_preparation_events(condition_id);
  `);
  console.log('[DB] ✅ Created indexes');
}

// Insert functions with duplicate checking
export function insertTokenRegisteredEvent(event: {
  condition_id: string;
  token0?: string;
  token1?: string;
  block_time: string;
  block_number: number;
  transaction_hash: string;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO token_registered_events 
    (condition_id, token0, token1, block_time, block_number, transaction_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    event.condition_id,
    event.token0 || null,
    event.token1 || null,
    event.block_time,
    event.block_number,
    event.transaction_hash
  );
  if (result.changes > 0) {
    // Reduced logging to avoid rate limits - only log every 100th insert
    if (Math.random() < 0.01) {
      console.log(`[DB] ✅ Inserted TokenRegistered: conditionId=${event.condition_id.substring(0, 16)}...`);
    }
    copyDatabaseIfNeeded();
  }
}

export function insertOrderFilledEvent(event: {
  order_hash: string;
  maker: string;
  taker: string;
  maker_asset_id: string;
  taker_asset_id: string;
  maker_amount_filled: string;
  taker_amount_filled: string;
  fee?: string;
  block_time: string;
  block_number: number;
  transaction_hash: string;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO order_filled_events 
    (order_hash, maker, taker, maker_asset_id, taker_asset_id, maker_amount_filled, taker_amount_filled, fee, block_time, block_number, transaction_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    event.order_hash,
    event.maker,
    event.taker,
    event.maker_asset_id,
    event.taker_asset_id,
    event.maker_amount_filled,
    event.taker_amount_filled,
    event.fee || null,
    event.block_time,
    event.block_number,
    event.transaction_hash
  );
  if (result.changes > 0) {
    // Reduced logging to avoid rate limits - only log every 100th insert
    if (Math.random() < 0.01) {
      console.log(`[DB] ✅ Inserted OrderFilled: orderHash=${event.order_hash.substring(0, 16)}...`);
    }
    copyDatabaseIfNeeded();
  }
}

export function insertConditionPreparationEvent(event: {
  condition_id: string;
  question_id: string;
  outcome_slot_count?: string;
  oracle?: string;
  block_time: string;
  block_number: number;
  transaction_hash: string;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO condition_preparation_events 
    (condition_id, question_id, outcome_slot_count, oracle, block_time, block_number, transaction_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    event.condition_id,
    event.question_id,
    event.outcome_slot_count || null,
    event.oracle || null,
    event.block_time,
    event.block_number,
    event.transaction_hash
  );
  if (result.changes > 0) {
    // Reduced logging to avoid rate limits - only log every 100th insert
    if (Math.random() < 0.01) {
      console.log(`[DB] ✅ Inserted ConditionPreparation: conditionId=${event.condition_id.substring(0, 16)}...`);
    }
    copyDatabaseIfNeeded();
  }
}

export function insertQuestionInitializedEvent(event: {
  question_id: string;
  request_timestamp?: string;
  creator?: string;
  ancillary_data?: string;
  ancillary_data_decoded?: string;
  reward_token?: string;
  reward?: string;
  proposal_bond?: string;
  block_time: string;
  block_number: number;
  transaction_hash: string;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO question_initialized_events 
    (question_id, request_timestamp, creator, ancillary_data, ancillary_data_decoded, reward_token, reward, proposal_bond, block_time, block_number, transaction_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    event.question_id,
    event.request_timestamp || null,
    event.creator || null,
    event.ancillary_data || null,
    event.ancillary_data_decoded || null,
    event.reward_token || null,
    event.reward || null,
    event.proposal_bond || null,
    event.block_time,
    event.block_number,
    event.transaction_hash
  );
  if (result.changes > 0) {
    let title = 'Unknown';
    try {
      if (event.ancillary_data_decoded) {
        const parsed = JSON.parse(event.ancillary_data_decoded);
        title = parsed.title || 'Untitled';
      }
    } catch (e) {
      // Ignore parse errors
    }
    // Reduced logging to avoid rate limits - only log every 50th insert
    if (Math.random() < 0.02) {
      console.log(`[DB] ✅ Inserted QuestionInitialized: questionId=${event.question_id.substring(0, 16)}..., title="${title.substring(0, 50)}${title.length > 50 ? '...' : ''}"`);
    }
    copyDatabaseIfNeeded();
  }
}

// Query functions - Relationships are encoded in the queries:
// 1. question_initialized_events.question_id -> condition_preparation_events.question_id -> condition_id
// 2. condition_preparation_events.condition_id -> token_registered_events.condition_id -> token0, token1
// 3. token0/token1 matches maker_asset_id/taker_asset_id in order_filled_events (where "0" = USDC)
export function getMarketsWithDataAndTrades() {
  const db = getDb();
  const startTime = Date.now();
  // Get all markets with decoded data and their related condition/token info
  // Relationship: question_id -> condition_id -> token0/token1
  const results = db.prepare(`
    SELECT DISTINCT
      q.question_id,
      q.ancillary_data_decoded,
      q.block_time as question_time,
      c.condition_id,
      c.outcome_slot_count,
      t.token0,
      t.token1
    FROM question_initialized_events q
    INNER JOIN condition_preparation_events c ON q.question_id = c.question_id
    INNER JOIN token_registered_events t ON c.condition_id = t.condition_id
    WHERE q.ancillary_data_decoded IS NOT NULL
      AND q.ancillary_data_decoded != ''
      AND q.ancillary_data_decoded != 'null'
    ORDER BY q.block_time DESC
    LIMIT 100
  `).all();
  const duration = Date.now() - startTime;
  console.log(`[DB] 📊 Query: getMarketsWithDataAndTrades() returned ${results.length} markets in ${duration}ms`);
  return results;
}

// Get all order filled events (filtering will be done at API level)
export function getAllOrderFilledEvents() {
  const db = getDb();
  return db.prepare(`
    SELECT *
    FROM order_filled_events
    ORDER BY block_time DESC
  `).all();
}

// Get token registered events for a condition
export function getTokenRegisteredEventsByConditionId(conditionId: string) {
  const db = getDb();
  return db.prepare(`
    SELECT *
    FROM token_registered_events
    WHERE condition_id = ?
  `).all(conditionId);
}

// Get market details with trades - relationships are encoded:
// 1. question_id -> condition_id (via condition_preparation_events)
// 2. condition_id -> token0/token1 (via token_registered_events)
// 3. token0/token1 -> trades (via order_filled_events matching maker_asset_id/taker_asset_id)
export function getMarketDetails(questionId: string) {
  const db = getDb();
  // Reduced logging - removed verbose query logging
  const startTime = Date.now();
  
  // Step 1: Get market and condition_id (relationship: question_id -> condition_id)
  const market = db.prepare(`
    SELECT 
      q.*,
      c.condition_id,
      c.outcome_slot_count,
      c.oracle
    FROM question_initialized_events q
    LEFT JOIN condition_preparation_events c ON q.question_id = c.question_id
    WHERE q.question_id = ?
  `).get(questionId);

  if (!market) {
    console.log(`[DB] ⚠️  Market not found for questionId: ${questionId.substring(0, 16)}...`);
    return null;
  }

  // Step 2: Get condition_id from the relationship
  const conditionId = (market as any).condition_id;
  if (!conditionId) {
    console.log(`[DB] ⚠️  No conditionId found for market (no condition_preparation_events match)`);
    return {
      market,
      trades: [],
    };
  }

  // Step 3: Get token0 and token1 for this condition (relationship: condition_id -> token0/token1)
  const tokens = db.prepare(`
    SELECT token0, token1
    FROM token_registered_events
    WHERE condition_id = ?
  `).all(conditionId);
  
  if (tokens.length === 0) {
    console.log(`[DB] ⚠️  No tokens found for conditionId: ${conditionId.substring(0, 16)}...`);
    return {
      market,
      trades: [],
    };
  }

  // Step 4: Get all trades and filter by tokens (relationship: token0/token1 -> maker_asset_id/taker_asset_id)
  // Note: We fetch all trades (no limit) to ensure we get all matching trades for this market
  const allTrades = db.prepare(`
    SELECT *
    FROM order_filled_events
    ORDER BY block_time DESC
  `).all();
  
  // Step 5: Filter trades where maker_asset_id or taker_asset_id matches token0 or token1
  // Also handles USDC case where "0" represents USDC
  const trades = filterTradesByTokens(allTrades, tokens);
  const duration = Date.now() - startTime;
  // Reduced logging - only log if query is slow
  if (duration > 500) {
    console.log(`[DB] ✅ Found market with ${trades.length} trades in ${duration}ms`);
  }

  return {
    market,
    trades,
  };
}

// Helper function to filter trades by tokens (UI/API level logic)
// Relationship chain:
// 1. question_initialized_events.question_id -> condition_preparation_events.question_id -> condition_id
// 2. condition_preparation_events.condition_id -> token_registered_events.condition_id -> token0, token1
// 3. token0/token1 should match maker_asset_id/taker_asset_id in order_filled_events
// Note: "0", "0x0", or "0x0000000000000000000000000000000000000000" in maker_asset_id/taker_asset_id means USDC
export function filterTradesByTokens(trades: any[], tokens: any[]): any[] {
  // Collect all token0 and token1 values
  const tokenSet = new Set<string>();
  tokens.forEach(t => {
    if (t.token0) tokenSet.add(t.token0.toLowerCase());
    if (t.token1) tokenSet.add(t.token1.toLowerCase());
  });
  
  // USDC representations (normalized to lowercase for comparison)
  const usdcRepresentations = new Set([
    '0',
    '0x0',
    '0x0000000000000000000000000000000000000000'
  ]);
  
  // Filter trades where maker_asset_id or taker_asset_id matches token0 or token1
  // Only match USDC if one of the tokens is also USDC
  return trades.filter(trade => {
    const makerAssetId = trade.maker_asset_id ? String(trade.maker_asset_id).toLowerCase() : null;
    const takerAssetId = trade.taker_asset_id ? String(trade.taker_asset_id).toLowerCase() : null;
    
    // Check if any token is USDC
    const hasUSDCToken = Array.from(tokenSet).some(token => usdcRepresentations.has(token));
    
    // Check if maker_asset_id matches any token
    // Only match USDC if one of the tokens is also USDC
    const makerMatch = makerAssetId && (
      tokenSet.has(makerAssetId) || 
      (usdcRepresentations.has(makerAssetId) && hasUSDCToken)
    );
    
    // Check if taker_asset_id matches any token
    // Only match USDC if one of the tokens is also USDC
    const takerMatch = takerAssetId && (
      tokenSet.has(takerAssetId) || 
      (usdcRepresentations.has(takerAssetId) && hasUSDCToken)
    );
    
    return makerMatch || takerMatch;
  });
}

// Get trades for a market by condition_id - relationships are encoded:
// 1. condition_id -> token0/token1 (via token_registered_events)
// 2. token0/token1 -> trades (via order_filled_events matching maker_asset_id/taker_asset_id)
export function getTradesForMarket(conditionId: string) {
  const db = getDb();
  console.log(`[DB] 📊 Query: getTradesForMarket(conditionId=${conditionId.substring(0, 16)}...)`);
  const startTime = Date.now();
  
  // Step 1: Get token0 and token1 for this condition (relationship: condition_id -> token0/token1)
  const tokens = db.prepare(`
    SELECT token0, token1
    FROM token_registered_events
    WHERE condition_id = ?
  `).all(conditionId);
  
  if (tokens.length === 0) {
    console.log(`[DB] ⚠️  No tokens found for conditionId: ${conditionId.substring(0, 16)}...`);
    return [];
  }
  
  // Step 2: Get all recent trades
  const allTrades = db.prepare(`
    SELECT *
    FROM order_filled_events
    ORDER BY block_time DESC
    LIMIT 1000
  `).all();
  
  // Step 3: Filter trades where maker_asset_id or taker_asset_id matches token0 or token1
  // Also handles USDC case where "0" represents USDC
  const results = filterTradesByTokens(allTrades, tokens).slice(0, 100);
  
  const duration = Date.now() - startTime;
  // Reduced logging - only log if query is slow or returns many results
  if (duration > 500 || results.length > 100) {
    console.log(`[DB] ✅ Found ${results.length} trades in ${duration}ms`);
  }
  return results;
}

// Check if any table is empty
export function areTablesEmpty(): boolean {
  const db = getDb();
  
  const tokenRegCount = db.prepare('SELECT COUNT(*) as count FROM token_registered_events').get() as { count: number };
  const orderFilledCount = db.prepare('SELECT COUNT(*) as count FROM order_filled_events').get() as { count: number };
  const condPrepCount = db.prepare('SELECT COUNT(*) as count FROM condition_preparation_events').get() as { count: number };
  const questionInitCount = db.prepare('SELECT COUNT(*) as count FROM question_initialized_events').get() as { count: number };
  
  console.log(`[DB] 📊 Table counts: TokenRegistered=${tokenRegCount.count}, OrderFilled=${orderFilledCount.count}, ConditionPrep=${condPrepCount.count}, QuestionInit=${questionInitCount.count}`);
  
  const isEmpty = (
    tokenRegCount.count === 0 ||
    orderFilledCount.count === 0 ||
    condPrepCount.count === 0 ||
    questionInitCount.count === 0
  );
  
  return isEmpty;
}

// Check if all tables are filled (have data)
export function areAllTablesFilled(): boolean {
  const db = getDb();
  
  const tokenRegCount = db.prepare('SELECT COUNT(*) as count FROM token_registered_events').get() as { count: number };
  const orderFilledCount = db.prepare('SELECT COUNT(*) as count FROM order_filled_events').get() as { count: number };
  const condPrepCount = db.prepare('SELECT COUNT(*) as count FROM condition_preparation_events').get() as { count: number };
  const questionInitCount = db.prepare('SELECT COUNT(*) as count FROM question_initialized_events').get() as { count: number };
  
  const allFilled = (
    tokenRegCount.count > 0 &&
    orderFilledCount.count > 0 &&
    condPrepCount.count > 0 &&
    questionInitCount.count > 0
  );
  
  if (allFilled) {
    console.log(`[DB] ✅ All tables have data: TokenRegistered=${tokenRegCount.count}, OrderFilled=${orderFilledCount.count}, ConditionPrep=${condPrepCount.count}, QuestionInit=${questionInitCount.count}`);
  } else {
    console.log(`[DB] ⚠️  Some tables are empty: TokenRegistered=${tokenRegCount.count}, OrderFilled=${orderFilledCount.count}, ConditionPrep=${condPrepCount.count}, QuestionInit=${questionInitCount.count}`);
  }
  
  return allFilled;
}
