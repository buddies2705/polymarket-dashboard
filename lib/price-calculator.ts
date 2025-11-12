/**
 * Calculate prices for YES and NO tokens from trades
 */

interface Trade {
  maker_asset_id: string;
  taker_asset_id: string;
  maker_amount_filled: string;
  taker_amount_filled: string;
  block_time: string;
}

interface PriceInfo {
  price: number;
  formatted: string;
  formattedCents: string;
  lastTradeTime?: string;
}

// Helper function to check if an asset ID is USDC
function isUSDC(assetId: string): boolean {
  if (!assetId) return false;
  const normalized = assetId.toLowerCase();
  return normalized === '0' || normalized === '0x0' || normalized === '0x0000000000000000000000000000000000000000';
}

// Calculate price for a specific token from trades
function calculateTokenPrice(trades: Trade[], tokenId: string): PriceInfo | null {
  // Filter trades that involve this token
  const relevantTrades = trades.filter(trade => {
    const makerId = trade.maker_asset_id ? String(trade.maker_asset_id).toLowerCase() : null;
    const takerId = trade.taker_asset_id ? String(trade.taker_asset_id).toLowerCase() : null;
    const normalizedTokenId = tokenId ? String(tokenId).toLowerCase() : null;
    
    return (makerId === normalizedTokenId || takerId === normalizedTokenId) &&
           (isUSDC(trade.maker_asset_id) || isUSDC(trade.taker_asset_id));
  });

  if (relevantTrades.length === 0) {
    return null;
  }

  // Sort by time (most recent first) and calculate price from latest trade
  const sortedTrades = [...relevantTrades].sort((a, b) => 
    new Date(b.block_time).getTime() - new Date(a.block_time).getTime()
  );

  // Calculate prices from all trades and average them
  const prices: number[] = [];
  let lastTradeTime: string | undefined;

  for (const trade of sortedTrades) {
    const makerAmount = parseFloat(trade.maker_amount_filled) / 1e6;
    const takerAmount = parseFloat(trade.taker_amount_filled) / 1e6;
    
    if (isNaN(makerAmount) || isNaN(takerAmount) || makerAmount === 0 || takerAmount === 0) {
      continue;
    }

    const makerIsUSDC = isUSDC(trade.maker_asset_id);
    const takerIsUSDC = isUSDC(trade.taker_asset_id);
    const makerIsToken = String(trade.maker_asset_id).toLowerCase() === String(tokenId).toLowerCase();
    const takerIsToken = String(trade.taker_asset_id).toLowerCase() === String(tokenId).toLowerCase();

    let price: number | null = null;

    if (makerIsUSDC && takerIsToken) {
      // Maker gives USDC, Taker gives tokens
      // Price = USDC / tokens
      price = makerAmount / takerAmount;
    } else if (takerIsUSDC && makerIsToken) {
      // Taker gives USDC, Maker gives tokens
      // Price = USDC / tokens
      price = takerAmount / makerAmount;
    }

    if (price !== null && price > 0) {
      prices.push(price);
      if (!lastTradeTime) {
        lastTradeTime = trade.block_time;
      }
    }
  }

  if (prices.length === 0) {
    return null;
  }

  // Use the latest price (most recent trade)
  const latestPrice = prices[0];
  
  return {
    price: latestPrice,
    formatted: `${latestPrice.toFixed(4)} USDC`,
    formattedCents: `${(latestPrice * 100).toFixed(1)}¢`,
    lastTradeTime,
  };
}

// Calculate prices for both YES and NO tokens
export function calculateMarketPrices(
  trades: Trade[],
  token0: string | null,
  token1: string | null,
  p1: string,
  p2: string
): {
  yesPrice: PriceInfo | null;
  noPrice: PriceInfo | null;
  token0IsYes: boolean;
} {
  // Determine which token is YES and which is NO
  // p1 is usually "0" (No), p2 is usually "1" (Yes)
  // token0 typically corresponds to p1, token1 to p2
  const p1IsNo = p1 === '0' || p1.toLowerCase() === 'no';
  const p2IsYes = p2 === '1' || p2.toLowerCase() === 'yes';
  
  // Default assumption: token0 = No (p1), token1 = Yes (p2)
  let token0IsYes = false;
  if (p1IsNo && p2IsYes) {
    token0IsYes = false; // token0 = No, token1 = Yes
  } else if (!p1IsNo && p2IsYes) {
    // If p1 is not "No", check if it's "Yes"
    token0IsYes = p1.toLowerCase() === 'yes' || p1 === '1';
  }

  const yesTokenId = token0IsYes ? token0 : token1;
  const noTokenId = token0IsYes ? token1 : token0;

  const yesPrice = yesTokenId ? calculateTokenPrice(trades, yesTokenId) : null;
  const noPrice = noTokenId ? calculateTokenPrice(trades, noTokenId) : null;

  return {
    yesPrice,
    noPrice,
    token0IsYes,
  };
}

