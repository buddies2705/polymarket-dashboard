interface Trade {
  order_hash: string;
  maker: string;
  taker: string;
  maker_asset_id: string;
  taker_asset_id: string;
  maker_amount_filled: string;
  taker_amount_filled: string;
  fee: string | null;
  block_time: string;
  transaction_hash: string;
}

interface TradeListProps {
  trades: Trade[];
}

// Helper function to check if an asset ID is USDC
function isUSDC(assetId: string): boolean {
  if (!assetId) return false;
  const normalized = assetId.toLowerCase();
  return normalized === '0' || normalized === '0x0' || normalized === '0x0000000000000000000000000000000000000000';
}

// Calculate price per YES token
function calculatePrice(trade: Trade): { price: number; formatted: string; formattedCents: string } | null {
  try {
    const makerAmount = parseFloat(trade.maker_amount_filled) / 1e6;
    const takerAmount = parseFloat(trade.taker_amount_filled) / 1e6;
    
    if (isNaN(makerAmount) || isNaN(takerAmount) || makerAmount === 0 || takerAmount === 0) {
      return null;
    }
    
    const makerIsUSDC = isUSDC(trade.maker_asset_id);
    const takerIsUSDC = isUSDC(trade.taker_asset_id);
    
    // One side must be USDC and the other must be YES tokens
    if (makerIsUSDC && !takerIsUSDC) {
      // Maker gives USDC, Taker gives YES tokens
      // Price = USDC / YES tokens
      const price = makerAmount / takerAmount;
      return {
        price,
        formatted: `${price.toFixed(4)} USDC`,
        formattedCents: `${(price * 100).toFixed(1)}¢`
      };
    } else if (takerIsUSDC && !makerIsUSDC) {
      // Taker gives USDC, Maker gives YES tokens
      // Price = USDC / YES tokens
      const price = takerAmount / makerAmount;
      return {
        price,
        formatted: `${price.toFixed(4)} USDC`,
        formattedCents: `${(price * 100).toFixed(1)}¢`
      };
    }
    
    // If neither is USDC or both are USDC, we can't calculate price
    return null;
  } catch (error) {
    console.error('Error calculating price:', error, trade);
    return null;
  }
}

export default function TradeList({ trades }: TradeListProps) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No trades found for this market
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Maker
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Taker
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Maker Amount
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Taker Amount
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Price per YES
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Fee
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              TX
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {trades.map((trade) => {
            const priceInfo = calculatePrice(trade);
            return (
              <tr key={trade.order_hash} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(trade.block_time).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <span className="font-mono text-xs">
                    {trade.maker.substring(0, 6)}...{trade.maker.substring(38)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <span className="font-mono text-xs">
                    {trade.taker.substring(0, 6)}...{trade.taker.substring(38)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {parseFloat(trade.maker_amount_filled) / 1e6}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {parseFloat(trade.taker_amount_filled) / 1e6}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {priceInfo ? (
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-900">{priceInfo.formatted}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{priceInfo.formattedCents}</span>
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">N/A</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {trade.fee ? parseFloat(trade.fee) / 1e6 : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <a
                    href={`https://polygonscan.com/tx/${trade.transaction_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    View
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

