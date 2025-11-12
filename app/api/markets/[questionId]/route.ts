import { NextRequest, NextResponse } from 'next/server';
import { getMarketDetails, getTokenRegisteredEventsByConditionId } from '@/lib/db';
import { calculateMarketPrices } from '@/lib/price-calculator';

export async function GET(
  request: NextRequest,
  { params }: { params: { questionId: string } }
) {
  const { questionId } = params;
  console.log(`[API] 📊 GET /api/markets/${questionId.substring(0, 16)}... - Fetching market details...`);
  const startTime = Date.now();
  try {
    // getMarketDetails already filters trades correctly, so we use them directly
    const details = getMarketDetails(questionId);
    
    if (!details) {
      const duration = Date.now() - startTime;
      console.log(`[API] ⚠️  GET /api/markets/${questionId.substring(0, 16)}... - Market not found (${duration}ms)`);
      return NextResponse.json(
        {
          success: false,
          error: 'Market not found',
        },
        { status: 404 }
      );
    }

    // getMarketDetails already returns filtered trades, so use them directly
    const trades = details.trades || [];
    
    // Get token0 and token1 for price calculation
    const conditionId = (details.market as any).condition_id;
    let token0: string | null = null;
    let token1: string | null = null;
    
    if (conditionId) {
      const tokens = getTokenRegisteredEventsByConditionId(conditionId);
      if (tokens.length > 0) {
        const tokenData = tokens[0] as any;
        token0 = tokenData.token0 || null;
        token1 = tokenData.token1 || null;
      }
    }

    // Parse ancillary data to get p1 and p2
    let parsed: any = {};
    try {
      parsed = JSON.parse((details.market as any).ancillary_data_decoded || '{}');
    } catch (e) {
      // Ignore parse errors
    }

    const p1 = parsed.p1 || '';
    const p2 = parsed.p2 || '';

    // Calculate prices for YES and NO tokens
    const prices = calculateMarketPrices(trades, token0, token1, p1, p2);
    
    console.log(`[API] 📦 Market details: condition_id=${conditionId}, trades=${trades.length}`);
    console.log(`[API] 💰 Prices: YES=${prices.yesPrice?.formatted || 'N/A'}, NO=${prices.noPrice?.formatted || 'N/A'}`);
    if (trades.length > 0) {
      console.log(`[API] 📊 Sample trade: maker=${trades[0].maker_asset_id}, taker=${trades[0].taker_asset_id}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[API] ✅ GET /api/markets/${questionId.substring(0, 16)}... - Returning market with ${trades.length} trades (${duration}ms)`);
    return NextResponse.json({
      success: true,
      data: {
        market: details.market,
        trades: trades,
        prices: {
          yes: prices.yesPrice,
          no: prices.noPrice,
        },
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[API] ❌ GET /api/markets/${questionId.substring(0, 16)}... - Error after ${duration}ms:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch market details',
      },
      { status: 500 }
    );
  }
}
