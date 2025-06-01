import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { McpServer, McpServerOptions } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { z, ZodError } from 'zod'; // ZodError might be useful for consistent error responses
import axios from 'axios';
import { McpContent } from '@modelcontextprotocol/sdk/types'; // For return type


// Load .env file first
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// --- Centralized API Key Fetching Logic ---
let internalApiKey: string | null = null;

async function fetchAndSetInternalApiKey(): Promise<void> {
  const gcloudProject = process.env.GCLOUD_PROJECT;
  const secretName = process.env.MCP_API_KEY_SECRET_NAME;
  const fallbackApiKey = process.env.MCP_SERVER_INTERNAL_API_KEY_FALLBACK;

  if (gcloudProject && secretName) {
    try {
      const client = new SecretManagerServiceClient();
      const secretVersionName = `projects/${gcloudProject}/secrets/${secretName}/versions/latest`;
      console.log(`Attempting to fetch secret: ${secretVersionName}`);
      const [version] = await client.accessSecretVersion({ name: secretVersionName });
      const payload = version.payload?.data?.toString('utf8');
      if (!payload) {
        throw new Error('Fetched secret payload is empty from Secret Manager.');
      }
      internalApiKey = payload;
      console.log('Successfully fetched and configured API key from Secret Manager.');
    } catch (error: any) {
      console.error('Error fetching API key from Secret Manager:', error.message);
      if (!fallbackApiKey) {
        throw new Error('Secret Manager fetch failed and MCP_SERVER_INTERNAL_API_KEY_FALLBACK is not set.');
      }
      console.warn('Falling back to MCP_SERVER_INTERNAL_API_KEY_FALLBACK due to Secret Manager error.');
      internalApiKey = fallbackApiKey;
    }
  } else {
    if (!fallbackApiKey) {
      throw new Error('MCP_SERVER_INTERNAL_API_KEY_FALLBACK is not set and GCP config for Secret Manager is missing.');
    }
    console.log('GCLOUD_PROJECT or MCP_API_KEY_SECRET_NAME not set. Using fallback API key for local development.');
    internalApiKey = fallbackApiKey;
  }
  if (!internalApiKey) { // Should be unreachable if logic above is correct
    throw new Error('CRITICAL: Internal API Key could not be configured.');
  }
}

// --- Authentication Middleware (Service-to-Service) ---
const authenticateApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!internalApiKey) {
    console.error('CRITICAL: Internal API Key is not configured on server. Denying request.');
    return res.status(500).json({ error: 'Internal Server Configuration Error: API Key missing' });
  }
  const providedApiKey = req.headers['x-internal-api-key'];
  if (!providedApiKey || providedApiKey !== internalApiKey) {
    console.warn(`Failed authentication attempt. Provided key: ${providedApiKey ? providedApiKey.substring(0,5)+'...' : 'None'}`);
    return res.status(401).json({ error: 'Unauthorized access to MCP server' });
  }
  next();
};

// --- CORS Configuration ---
const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS;
const allowedOrigins = allowedOriginsEnv ? allowedOriginsEnv.split(',').map(origin => origin.trim()) : [];

if (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'development') {
  console.warn('CORS_ALLOWED_ORIGINS is not set. Cross-origin browser requests might be blocked in production.');
} else if (allowedOrigins.length === 0 && process.env.NODE_ENV === 'development') {
  console.log('CORS_ALLOWED_ORIGINS not set. Defaulting to common local development origins for development mode.');
  allowedOrigins.push('http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:8080');
}

const corsOptions: cors.CorsOptions = {
  origin: function (origin, callback) {
    console.log(`CORS Check: Request Origin: '${origin}', Allowed Origins Configured: '${allowedOrigins.join('|')}'`);
    if (!origin || allowedOrigins.includes(origin)) {
      // Log when allowed, including undefined origin (server-to-server, curl)
      console.log(`CORS: Origin ${origin ? origin : 'undefined (server-to-server or curl)'} allowed.`);
      callback(null, true);
    } else {
      console.warn(`CORS: Origin ${origin} NOT allowed.`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-api-key'], // x-internal-api-key added here
  credentials: true,
  optionsSuccessStatus: 204
};

// --- MCP Server Setup ---
// This function creates and configures an McpServer instance.
// Tools and resources will be added to this server instance.
function initializeMcpServerInstance(): McpServer {
  const mcpServerOptions: McpServerOptions = {
    name: "KnowReply-MCP-Server",
    version: "1.0.0", // Consider moving to package.json version
    // Add other server options if needed
  };
  const server = new McpServer(mcpServerOptions);

  // Refactored stripe.getCustomerByEmail tool
  server.tool(
    "stripe_getCustomerByEmail", // Tool name
    z.object({                   // Zod schema for arguments (paramSchema)
      email: z.string().email({ message: "Invalid email format." }),
      stripe_api_key: z.string().min(1, { message: "Stripe API key (secret key) cannot be empty." })
    }),
    async (toolArgs): Promise<{ content: McpContent[], isError?: boolean }> => { // Tool handler function
      const { email, stripe_api_key: apiKey } = toolArgs;
      console.log(`Executing MCP SDK Tool: stripe_getCustomerByEmail for email: ${email}`);

      try {
        const response = await axios.get('https://api.stripe.com/v1/customers', {
          params: { email: email, limit: 1 },
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
          const customer = response.data.data[0];
          const customerData = { // Transformed data
            id: customer.id,
            name: customer.name || null,
            email: customer.email,
            created: customer.created ? new Date(customer.created * 1000).toISOString() : null,
          };
          // Return data in MCP SDK content format
          return { content: [{ type: "text", text: JSON.stringify(customerData) }] };
        } else {
          // Customer not found, but API call was successful
          return { content: [{ type: "text", text: JSON.stringify({ message: "Customer not found with the provided email.", customerData: null }) }] };
        }
      } catch (error: any) {
        console.error("Error calling Stripe API (tool: stripe_getCustomerByEmail):", error.message);
        let errorMessage = "An unexpected error occurred while trying to retrieve customer data from Stripe.";
        let errorDetails: any = null;

        if (error.response) {
          errorMessage = `Stripe API Error: ${error.response.data?.error?.message || error.response.statusText || 'Failed to retrieve data'}`;
          errorDetails = { status: error.response.status, data: error.response.data?.error };
        } else if (error.request) {
          errorMessage = "No response received from Stripe API. Check network connectivity.";
        }

        // Return error in MCP SDK content format
        return {
          content: [{ type: "text", text: JSON.stringify({ error: errorMessage, details: errorDetails }) }],
          isError: true
        };
      }
    }
  ); // End of server.tool for stripe_getCustomerByEmail

  return server;
}

// --- Main Server Startup Logic ---
async function startServer() {
  try {
    await fetchAndSetInternalApiKey(); // Fetch and set the key at startup

    app.use(express.json()); // Middleware to parse JSON request bodies

    // Apply CORS middleware globally
    app.use(cors(corsOptions));
    // Explicitly handle OPTIONS requests (preflight) for all routes
    // This ensures CORS headers are sent for preflight requests even if a route doesn't explicitly handle OPTIONS.
    app.options('*', cors(corsOptions));


    // Health check endpoint (public, before other MCP-specific routes)
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        message: 'MCP Server is running',
        apiKeyStatus: internalApiKey ? 'Loaded' : 'Not Loaded' // For diagnostics
      });
    });

    // MCP Endpoint - Protected by x-internal-api-key
    // This single POST endpoint will handle all MCP JSON-RPC messages
    app.post('/mcp', authenticateApiKey, async (req: express.Request, res: express.Response) => {
      // In stateless mode, create a new instance of transport and server for each request
      // to ensure complete isolation, as per MCP SDK stateless streamable HTTP example.
      const mcpInstance = initializeMcpServerInstance(); // Get a configured McpServer instance
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless, no session ID needed
      });

      // Clean up transport and server when the request is closed by the client
      // This is important to prevent memory leaks or resource exhaustion.
      res.on('close', () => {
        console.log(`Request to /mcp closed by client. Closing MCP transport and server instance for this request.`);
        transport.close(); // Close the transport
        mcpInstance.close(); // Close the McpServer instance
      });

      try {
        await mcpInstance.connect(transport); // Connect the server instance to the transport
        await transport.handleRequest(req, res, req.body); // Handle the actual MCP request
      } catch (error: any) {
        console.error('Error handling MCP request in /mcp route:', error.message, error.stack);
        if (!res.headersSent) {
          // Mimic JSON-RPC error structure if possible
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32000, // Using a generic JSON-RPC internal error code
              message: 'Internal server error while handling MCP request.',
              data: error.message // Optional: include error message if not sensitive
            },
            id: req.body?.id || null,
          });
        }
      }
    });

    // Remove old /discover endpoint - MCP SDK has its own discovery (listTools, listResources etc.)
    // The old /mcp/:provider/:action routes are also replaced by the single /mcp POST endpoint.

    app.listen(port, () => {
      console.log(`MCP Server (SDK-based) listening at http://localhost:${port}`);
      console.log(`MCP requests should be POSTed to /mcp`);
      if(process.env.NODE_ENV === 'development' && allowedOrigins.length > 0) {
        console.log(`Development CORS enabled for: ${allowedOrigins.join(', ')}`);
      } else if (allowedOrigins.length > 0) {
        console.log(`Production CORS enabled for: ${allowedOrigins.join(', ')}`);
      } else {
        console.warn('CORS_ALLOWED_ORIGINS is not configured. Browser-based cross-origin requests will likely fail.');
      }
    });

  } catch (error: any) {
    console.error('Failed to start server:', error.message, error.stack);
    process.exit(1);
  }
}

// Start the server
startServer();

// Global Error Handlers (remain good practice)
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  // Ensure reason is an Error object for consistent logging
  if (reason instanceof Error) {
    console.error('UNHANDLED REJECTION:', reason.message, reason.stack);
  } else {
    console.error('UNHANDLED REJECTION (non-Error type):', reason);
  }
  // Consider exiting if it's a critical unhandled promise rejection,
  // depending on application's fault tolerance strategy.
  // process.exit(1);
});
