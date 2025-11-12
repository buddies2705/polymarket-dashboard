// Initialize polling on server startup
import { startPolling } from './polling';
import { startDatabaseWatcher } from './db-watcher';

// Only initialize on server side
if (typeof window === 'undefined') {
  console.log('\n[Init] 🚀 Initializing Polymarket Dashboard...');
  console.log('[Init] 📦 Starting background polling system...');
  // Start polling when this module is imported
  startPolling();
  // Start database watcher to auto-copy on changes
  startDatabaseWatcher();
} else {
  console.log('[Init] ⚠️  Skipping server-side initialization (client-side)');
}

