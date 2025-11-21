import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { startPolling } from '@/lib/polling';

async function clearAndSync() {
  const db = getDb();
  
  console.log('[Clear & Sync] 🗑️  Clearing all database tables...');
  
  // Clear all tables
  db.exec(`
    DELETE FROM token_registered_events;
    DELETE FROM order_filled_events;
    DELETE FROM condition_preparation_events;
    DELETE FROM question_initialized_events;
  `);
  
  // Reset auto-increment counters (optional, but clean)
  db.exec(`
    DELETE FROM sqlite_sequence WHERE name IN (
      'token_registered_events',
      'order_filled_events',
      'condition_preparation_events',
      'question_initialized_events'
    );
  `);
  
  // Force checkpoint to ensure deletes are visible
  db.pragma('wal_checkpoint(RESTART)');
  
  // Get counts to verify
  const tokenRegCount = db.prepare('SELECT COUNT(*) as count FROM token_registered_events').get() as { count: number };
  const orderFilledCount = db.prepare('SELECT COUNT(*) as count FROM order_filled_events').get() as { count: number };
  const condPrepCount = db.prepare('SELECT COUNT(*) as count FROM condition_preparation_events').get() as { count: number };
  const questionInitCount = db.prepare('SELECT COUNT(*) as count FROM question_initialized_events').get() as { count: number };
  
  console.log('[Clear & Sync] ✅ Database cleared. Counts:', {
    tokenReg: tokenRegCount.count,
    orderFilled: orderFilledCount.count,
    condPrep: condPrepCount.count,
    questionInit: questionInitCount.count,
  });
  
  // Trigger fresh sync
  console.log('[Clear & Sync] 🚀 Starting fresh data sync...');
  startPolling();
  
  return {
    success: true,
    message: 'Database cleared and sync started',
    counts: {
      token_registered_events: tokenRegCount.count,
      order_filled_events: orderFilledCount.count,
      condition_preparation_events: condPrepCount.count,
      question_initialized_events: questionInitCount.count,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get('confirm');
    
    // Require ?confirm=true for GET requests to prevent accidental clears
    if (confirm !== 'true') {
      return NextResponse.json(
        {
          success: false,
          error: 'Confirmation required',
          message: 'Add ?confirm=true to the URL to clear database and trigger sync',
          example: 'http://localhost:3001/api/clear-and-sync?confirm=true',
          note: 'For programmatic access, use POST method instead',
        },
        { status: 400 }
      );
    }
    
    const result = await clearAndSync();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Clear & Sync] ❌ Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to clear database and start sync',
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const result = await clearAndSync();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Clear & Sync] ❌ Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to clear database and start sync',
      },
      { status: 500 }
    );
  }
}

