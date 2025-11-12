import { watch } from 'fs';
import { resolve } from 'path';
import { copyFileSync, existsSync } from 'fs';

const dbPath = process.env.DATABASE_PATH || resolve(process.cwd(), 'data/polymarket.db');
const copyPath = resolve(process.cwd(), 'data/polymarket.db.copy');

let isCopying = false;

function copyDatabase() {
  if (isCopying) return; // Prevent concurrent copies
  
  try {
    if (!existsSync(dbPath)) {
      console.log('[DB Watcher] ⚠️  Database file not found, skipping copy');
      return;
    }
    
    isCopying = true;
    copyFileSync(dbPath, copyPath);
    const stats = require('fs').statSync(copyPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`[DB Watcher] ✅ Database copied: ${sizeMB} MB → polymarket.db.copy`);
  } catch (error) {
    console.error('[DB Watcher] ❌ Error copying database:', error);
  } finally {
    isCopying = false;
  }
}

export function startDatabaseWatcher() {
  const dbDir = resolve(process.cwd(), 'data');
  
  // Create initial copy
  if (existsSync(dbPath)) {
    copyDatabase();
  }
  
  // Watch the database file for changes
  try {
    watch(dbPath, { persistent: true }, (eventType) => {
      if (eventType === 'change') {
        // Small delay to ensure file write is complete
        setTimeout(() => {
          copyDatabase();
        }, 500);
      }
    });
    
    console.log('[DB Watcher] 👁️  Watching database for changes...');
    console.log(`[DB Watcher] 📂 Source: ${dbPath}`);
    console.log(`[DB Watcher] 📋 Copy: ${copyPath}`);
  } catch (error) {
    console.error('[DB Watcher] ❌ Error setting up file watcher:', error);
    console.log('[DB Watcher] ⚠️  File watching not available, will copy on next manual trigger');
  }
}

