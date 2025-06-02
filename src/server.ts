import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { z, ZodError } from 'zod';
import axios from 'axios';

// Define McpContent locally based on current usage
interface McpTextContent {
  type: "text";
  text: string;
  [key: string]: any; // Allow any other properties (FIX APPLIED HERE)
}
type McpContent = McpTextContent;

// Load .env file first
dotenv.config();

// let globalMcpServer: McpServer; // Removed global McpServer variable
// let globalTransport: StreamableHTTPServerTransport; // Removed global transport

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
      const request = { name: secretVersionName };
      const [versionResponse] = await client.accessSecretVersion(request);

      // Refined payload handling (FIX APPLIED HERE)
      let apiKeyPayload: string | undefined;
      if (versionResponse.payload?.data) {
          if (typeof versionResponse.payload.data === 'string') {
              apiKeyPayload = versionResponse.payload.data;
          } else if (versionResponse.payload.data instanceof Uint8Array || Buffer.isBuffer(versionResponse.payload.data)) {
              apiKeyPayload = Buffer.from(versionResponse.payload.data).toString('utf8');
          } else {
              console.error('Secret payload data is of an unexpected type:', typeof versionResponse.payload.data);
              throw new Error('Secret payload data is of an unexpected type.');
          }
      }

      if (!apiKeyPayload) {
        throw new Error('Fetched secret payload is empty, data is missing, or data is of an unexpected type.');
      }
      internalApiKey = apiKeyPayload;
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
  if (!internalApiKey) {
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

  let keyForLog = 'None';
  if (providedApiKey) {
    const key = Array.isArray(providedApiKey) ? providedApiKey[0] : providedApiKey;
    if (typeof key === 'string' && key.length > 0) {
      keyForLog = key.substring(0, 5) + '...';
    } else if (typeof key === 'string' && key.length === 0) {
      keyForLog = '[empty string]';
    }
  }

  if (!providedApiKey || providedApiKey !== internalApiKey) {
    console.warn(`Failed authentication attempt. Provided key: ${keyForLog}`);
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
      console.log(`CORS: Origin ${origin ? origin : 'undefined (server-to-server or curl)'} allowed.`);
      callback(null, true);
    } else {
      console.warn(`CORS: Origin ${origin} NOT allowed.`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-api-key'],
  credentials: true,
  optionsSuccessStatus: 204
};

// --- MCP Server Setup ---
// This function now ALWAYS creates a new McpServer instance
function initializeMcpServerInstance(): McpServer {
  // if (globalMcpServer) { // Removed check for global instance
  //   return globalMcpServer;
  // }
  console.log('[MCP_SERVER_LOG] Initializing McpServer instance and registering tools...');
  const mcpServerOptions: ConstructorParameters<typeof McpServer>[0] = {
    name: "KnowReply-MCP-Server",
    version: "1.0.0",
  };
  const server = new McpServer(mcpServerOptions);

  server.tool(
    "stripe_getCustomerByEmail",
    {
      email: z.string().email({ message: "Invalid email format." }),
      stripe_api_key: z.string().min(1, { message: "Stripe API key (secret key) cannot be empty." })
    },
    async (toolArgs: { email: string, stripe_api_key: string }): Promise<{ content: McpContent[], isError?: boolean }> => {
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
          const customerData = {
            id: customer.id,
            name: customer.name || null,
            email: customer.email,
            created: customer.created ? new Date(customer.created * 1000).toISOString() : null,
          };
          return { content: [{ type: "text", text: JSON.stringify(customerData) }] };
        } else {
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

        return {
          content: [{ type: "text", text: JSON.stringify({ error: errorMessage, details: errorDetails }) }],
          isError: true
        };
      }
    }
  );
  console.log('[MCP_SERVER_LOG] Tool "stripe_getCustomerByEmail" registration attempted.');

  // globalMcpServer = server; // Removed assignment to global variable
  return server; // Return the new instance
}

// --- Main Server Startup Logic ---
async function startServer() {
  try {
    await fetchAndSetInternalApiKey();
    // globalMcpServer = initializeMcpServerInstance(); // Global McpServer initialization removed

    // Global transport and its connection at startup are removed.
    // globalTransport = new StreamableHTTPServerTransport({
    //   sessionIdGenerator: undefined,
    // });
    // await globalMcpServer.connect(globalTransport);
    // console.log('[MCP_SERVER_LOG] Global McpServer connected to global transport at startup.');

    app.use(express.json());
    app.use(cors(corsOptions));

    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        message: 'MCP Server is running',
        apiKeyStatus: internalApiKey ? 'Loaded' : 'Not Loaded'
      });
    });

    app.post('/mcp', authenticateApiKey, async (req: express.Request, res: express.Response) => {
      // ==========================================================================================
      // UNRESOLVED ISSUE: "Method not found"
      // ------------------------------------------------------------------------------------------
      // Despite various architectural approaches, the MCP SDK consistently returns a
      // "Method not found" error (JSON-RPC error code -32601) when attempting to call
      // registered tools like "stripe_getCustomerByEmail".
      //
      // Current Architecture:
      // - Per-request McpServer instances (created by `initializeMcpServerInstance`).
      // - Per-request StreamableHTTPServerTransport instances.
      // This aligns with the apparent stateless model suggested by the example name
      // `simpleStatelessStreamableHttp.ts` that was referenced.
      //
      // Other Architectures Tried:
      // 1. Global McpServer, Per-request Transport: Still "Method not found".
      // 2. Global McpServer, Global Transport (connected once at startup): Still "Method not found".
      //
      // Hypothesis:
      // The issue may stem from subtle internal workings of the @modelcontextprotocol/sdk,
      // potentially around tool registration visibility, the `connect` method's effect on the
      // McpServer instance, or how `StreamableHTTPServerTransport.handleRequest` dispatches
      // method calls. Without SDK documentation or source access, further debugging is limited.
      // The tool's own internal console.log is never reached, indicating a dispatch failure.
      // ==========================================================================================
      console.log(`[MCP_SERVER_LOG] Received request for method: ${req.body?.method} (ID: ${req.body?.id})`);

      const mcpInstance = initializeMcpServerInstance(); // Create per-request McpServer instance
      const transport = new StreamableHTTPServerTransport({ // Create per-request transport
        sessionIdGenerator: undefined,
      });

      res.on('close', () => {
        console.log('Request to /mcp closed by client. Closing MCP transport and per-request server instance.');
        transport.close(); // Close per-request transport
        mcpInstance.close(); // Close per-request McpServer instance
      });

      try {
        console.log('[MCP_SERVER_LOG] Connecting per-request McpServer to per-request transport.');
        await mcpInstance.connect(transport); // Connect per-request server to per-request transport
        // console.log('[MCP_SERVER_LOG] Post-connect check: mcpInstance has tool "stripe_getCustomerByEmail"?', mcpInstance.hasTool?.('stripe_getCustomerByEmail') ?? 'cannot check'); // Removed failing diagnostic
        await transport.handleRequest(req, res, req.body); // Use per-request transport
      } catch (error: any) {
        console.error('Error handling MCP request in /mcp route:', error.message, error.stack);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Internal server error while handling MCP request.',
              data: error.message
            },
            id: req.body?.id || null,
          });
        }
      }
    });

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
    console.error('Failed to start server (outer catch):', error.message, error.stack);
    console.error('OUTER CATCH: PROCESS IS EXITING DUE TO FAILURE IN startServer()');
    process.exit(1);
  }
}

startServer().then(() => {
  console.log('startServer promise resolved. Server should be running.');
}).catch(err => {
  console.error('startServer promise rejected:', err.message, err.stack);
  console.error('PROMISE REJECT: PROCESS IS EXITING DUE TO ASYNC FAILURE IN startServer() CHAIN');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason instanceof Error) {
    console.error('UNHANDLED REJECTION:', reason.message, reason.stack);
  } else {
    console.error('UNHANDLED REJECTION (non-Error type):', reason);
  }
});
