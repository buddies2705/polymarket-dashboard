import { GraphQLClient } from 'graphql-request';
// Import env module early to ensure .env.local is loaded
import './env';
import { getBitqueryOAuthToken } from './env';

const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const MAIN_POLYMARKET_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const UMA_ADAPTER_ADDRESS = '0x65070BE91477460D8A7AeEb94ef92fe056C2f2A7';

let client: GraphQLClient | null = null;

// Reset client (useful if token changes)
export function resetClient(): void {
  client = null;
}

function getClient(): GraphQLClient {
  // Always get fresh token to ensure it's loaded from .env.local
  const oauthToken = getBitqueryOAuthToken();
  
  // If no token, throw error immediately
  if (!oauthToken || !oauthToken.trim()) {
    const errorMsg = 
      'Bitquery OAuth token is required. Please create a .env.local file in the project root with:\n' +
      '  BITQUERY_OAUTH_TOKEN=your_token_here\n' +
      '  OR\n' +
      '  BITQUERY_API_KEY=your_token_here';
    console.error(`[Bitquery] ❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  // Clean and trim token
  let trimmedToken = oauthToken.trim()
    .replace(/^["']|["']$/g, '') // Remove surrounding quotes
    .replace(/\n|\r/g, '') // Remove newlines
    .trim();
  
  // If client doesn't exist, create it
  if (!client) {
    const endpoint = process.env.BITQUERY_ENDPOINT || 'https://streaming.bitquery.io/graphql';
    
    // Bitquery API uses Authorization: Bearer header (as shown in working curl example)
    client = new GraphQLClient(endpoint, {
      headers: {
        'Authorization': `Bearer ${trimmedToken}`,
        'Content-Type': 'application/json',
      },
    });
  }
  
  return client;
}

const EVENT_FIELDS = `
  Block {
    Time
    Number
    Hash
  }
  Transaction {
    Hash
    From
    To
  }
  Arguments {
    Name
    Value {
      ... on EVM_ABI_Integer_Value_Arg {
        integer
      }
      ... on EVM_ABI_Address_Value_Arg {
        address
      }
      ... on EVM_ABI_String_Value_Arg {
        string
      }
      ... on EVM_ABI_BigInt_Value_Arg {
        bigInteger
      }
      ... on EVM_ABI_Bytes_Value_Arg {
        hex
      }
      ... on EVM_ABI_Boolean_Value_Arg {
        bool
      }
    }
  }
`;

export function getArgumentValue(args: any[], name: string): string | null {
  const arg = args.find((a: any) => a.Name === name);
  if (!arg || !arg.Value) return null;
  
  if (arg.Value.hex) return arg.Value.hex;
  if (arg.Value.address) return arg.Value.address;
  if (arg.Value.string) return arg.Value.string;
  if (arg.Value.bigInteger) return arg.Value.bigInteger;
  if (arg.Value.integer) return arg.Value.integer.toString();
  if (arg.Value.bool !== undefined) return arg.Value.bool.toString();
  
  return null;
}

export async function fetchTokenRegisteredEvents(limit: number = 20000): Promise<any[]> {
  const query = `
    {
      EVM(dataset: combined, network: matic) {
        Events(
          where: {
            Block: {Time: {since_relative: {hours_ago: 72}}},
            Log: {Signature: {Name: {in: ["TokenRegistered"]}}},
            LogHeader: {Address: {is: "${CTF_EXCHANGE_ADDRESS}"}}
          }
          limit: {count: ${limit}}
        ) {
          ${EVENT_FIELDS}
        }
      }
    }
  `;

  try {
    const client = getClient();
    const startTime = Date.now();
    const data: any = await client.request(query);
    const duration = Date.now() - startTime;
    const events = data.EVM?.Events || [];
    return events;
  } catch (error) {
    console.error('[Bitquery] ❌ Error fetching TokenRegistered events:', error);
    throw error;
  }
}

export async function fetchOrderFilledEvents(limit: number = 10000): Promise<any[]> {
  const query = `
    {
      EVM(dataset: combined, network: matic) {
        Events(
          where: {
            Block: {Time: {since_relative: {hours_ago: 72}}},
            Log: {Signature: {Name: {in: ["OrderFilled"]}}},
            LogHeader: {Address: {is: "${CTF_EXCHANGE_ADDRESS}"}}
          }
          limit: {count: ${limit}}
        ) {
          ${EVENT_FIELDS}
        }
      }
    }
  `;

  try {
    const client = getClient();
    const startTime = Date.now();
    const data: any = await client.request(query);
    const duration = Date.now() - startTime;
    const events = data.EVM?.Events || [];
    // Reduced logging - only log summary
    if (events.length > 0 || duration > 5000) {
      console.log(`[Bitquery] ✅ Fetched ${events.length} OrderFilled events in ${duration}ms`);
    }
    return events;
  } catch (error) {
    console.error('[Bitquery] ❌ Error fetching OrderFilled events:', error);
    throw error;
  }
}

export async function fetchConditionPreparationEvents(limit: number = 10000): Promise<any[]> {
  const query = `
    {
      EVM(dataset: combined, network: matic) {
        Events(
          where: {
            Block: {Time: {since_relative: {hours_ago: 72}}},
            Log: {Signature: {Name: {in: ["ConditionPreparation"]}}},
            LogHeader: {Address: {is: "${MAIN_POLYMARKET_ADDRESS}"}}
          }
          limit: {count: ${limit}}
        ) {
          ${EVENT_FIELDS}
        }
      }
    }
  `;

  try {
    const client = getClient();
    const startTime = Date.now();
    const data: any = await client.request(query);
    const duration = Date.now() - startTime;
    const events = data.EVM?.Events || [];
    // Reduced logging - only log summary
    if (events.length > 0 || duration > 5000) {
      console.log(`[Bitquery] ✅ Fetched ${events.length} ConditionPreparation events in ${duration}ms`);
    }
    return events;
  } catch (error) {
    console.error('[Bitquery] ❌ Error fetching ConditionPreparation events:', error);
    throw error;
  }
}

export async function fetchQuestionInitializedEvents(limit: number = 10000): Promise<any[]> {
  const query = `
    {
      EVM(dataset: combined, network: matic) {
        Events(
          where: {
            Block: {Time: {since_relative: {hours_ago: 72}}},
            Log: {Signature: {Name: {in: ["QuestionInitialized"]}}},
            LogHeader: {Address: {is: "${UMA_ADAPTER_ADDRESS}"}}
          }
          limit: {count: ${limit}}
        ) {
          Block {
            Time
            Number
            Hash
          }
          Transaction {
            Hash
            From
            To
          }
          TransactionStatus {
            Success
          }
          Arguments {
            Name
            Value {
              ... on EVM_ABI_Integer_Value_Arg {
                integer
              }
              ... on EVM_ABI_Address_Value_Arg {
                address
              }
              ... on EVM_ABI_String_Value_Arg {
                string
              }
              ... on EVM_ABI_BigInt_Value_Arg {
                bigInteger
              }
              ... on EVM_ABI_Bytes_Value_Arg {
                hex
              }
              ... on EVM_ABI_Boolean_Value_Arg {
                bool
              }
            }
          }
        }
      }
    }
  `;

  try {
    const client = getClient();
    const startTime = Date.now();
    const data: any = await client.request(query);
    const duration = Date.now() - startTime;
    const events = data.EVM?.Events || [];
    // Reduced logging - only log summary
    if (events.length > 0 || duration > 5000) {
      console.log(`[Bitquery] ✅ Fetched ${events.length} QuestionInitialized events in ${duration}ms`);
    }
    return events;
  } catch (error) {
    console.error('[Bitquery] ❌ Error fetching QuestionInitialized events:', error);
    throw error;
  }
}

// Fetch TokenRegistered events for a specific condition_id (on-demand)
export async function fetchTokenRegisteredByConditionId(conditionId: string): Promise<any[]> {
  // Ensure conditionId is in hex format (add 0x if missing)
  const formattedConditionId = conditionId.startsWith('0x') ? conditionId : `0x${conditionId}`;
  
  const query = `
    {
      EVM(dataset: combined, network: matic) {
        Events(
          orderBy: {descending: Block_Time}
          where: {
            Block: {Time: {since_relative: {days_ago: 6}}},
            Arguments: {
              includes: {
                Name: {is: "conditionId"},
                Value: {Bytes: {is: "${formattedConditionId}"}}
              }
            },
            Log: {Signature: {Name: {in: ["TokenRegistered"]}}},
            LogHeader: {Address: {is: "${CTF_EXCHANGE_ADDRESS}"}}
          }
          limit: {count: 10}
        ) {
          Block {
            Time
            Number
            Hash
          }
          Transaction {
            Hash
            From
            To
          }
          Arguments {
            Name
            Value {
              ... on EVM_ABI_Integer_Value_Arg {
                integer
              }
              ... on EVM_ABI_Address_Value_Arg {
                address
              }
              ... on EVM_ABI_String_Value_Arg {
                string
              }
              ... on EVM_ABI_BigInt_Value_Arg {
                bigInteger
              }
              ... on EVM_ABI_Bytes_Value_Arg {
                hex
              }
              ... on EVM_ABI_Boolean_Value_Arg {
                bool
              }
            }
          }
        }
      }
    }
  `;

  try {
    const client = getClient();
    const startTime = Date.now();
    const data: any = await client.request(query);
    const duration = Date.now() - startTime;
    const events = data.EVM?.Events || [];
    return events;
  } catch (error) {
    console.error('[Bitquery] ❌ Error fetching TokenRegistered by conditionId:', error);
    throw error;
  }
}

// Fetch OrderFilled events for specific token0 and token1 (on-demand)
// Note: token0 and token1 are bigInteger values, not hex bytes
export async function fetchOrderFilledByTokens(token0: string, token1: string): Promise<any[]> {
  // Filter out USDC (0) as per user requirement - don't use 0 in the query
  const tokensToQuery: string[] = [];
  if (token0 && token0 !== '0' && token0 !== '0x0' && token0 !== '0x0000000000000000000000000000000000000000') {
    tokensToQuery.push(token0);
  }
  if (token1 && token1 !== '0' && token1 !== '0x0' && token1 !== '0x0000000000000000000000000000000000000000') {
    tokensToQuery.push(token1);
  }
  
  if (tokensToQuery.length === 0) {
    return [];
  }
  
  // Build the query - tokens are bigInteger values, so we need to match them in Arguments
  // The query structure matches tokens in makerAssetId or takerAssetId arguments
  const query = `
    {
      EVM(dataset: combined, network: matic) {
        Events(
          orderBy: {descending: Block_Time}
          where: {
            Block: {Time: {since_relative: {days_ago: 6}}},
            Arguments: {
              includes: {
                Name: {in: ["makerAssetId", "takerAssetId"]},
                Value: {BigInteger: {in: [${tokensToQuery.map(t => `"${t}"`).join(', ')}]}}
              }
            },
            Log: {Signature: {Name: {in: ["OrderFilled"]}}},
            LogHeader: {Address: {is: "${CTF_EXCHANGE_ADDRESS}"}}
          }
          limit: {count: 100}
        ) {
          Block {
            Time
            Number
            Hash
          }
          Transaction {
            Hash
            From
            To
          }
          Arguments {
            Name
            Value {
              ... on EVM_ABI_Integer_Value_Arg {
                integer
              }
              ... on EVM_ABI_Address_Value_Arg {
                address
              }
              ... on EVM_ABI_String_Value_Arg {
                string
              }
              ... on EVM_ABI_BigInt_Value_Arg {
                bigInteger
              }
              ... on EVM_ABI_Bytes_Value_Arg {
                hex
              }
              ... on EVM_ABI_Boolean_Value_Arg {
                bool
              }
            }
          }
        }
      }
    }
  `;

  try {
    const client = getClient();
    const startTime = Date.now();
    const data: any = await client.request(query);
    const duration = Date.now() - startTime;
    const events = data.EVM?.Events || [];
    return events;
  } catch (error) {
    console.error('[Bitquery] ❌ Error fetching OrderFilled by tokens:', error);
    throw error;
  }
}

// Fetch balance updates (holders) for specific token IDs
export async function fetchBalanceUpdates(token0: string, token1: string): Promise<any[]> {
  // Filter out USDC (0) as per user requirement - don't use 0 in the query
  const tokensToQuery: string[] = [];
  if (token0 && token0 !== '0' && token0 !== '0x0' && token0 !== '0x0000000000000000000000000000000000000000') {
    tokensToQuery.push(token0);
  }
  if (token1 && token1 !== '0' && token1 !== '0x0' && token1 !== '0x0000000000000000000000000000000000000000') {
    tokensToQuery.push(token1);
  }
  
  if (tokensToQuery.length === 0) {
    console.log(`[Bitquery] ⚠️  Both tokens are USDC (0), skipping BalanceUpdates query`);
    return [];
  }
  
  // Build the query - BalanceUpdate.Id should match the token IDs
  // The Id field in BalanceUpdates represents the token/asset ID
  const query = `
    {
      EVM(dataset: combined, network: matic) {
        BalanceUpdates(
          where: {
            Block: {Time: {since_relative: {days_ago: 6}}},
            BalanceUpdate: {
              Id: {
                in: [${tokensToQuery.map(t => `"${t}"`).join(', ')}]
              }
            }
          }
          orderBy: {descendingByField: "balance"}
        ) {
          Currency {
            Name
            SmartContract
            Symbol
          }
          balance: sum(of: BalanceUpdate_Amount, selectWhere: {gt: "0"})
          BalanceUpdate {
            Id
            Address
          }
        }
      }
    }
  `;
  
  try {
    // Always reset client to ensure fresh token is used
    resetClient();
    const client = getClient();
    const startTime = Date.now();
    
    // Verify token is available before making request
    const oauthToken = getBitqueryOAuthToken();
    if (!oauthToken || !oauthToken.trim()) {
      throw new Error('OAuth token is missing or empty');
    }
    
    // Make request - headers should be set in client, but verify
    const data: any = await client.request(query);
    const duration = Date.now() - startTime;
    const balanceUpdates = data.EVM?.BalanceUpdates || [];
    
    return balanceUpdates;
  } catch (error: any) {
    console.error('[Bitquery] ❌ Error fetching BalanceUpdates:', error);
    
    // Check if it's an authentication error
    if (error.response?.error?.includes('Unauthorized') || error.response?.status === 401) {
      const oauthToken = getBitqueryOAuthToken();
      console.error('[Bitquery] ❌ Authentication failed!');
      console.error('[Bitquery] ❌ Token present:', oauthToken ? 'Yes' : 'No');
      console.error('[Bitquery] ❌ Token length:', oauthToken?.length || 0);
      console.error('[Bitquery] ❌ Token preview:', oauthToken ? `${oauthToken.substring(0, 30)}...` : 'N/A');
      console.error('[Bitquery] ❌ Please verify BITQUERY_OAUTH_TOKEN in .env.local file');
    }
    
    if (error.response) {
      console.error('[Bitquery] ❌ Response error:', JSON.stringify(error.response, null, 2));
    }
    if (error.message) {
      console.error('[Bitquery] ❌ Error message:', error.message);
    }
    throw error;
  }
}
