import * as cron from 'node-cron';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

import {
  fetchTokenRegisteredEvents,
  fetchOrderFilledEvents,
  fetchConditionPreparationEvents,
  fetchQuestionInitializedEvents,
  getArgumentValue,
} from './bitquery';
import {
  insertTokenRegisteredEvent,
  insertOrderFilledEvent,
  insertConditionPreparationEvent,
  insertQuestionInitializedEvent,
  areTablesEmpty,
  areAllTablesFilled,
} from './db';
import { decodeAndParseAncillaryData } from './decoder';

let isPolling = false;
let isInitialSyncInProgress = false;
let initialSyncStartTime: number | null = null;

// Queue system to ensure queries run sequentially
interface QueuedQuery {
  fn: () => Promise<any>;
  retries: number;
  maxRetries: number;
  backoffMs: number;
  name?: string;
}

let queryQueue: QueuedQuery[] = [];
let isProcessingQueue = false;

// Retry configuration
const DEFAULT_MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000; // Start with 1 second
const BACKOFF_MULTIPLIER = 2; // Double the wait time on each retry

// Sleep helper for backoff
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Process queue sequentially - only start next query after previous completes
async function processQueue() {
  if (isProcessingQueue || queryQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;
  console.log(`[Queue] 📋 Processing queue (${queryQueue.length} queries waiting)...`);

  while (queryQueue.length > 0) {
    const queuedQuery = queryQueue.shift();
    if (!queuedQuery) continue;

    const { fn, retries, maxRetries, backoffMs, name } = queuedQuery;
    const queryName = name || 'Query';

    try {
      console.log(`[Queue] ▶️  Executing ${queryName} (${queryQueue.length} remaining, attempt ${retries + 1}/${maxRetries + 1})...`);
      await fn();
      console.log(`[Queue] ✅ ${queryName} completed successfully (${queryQueue.length} remaining)`);
    } catch (error) {
      console.error(`[Queue] ❌ ${queryName} failed (attempt ${retries + 1}/${maxRetries + 1}):`, error);
      
      // Retry with backoff if we haven't exceeded max retries
      if (retries < maxRetries) {
        const nextBackoff = backoffMs * BACKOFF_MULTIPLIER;
        console.log(`[Queue] 🔄 Retrying ${queryName} in ${(nextBackoff / 1000).toFixed(1)}s (${retries + 1}/${maxRetries} retries used)...`);
        
        // Wait for backoff period
        await sleep(backoffMs);
        
        // Re-queue with incremented retry count and increased backoff
        queryQueue.unshift({
          fn,
          retries: retries + 1,
          maxRetries,
          backoffMs: nextBackoff,
          name,
        });
        console.log(`[Queue] 📥 ${queryName} re-queued for retry (backoff: ${(nextBackoff / 1000).toFixed(1)}s)`);
      } else {
        console.error(`[Queue] ❌ ${queryName} failed after ${maxRetries + 1} attempts. Giving up.`);
      }
    }
  }

  isProcessingQueue = false;
  console.log(`[Queue] ✅ Queue empty, all queries processed`);
}

// Add query to queue with retry support
function enqueueQuery(
  queryFn: () => Promise<any>,
  options?: {
    maxRetries?: number;
    initialBackoffMs?: number;
    name?: string;
  }
) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialBackoffMs = INITIAL_BACKOFF_MS,
    name,
  } = options || {};

  queryQueue.push({
    fn: queryFn,
    retries: 0,
    maxRetries,
    backoffMs: initialBackoffMs,
    name,
  });
  
  processQueue(); // Start processing if not already running
}

// Helper function to process and store events
async function processTokenRegisteredEvents(isInitialSync: boolean = false) {
  const prefix = isInitialSync ? '[Initial Sync]' : '[Polling]';
  console.log(`\n${prefix} 🪙 Processing TokenRegistered events...`);
  try {
    const events = await fetchTokenRegisteredEvents(10000);
    console.log(`${prefix} 📦 Processing ${events.length} events...`);
    let count = 0;
    let skipped = 0;
    for (const event of events) {
      const conditionId = getArgumentValue(event.Arguments, 'conditionId');
      // Extract token0 and token1 from TokenRegistered event
      const token0 = getArgumentValue(event.Arguments, 'token0');
      const token1 = getArgumentValue(event.Arguments, 'token1');
      
      if (conditionId) {
        // Store both token0 and token1 separately
        insertTokenRegisteredEvent({
          condition_id: conditionId,
          token0: token0 || undefined,
          token1: token1 || undefined,
          block_time: event.Block.Time,
          block_number: parseInt(event.Block.Number),
          transaction_hash: event.Transaction.Hash,
        });
        
        count++;
        if (count % 100 === 0) {
          console.log(`${prefix} Progress: ${count}/${events.length} processed...`);
        }
      } else {
        skipped++;
      }
    }
    console.log(`${prefix} ✅ Completed: ${count} stored, ${skipped} skipped, ${events.length} total`);
    return count;
  } catch (error) {
    console.error(`${prefix} ❌ Error processing TokenRegistered:`, error);
    return 0;
  }
}

async function processOrderFilledEvents(isInitialSync: boolean = false) {
  const prefix = isInitialSync ? '[Initial Sync]' : '[Polling]';
  console.log(`\n${prefix} 💰 Processing OrderFilled events...`);
  try {
    const events = await fetchOrderFilledEvents(10000);
    console.log(`${prefix} 📦 Processing ${events.length} events...`);
    let count = 0;
    let skipped = 0;
    for (const event of events) {
      const orderHash = getArgumentValue(event.Arguments, 'orderHash');
      const maker = getArgumentValue(event.Arguments, 'maker');
      const taker = getArgumentValue(event.Arguments, 'taker');
      const makerAssetId = getArgumentValue(event.Arguments, 'makerAssetId');
      const takerAssetId = getArgumentValue(event.Arguments, 'takerAssetId');
      const makerAmountFilled = getArgumentValue(event.Arguments, 'makerAmountFilled');
      const takerAmountFilled = getArgumentValue(event.Arguments, 'takerAmountFilled');
      const fee = getArgumentValue(event.Arguments, 'fee');

      if (orderHash && maker && taker && makerAssetId && takerAssetId) {
        insertOrderFilledEvent({
          order_hash: orderHash,
          maker,
          taker,
          maker_asset_id: makerAssetId,
          taker_asset_id: takerAssetId,
          maker_amount_filled: makerAmountFilled || '0',
          taker_amount_filled: takerAmountFilled || '0',
          fee: fee || undefined,
          block_time: event.Block.Time,
          block_number: parseInt(event.Block.Number),
          transaction_hash: event.Transaction.Hash,
        });
        count++;
        if (count % 500 === 0) {
          console.log(`${prefix} Progress: ${count}/${events.length} processed...`);
        }
      } else {
        skipped++;
      }
    }
    console.log(`${prefix} ✅ Completed: ${count} stored, ${skipped} skipped, ${events.length} total`);
    return count;
  } catch (error) {
    console.error(`${prefix} ❌ Error processing OrderFilled:`, error);
    return 0;
  }
}

async function processConditionPreparationEvents(isInitialSync: boolean = false) {
  const prefix = isInitialSync ? '[Initial Sync]' : '[Polling]';
  console.log(`\n${prefix} 🔗 Processing ConditionPreparation events...`);
  try {
    const events = await fetchConditionPreparationEvents(10000);
    console.log(`${prefix} 📦 Processing ${events.length} events...`);
    let count = 0;
    let skipped = 0;
    for (const event of events) {
      const conditionId = getArgumentValue(event.Arguments, 'conditionId');
      const questionId = getArgumentValue(event.Arguments, 'questionId');
      const outcomeSlotCount = getArgumentValue(event.Arguments, 'outcomeSlotCount');
      const oracle = getArgumentValue(event.Arguments, 'oracle');

      if (conditionId && questionId) {
        insertConditionPreparationEvent({
          condition_id: conditionId,
          question_id: questionId,
          outcome_slot_count: outcomeSlotCount || undefined,
          oracle: oracle || undefined,
          block_time: event.Block.Time,
          block_number: parseInt(event.Block.Number),
          transaction_hash: event.Transaction.Hash,
        });
        count++;
        if (count % 100 === 0) {
          console.log(`${prefix} Progress: ${count}/${events.length} processed...`);
        }
      } else {
        skipped++;
      }
    }
    console.log(`${prefix} ✅ Completed: ${count} stored, ${skipped} skipped, ${events.length} total`);
    return count;
  } catch (error) {
    console.error(`${prefix} ❌ Error processing ConditionPreparation:`, error);
    return 0;
  }
}

async function processQuestionInitializedEvents(isInitialSync: boolean = false) {
  const prefix = isInitialSync ? '[Initial Sync]' : '[Polling]';
  console.log(`\n${prefix} 📋 Processing QuestionInitialized events...`);
  try {
    const events = await fetchQuestionInitializedEvents(10000);
    console.log(`${prefix} 📦 Processing ${events.length} events...`);
    let count = 0;
    let skipped = 0;
    for (const event of events) {
      const questionId = getArgumentValue(event.Arguments, 'questionID');
      const requestTimestamp = getArgumentValue(event.Arguments, 'requestTimestamp');
      const creator = getArgumentValue(event.Arguments, 'creator');
      const ancillaryData = getArgumentValue(event.Arguments, 'ancillaryData');
      const rewardToken = getArgumentValue(event.Arguments, 'rewardToken');
      const reward = getArgumentValue(event.Arguments, 'reward');
      const proposalBond = getArgumentValue(event.Arguments, 'proposalBond');

      if (questionId) {
        // Decode ancillary data
        let decodedData = null;
        if (ancillaryData) {
          const parsed = decodeAndParseAncillaryData(ancillaryData);
          decodedData = JSON.stringify(parsed);
        }

        insertQuestionInitializedEvent({
          question_id: questionId,
          request_timestamp: requestTimestamp || undefined,
          creator: creator || undefined,
          ancillary_data: ancillaryData || undefined,
          ancillary_data_decoded: decodedData || undefined,
          reward_token: rewardToken || undefined,
          reward: reward || undefined,
          proposal_bond: proposalBond || undefined,
          block_time: event.Block.Time,
          block_number: parseInt(event.Block.Number),
          transaction_hash: event.Transaction.Hash,
        });
        count++;
        if (count % 100 === 0) {
          console.log(`${prefix} Progress: ${count}/${events.length} processed...`);
        }
      } else {
        skipped++;
      }
    }
    console.log(`${prefix} ✅ Completed: ${count} stored, ${skipped} skipped, ${events.length} total`);
    return count;
  } catch (error) {
    console.error(`${prefix} ❌ Error processing QuestionInitialized:`, error);
    return 0;
  }
}

// Initial sync function - runs all queries if any table is empty
async function runInitialSync() {
  console.log('\n[Initial Sync] 🔄 Checking if initial sync is needed...');
  
  // Only skip if ALL tables are filled
  if (areAllTablesFilled()) {
    console.log('[Initial Sync] ✅ All tables have data, skipping initial sync');
    return;
  }

  isInitialSyncInProgress = true;
  initialSyncStartTime = Date.now();
  console.log('[Initial Sync] 🚀 Starting initial data sync (some tables are empty)...\n');
  console.log('[Initial Sync] 📋 Queueing queries for sequential execution (one at a time)...\n');
  
  // Store results to track progress
  const results: { [key: string]: number } = {
    tokenReg: 0,
    orderFilled: 0,
    condPrep: 0,
    questionInit: 0,
  };

  // Create promises that will resolve when each query completes
  const promises: Promise<void>[] = [];

  // Queue TokenRegistered query with retry
  promises.push(
    new Promise<void>((resolve) => {
      enqueueQuery(
        async () => {
          results.tokenReg = await processTokenRegisteredEvents(true);
          resolve();
        },
        { name: 'TokenRegistered (Initial Sync)', maxRetries: 3 }
      );
    })
  );

  // Queue OrderFilled query (will execute after TokenRegistered completes)
  promises.push(
    new Promise<void>((resolve) => {
      enqueueQuery(
        async () => {
          results.orderFilled = await processOrderFilledEvents(true);
          resolve();
        },
        { name: 'OrderFilled (Initial Sync)', maxRetries: 3 }
      );
    })
  );

  // Queue ConditionPreparation query (will execute after OrderFilled completes)
  promises.push(
    new Promise<void>((resolve) => {
      enqueueQuery(
        async () => {
          results.condPrep = await processConditionPreparationEvents(true);
          resolve();
        },
        { name: 'ConditionPreparation (Initial Sync)', maxRetries: 3 }
      );
    })
  );

  // Queue QuestionInitialized query (will execute after ConditionPreparation completes)
  promises.push(
    new Promise<void>((resolve) => {
      enqueueQuery(
        async () => {
          results.questionInit = await processQuestionInitializedEvents(true);
          resolve();
        },
        { name: 'QuestionInitialized (Initial Sync)', maxRetries: 3 }
      );
    })
  );

  try {
    // Wait for all queries to complete (they'll execute sequentially via queue)
    await Promise.all(promises);

    const duration = initialSyncStartTime ? ((Date.now() - initialSyncStartTime) / 1000).toFixed(1) : '0';
    console.log('\n[Initial Sync] ✅ Initial sync completed!');
    console.log(`[Initial Sync] Summary (took ${duration}s):`);
    console.log(`  - TokenRegistered: ${results.tokenReg} events`);
    console.log(`  - OrderFilled: ${results.orderFilled} events`);
    console.log(`  - ConditionPreparation: ${results.condPrep} events`);
    console.log(`  - QuestionInitialized: ${results.questionInit} events\n`);
  } catch (error) {
    console.error('[Initial Sync] ❌ Error during initial sync:', error);
  } finally {
    isInitialSyncInProgress = false;
    initialSyncStartTime = null;
  }
}

// Export function to check sync status
export function getInitialSyncStatus() {
  return {
    inProgress: isInitialSyncInProgress,
    startTime: initialSyncStartTime,
    duration: initialSyncStartTime ? Math.floor((Date.now() - initialSyncStartTime) / 1000) : 0,
  };
}

export function startPolling() {
  if (isPolling) {
    console.log('[Polling] ⚠️  Polling already started, skipping...');
    return;
  }

  isPolling = true;
  console.log('\n[Polling] 🚀 Starting scheduled polling system...');
  console.log('[Polling] 📅 Schedule:');
  console.log('  - TokenRegistered: Every 5 minutes');
  console.log('  - OrderFilled: Every 1 minute');
  console.log('  - ConditionPreparation: Every 15 minutes');
  console.log('  - QuestionInitialized: Every 15 minutes\n');

  // Run initial sync if tables are empty
  runInitialSync();

  // TokenRegistered: Every 5 minutes - queue for sequential execution with retry
  cron.schedule('*/5 * * * *', () => {
    const now = new Date().toISOString();
    console.log(`\n[Polling] ⏰ ${now} - Scheduled: TokenRegistered (every 5 min) - Queued`);
    enqueueQuery(
      () => processTokenRegisteredEvents(),
      { name: 'TokenRegistered (Polling)', maxRetries: 3 }
    );
  });

  // OrderFilled: Every 1 minute - queue for sequential execution with retry
  cron.schedule('* * * * *', () => {
    const now = new Date().toISOString();
    console.log(`\n[Polling] ⏰ ${now} - Scheduled: OrderFilled (every 1 min) - Queued`);
    enqueueQuery(
      () => processOrderFilledEvents(),
      { name: 'OrderFilled (Polling)', maxRetries: 3 }
    );
  });

  // ConditionPreparation: Every 15 minutes - queue for sequential execution with retry
  cron.schedule('*/15 * * * *', () => {
    const now = new Date().toISOString();
    console.log(`\n[Polling] ⏰ ${now} - Scheduled: ConditionPreparation (every 15 min) - Queued`);
    enqueueQuery(
      () => processConditionPreparationEvents(),
      { name: 'ConditionPreparation (Polling)', maxRetries: 3 }
    );
  });

  // QuestionInitialized: Every 15 minutes - queue for sequential execution with retry
  cron.schedule('*/15 * * * *', () => {
    const now = new Date().toISOString();
    console.log(`\n[Polling] ⏰ ${now} - Scheduled: QuestionInitialized (every 15 min) - Queued`);
    enqueueQuery(
      () => processQuestionInitializedEvents(),
      { name: 'QuestionInitialized (Polling)', maxRetries: 3 }
    );
  });

  console.log('[Polling] ✅ All polling jobs scheduled and active\n');
}

