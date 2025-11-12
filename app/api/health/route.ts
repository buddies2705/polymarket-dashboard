import { NextResponse } from 'next/server';

// Simple health check endpoint for Railway
// This ensures the server is responding even if background tasks are still initializing
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}

