// API route to trigger initialization
// This is called automatically on server startup via server.js
import { startPolling } from '@/lib/polling';

let initialized = false;

export async function GET() {
  if (!initialized) {
    try {
      startPolling();
      initialized = true;
      return Response.json({ success: true, message: 'Initialization started' });
    } catch (error: any) {
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
  }
  return Response.json({ success: true, message: 'Already initialized' });
}

// Auto-initialize when this module is loaded (server-side only)
if (typeof window === 'undefined') {
  setImmediate(() => {
    try {
      startPolling();
      initialized = true;
    } catch (error) {
      console.error('[Init API] ❌ Failed to start polling:', error);
    }
  });
}

