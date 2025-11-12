import { NextResponse } from 'next/server';
import { getMarketsWithDataAndTrades, getAllOrderFilledEvents } from '@/lib/db';
import { calculateMarketPrices } from '@/lib/price-calculator';

// Helper function to check if a trade matches tokens (UI/API level logic)
// Relationship chain:
// 1. question_initialized_events.question_id -> condition_preparation_events.question_id -> condition_id
// 2. condition_preparation_events.condition_id -> token_registered_events.condition_id -> token0, token1
// 3. token0/token1 should match maker_asset_id/taker_asset_id in order_filled_events
// Note: "0" or "0x0" in maker_asset_id/taker_asset_id means USDC, but we only match if token is also USDC
function doesTradeMatchTokens(trade: any, token0: string | null, token1: string | null): boolean {
  if (!token0 && !token1) return false;
  
  const makerAssetId = trade.maker_asset_id;
  const takerAssetId = trade.taker_asset_id;
  
  // Normalize for comparison (lowercase)
  const normalizedToken0 = token0 ? token0.toLowerCase() : null;
  const normalizedToken1 = token1 ? token1.toLowerCase() : null;
  const normalizedMaker = makerAssetId ? String(makerAssetId).toLowerCase() : null;
  const normalizedTaker = takerAssetId ? String(takerAssetId).toLowerCase() : null;
  
  // USDC representations
  const usdcValues = ['0', '0x0', '0x0000000000000000000000000000000000000000'];
  const isMakerUSDC = normalizedMaker && usdcValues.includes(normalizedMaker);
  const isTakerUSDC = normalizedTaker && usdcValues.includes(normalizedTaker);
  
  // Check if maker_asset_id matches token0 or token1
  // Only match USDC if one of the tokens is also USDC
  const makerMatch = normalizedMaker && (
    normalizedMaker === normalizedToken0 || 
    normalizedMaker === normalizedToken1 ||
    (isMakerUSDC && (normalizedToken0 && usdcValues.includes(normalizedToken0) || normalizedToken1 && usdcValues.includes(normalizedToken1)))
  );
  
  // Check if taker_asset_id matches token0 or token1
  // Only match USDC if one of the tokens is also USDC
  const takerMatch = normalizedTaker && (
    normalizedTaker === normalizedToken0 || 
    normalizedTaker === normalizedToken1 ||
    (isTakerUSDC && (normalizedToken0 && usdcValues.includes(normalizedToken0) || normalizedToken1 && usdcValues.includes(normalizedToken1)))
  );
  
  return makerMatch || takerMatch;
}

export async function GET() {
  const startTime = Date.now();
  try {
    // Get markets with token info
    const markets = getMarketsWithDataAndTrades();
    
    // Get all trades for filtering (limit to recent trades for performance)
    const allTrades = getAllOrderFilledEvents();
    
    // Create a map of trades by asset IDs for faster lookup
    const tradesByAssetId = new Map<string, any[]>();
    allTrades.forEach((trade: any) => {
      const makerId = trade.maker_asset_id ? String(trade.maker_asset_id).toLowerCase() : null;
      const takerId = trade.taker_asset_id ? String(trade.taker_asset_id).toLowerCase() : null;
      
      if (makerId) {
        if (!tradesByAssetId.has(makerId)) {
          tradesByAssetId.set(makerId, []);
        }
        tradesByAssetId.get(makerId)!.push(trade);
      }
      
      if (takerId && takerId !== makerId) {
        if (!tradesByAssetId.has(takerId)) {
          tradesByAssetId.set(takerId, []);
        }
        tradesByAssetId.get(takerId)!.push(trade);
      }
    });
    
    
    // Calculate trade counts for all markets (optimized lookup)
    const allMarkets = markets
      .map((market: any) => {
        const token0 = market.token0 ? String(market.token0).toLowerCase() : null;
        const token1 = market.token1 ? String(market.token1).toLowerCase() : null;
        
        // Get trades for token0 and token1 from the map
        const trades0 = token0 ? tradesByAssetId.get(token0) || [] : [];
        const trades1 = token1 ? tradesByAssetId.get(token1) || [] : [];
        
        // Combine and deduplicate by order_hash
        const tradeSet = new Set<string>();
        const matchingTrades: any[] = [];
        
        [...trades0, ...trades1].forEach((trade: any) => {
          if (!tradeSet.has(trade.order_hash)) {
            tradeSet.add(trade.order_hash);
            // Verify the trade actually matches (handle USDC case)
            if (doesTradeMatchTokens(trade, market.token0, market.token1)) {
              matchingTrades.push(trade);
            }
          }
        });
        
        // Parse ancillary data to get p1 and p2 for price calculation
        let parsed: any = {};
        try {
          parsed = JSON.parse(market.ancillary_data_decoded || '{}');
        } catch (e) {
          // Ignore parse errors
        }

        const p1 = parsed.p1 || '';
        const p2 = parsed.p2 || '';

        // Calculate prices for YES and NO tokens
        const prices = calculateMarketPrices(matchingTrades, market.token0, market.token1, p1, p2);

        return {
          question_id: market.question_id,
          ancillary_data_decoded: market.ancillary_data_decoded,
          question_time: market.question_time,
          condition_id: market.condition_id,
          outcome_slot_count: market.outcome_slot_count,
          token0: market.token0,
          token1: market.token1,
          trade_count: matchingTrades.length,
          prices: {
            yes: prices.yesPrice,
            no: prices.noPrice,
          },
        };
      })
      .sort((a: any, b: any) => {
        // Sort: markets with trades first, then by question_time (newest first)
        if (a.trade_count > 0 && b.trade_count === 0) return -1;
        if (a.trade_count === 0 && b.trade_count > 0) return 1;
        // If both have trades or both don't, sort by time (newest first)
        return new Date(b.question_time).getTime() - new Date(a.question_time).getTime();
      })
      .slice(0, 200); // Increased limit to show more markets

    const marketsWithTrades = allMarkets.filter((m: any) => m.trade_count > 0);
    const marketsWithoutTrades = allMarkets.filter((m: any) => m.trade_count === 0);
    
    return NextResponse.json({
      success: true,
      data: allMarkets,
      count: allMarkets.length,
      with_trades: marketsWithTrades.length,
      without_trades: marketsWithoutTrades.length,
    });
  } catch (error) {
    console.error(`[API] ❌ GET /api/markets - Error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch markets',
      },
      { status: 500 }
    );
  }
}
