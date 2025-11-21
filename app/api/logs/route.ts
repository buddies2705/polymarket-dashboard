import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getInitialSyncStatus } from '@/lib/polling';

// Simple endpoint to show current application status and recent activity
export async function GET() {
  try {
    const db = getDb();
    const syncStatus = getInitialSyncStatus();
    
    // Get table counts
    const tokenRegCount = db.prepare('SELECT COUNT(*) as count FROM token_registered_events').get() as { count: number };
    const orderFilledCount = db.prepare('SELECT COUNT(*) as count FROM order_filled_events').get() as { count: number };
    const condPrepCount = db.prepare('SELECT COUNT(*) as count FROM condition_preparation_events').get() as { count: number };
    const questionInitCount = db.prepare('SELECT COUNT(*) as count FROM question_initialized_events').get() as { count: number };
    
    // Get most recent events (last 5 of each type)
    const recentTokenReg = db.prepare(`
      SELECT block_time, condition_id, transaction_hash 
      FROM token_registered_events 
      ORDER BY block_time DESC 
      LIMIT 5
    `).all();
    
    const recentOrderFilled = db.prepare(`
      SELECT block_time, maker_asset_id, taker_asset_id, transaction_hash 
      FROM order_filled_events 
      ORDER BY block_time DESC 
      LIMIT 5
    `).all();
    
    const recentCondPrep = db.prepare(`
      SELECT block_time, condition_id, question_id, transaction_hash 
      FROM condition_preparation_events 
      ORDER BY block_time DESC 
      LIMIT 5
    `).all();
    
    const recentQuestionInit = db.prepare(`
      SELECT block_time, question_id, transaction_hash 
      FROM question_initialized_events 
      ORDER BY block_time DESC 
      LIMIT 5
    `).all();
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      status: {
        sync: {
          inProgress: syncStatus.inProgress,
          duration: syncStatus.duration,
        },
        tables: {
          token_registered_events: tokenRegCount.count,
          order_filled_events: orderFilledCount.count,
          condition_preparation_events: condPrepCount.count,
          question_initialized_events: questionInitCount.count,
        },
      },
      recentActivity: {
        token_registered: recentTokenReg,
        order_filled: recentOrderFilled,
        condition_preparation: recentCondPrep,
        question_initialized: recentQuestionInit,
      },
      note: 'For full console logs, check the terminal where npm run dev is running',
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch logs',
      },
      { status: 500 }
    );
  }
}

