const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON request bodies
app.use(express.json());

// Authentication middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-internal-api-key'];
  if (!apiKey || apiKey !== process.env.MCP_SERVER_INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized access to MCP server' });
  }
  next();
};

// Health check endpoint (not protected)
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
  const { args, auth } = req.body; // Destructure args and auth from req.body
  const timestamp = new Date().toISOString();

  // Log incoming request (after auth middleware, so this part of the request is authorized)
  console.log(`[${timestamp}] [MCP Request] Provider: ${provider}, Action: ${action}, Args: ${JSON.stringify(args)}`);

  if (args === undefined || auth === undefined) {
    console.error(`[${timestamp}] [MCP Error - 400] Provider: ${provider}, Action: ${action}, Error: Missing 'args' or 'auth' in request body`);
    return res.status(400).json({ error: "Missing 'args' or 'auth' in request body" });
  }

  const handlerFileName = `${action}.js`;
  const handlerPath = path.join(__dirname, 'handlers', provider, handlerFileName);

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

    const result = await handler({ args, auth }); // Pass args and auth correctly
    
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

// Handle server startup errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});
