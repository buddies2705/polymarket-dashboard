import { NextResponse } from 'next/server';
import { getDb, dbPath } from '@/lib/db';
import { existsSync, statSync } from 'fs';
import { execSync } from 'child_process';

export async function GET() {
  try {
    const db = getDb();
    
    // Get table counts
    const tokenRegCount = db.prepare('SELECT COUNT(*) as count FROM token_registered_events').get() as { count: number };
    const orderFilledCount = db.prepare('SELECT COUNT(*) as count FROM order_filled_events').get() as { count: number };
    const condPrepCount = db.prepare('SELECT COUNT(*) as count FROM condition_preparation_events').get() as { count: number };
    const questionInitCount = db.prepare('SELECT COUNT(*) as count FROM question_initialized_events').get() as { count: number };
    
    // Check database file
    const dbExists = existsSync(dbPath);
    let dbSize = 0;
    let dbStats = null;
    
    if (dbExists) {
      try {
        const stats = statSync(dbPath);
        dbSize = stats.size;
        dbStats = {
          size: stats.size,
          sizeHuman: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
          created: stats.birthtime,
          modified: stats.mtime,
        };
      } catch (e) {
        // Ignore stat errors
      }
    }
    
    // Check if /data exists
    const dataDirExists = existsSync('/data');
    let dataDirContents: string[] = [];
    if (dataDirExists) {
      try {
        dataDirContents = execSync('ls -la /data 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
      } catch (e) {
        // Ignore
      }
    }
    
    // Check current working directory
    const cwd = process.cwd();
    const cwdContents = execSync('ls -la . 2>/dev/null | head -20 || echo ""', { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    
    return NextResponse.json({
      success: true,
      data: {
        database: {
          path: dbPath,
          exists: dbExists,
          size: dbSize,
          stats: dbStats,
        },
        volume: {
          dataDirExists,
          dataDirContents: dataDirContents.slice(0, 10), // Limit to first 10 items
        },
        environment: {
          cwd,
          DATABASE_PATH: process.env.DATABASE_PATH,
          DB_PATH: process.env.DB_PATH,
          NODE_ENV: process.env.NODE_ENV,
        },
        tables: {
          question_initialized_events: questionInitCount.count,
          condition_preparation_events: condPrepCount.count,
          token_registered_events: tokenRegCount.count,
          order_filled_events: orderFilledCount.count,
        },
        filesystem: {
          cwdContents: cwdContents.slice(0, 10),
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

