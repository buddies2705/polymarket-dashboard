# Bitquery API Queries

This document contains all GraphQL queries used to fetch Polymarket data from Bitquery.

## Authentication

All queries require authentication using the `Authorization: Bearer` header:

```
Authorization: Bearer YOUR_OAUTH_TOKEN
```

The OAuth token should be stored in `.env.local` as `BITQUERY_OAUTH_TOKEN` or `BITQUERY_API_KEY`.

## API Endpoint

```
POST https://streaming.bitquery.io/graphql
```

## Contract Addresses

- **CTF Exchange**: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
- **Main Polymarket**: `0x4d97dcd97ec945f40cf65f87097ace5ea0476045`
- **UMA Adapter**: `0x65070BE91477460D8A7AeEb94ef92fe056C2f2A7`

## Event Queries

### 1. QuestionInitialized Events

Fetches market questions initialized on the UMA Oracle.

**Purpose**: Get all new markets/questions created on Polymarket.

**Query**:
```graphql
{
  EVM(dataset: combined, network: matic) {
    Events(
      where: {
        Block: {Time: {since_relative: {hours_ago: 72}}},
        Log: {Signature: {Name: {in: ["QuestionInitialized"]}}},
        LogHeader: {Address: {is: "0x65070BE91477460D8A7AeEb94ef92fe056C2f2A7"}}
      }
      limit: {count: 10000}
    ) {
      Block { Time Number Hash }
      Transaction { Hash From To }
      TransactionStatus { Success }
      Arguments {
        Name
        Value {
          ... on EVM_ABI_Integer_Value_Arg { integer }
          ... on EVM_ABI_Address_Value_Arg { address }
          ... on EVM_ABI_String_Value_Arg { string }
          ... on EVM_ABI_BigInt_Value_Arg { bigInteger }
          ... on EVM_ABI_Bytes_Value_Arg { hex }
          ... on EVM_ABI_Boolean_Value_Arg { bool }
        }
      }
    }
  }
}
```

**Key Arguments**:
- `questionId` (hex) - Unique identifier for the market question
- `ancillaryData` (hex) - Encoded market metadata (title, description, etc.)
- `rewardToken` (address) - Token used for rewards
- `reward` (bigInteger) - Reward amount
- `proposalBond` (bigInteger) - Bond amount required

**Polling Frequency**: Every 15 minutes

---

### 2. ConditionPreparation Events

Fetches condition preparation events that link questions to conditions.

**Purpose**: Get the condition_id associated with each question_id.

**Query**:
```graphql
{
  EVM(dataset: combined, network: matic) {
    Events(
      where: {
        Block: {Time: {since_relative: {hours_ago: 72}}},
        Log: {Signature: {Name: {in: ["ConditionPreparation"]}}},
        LogHeader: {Address: {is: "0x4d97dcd97ec945f40cf65f87097ace5ea0476045"}}
      }
      limit: {count: 10000}
    ) {
      Block { Time Number Hash }
      Transaction { Hash From To }
      Arguments {
        Name
        Value {
          ... on EVM_ABI_Integer_Value_Arg { integer }
          ... on EVM_ABI_Address_Value_Arg { address }
          ... on EVM_ABI_String_Value_Arg { string }
          ... on EVM_ABI_BigInt_Value_Arg { bigInteger }
          ... on EVM_ABI_Bytes_Value_Arg { hex }
          ... on EVM_ABI_Boolean_Value_Arg { bool }
        }
      }
    }
  }
}
```

**Key Arguments**:
- `questionId` (hex) - Links to QuestionInitialized event
- `conditionId` (hex) - Unique condition identifier
- `outcomeSlotCount` (integer) - Number of possible outcomes
- `oracle` (address) - Oracle contract address

**Polling Frequency**: Every 15 minutes

---

### 3. TokenRegistered Events

Fetches token registration events that create outcome tokens for each condition.

**Purpose**: Get token0 and token1 (YES/NO tokens) for each condition.

**Query**:
```graphql
{
  EVM(dataset: combined, network: matic) {
    Events(
      where: {
        Block: {Time: {since_relative: {hours_ago: 72}}},
        Log: {Signature: {Name: {in: ["TokenRegistered"]}}},
        LogHeader: {Address: {is: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"}}
      }
      limit: {count: 20000}
    ) {
      Block { Time Number Hash }
      Transaction { Hash From To }
      Arguments {
        Name
        Value {
          ... on EVM_ABI_Integer_Value_Arg { integer }
          ... on EVM_ABI_Address_Value_Arg { address }
          ... on EVM_ABI_String_Value_Arg { string }
          ... on EVM_ABI_BigInt_Value_Arg { bigInteger }
          ... on EVM_ABI_Bytes_Value_Arg { hex }
          ... on EVM_ABI_Boolean_Value_Arg { bool }
        }
      }
    }
  }
}
```

**Key Arguments**:
- `conditionId` (hex) - Links to ConditionPreparation event
- `token0` (bigInteger) - First outcome token ID (usually "No")
- `token1` (bigInteger) - Second outcome token ID (usually "Yes")

**Polling Frequency**: Every 5 minutes

---

### 4. OrderFilled Events

Fetches trade execution events on the CTF Exchange.

**Purpose**: Get all trades/orders filled for outcome tokens.

**Query**:
```graphql
{
  EVM(dataset: combined, network: matic) {
    Events(
      where: {
        Block: {Time: {since_relative: {hours_ago: 72}}},
        Log: {Signature: {Name: {in: ["OrderFilled"]}}},
        LogHeader: {Address: {is: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"}}
      }
      limit: {count: 10000}
    ) {
      Block { Time Number Hash }
      Transaction { Hash From To }
      Arguments {
        Name
        Value {
          ... on EVM_ABI_Integer_Value_Arg { integer }
          ... on EVM_ABI_Address_Value_Arg { address }
          ... on EVM_ABI_String_Value_Arg { string }
          ... on EVM_ABI_BigInt_Value_Arg { bigInteger }
          ... on EVM_ABI_Bytes_Value_Arg { hex }
          ... on EVM_ABI_Boolean_Value_Arg { bool }
        }
      }
    }
  }
}
```

**Key Arguments**:
- `orderHash` (hex) - Unique order identifier
- `maker` (address) - Order maker address
- `taker` (address) - Order taker address
- `makerAssetId` (bigInteger) - Asset ID being sold by maker
- `takerAssetId` (bigInteger) - Asset ID being sold by taker
- `makerAmountFilled` (bigInteger) - Amount filled for maker
- `takerAmountFilled` (bigInteger) - Amount filled for taker
- `fee` (bigInteger) - Trading fee

**Note**: `makerAssetId` or `takerAssetId` can be `0` (USDC). The other must be a token ID (token0 or token1).

**Polling Frequency**: Every 1 minute

---

## On-Demand Queries

### 5. TokenRegistered by Condition ID

Fetches tokens for a specific condition (used when tokens are missing from database).

**Query**:
```graphql
{
  EVM(dataset: combined, network: matic) {
    Events(
      orderBy: {descending: Block_Time}
      where: {
        Block: {Time: {since_relative: {days_ago: 6}}},
        Arguments: {
          includes: {
            Name: {is: "conditionId"},
            Value: {Bytes: {is: "0xCONDITION_ID_HERE"}}
          }
        },
        Log: {Signature: {Name: {in: ["TokenRegistered"]}}},
        LogHeader: {Address: {is: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"}}
      }
      limit: {count: 10}
    ) {
      Block { Time Number Hash }
      Transaction { Hash From To }
      Arguments {
        Name
        Value {
          ... on EVM_ABI_Integer_Value_Arg { integer }
          ... on EVM_ABI_Address_Value_Arg { address }
          ... on EVM_ABI_String_Value_Arg { string }
          ... on EVM_ABI_BigInt_Value_Arg { bigInteger }
          ... on EVM_ABI_Bytes_Value_Arg { hex }
          ... on EVM_ABI_Boolean_Value_Arg { bool }
        }
      }
    }
  }
}
```

---

### 6. OrderFilled by Token IDs

Fetches trades for specific token0 and token1 (used for on-demand trade fetching).

**Query**:
```graphql
{
  EVM(dataset: combined, network: matic) {
    Events(
      orderBy: {descending: Block_Time}
      where: {
        Block: {Time: {since_relative: {days_ago: 6}}},
        Arguments: {
          includes: {
            Name: {in: ["makerAssetId", "takerAssetId"]},
            Value: {BigInteger: {in: ["TOKEN0_ID", "TOKEN1_ID"]}}
          }
        },
        Log: {Signature: {Name: {in: ["OrderFilled"]}}},
        LogHeader: {Address: {is: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"}}
      }
      limit: {count: 100}
    ) {
      Block { Time Number Hash }
      Transaction { Hash From To }
      Arguments {
        Name
        Value {
          ... on EVM_ABI_Integer_Value_Arg { integer }
          ... on EVM_ABI_Address_Value_Arg { address }
          ... on EVM_ABI_String_Value_Arg { string }
          ... on EVM_ABI_BigInt_Value_Arg { bigInteger }
          ... on EVM_ABI_Bytes_Value_Arg { hex }
          ... on EVM_ABI_Boolean_Value_Arg { bool }
        }
      }
    }
  }
}
```

**Note**: USDC (`0`) is filtered out from the `in` clause as it's not a valid token ID to query.

---

### 7. BalanceUpdates (Token Holders)

Fetches token holders for specific token IDs.

**Query**:
```graphql
{
  EVM(dataset: combined, network: matic) {
    BalanceUpdates(
      where: {
        Block: {Time: {since_relative: {days_ago: 6}}},
        BalanceUpdate: {
          Id: {
            in: ["TOKEN0_ID", "TOKEN1_ID"]
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
```

**Response Fields**:
- `BalanceUpdate.Id` - Token ID
- `BalanceUpdate.Address` - Holder wallet address
- `balance` - Total balance for this address/token combination
- `Currency.Name` - Currency name (usually "Conditional Token")
- `Currency.Symbol` - Currency symbol (usually "CT")
- `Currency.SmartContract` - Contract address

**Note**: USDC (`0`) is filtered out from the `in` clause.

---

## Common Patterns

### Time Range

All queries use relative time ranges:
- `since_relative: {hours_ago: 72}` - Last 72 hours (3 days)
- `since_relative: {days_ago: 6}` - Last 6 days

### Event Filtering

Events are filtered by:
- `Log.Signature.Name` - Event name (e.g., "OrderFilled", "TokenRegistered")
- `LogHeader.Address` - Contract address emitting the event

### Argument Extraction

Use the `getArgumentValue()` helper function to extract values from the `Arguments` array:

```typescript
const conditionId = getArgumentValue(event.Arguments, 'conditionId');
const token0 = getArgumentValue(event.Arguments, 'token0');
const makerAssetId = getArgumentValue(event.Arguments, 'makerAssetId');
```

The function automatically handles different value types (hex, address, string, bigInteger, integer, bool).

---

## Error Handling

All queries include:
- Sequential execution (queue system)
- Retry logic with exponential backoff (3 retries, 1s initial backoff)
- Comprehensive logging
- Error reporting with stack traces

---

## Rate Limits

Bitquery has rate limits. The application implements:
- Sequential query execution (one at a time)
- Automatic retry with backoff
- Polling intervals to avoid excessive requests

---

## Testing Queries

You can test queries directly using curl:

```bash
curl -X POST https://streaming.bitquery.io/graphql \
  -H "Authorization: Bearer YOUR_OAUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"YOUR_GRAPHQL_QUERY_HERE"}'
```

Or use the Bitquery GraphQL playground: https://graphql.bitquery.io/

