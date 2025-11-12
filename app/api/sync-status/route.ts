import { NextResponse } from 'next/server';
import { getInitialSyncStatus } from '@/lib/polling';
import { areTablesEmpty } from '@/lib/db';

export async function GET() {
  try {
    const syncStatus = getInitialSyncStatus();
    const tablesEmpty = areTablesEmpty();
    
    return NextResponse.json({
      success: true,
      data: {
        inProgress: syncStatus.inProgress,
        duration: syncStatus.duration,
        tablesEmpty,
        needsSync: tablesEmpty && !syncStatus.inProgress,
      },
    });
  } catch (error) {
    console.error('[API] ❌ Error fetching sync status:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch sync status',
      },
      { status: 500 }
    );
  }
}

