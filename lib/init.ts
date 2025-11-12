// Initialize polling on server startup
// This is called asynchronously to avoid blocking server startup
import { startPolling } from './polling';

// Only initialize on server side
if (typeof window === 'undefined') {
  // Start polling asynchronously to avoid blocking Next.js app preparation
  // Use setImmediate to ensure this runs after the module is fully loaded
  setImmediate(() => {
    try {
      startPolling();
    } catch (error) {
      // Log error but don't crash the server
      console.error('[Init] ❌ Failed to start polling:', error);
    }
  });
}

