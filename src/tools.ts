import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

interface CoinGeckoPlatform {
  [platform_name: string]: string | null
}

interface CoinGeckoCoinDetail {
  id: string
  symbol: string
  name: string
  web_slug: string
  platforms?: CoinGeckoPlatform
  // Add other fields you might expect or need from the full response
  // For now, keeping it minimal based on usage
  error?: string // For cases where API returns 200 OK with an error message
}

interface CoinGeckoApiError {
  error: string
}

interface CoinGeckoSearchCoin {
  id: string
  name: string
  api_symbol: string
  symbol: string
  // market_cap_rank?: number; // Example of other fields from your comment
  // thumb?: string;
  // large?: string;
}

interface CoinGeckoSearchResponse {
  coins: CoinGeckoSearchCoin[]
  // exchanges?: any[]; // Add other parts of search response if needed
  // icos?: any[];
  // categories?: any[];
  // nfts?: any[];
}

export function registerTools(server: McpServer) {
  const apiKey = process.env.COINGECKO_API_KEY

  if (!apiKey) {
    throw new Error('COINGECKO_API_KEY environment variable is not set')
  }

  server.tool(
    'get_coin_info',
    'Fetches detailed coin data from CoinGecko using a token symbol, name, or CoinGecko ID. Returns platform contract addresses.',
    {
      query: z
        .string()
        .describe(
          'The token symbol (e.g., "USDC"), name (e.g., "Bitcoin"), or CoinGecko ID (e.g., "usd-coin")'
        ),
    },
    async ({ query }) => {
      const headers = {
        accept: 'application/json',
        'x-cg-pro-api-key': apiKey,
      }

      const processCoinDataResponse = (coinDetails: CoinGeckoCoinDetail) => {
        // The check for coinDetails.id is already good,
        // but with types, coinDetails.id must exist if it's a valid CoinGeckoCoinDetail
        // However, the API might return an error structure even with a 200, so we keep runtime checks.
        if (typeof coinDetails.id !== 'string') {
          throw new Error(
            `Invalid coin data structure received from API (missing id): ${JSON.stringify(
              coinDetails
            )}`
          )
        }
        const filteredData = {
          id: coinDetails.id,
          symbol: coinDetails.symbol,
          name: coinDetails.name,
          web_slug: coinDetails.web_slug,
          platforms: coinDetails.platforms || {},
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(filteredData, null, 2),
            },
          ],
        } as CallToolResult
      }

      try {
        // Step 1: Attempt to fetch by ID directly (query might be an ID)
        const idFetchUrl = `https://pro-api.coingecko.com/api/v3/coins/${encodeURIComponent(
          query
        )}`
        const directIdResponse = await fetch(idFetchUrl, { headers })

        let directIdData: CoinGeckoCoinDetail | CoinGeckoApiError
        try {
          directIdData = (await directIdResponse.json()) as
            | CoinGeckoCoinDetail
            | CoinGeckoApiError
        } catch (e) {
          directIdData = {
            error: `Failed to parse JSON response from ID endpoint. Status: ${directIdResponse.status}`,
          }
        }

        if (directIdResponse.ok) {
          const potentialCoinData = directIdData as CoinGeckoCoinDetail
          const potentialErrorData = directIdData as CoinGeckoApiError
          if (potentialCoinData.id && !potentialErrorData.error) {
            return processCoinDataResponse(potentialCoinData) // Success
          }
          if (potentialErrorData.error === 'coin not found') {
            // Known "not found" error, proceed to search.
          } else {
            // Other 200 OK but not valid data, also proceed to search as a fallback.
          }
        } else if (directIdResponse.status === 404) {
          // Coin not found by ID (HTTP 404), proceed to search.
        } else {
          throw new Error(
            `Error fetching directly by ID '${query}'. Status: ${
              directIdResponse.status
            }, Response: ${JSON.stringify(directIdData)}`
          )
        }

        // Proceed to Step 2: Search for the coin.
        const searchUrl = `https://pro-api.coingecko.com/api/v3/search?query=${encodeURIComponent(
          query
        )}`
        const searchResponse = await fetch(searchUrl, { headers })

        if (!searchResponse.ok) {
          const errorText = await searchResponse.text()
          throw new Error(
            `Search API error for query '${query}'. Status: ${searchResponse.status}, Body: ${errorText}`
          )
        }

        const searchData =
          (await searchResponse.json()) as CoinGeckoSearchResponse

        if (!searchData.coins || searchData.coins.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `Coin not found for query: '${query}' after attempting ID lookup and search.`,
              },
            ],
            isError: true,
          }
        }

        const firstCoinId = searchData.coins[0]?.id
        if (!firstCoinId) {
          // This case should be less likely if searchData.coins[0] exists and CoinGeckoSearchCoin has 'id' as non-optional
          throw new Error('Could not extract ID from the first search result.')
        }

        // Step 3: Fetch coin data using the ID found from search
        const idFromSearchUrl = `https://pro-api.coingecko.com/api/v3/coins/${encodeURIComponent(
          firstCoinId
        )}`
        const idFromSearchResponse = await fetch(idFromSearchUrl, { headers })

        let idFromSearchData: CoinGeckoCoinDetail | CoinGeckoApiError
        try {
          idFromSearchData = (await idFromSearchResponse.json()) as
            | CoinGeckoCoinDetail
            | CoinGeckoApiError
        } catch (e) {
          idFromSearchData = {
            error: `Failed to parse JSON response from coin details endpoint (after search). Status: ${idFromSearchResponse.status}`,
          }
        }

        if (!idFromSearchResponse.ok) {
          throw new Error(
            `Error fetching coin details for ID '${firstCoinId}' (found via search for '${query}'). Status: ${
              idFromSearchResponse.status
            }, Body: ${JSON.stringify(idFromSearchData)}`
          )
        }

        const potentialCoinDataAfterSearch =
          idFromSearchData as CoinGeckoCoinDetail
        const potentialErrorDataAfterSearch =
          idFromSearchData as CoinGeckoApiError

        if (
          potentialCoinDataAfterSearch.id &&
          !potentialErrorDataAfterSearch.error
        ) {
          return processCoinDataResponse(potentialCoinDataAfterSearch)
        } else {
          const errorDetail =
            potentialErrorDataAfterSearch.error ||
            'Invalid data structure after search'
          throw new Error(
            `Failed to retrieve valid data for coin ID '${firstCoinId}' (from search). API response: ${errorDetail}`
          )
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error processing coin query '${query}': ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        }
      }
    }
  )
}
