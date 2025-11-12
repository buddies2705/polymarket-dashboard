// Initialize polling on server startup
import { startPolling } from './polling';

// Only initialize on server side
if (typeof window === 'undefined') {
  // Start polling when this module is imported
  startPolling();
}

