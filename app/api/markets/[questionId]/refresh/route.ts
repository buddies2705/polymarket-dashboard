import { NextRequest, NextResponse } from 'next/server';
import { getMarketDetails, getTokenRegisteredEventsByConditionId, insertTokenRegisteredEvent, insertOrderFilledEvent, getAllOrderFilledEvents } from '@/lib/db';
import { fetchTokenRegisteredByConditionId, fetchOrderFilledByTokens, getArgumentValue } from '@/lib/bitquery';
import { filterTradesByTokens } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { questionId: string } }
) {
  const { questionId } = params;
  console.log(`[API] 🔄 POST /api/markets/${questionId.substring(0, 16)}.../refresh - Refreshing market data...`);
  const startTime = Date.now();
  
  try {
    // Step 1: Get market details
    const details = getMarketDetails(questionId);
    
    if (!details) {
      return NextResponse.json(
        {
          success: false,
          error: 'Market not found',
        },
        { status: 404 }
      );
    }

    const conditionId = (details.market as any).condition_id;
    if (!conditionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'No condition_id found for this market',
        },
        { status: 400 }
      );
    }

    // Step 2: Check if tokens exist in DB, if not fetch from API
    let tokens = getTokenRegisteredEventsByConditionId(conditionId);
    let token0: string | null = null;
    let token1: string | null = null;

    const tokenData = tokens[0] as any;
    if (tokens.length === 0 || !tokenData?.token0 || !tokenData?.token1) {
      console.log(`[API] 📡 Tokens not found in DB, fetching from API for conditionId: ${conditionId.substring(0, 16)}...`);
      
      try {
        const tokenEvents = await fetchTokenRegisteredByConditionId(conditionId);
        
        if (tokenEvents.length > 0) {
          // Process and store the first TokenRegistered event
          const event = tokenEvents[0];
          const eventConditionId = getArgumentValue(event.Arguments, 'conditionId');
          const eventToken0 = getArgumentValue(event.Arguments, 'token0');
          const eventToken1 = getArgumentValue(event.Arguments, 'token1');
          
          if (eventConditionId && eventToken0 && eventToken1) {
            insertTokenRegisteredEvent({
              condition_id: eventConditionId,
              token0: eventToken0,
              token1: eventToken1,
              block_time: event.Block.Time,
              block_number: event.Block.Number,
              transaction_hash: event.Transaction.Hash,
            });
            
            token0 = eventToken0;
            token1 = eventToken1;
            console.log(`[API] ✅ Stored tokens: token0=${token0.substring(0, 16)}..., token1=${token1.substring(0, 16)}...`);
          }
        } else {
          console.log(`[API] ⚠️  No TokenRegistered events found for conditionId`);
        }
      } catch (error) {
        console.error(`[API] ❌ Error fetching tokens:`, error);
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to fetch tokens from API',
          },
          { status: 500 }
        );
      }
    } else {
      // Use existing tokens from DB
      const tokenData = tokens[0] as any;
      token0 = tokenData.token0;
      token1 = tokenData.token1;
      console.log(`[API] ✅ Using existing tokens from DB: token0=${token0?.substring(0, 16)}..., token1=${token1?.substring(0, 16)}...`);
    }

    if (!token0 || !token1) {
      return NextResponse.json(
        {
          success: false,
          error: 'Could not determine token0 and token1 for this market',
        },
        { status: 400 }
      );
    }

    // Step 3: Get existing trades from DB
    const existingTrades = getAllOrderFilledEvents();
    const existingTradesForMarket = filterTradesByTokens(existingTrades, [{ token0, token1 }]);
    console.log(`[API] 📊 Found ${existingTradesForMarket.length} existing trades in DB`);

    // Step 4: Fetch new trades from API
    console.log(`[API] 📡 Fetching new trades from API for token0 and token1...`);
    let newTradesFromAPI: any[] = [];
    
    try {
      const orderFilledEvents = await fetchOrderFilledByTokens(token0, token1);
      
      // Process and store new trades
      for (const event of orderFilledEvents) {
        const orderHash = getArgumentValue(event.Arguments, 'orderHash');
        const makerAssetId = getArgumentValue(event.Arguments, 'makerAssetId');
        const takerAssetId = getArgumentValue(event.Arguments, 'takerAssetId');
        const makerAmount = getArgumentValue(event.Arguments, 'makerAmountFilled') || getArgumentValue(event.Arguments, 'makerAmount');
        const takerAmount = getArgumentValue(event.Arguments, 'takerAmountFilled') || getArgumentValue(event.Arguments, 'takerAmount');
        const maker = getArgumentValue(event.Arguments, 'maker');
        const taker = getArgumentValue(event.Arguments, 'taker');
        const fee = getArgumentValue(event.Arguments, 'fee');

        if (orderHash && makerAssetId && takerAssetId) {
          insertOrderFilledEvent({
            order_hash: orderHash,
            maker: maker || '',
            taker: taker || '',
            maker_asset_id: makerAssetId,
            taker_asset_id: takerAssetId,
            maker_amount_filled: makerAmount || '0',
            taker_amount_filled: takerAmount || '0',
            fee: fee || null,
            block_time: event.Block.Time,
            block_number: event.Block.Number,
            transaction_hash: event.Transaction.Hash,
          });
        }
      }
      
      console.log(`[API] ✅ Processed ${orderFilledEvents.length} OrderFilled events from API`);
    } catch (error) {
      console.error(`[API] ❌ Error fetching trades from API:`, error);
      // Continue with existing trades even if API call fails
    }

    // Step 5: Get all trades again (including newly stored ones) and filter
    const allTrades = getAllOrderFilledEvents();
    const allTradesForMarket = filterTradesByTokens(allTrades, [{ token0, token1 }]);
    
    const duration = Date.now() - startTime;
    console.log(`[API] ✅ Refresh complete: ${allTradesForMarket.length} total trades found (${duration}ms)`);

    return NextResponse.json({
      success: true,
      data: {
        trades: allTradesForMarket,
        count: allTradesForMarket.length,
        tokensFetched: !tokens.length || !(tokens[0] as any)?.token0 || !(tokens[0] as any)?.token1,
        tradesFetched: true,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[API] ❌ Error refreshing market after ${duration}ms:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to refresh market data',
      },
      { status: 500 }
    );
  }
}

