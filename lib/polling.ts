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
  checkpointDatabase,
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

  while (queryQueue.length > 0) {
    const queuedQuery = queryQueue.shift();
    if (!queuedQuery) continue;

    const { fn, retries, maxRetries, backoffMs } = queuedQuery;

    try {
      await fn();
    } catch (error) {
      console.error(`[Queue] ❌ Query failed (attempt ${retries + 1}/${maxRetries + 1}):`, error);
      
      // Retry with backoff if we haven't exceeded max retries
      if (retries < maxRetries) {
        const nextBackoff = backoffMs * BACKOFF_MULTIPLIER;
        
        // Wait for backoff period
        await sleep(backoffMs);
        
        // Re-queue with incremented retry count and increased backoff
        queryQueue.unshift({
          fn,
          retries: retries + 1,
          maxRetries,
          backoffMs: nextBackoff,
          name: queuedQuery.name,
        });
      } else {
        console.error(`[Queue] ❌ Query failed after ${maxRetries + 1} attempts. Giving up.`);
      }
    }
  }

  isProcessingQueue = false;
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
  try {
    const events = await fetchTokenRegisteredEvents(10000);
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
        // Reduced logging - only log every 1000 items
        if (count % 1000 === 0) {
          console.log(`${prefix} Progress: ${count}/${events.length} processed...`);
        }
      } else {
        skipped++;
      }
    }
    return count;
  } catch (error) {
    console.error(`${prefix} ❌ Error processing TokenRegistered:`, error);
    return 0;
  }
}

async function processOrderFilledEvents(isInitialSync: boolean = false) {
  const prefix = isInitialSync ? '[Initial Sync]' : '[Polling]';
  try {
    const events = await fetchOrderFilledEvents(10000);
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
      } else {
        skipped++;
      }
    }
    return count;
  } catch (error) {
    console.error(`${prefix} ❌ Error processing OrderFilled:`, error);
    return 0;
  }
}

async function processConditionPreparationEvents(isInitialSync: boolean = false) {
  const prefix = isInitialSync ? '[Initial Sync]' : '[Polling]';
  try {
    const events = await fetchConditionPreparationEvents(10000);
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
        // Reduced logging - only log every 1000 items
        if (count % 1000 === 0) {
          console.log(`${prefix} Progress: ${count}/${events.length} processed...`);
        }
      } else {
        skipped++;
      }
    }
    return count;
  } catch (error) {
    console.error(`${prefix} ❌ Error processing ConditionPreparation:`, error);
    return 0;
  }
}

async function processQuestionInitializedEvents(isInitialSync: boolean = false) {
  const prefix = isInitialSync ? '[Initial Sync]' : '[Polling]';
  try {
    const events = await fetchQuestionInitializedEvents(10000);
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
        // Reduced logging - only log every 1000 items
        if (count % 1000 === 0) {
          console.log(`${prefix} Progress: ${count}/${events.length} processed...`);
        }
      } else {
        skipped++;
      }
    }
    return count;
  } catch (error) {
    console.error(`${prefix} ❌ Error processing QuestionInitialized:`, error);
    return 0;
  }
}

// Initial sync function - runs all queries if any table is empty
async function runInitialSync() {
  // Only skip if ALL tables are filled
  if (areAllTablesFilled()) {
    return;
  }

  isInitialSyncInProgress = true;
  initialSyncStartTime = Date.now();
  
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
    
    // Force WAL checkpoint after initial sync to ensure data is visible
    checkpointDatabase();

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
    return;
  }

  isPolling = true;

  // Run initial sync if tables are empty
  runInitialSync();

  // All queries run every 60 minutes - queue for sequential execution with retry
  // TokenRegistered: Every 60 minutes
  cron.schedule('0 * * * *', () => {
    enqueueQuery(
      () => processTokenRegisteredEvents(),
      { name: 'TokenRegistered (Polling)', maxRetries: 3 }
    );
  });

  // OrderFilled: Every 60 minutes
  cron.schedule('0 * * * *', () => {
    enqueueQuery(
      () => processOrderFilledEvents(),
      { name: 'OrderFilled (Polling)', maxRetries: 3 }
    );
  });

  // ConditionPreparation: Every 60 minutes
  cron.schedule('0 * * * *', () => {
    enqueueQuery(
      () => processConditionPreparationEvents(),
      { name: 'ConditionPreparation (Polling)', maxRetries: 3 }
    );
  });

  // QuestionInitialized: Every 60 minutes
  cron.schedule('0 * * * *', () => {
    enqueueQuery(
      () => processQuestionInitializedEvents(),
      { name: 'QuestionInitialized (Polling)', maxRetries: 3 }
    );
  });

}

