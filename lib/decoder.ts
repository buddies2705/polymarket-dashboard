/**
 * Decode and parse ancillary data from UMA Oracle
 */

// Decode hex-encoded ancillary data to UTF-8 string
export function decodeAncillaryData(hexData: string): string {
  if (!hexData || hexData === '0x') {
    return '';
  }
  
  try {
    // Remove '0x' prefix if present
    const hex = hexData.startsWith('0x') ? hexData.slice(2) : hexData;
    
    // Convert hex to bytes array
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.substr(i, 2), 16);
      if (byte > 0) {
        bytes.push(byte);
      }
    }
    
    // Decode UTF-8 bytes to string
    // Use TextDecoder for proper UTF-8 handling (handles multi-byte characters like smart quotes)
    const decoder = new TextDecoder('utf-8');
    const decoded = decoder.decode(new Uint8Array(bytes));
    
    return decoded;
  } catch (error) {
    console.error('[Decoder] ❌ Error decoding ancillary data:', error);
    // Fallback to simple decoding if TextDecoder fails
    try {
      const hex = hexData.startsWith('0x') ? hexData.slice(2) : hexData;
      let decoded = '';
      for (let i = 0; i < hex.length; i += 2) {
        const charCode = parseInt(hex.substr(i, 2), 16);
        if (charCode > 0) {
          decoded += String.fromCharCode(charCode);
        }
      }
      return decoded;
    } catch (fallbackError) {
      console.error('[Decoder] ❌ Fallback decoding also failed:', fallbackError);
      return '';
    }
  }
}

// Parse decoded ancillary data into structured format
export function parseAncillaryData(decodedText: string): {
  title: string;
  description: string;
  market_id?: string;
  res_data?: string;
  p1?: string;
  p2?: string;
  p3?: string;
  initializer?: string;
} {
  const result: any = {
    title: '',
    description: '',
  };

  if (!decodedText) {
    return result;
  }

  try {
    // Extract title - handle both "q: title:" and "title:" formats, and commas within titles
    const titleMatch = decodedText.match(/(?:q:\s*)?title:\s*(.+?),\s*description:/i);
    if (titleMatch && titleMatch[1]) {
      result.title = titleMatch[1].trim();
    }

    // Extract description - improved regex to capture full description even with commas
    // Description can contain commas and newlines, so we need to match until "market_id:" or end
    const descIndex = decodedText.toLowerCase().indexOf('description:');
    if (descIndex !== -1) {
      const afterDesc = decodedText.substring(descIndex + 'description:'.length);
      // Look for "market_id:" (with optional space and case insensitive)
      const marketIdIndex = afterDesc.toLowerCase().indexOf('market_id:');
      if (marketIdIndex !== -1) {
        result.description = afterDesc.substring(0, marketIdIndex).trim();
      } else {
        // If no market_id, look for other fields
        const nextFieldMatch = afterDesc.match(/\s*(?:res_data|p1|p2|p3|initializer):/i);
        if (nextFieldMatch) {
          result.description = afterDesc.substring(0, nextFieldMatch.index).trim();
        } else {
          result.description = afterDesc.trim();
        }
      }
    }

    // Extract market_id
    const marketIdMatch = decodedText.match(/market_id:\s*([^,]+)/i);
    if (marketIdMatch && marketIdMatch[1]) {
      result.market_id = marketIdMatch[1].trim();
    }

    // Extract res_data
    const resDataMatch = decodedText.match(/res_data:\s*([^,]+)/i);
    if (resDataMatch && resDataMatch[1]) {
      result.res_data = resDataMatch[1].trim();
    }

    // Extract p1, p2, p3 (outcomes)
    const p1Match = decodedText.match(/p1:\s*([^,]+)/i);
    if (p1Match && p1Match[1]) {
      result.p1 = p1Match[1].trim();
    }

    const p2Match = decodedText.match(/p2:\s*([^,]+)/i);
    if (p2Match && p2Match[1]) {
      result.p2 = p2Match[1].trim();
    }

    const p3Match = decodedText.match(/p3:\s*([^,]+)/i);
    if (p3Match && p3Match[1]) {
      result.p3 = p3Match[1].trim();
    }

    // Extract initializer
    const initializerMatch = decodedText.match(/initializer:\s*([^,]+)/i);
    if (initializerMatch && initializerMatch[1]) {
      result.initializer = initializerMatch[1].trim();
    }

  } catch (error) {
    console.error('[Decoder] ❌ Error parsing ancillary data:', error);
  }

  return result;
}

// Combined function to decode and parse
export function decodeAndParseAncillaryData(hexData: string): {
  title: string;
  description: string;
  market_id?: string;
  res_data?: string;
  p1?: string;
  p2?: string;
  p3?: string;
  initializer?: string;
} {
  const decoded = decodeAncillaryData(hexData);
  return parseAncillaryData(decoded);
}

