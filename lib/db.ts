import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Use DATABASE_PATH env var, or default based on environment
// For Railway: Use /data/polymarket.db if /data exists (Railway volumes mount at /data)
// For local: Use data/polymarket.db
// IMPORTANT: On Railway, you MUST create a volume and mount it at /data for persistence
function getDatabasePath(): string {
  // Allow explicit override via environment variable
  if (process.env.DATABASE_PATH || process.env.DB_PATH) {
    return process.env.DATABASE_PATH || process.env.DB_PATH || '';
  }
  
  // Check if /data exists (Railway volume mount point)
  // If it exists, use it for persistence across deploys
  if (existsSync('/data')) {
    return '/data/polymarket.db';
  }
  
  // Default to local data directory
  return resolve(process.cwd(), 'data/polymarket.db');
}

const dbPath = getDatabasePath();
export { dbPath }; // Export for debug endpoint
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dbDir = resolve(dbPath, '..');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    
    console.log(`[DB] Initializing database connection at: ${dbPath}`);
    db = new Database(dbPath, {
      // Enable WAL mode for better concurrency
      // timeout option allows retries if database is locked
    });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = OFF');
    // Set busy timeout to handle concurrent access gracefully (5 seconds)
    db.pragma('busy_timeout = 5000');
    initializeDatabase(db);
    
    // Log initial table counts to verify connection
    try {
      const testCount = db.prepare('SELECT COUNT(*) as c FROM question_initialized_events').get() as { c: number };
      console.log(`[DB] Database initialized. Initial question count: ${testCount.c}`);
    } catch (error) {
      console.error('[DB] Error checking initial count:', error);
    }
  }
  return db;
}

// Force WAL checkpoint to ensure all writes are visible
// This is important for WAL mode where writes go to WAL file first
// Note: Checkpoint can block if there are active transactions, so we use RESTART mode
// which is less aggressive and won't block reads
export function checkpointDatabase(): void {
  const database = getDb();
  try {
    // Use RESTART instead of TRUNCATE to avoid blocking
    // RESTART checkpoints the WAL but doesn't truncate it, allowing concurrent access
    const result = database.pragma('wal_checkpoint(RESTART)', { simple: true });
    if (result !== 0) {
      // 0 = SQLITE_OK, non-zero means checkpoint couldn't complete (usually because of active transactions)
      // This is OK - the data will still be readable, just might be slightly behind
      console.log(`[DB] Checkpoint returned ${result} (may have active transactions)`);
    }
  } catch (error: any) {
    // Log checkpoint errors but don't fail - data is still readable
    console.error('[DB] Checkpoint error:', error.message);
  }
}

function initializeDatabase(database: Database.Database) {
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
  
  // Migration: Add token0 and token1 columns if they don't exist
  try {
    database.exec(`
      ALTER TABLE token_registered_events ADD COLUMN token0 TEXT;
    `);
  } catch (e: any) {
    // Column already exists, ignore
  }
  
  try {
    database.exec(`
      ALTER TABLE token_registered_events ADD COLUMN token1 TEXT;
    `);
  } catch (e: any) {
    // Column already exists, ignore
  }
  
  // Migration: Remove asset_id column (SQLite doesn't support DROP COLUMN, so we recreate the table)
  try {
    const tableInfo = database.prepare("PRAGMA table_info(token_registered_events)").all();
    const hasAssetId = tableInfo.some((col: any) => col.name === 'asset_id');
    
    if (hasAssetId) {
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
      
    }
  } catch (e: any) {
    // Error removing asset_id column - ignore
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

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_token_registered_condition_id ON token_registered_events(condition_id);
    CREATE INDEX IF NOT EXISTS idx_order_filled_maker_asset ON order_filled_events(maker_asset_id);
    CREATE INDEX IF NOT EXISTS idx_order_filled_taker_asset ON order_filled_events(taker_asset_id);
    CREATE INDEX IF NOT EXISTS idx_condition_prep_question_id ON condition_preparation_events(question_id);
    CREATE INDEX IF NOT EXISTS idx_condition_prep_condition_id ON condition_preparation_events(condition_id);
  `);
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
  }
}

// Query functions - Relationships are encoded in the queries:
// 1. question_initialized_events.question_id -> condition_preparation_events.question_id -> condition_id
// 2. condition_preparation_events.condition_id -> token_registered_events.condition_id -> token0, token1
// 3. token0/token1 matches maker_asset_id/taker_asset_id in order_filled_events (where "0" = USDC)
export function getMarketsWithDataAndTrades() {
  const db = getDb();
  const startTime = Date.now();
  
  // Force aggressive checkpoint to ensure WAL writes are visible
  // TRUNCATE mode forces all WAL data to be written to main database file
  try {
    const checkpointResult = db.pragma('wal_checkpoint(TRUNCATE)', { simple: true });
    if (checkpointResult !== 0) {
      console.error(`[DB] Checkpoint returned ${checkpointResult} (may have active transactions)`);
    }
  } catch (error: any) {
    // Checkpoint failed - continue anyway, WAL mode allows concurrent reads
    console.error('[DB] Checkpoint error:', error.message);
  }
  
  // Debug: Check counts before query
  const totalQuestions = db.prepare('SELECT COUNT(*) as c FROM question_initialized_events').get() as { c: number };
  const totalConditions = db.prepare('SELECT COUNT(*) as c FROM condition_preparation_events').get() as { c: number };
  const withDecoded = db.prepare(`
    SELECT COUNT(*) as c 
    FROM question_initialized_events 
    WHERE ancillary_data_decoded IS NOT NULL 
      AND ancillary_data_decoded != '' 
      AND ancillary_data_decoded != 'null'
  `).get() as { c: number };
  
  // Check how many questions have matching conditions
  const withConditions = db.prepare(`
    SELECT COUNT(DISTINCT q.question_id) as c
    FROM question_initialized_events q
    INNER JOIN condition_preparation_events c ON q.question_id = c.question_id
    WHERE q.ancillary_data_decoded IS NOT NULL 
      AND q.ancillary_data_decoded != '' 
      AND q.ancillary_data_decoded != 'null'
  `).get() as { c: number };
  
  console.log(`[DB] Query stats - Questions: ${totalQuestions.c}, Conditions: ${totalConditions.c}, With decoded: ${withDecoded.c}, With decoded+conditions: ${withConditions.c}`);
  console.log(`[DB] Database path: ${dbPath}, Connection: ${db ? 'active' : 'null'}`);
  
  // Get all markets with decoded data and their related condition/token info
  // Relationship: question_id -> condition_id -> token0/token1
  // Use LEFT JOIN for token_registered_events so markets show even without tokens
  // Relationship: question_id -> condition_id -> token0/token1 (optional)
  // Note: WAL mode allows concurrent reads even during writes, so this should work
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
    LEFT JOIN token_registered_events t ON c.condition_id = t.condition_id
    WHERE q.ancillary_data_decoded IS NOT NULL
      AND q.ancillary_data_decoded != ''
      AND q.ancillary_data_decoded != 'null'
    ORDER BY q.block_time DESC
    LIMIT 500
  `).all();
  
  console.log(`[DB] Markets query returned ${results.length} results`);
  
  return results;
}

// Get all order filled events (filtering will be done at API level)
export function getAllOrderFilledEvents() {
  const db = getDb();
  // Force aggressive checkpoint to ensure WAL writes are visible
  try {
    const checkpointResult = db.pragma('wal_checkpoint(TRUNCATE)', { simple: true });
    if (checkpointResult !== 0) {
      console.error(`[DB] Checkpoint returned ${checkpointResult} (may have active transactions)`);
    }
  } catch (error: any) {
    console.error('[DB] Checkpoint error:', error.message);
  }
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
    return null;
  }

  // Step 2: Get condition_id from the relationship
  const conditionId = (market as any).condition_id;
  if (!conditionId) {
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
  
  return results;
}

// Check if any table is empty
export function areTablesEmpty(): boolean {
  // Force checkpoint to ensure WAL writes are visible
  checkpointDatabase();
  const db = getDb();
  
  const tokenRegCount = db.prepare('SELECT COUNT(*) as count FROM token_registered_events').get() as { count: number };
  const orderFilledCount = db.prepare('SELECT COUNT(*) as count FROM order_filled_events').get() as { count: number };
  const condPrepCount = db.prepare('SELECT COUNT(*) as count FROM condition_preparation_events').get() as { count: number };
  const questionInitCount = db.prepare('SELECT COUNT(*) as count FROM question_initialized_events').get() as { count: number };
  
  // Only require QuestionInitialized and ConditionPreparation to have markets
  // TokenRegistered and OrderFilled are optional (markets can show without trades)
  const isEmpty = (
    condPrepCount.count === 0 ||
    questionInitCount.count === 0
  );
  
  return isEmpty;
}

// Check if all required tables are filled (have data)
// Only requires QuestionInitialized and ConditionPreparation (same logic as areTablesEmpty)
// TokenRegistered and OrderFilled are optional (markets can show without trades)
export function areAllTablesFilled(): boolean {
  const db = getDb();
  
  const condPrepCount = db.prepare('SELECT COUNT(*) as count FROM condition_preparation_events').get() as { count: number };
  const questionInitCount = db.prepare('SELECT COUNT(*) as count FROM question_initialized_events').get() as { count: number };
  
  // Only require QuestionInitialized and ConditionPreparation to have data
  // This matches the logic in areTablesEmpty()
  const allFilled = (
    condPrepCount.count > 0 &&
    questionInitCount.count > 0
  );
  
  return allFilled;
}
