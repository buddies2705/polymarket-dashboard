'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import TradeList from '@/app/components/TradeList';

interface MarketDetails {
  market: {
    question_id: string;
    ancillary_data_decoded: string;
    condition_id: string;
    outcome_slot_count: string;
    oracle: string;
    block_time: string;
  };
  trades: any[];
  prices?: {
    yes?: {
      formatted: string;
      formattedCents: string;
      price: number;
    } | null;
    no?: {
      formatted: string;
      formattedCents: string;
      price: number;
    } | null;
  };
}

export default function MarketDetailsPage() {
  const params = useParams();
  const questionId = params.questionId ? decodeURIComponent(params.questionId as string) : '';
  const [details, setDetails] = useState<MarketDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [holders, setHolders] = useState<any[]>([]);
  const [loadingHolders, setLoadingHolders] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const encodedQuestionId = encodeURIComponent(questionId);
        const response = await fetch(`/api/markets/${encodedQuestionId}`);
        const data = await response.json();
        
        if (data.success) {
          setDetails(data.data);
          setError(null);
          
          // Fetch holders after market details are loaded
          fetchHolders(encodedQuestionId);
        } else {
          setError(data.error || 'Market not found');
        }
      } catch (err) {
        setError('Failed to fetch market details');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    if (questionId) {
      fetchDetails();
    }
  }, [questionId]);

  const fetchHolders = async (encodedQuestionId: string) => {
    setLoadingHolders(true);
    try {
      const response = await fetch(`/api/markets/${encodedQuestionId}/holders`);
      const data = await response.json();
      
      if (data.success) {
        setHolders(data.data.holders || []);
      } else {
        console.error('Failed to fetch holders:', data.error);
        console.error('Error details:', data.details);
        setHolders([]);
        // Show error to user
        if (data.error) {
          setError(`Failed to fetch holders: ${data.error}`);
        }
      }
    } catch (err: any) {
      console.error('Error fetching holders:', err);
      setHolders([]);
      setError(`Failed to fetch holders: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoadingHolders(false);
    }
  };

  const handleRefreshTrades = async () => {
    if (!questionId || refreshing) return;
    
    setRefreshing(true);
    setRefreshMessage('🔄 Fetching tokens and trades from API... This may take a moment.');
    
    try {
      const encodedQuestionId = encodeURIComponent(questionId);
      const response = await fetch(`/api/markets/${encodedQuestionId}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update the trades in the details
        if (details) {
          setDetails({
            ...details,
            trades: data.data.trades,
          });
        }
        
        const messages = [];
        if (data.data.tokensFetched) {
          messages.push('✅ Tokens fetched from API');
        }
        if (data.data.tradesFetched) {
          messages.push(`✅ Found ${data.data.count} trades`);
        }
        setRefreshMessage(messages.join(' | ') || '✅ Refresh complete');
        
        // Clear message after 5 seconds
        setTimeout(() => {
          setRefreshMessage(null);
        }, 5000);
      } else {
        setRefreshMessage(`❌ Error: ${data.error || 'Failed to refresh trades'}`);
        setTimeout(() => {
          setRefreshMessage(null);
        }, 5000);
      }
    } catch (err) {
      console.error('Error refreshing trades:', err);
      setRefreshMessage('❌ Failed to refresh trades. Please try again.');
      setTimeout(() => {
        setRefreshMessage(null);
      }, 5000);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <Link href="/" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
            ← Back to Markets
          </Link>
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <Link href="/" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
            ← Back to Markets
          </Link>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error || 'Market not found'}
          </div>
        </div>
      </div>
    );
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(details.market.ancillary_data_decoded || '{}');
  } catch (e) {
    // Ignore parse errors
  }

  const title = parsed.title || 'Untitled Market';
  const description = parsed.description || '';
  const marketId = parsed.market_id || '';
  // Map 0/1 to No/Yes for better UI display
  const p1 = parsed.p1 === '0' ? 'No' : parsed.p1 === '1' ? 'Yes' : parsed.p1 || '';
  const p2 = parsed.p2 === '0' ? 'No' : parsed.p2 === '1' ? 'Yes' : parsed.p2 || '';
  const p3 = parsed.p3 === '0' ? 'No' : parsed.p3 === '1' ? 'Yes' : parsed.p3 || '';
  const resData = parsed.res_data || '';
  const initializer = parsed.initializer || '';

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <Link href="/" className="text-blue-600 hover:text-blue-800 mb-6 inline-block">
          ← Back to Markets
        </Link>

        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{title}</h1>
              
              {marketId && (
                <div className="mb-4">
                  <span className="text-sm text-gray-500">Market ID: </span>
                  <span className="text-sm font-mono">{marketId}</span>
                </div>
              )}
            </div>
            
            {/* Price Display */}
            {details.prices && (
              <div className="flex gap-4 ml-6">
                {details.prices.yes && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 min-w-[120px]">
                    <div className="text-xs text-green-600 font-medium mb-1">YES</div>
                    <div className="text-lg font-bold text-green-900">
                      {details.prices.yes.formattedCents}
                    </div>
                    <div className="text-xs text-green-700">
                      {details.prices.yes.formatted}
                    </div>
                  </div>
                )}
                {details.prices.no && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 min-w-[120px]">
                    <div className="text-xs text-red-600 font-medium mb-1">NO</div>
                    <div className="text-lg font-bold text-red-900">
                      {details.prices.no.formattedCents}
                    </div>
                    <div className="text-xs text-red-700">
                      {details.prices.no.formatted}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {description && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{description}</p>
            </div>
          )}

          {(p1 || p2 || p3) && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Outcomes</h2>
              <div className="flex gap-2 flex-wrap">
                {p1 && (
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded">
                    {p1}
                  </span>
                )}
                {p2 && (
                  <span className="px-3 py-1 bg-purple-50 text-purple-700 text-sm rounded">
                    {p2}
                  </span>
                )}
                {p3 && (
                  <span className="px-3 py-1 bg-gray-50 text-gray-700 text-sm rounded">
                    {p3}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Technical Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 p-3 rounded">
                <span className="text-gray-600 font-medium block mb-1">Condition ID:</span>
                <p className="font-mono text-xs break-all text-gray-900">{details.market.condition_id}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <span className="text-gray-600 font-medium block mb-1">Question ID:</span>
                <p className="font-mono text-xs break-all text-gray-900">{details.market.question_id}</p>
              </div>
              {details.market.oracle && (
                <div className="bg-gray-50 p-3 rounded">
                  <span className="text-gray-600 font-medium block mb-1">Oracle:</span>
                  <p className="font-mono text-xs break-all text-gray-900">{details.market.oracle}</p>
                </div>
              )}
              <div className="bg-gray-50 p-3 rounded">
                <span className="text-gray-600 font-medium block mb-1">Created:</span>
                <p className="text-gray-900">{new Date(details.market.block_time).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Trades ({details.trades.length})</h2>
            <button
              onClick={handleRefreshTrades}
              disabled={refreshing}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                refreshing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {refreshing ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner />
                  Refreshing...
                </span>
              ) : (
                'Refresh Trades'
              )}
            </button>
          </div>
          
          {refreshMessage && (
            <div className={`mb-4 p-3 rounded ${
              refreshMessage.includes('✅') 
                ? 'bg-green-50 text-green-700 border border-green-200' 
                : refreshMessage.includes('⚠️')
                ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {refreshMessage}
            </div>
          )}
          
          <TradeList trades={details.trades} />
        </div>

        {/* Holders Section */}
        <div className="bg-white rounded-lg shadow-sm p-8 mt-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Token Holders ({loadingHolders ? '...' : holders.length})
          </h2>
          
          {loadingHolders ? (
            <div className="text-center py-8">
              <LoadingSpinner />
              <p className="text-gray-500 mt-4">Loading holders...</p>
            </div>
          ) : holders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No holders found for this market
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Token ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Balance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Currency
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {holders.map((holder, index) => (
                    <tr key={`${holder.address}-${holder.tokenId}-${index}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <a
                          href={`https://polygonscan.com/address/${holder.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-blue-600 hover:text-blue-800"
                        >
                          {holder.address.substring(0, 6)}...{holder.address.substring(38)}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="font-mono text-xs">
                          {holder.tokenId.substring(0, 16)}...
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {parseFloat(holder.balance).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {holder.currency.symbol || holder.currency.name || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
