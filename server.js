require('dotenv').config(); // Load .env file first

const express = require('express');
const fs = require('fs');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON request bodies
app.use(express.json());

// --- Authentication Middleware ---
// This will use MCP_SERVER_INTERNAL_API_KEY which is set by startServer()
const authenticateApiKey = (req, res, next) => {
  const apiKey = process.env.MCP_SERVER_INTERNAL_API_KEY;
  if (!apiKey) {
    // This case should ideally not be reached if startServer ensures apiKey is set or exits.
    console.error('CRITICAL: MCP_SERVER_INTERNAL_API_KEY is not set. Server started incorrectly.');
    return res.status(500).json({ error: 'Internal Server Configuration Error: API Key missing' });
  }
  const providedApiKey = req.headers['x-internal-api-key'];
  if (!providedApiKey || providedApiKey !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized access to MCP server' });
  }
  next();
};

// --- Helper function to get API key ---
async function getMcpApiKey() {
  const gcloudProject = process.env.GCLOUD_PROJECT;
  const secretName = process.env.MCP_API_KEY_SECRET_NAME; // e.g., "mcp-api-key"
  const fallbackApiKey = process.env.MCP_SERVER_INTERNAL_API_KEY_FALLBACK;

  if (gcloudProject && secretName) {
    try {
      const client = new SecretManagerServiceClient();
      const secretVersionName = `projects/${gcloudProject}/secrets/${secretName}/versions/latest`;
      console.log(`Attempting to fetch secret: ${secretVersionName}`);
      const [version] = await client.accessSecretVersion({ name: secretVersionName });
      const payload = version.payload.data.toString('utf8');
      if (!payload) {
        throw new Error('Fetched secret payload is empty.');
      }
      console.log('Successfully fetched API key from Secret Manager.');
      return payload;
    } catch (error) {
      console.error('Error fetching API key from Secret Manager:', error.message);
      console.warn('Falling back to MCP_SERVER_INTERNAL_API_KEY_FALLBACK due to Secret Manager error.');
      if (!fallbackApiKey) {
        throw new Error('Secret Manager fetch failed and MCP_SERVER_INTERNAL_API_KEY_FALLBACK is not set.');
      }
      return fallbackApiKey;
    }
  } else {
    console.log('GCLOUD_PROJECT or MCP_API_KEY_SECRET_NAME not set. Using fallback API key for local development.');
    if (!fallbackApiKey) {
      throw new Error('MCP_SERVER_INTERNAL_API_KEY_FALLBACK is not set for local development.');
    }
    return fallbackApiKey;
  }
}

// --- Main Server Startup Logic ---
async function startServer() {
  try {
    const apiKey = await getMcpApiKey();
    if (!apiKey) {
      console.error('CRITICAL: API Key could not be retrieved. Server cannot start.');
      process.exit(1);
    }
    process.env.MCP_SERVER_INTERNAL_API_KEY = apiKey; // Set the key for the auth middleware
    console.log('MCP Server Internal API Key has been configured.');

    // Health check endpoint (not protected by API key authentication)
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        message: 'MCP Server is running',
      });
    });

    // MCP routes (protected by API key authentication)
    const mcpRouter = express.Router();
    mcpRouter.use(authenticateApiKey); // Apply middleware to all /mcp routes

    mcpRouter.post('/:provider/:action', async (req, res) => {
      const { provider, action } = req.params;
      const { args, auth } = req.body;
      const timestamp = new Date().toISOString();

      console.log(`[${timestamp}] [MCP Request] Provider: ${provider}, Action: ${action}, Args: ${JSON.stringify(args || {})}`);

      if (args === undefined || auth === undefined) {
        console.error(`[${timestamp}] [MCP Error - 400] Provider: ${provider}, Action: ${action}, Error: Missing 'args' or 'auth' in request body`);
        return res.status(400).json({ error: "Missing 'args' or 'auth' in request body" });
      }

      const handlerFileName = `${action}.js`;
      const handlerPath = require('path').join(__dirname, 'handlers', provider, handlerFileName); // Corrected path usage

      if (!fs.existsSync(handlerPath)) {
        console.error(`[${timestamp}] [MCP Error - 404] Provider: ${provider}, Action: ${action}, Error: MCP handler file not found at ${handlerPath}`);
        return res.status(404).json({ error: "MCP handler not found" });
      }

      try {
        const handler = require(handlerPath);

        if (typeof handler !== 'function') {
          console.error(`[${timestamp}] [MCP Error - 500] Provider: ${provider}, Action: ${action}, Error: Handler at ${handlerPath} is not a function`);
          return res.status(500).json({ error: "Error executing MCP handler (handler is not a function)" });
        }

        const result = await handler({ args, auth });
        
        console.log(`[${new Date().toISOString()}] [MCP Response] Provider: ${provider}, Action: ${action}, Result: ${JSON.stringify(result)}`);
        res.status(200).json(result);

      } catch (err) {
        console.error(`[${new Date().toISOString()}] [MCP Error - 500] Provider: ${provider}, Action: ${action}, Error: ${err.message}`, err.stack);
        res.status(500).json({ error: "Error executing MCP handler" });
      }
    });

    app.use('/mcp', mcpRouter); // Mount the MCP router

    // Start server
    app.listen(port, () => {
      console.log(`MCP Server listening at http://localhost:${port}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();

// --- Global Error Handlers (Optional but good practice) ---
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1); // Mandatory (as per the Node.js docs)
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  // Application specific logging, throwing an error, or other logic here
});
