import { NextRequest, NextResponse } from 'next/server';
// Import env module early to ensure .env.local is loaded in API routes
import '@/lib/env';
import { getBitqueryOAuthToken } from '@/lib/env';
import { getMarketDetails, getTokenRegisteredEventsByConditionId } from '@/lib/db';
import { fetchBalanceUpdates, resetClient } from '@/lib/bitquery';

export async function GET(
  request: NextRequest,
  { params }: { params: { questionId: string } }
) {
  // Decode questionId in case it's URL encoded
  const questionId = decodeURIComponent(params.questionId);
  const startTime = Date.now();
  
  try {
    // Get market details
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

    // Get token0 and token1 for this condition
    let tokens = getTokenRegisteredEventsByConditionId(conditionId);
    let token0: string | null = null;
    let token1: string | null = null;
    
    const tokenData = tokens[0] as any;
    if (tokens.length === 0 || !tokenData?.token0 || !tokenData?.token1) {
      // Try to fetch tokens from API if not in DB
      try {
        const { fetchTokenRegisteredByConditionId, getArgumentValue } = await import('@/lib/bitquery');
        const { insertTokenRegisteredEvent } = await import('@/lib/db');
        
        const tokenEvents = await fetchTokenRegisteredByConditionId(conditionId);
        if (tokenEvents.length > 0) {
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
            
            // Use the fetched tokens
            token0 = eventToken0;
            token1 = eventToken1;
          } else {
            console.error(`[API] ❌ Could not extract tokens. ConditionId: ${eventConditionId}, Token0: ${eventToken0}, Token1: ${eventToken1}`);
            return NextResponse.json(
              {
                success: false,
                error: 'Could not extract tokens from API response',
              },
              { status: 400 }
            );
          }
        } else {
          return NextResponse.json(
            {
              success: false,
              error: 'Tokens not found for this market',
            },
            { status: 400 }
          );
        }
      } catch (error: any) {
        console.error(`[API] ❌ Error fetching tokens:`, error);
        console.error(`[API] ❌ Error stack:`, error?.stack);
        return NextResponse.json(
          {
            success: false,
            error: `Failed to fetch tokens from API: ${error?.message || 'Unknown error'}`,
          },
          { status: 500 }
        );
      }
    } else {
      // Use tokens from DB
      const tokenData = tokens[0] as any;
      token0 = tokenData.token0;
      token1 = tokenData.token1;
    }
    
    if (!token0 || !token1) {
      return NextResponse.json(
        {
          success: false,
          error: 'Token0 or token1 is missing',
        },
        { status: 400 }
      );
    }

    // Verify token is loaded before making request
    const token = getBitqueryOAuthToken();
    if (!token || !token.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'OAuth token not configured. Please set BITQUERY_OAUTH_TOKEN or BITQUERY_API_KEY in .env.local',
        },
        { status: 500 }
      );
    }
    // Reset client to ensure fresh token is used
    resetClient();
    
    // Fetch balance updates from API
    const balanceUpdates = await fetchBalanceUpdates(token0, token1);
    
    // Process and format the data
    // Note: The response structure should match the query structure
    const holders = balanceUpdates.map((update: any) => {
      // Try different possible response structures
      const address = update.BalanceUpdate?.Address || 
                     update.Address || 
                     update.balanceUpdate?.Address || 
                     '';
      const tokenId = update.BalanceUpdate?.Id || 
                     update.Id || 
                     update.balanceUpdate?.Id || 
                     '';
      const balance = update.balance || '0';
      const currency = {
        name: update.Currency?.Name || update.currency?.name || '',
        symbol: update.Currency?.Symbol || update.currency?.symbol || '',
        contract: update.Currency?.SmartContract || update.currency?.contract || '',
      };
      
      return {
        address,
        tokenId,
        balance,
        currency,
      };
    }).filter((holder: any) => {
      // Filter out zero balances and invalid addresses
      const balance = parseFloat(holder.balance);
      return !isNaN(balance) && balance > 0 && holder.address;
    });
    

    return NextResponse.json({
      success: true,
      data: {
        holders,
        count: holders.length,
        token0,
        token1,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[API] ❌ Error fetching holders after ${duration}ms:`, error);
    console.error(`[API] ❌ Error message:`, error?.message);
    console.error(`[API] ❌ Error stack:`, error?.stack);
    return NextResponse.json(
      {
        success: false,
        error: `Failed to fetch holders: ${error?.message || 'Unknown error'}`,
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}

