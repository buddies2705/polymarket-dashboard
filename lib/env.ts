// Ensure environment variables are loaded
// Next.js automatically loads .env.local, but we ensure it's available
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local if it exists (Next.js does this automatically, but this ensures it's loaded in all contexts)
if (typeof window === 'undefined') {
  // Only load on server side
  const envLocalPath = resolve(process.cwd(), '.env.local');
  const envPath = resolve(process.cwd(), '.env');
  
  // Load .env.local first (highest priority in Next.js)
  try {
    const result = config({ path: envLocalPath });
    if (result && !result.error) {
      console.log(`[Env] ✅ Loaded .env.local file from: ${envLocalPath}`);
      console.log(`[Env] 🔑 BITQUERY_OAUTH_TOKEN loaded: ${process.env.BITQUERY_OAUTH_TOKEN ? 'Yes' : 'No'}`);
    } else if (result?.error) {
      console.log(`[Env] ⚠️  .env.local file not found at: ${envLocalPath}`);
    }
  } catch (error: any) {
    console.log(`[Env] ⚠️  Error loading .env.local: ${error?.message || 'File not found'}`);
  }
  
  // Also try .env as fallback
  try {
    const result = config({ path: envPath });
    if (result && !result.error) {
      console.log(`[Env] ✅ Loaded .env file from: ${envPath}`);
    }
  } catch (error) {
    // Ignore if file doesn't exist
  }
}

export function getBitqueryOAuthToken(): string {
  // Get token from environment variables only (from .env.local file)
  // Support both BITQUERY_OAUTH_TOKEN and BITQUERY_API_KEY
  let token = process.env.BITQUERY_OAUTH_TOKEN || process.env.BITQUERY_API_KEY;
  
  // Clean up token - remove any whitespace, newlines, quotes, etc.
  if (token) {
    token = token.trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/\n|\r/g, '') // Remove newlines
      .trim();
  }
  
  if (token && token.length > 0) {
    console.log(`[Env] ✅ Found OAuth token (length: ${token.length}, starts with: ${token.substring(0, 10)}...)`);
    return token;
  }
  
  console.log(`[Env] ⚠️  BITQUERY_OAUTH_TOKEN/BITQUERY_API_KEY not found in process.env`);
  console.log(`[Env] 🔍 Attempting to load .env.local file...`);
  
  // Try to manually load .env.local if Next.js hasn't loaded it yet
  try {
    const { config } = require('dotenv');
    const { resolve } = require('path');
    const result = config({ path: resolve(process.cwd(), '.env.local') });
    if (result && !result.error) {
      // Check again after loading
      token = process.env.BITQUERY_OAUTH_TOKEN || process.env.BITQUERY_API_KEY;
      if (token) {
        token = token.trim()
          .replace(/^["']|["']$/g, '')
          .replace(/\n|\r/g, '')
          .trim();
      }
      if (token && token.length > 0) {
        console.log(`[Env] ✅ Loaded OAuth token from .env.local (length: ${token.length})`);
        return token;
      }
    }
  } catch (error: any) {
    console.log(`[Env] ⚠️  Could not load .env.local: ${error?.message || 'File not found'}`);
  }
  
  console.log(`[Env] ❌ No OAuth token found. Please create .env.local file with:`);
  console.log(`[Env]    BITQUERY_OAUTH_TOKEN=your_token_here`);
  console.log(`[Env]    OR`);
  console.log(`[Env]    BITQUERY_API_KEY=your_token_here`);
  console.log(`[Env]    Make sure there are no quotes around the token value`);
  return '';
}

