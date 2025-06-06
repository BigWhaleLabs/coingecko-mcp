import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { registerTools } from './tools'

// Create and start the MCP server
async function startServer() {
  try {
    // Create a new MCP server instance
    const server = new McpServer({
      name: 'EVM-Server',
      version: '1.0.0',
    })

    // Register all tools
    registerTools(server)

    // Log server information
    console.error(`Coingecko MCP Server initialized`)
    console.error('Server is ready to handle requests')

    return server
  } catch (error) {
    console.error('Failed to initialize server:', error)
    process.exit(1)
  }
}

// Export the server creation function
export default startServer
