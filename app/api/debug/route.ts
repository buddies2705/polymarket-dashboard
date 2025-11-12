import { NextResponse } from 'next/server';
import { getDb, areTablesEmpty, areAllTablesFilled } from '@/lib/db';
import { getInitialSyncStatus } from '@/lib/polling';
import { getBitqueryOAuthToken } from '@/lib/env';

export async function GET() {
  try {
    const db = getDb();
    
    // Get table counts
    const tokenRegCount = db.prepare('SELECT COUNT(*) as count FROM token_registered_events').get() as { count: number };
    const orderFilledCount = db.prepare('SELECT COUNT(*) as count FROM order_filled_events').get() as { count: number };
    const condPrepCount = db.prepare('SELECT COUNT(*) as count FROM condition_preparation_events').get() as { count: number };
    const questionInitCount = db.prepare('SELECT COUNT(*) as count FROM question_initialized_events').get() as { count: number };
    
    // Get sample data
    const sampleQuestion = db.prepare('SELECT * FROM question_initialized_events LIMIT 1').get();
    const sampleCondition = db.prepare('SELECT * FROM condition_preparation_events LIMIT 1').get();
    
    // Check OAuth token
    const oauthToken = getBitqueryOAuthToken();
    const hasToken = oauthToken && oauthToken.length > 0;
    
    // Get sync status
    const syncStatus = getInitialSyncStatus();
    const tablesEmpty = areTablesEmpty();
    const allTablesFilled = areAllTablesFilled();
    
    // Check if init was called
    const initCalled = typeof require !== 'undefined';
    
    return NextResponse.json({
      success: true,
      data: {
        database: {
          path: process.env.DATABASE_PATH || process.env.DB_PATH || 'data/polymarket.db',
          exists: true,
        },
        tables: {
          token_registered_events: tokenRegCount.count,
          order_filled_events: orderFilledCount.count,
          condition_preparation_events: condPrepCount.count,
          question_initialized_events: questionInitCount.count,
        },
        sync: {
          inProgress: syncStatus.inProgress,
          duration: syncStatus.duration,
          tablesEmpty,
          allTablesFilled,
          needsSync: tablesEmpty && !syncStatus.inProgress,
        },
        environment: {
          hasOAuthToken: hasToken,
          tokenLength: hasToken ? oauthToken.length : 0,
          nodeEnv: process.env.NODE_ENV,
          port: process.env.PORT,
        },
        sample: {
          question: sampleQuestion || null,
          condition: sampleCondition || null,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

