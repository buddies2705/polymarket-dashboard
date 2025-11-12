'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MarketCard from './components/MarketCard';
import LoadingSpinner from './components/LoadingSpinner';

interface Market {
  question_id: string;
  ancillary_data_decoded: string;
  condition_id: string;
  trade_count: number;
  question_time: string;
}

interface SyncStatus {
  inProgress: boolean;
  duration: number;
  tablesEmpty: boolean;
  needsSync: boolean;
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  
  // Timeout to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('[Frontend] Loading timeout - forcing loading to false');
        setLoading(false);
      }
    }, 5000); // 5 second timeout
    
    return () => clearTimeout(timeout);
  }, [loading]);
  
  // Force render after initial mount
  useEffect(() => {
    console.log('[Frontend] Component mounted, loading:', loading, 'markets:', markets.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSyncStatus = async () => {
    try {
      const response = await fetch('/api/sync-status');
      if (!response.ok) {
        console.warn('[Frontend] Sync status API error:', response.status);
        return;
      }
      const data = await response.json();
      if (data.success) {
        setSyncStatus(data.data);
      }
    } catch (err) {
      console.error('[Frontend] Error fetching sync status:', err);
      // Don't block the UI if sync status fails
    }
  };

  const fetchMarkets = async () => {
    try {
      console.log('[Frontend] 🚀 Fetching markets...');
      setLoading(true);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch('/api/markets', {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      console.log('[Frontend] ✅ Response received, status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Frontend] ❌ HTTP error:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[Frontend] 📦 Parsed JSON:', {
        success: data.success,
        count: data.count,
        dataLength: data.data?.length || 0
      });
      
      if (data.success && Array.isArray(data.data)) {
        console.log(`[Frontend] ✅ Setting ${data.data.length} markets`);
        setMarkets(data.data);
        setError(null);
        console.log(`[Frontend] ✅ State updated with ${data.data.length} markets`);
      } else {
        console.warn('[Frontend] ⚠️ Invalid response format:', data);
        setError(data.error || 'Invalid response format');
        setMarkets([]);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.error('[Frontend] ❌ Request timeout');
        setError('Request timeout - please refresh the page');
      } else {
        console.error('[Frontend] ❌ Error fetching markets:', err);
        setError(err.message || 'Failed to fetch markets');
      }
      setMarkets([]);
    } finally {
      console.log('[Frontend] 🏁 Finally block - setting loading to false');
      setLoading(false);
      console.log('[Frontend] 🏁 Loading state set to false');
    }
  };

  useEffect(() => {
    console.log('[Frontend] useEffect triggered - fetching data...');
    fetchSyncStatus();
    fetchMarkets();
    
    // Poll sync status every 2 seconds (will stop when sync completes)
    const syncInterval = setInterval(() => {
      fetchSyncStatus();
    }, 2000);
    
    // Auto-refresh markets every 30 seconds
    const marketsInterval = setInterval(() => {
      console.log('[Frontend] Auto-refreshing markets...');
      fetchMarkets();
    }, 30000);
    
    return () => {
      console.log('[Frontend] Cleaning up intervals');
      clearInterval(syncInterval);
      clearInterval(marketsInterval);
    };
  }, []); // Empty dependency array - only run on mount

  // Always render the main content, show loading state inline
  // Don't block rendering with early returns

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Polymarket Markets</h1>
          <div className="flex items-center gap-4">
            {loading && markets.length === 0 && (
              <div className="flex items-center gap-2">
                <LoadingSpinner />
                <span className="text-sm text-gray-400">Loading...</span>
              </div>
            )}
            {!loading && (
              <span className="text-sm text-gray-500">
                {markets.length} {markets.length === 1 ? 'market' : 'markets'} with trades
              </span>
            )}
          </div>
        </div>

        {/* Show sync status if in progress */}
        {syncStatus?.inProgress && markets.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center mb-8">
            <div className="flex flex-col items-center justify-center space-y-4">
              <LoadingSpinner />
              <div>
                <h2 className="text-xl font-semibold text-blue-900 mb-2">
                  Loading Initial Data
                </h2>
                <p className="text-blue-700 mb-4">
                  We&apos;re fetching market data from the blockchain. This may take a few minutes...
                </p>
                <div className="text-sm text-blue-600">
                  <p>Fetching events: TokenRegistered, OrderFilled, ConditionPreparation, QuestionInitialized</p>
                  {syncStatus.duration > 0 && (
                    <p className="mt-2">Time elapsed: {syncStatus.duration}s</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Show error if any */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            Error: {error}
          </div>
        )}

        {/* Show markets or empty state */}
        {markets.length === 0 && !loading ? (
          <div className="text-center py-12">
            {syncStatus?.needsSync ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-yellow-800">
                <p className="text-lg font-semibold mb-2">Initial Data Sync Required</p>
                <p className="text-sm mb-4">The database is empty. Initial data sync will start automatically on the server.</p>
                <p className="text-xs text-yellow-600">Please wait while we fetch market data from the blockchain...</p>
              </div>
            ) : (
              <div className="text-gray-500">
                <p className="text-lg mb-2">No markets found</p>
                <p className="text-sm">Markets will appear here once they have both ancillary data and trades.</p>
              </div>
            )}
          </div>
        ) : markets.length > 0 ? (
          <div>
            {/* Markets with trades */}
            {markets.filter((m: any) => m.trade_count > 0).length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Markets with Trades ({markets.filter((m: any) => m.trade_count > 0).length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {markets
                    .filter((m: any) => m.trade_count > 0)
                    .map((market) => (
                      <MarketCard key={market.question_id} market={market} />
                    ))}
                </div>
              </div>
            )}
            
            {/* Markets without trades */}
            {markets.filter((m: any) => m.trade_count === 0).length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Markets without Trades ({markets.filter((m: any) => m.trade_count === 0).length})
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Click on any market to use the &quot;Refresh Trades&quot; button to fetch trades from the API.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {markets
                    .filter((m: any) => m.trade_count === 0)
                    .map((market) => (
                      <MarketCard key={market.question_id} market={market} />
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <LoadingSpinner />
            <p className="text-gray-500 mt-4">Loading markets...</p>
          </div>
        )}
      </div>
    </div>
  );
}
