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
    config({ path: envLocalPath });
  } catch (error) {
    // Ignore if file doesn't exist
  }
  
  // Also try .env as fallback
  try {
    config({ path: envPath });
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
    return token;
  }
  
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
        return token;
      }
    }
  } catch (error) {
    // Ignore
  }
  
  return '';
}

