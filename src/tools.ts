import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export function registerTools(server: McpServer) {
  const apiKey = process.env.COINGECKO_API_KEY

  if (!apiKey) {
    throw new Error('COINGECKO_API_KEY environment variable is not set')
  }

  server.tool(
    'get_token_info',
    'Fetch Token Information by name or symbol for CoinGecko, including CoinGecko ID',
    {
      query: z
        .string()
        .describe('The name or symbol of the token to fetch information for'),
    },
    async ({ query }) => {
      const response = await fetch(
        `https://pro-api.coingecko.com/api/v3/search?query=${encodeURIComponent(
          query
        )}`,
        {
          headers: {
            accept: 'application/json',
            'x-cg-pro-api-key': apiKey,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      try {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching token info: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        }
      }
    }
  )

  server.tool(
    'get_coin_data',
    'Fetch detailed coin data by CoinGecko ID including contract addresses',
    {
      id: z
        .string()
        .describe(
          'The CoinGecko ID of the coin to fetch data for (e.g., "usd-coin", "bitcoin")'
        ),
    },
    async ({ id }) => {
      try {
        const response = await fetch(
          `https://pro-api.coingecko.com/api/v3/coins/${encodeURIComponent(
            id
          )}`,
          {
            headers: {
              accept: 'application/json',
              'x-cg-pro-api-key': apiKey,
            },
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching coin data: ${
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
