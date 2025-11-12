import Link from 'next/link';

interface MarketCardProps {
  market: {
    question_id: string;
    ancillary_data_decoded: string;
    condition_id: string;
    trade_count: number;
    question_time: string;
    prices?: {
      yes?: {
        formatted: string;
        formattedCents: string;
      } | null;
      no?: {
        formatted: string;
        formattedCents: string;
      } | null;
    };
  };
}

export default function MarketCard({ market }: MarketCardProps) {
  let parsed: any = {};
  try {
    parsed = JSON.parse(market.ancillary_data_decoded || '{}');
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

  return (
    <Link href={`/markets/${encodeURIComponent(market.question_id)}`} className="block">
      <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer bg-white">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-2">
              {title}
            </h3>
            {marketId && (
              <span className="text-xs text-gray-500">Market ID: {marketId}</span>
            )}
          </div>
          {market.trade_count > 0 ? (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
              {market.trade_count} trades
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 ml-2">
              No trades
            </span>
          )}
        </div>

        {description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {description}
          </p>
        )}

        {/* Prices */}
        {market.prices && (market.prices.yes || market.prices.no) && (
          <div className="flex gap-2 mb-3">
            {market.prices.yes && (
              <div className="flex-1 bg-green-50 border border-green-200 rounded px-3 py-2">
                <div className="text-xs text-green-600 font-medium mb-0.5">YES</div>
                <div className="text-sm font-bold text-green-900">{market.prices.yes.formattedCents}</div>
              </div>
            )}
            {market.prices.no && (
              <div className="flex-1 bg-red-50 border border-red-200 rounded px-3 py-2">
                <div className="text-xs text-red-600 font-medium mb-0.5">NO</div>
                <div className="text-sm font-bold text-red-900">{market.prices.no.formattedCents}</div>
              </div>
            )}
          </div>
        )}

        {(p1 || p2 || p3) && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {p1 && (
              <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
                {p1}
              </span>
            )}
            {p2 && (
              <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded">
                {p2}
              </span>
            )}
            {p3 && (
              <span className="px-2 py-1 bg-gray-50 text-gray-700 text-xs rounded">
                {p3}
              </span>
            )}
          </div>
        )}

        <div className="text-xs text-gray-500 pt-3 border-t border-gray-100">
          Created {new Date(market.question_time).toLocaleDateString()}
        </div>
      </div>
    </Link>
  );
}

