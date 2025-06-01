# Mock Centralized Provider (MCP) Server

The Mock Centralized Provider (MCP) Server is a Node.js application that provides a unified interface to interact with various third-party services. Some handlers in this server connect to **live third-party APIs** (e.g., Stripe), while others use **mock implementations** (e.g., HubSpot, Shopify, Klaviyo, Zendesk, Calendly). It's designed for development, testing, and abstracting service interactions.

## Features

-   **Unified Interface**: Access different providers through a consistent API endpoint structure.
-   **Live & Mock Implementations**:
    -   Connects to live Stripe APIs for real-time data interaction (for most Stripe MCPs).
    -   Includes mock handlers for other services like HubSpot, Shopify, Klaviyo, Zendesk, and Calendly, and some specific Stripe MCPs (e.g. `createCheckoutSession`) for predictable testing environments.
-   **Service Discovery**: A `GET /discover` endpoint to dynamically fetch available providers, actions, argument schemas, and sample payloads (Note: with SDK, discovery is via SDK methods like `listTools`).
-   **CORS Support**: Configurable Cross-Origin Resource Sharing to allow requests from authorized frontend origins.
-   **Request Validation**: Uses Zod to validate incoming request arguments and authentication details for all handlers/tools.
-   **Secure API Key Management**:
    -   Supports fetching the server's internal API key from Google Cloud Secret Manager for GCP deployments.
    -   Uses a fallback environment variable for local development.
-   **Authentication**:
    -   Protects MCP server access (except for `/health`) using an internal API key.
    -   Expects third-party API keys to be passed in the `params` of each tool, as defined by the tool's schema.
-   **TypeScript & Build Process**: Written in TypeScript for type safety, compiled to JavaScript for production. The Docker build process includes this compilation.

## Service Discovery (`/discover` Endpoint)

**Note:** With the transition to the `@modelcontextprotocol/sdk`, the primary method for service discovery will be through SDK-provided mechanisms (e.g., a tool similar to `listTools` that the SDK might offer, or a custom tool you build on top of the SDK that lists registered tools). The previous custom `GET /discover` endpoint described below is **no longer active** in the SDK-based server. This section will be updated or removed once the SDK's discovery mechanisms are fully integrated and documented for this server.

For conceptual understanding, the previous custom discovery aimed to provide:
-   A list of providers and their actions.
-   Argument schemas and sample payloads for each action.
-   This functionality will be replaced or supplemented by SDK features.

## Setup and Configuration

### 1. Clone the Repository
```bash
git clone <repository_url>
cd <repository_directory>
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file from `.env.example` and configure it:
```bash
cp .env.example .env
```
**Key Environment Variables:**
-   `PORT`: Optional. Server port (defaults to `3000`).
-   `MCP_SERVER_INTERNAL_API_KEY_FALLBACK`: **Required for local use.** Secret key for this MCP server.
-   `GCLOUD_PROJECT` & `MCP_API_KEY_SECRET_NAME`: For GCP deployment using Secret Manager to fetch the internal API key.
-   `CORS_ALLOWED_ORIGINS`: **Important for browser-based clients.** Comma-separated list of frontend origins allowed to make requests.

**Note on `MCP_SERVER_INTERNAL_API_KEY`**: This is set *internally* by the application at startup (from Secret Manager or fallback). The `x-internal-api-key` header from clients must match this.

#### CORS Configuration
The server implements CORS (Cross-Origin Resource Sharing) to control which frontend origins can make requests. This is primarily configured via the `CORS_ALLOWED_ORIGINS` environment variable.

-   **`CORS_ALLOWED_ORIGINS`**:
    -   **Purpose**: Specifies a comma-separated list of frontend URLs that are permitted to access the MCP server.
    -   **Format**: Example: `https://hub.example.com,http://localhost:5173,http://localhost:3001`
    -   **Production**: For any browser-based frontend application to interact with the MCP server in a production environment, its origin (e.g., `https://your-frontend-app.com`) **must** be included in this list.
    -   **Development (`NODE_ENV=development`)**: If `CORS_ALLOWED_ORIGINS` is not set, the server defaults to allowing common local development ports (e.g., `http://localhost:3000`, `http://localhost:3001`, `http://localhost:5173`, `http://localhost:8080`) for convenience.
    -   **No Origin**: Requests with no origin (like server-to-server calls, `curl`, or mobile apps) are allowed by default.

-   **Allowed HTTP Methods**: `GET, POST, PUT, DELETE, OPTIONS`
-   **Allowed Headers**: `Content-Type, Authorization, x-internal-api-key`.
-   **Credentials**: `credentials: true` is set, allowing credentials like `Authorization` headers or cookies (if applicable) to be passed in cross-origin requests.

## Running the Server

### Local Development
1.  **Build TypeScript (or watch for changes):**
    ```bash
    npm run build
    ```
    For continuous development, consider using a watch mode:
    ```bash
    # In one terminal:
    npm run build -- -w
    # In another terminal (requires nodemon: npm install -g nodemon):
    # nodemon dist/server.js
    ```
    Or, set up the `dev` script in `package.json` with `concurrently` and `nodemon` as mentioned in previous setup steps for a streamlined experience.

2.  **Start the server:**
    ```bash
    npm start
    ```
    This runs the compiled JavaScript from `dist/server.js`.

### Production
The server is started using `npm start`, which executes `node dist/server.js`. Ensure the code has been compiled using `npm run build` first.

## Calling MCP Endpoints (SDK Structure)

With the `@modelcontextprotocol/sdk`, interactions are via a single POST endpoint (`/mcp`) using JSON-RPC 2.0.

-   **Endpoint**: `POST http://localhost:<PORT>/mcp`
-   **Headers**:
    -   `Content-Type: application/json`
    -   `x-internal-api-key`: Your `MCP_SERVER_INTERNAL_API_KEY_FALLBACK` (for local) or the configured server key. Required for the `/mcp` route.
-   **JSON Body (JSON-RPC 2.0 Request)**:
    ```json
    {
      "jsonrpc": "2.0",
      "method": "<tool_name>", // e.g., "stripe_getCustomerByEmail"
      "params": {
        // Arguments specific to the tool, as defined in its Zod schema.
        // This typically includes the third-party API key, e.g., "stripe_api_key".
      },
      "id": "your_request_id_123" // Unique request ID (string or number)
    }
    ```
    The SDK server will route the request to the appropriate tool based on the `method` field. The third-party API key (previously in `auth.token`) is now expected within the `params` object for each tool, named according to the tool's argument schema (e.g., `stripe_api_key`, `hubspot_api_key`).

## Available MCP Tools (SDK-based)

The specific list of available tools and their exact `paramSchema` can be discovered by calling an SDK method on the server instance (e.g., `listTools()`, if available and exposed via a custom endpoint) or by inspecting the tool registrations in `src/server.ts`.

**Currently Refactored SDK Tools:**
*   `stripe_getCustomerByEmail` (Live API)

**To Be Refactored (examples of old handler names):**
*   Stripe: `getLastInvoice`, `getNextBillingDate`, `issueRefund` (Live), `createCheckoutSession` (Mock)
*   HubSpot: `getContactByEmail`, `updateContact`, `getTicketStatus`, `createTicket` (All Mock)
*   Shopify: `getOrderStatus`, `cancelOrder`, `getCustomerOrders` (All Mock)
*   Klaviyo: `getEmailHistory`, `getCartStatus` (All Mock)
*   Zendesk: `getTicketByEmail`, `updateTicketStatus` (All Mock)
*   Calendly: `rescheduleMeeting`, `getUpcomingMeetings` (All Mock)

(These will be registered as tools like `stripe_getLastInvoice`, `hubspot_getContactByEmail`, etc.)

---

## Provider Specific Tool Examples (SDK Structure)

### Stripe Tools
**Note:** Most Stripe tools (once refactored) make **live calls to the Stripe API**. You must provide a valid Stripe Secret Key (preferably a **Test Mode** key like `sk_test_...`) in the `params` of your JSON-RPC request, typically as `stripe_api_key`.

#### `stripe_getCustomerByEmail` (Live SDK Tool)
-   **Purpose**: Retrieves a customer's details from Stripe by their email address.
-   **JSON-RPC Method**: `stripe_getCustomerByEmail`
-   **Params Schema (example from tool definition):**
    ```typescript
    z.object({
      email: z.string().email(),
      stripe_api_key: z.string().min(1)
    })
    ```
-   **Stripe API Docs**: [List Customers (filter by email)](https://stripe.com/docs/api/customers/list)
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{
      "jsonrpc": "2.0",
      "method": "stripe_getCustomerByEmail",
      "params": { "email": "customer@example.com", "stripe_api_key": "sk_test_YOUR_STRIPE_TEST_KEY" },
      "id": "req-1"
    }'
    ```

*(Other tools for Stripe, HubSpot, Shopify, etc., will follow a similar JSON-RPC structure once they are refactored and registered with the MCP Server instance in `src/server.ts`.)*

---

## GCP Deployment Notes
When deploying the MCP server to a Google Cloud environment (like Cloud Run, GKE, or Compute Engine):

1.  **Secret Management:**
    -   Store the MCP server's internal API key in **Google Cloud Secret Manager**.
    -   The runtime service account used by your GCP service (e.g., Cloud Run service identity) **must** have the **"Secret Manager Secret Accessor"** IAM role granted for the specific secret you created.

2.  **Environment Variables in GCP:**
    Configure the following environment variables in your GCP service's settings:
    -   `GCLOUD_PROJECT`: Your Google Cloud Project ID.
    -   `MCP_API_KEY_SECRET_NAME`: The name of the secret in Secret Manager.
    -   `PORT`: The port your service should listen on (e.g., `8080` for Cloud Run).
    -   `MCP_SERVER_INTERNAL_API_KEY_FALLBACK`: Can be omitted if Secret Manager is the primary source.
    -   `CORS_ALLOWED_ORIGINS`: **Crucial for browser-based frontends.** Set this to the specific origin(s) of your deployed frontend application (e.g., `https://your-frontend-app.com`).

3.  **Containerization & Build:**
    -   The provided `Dockerfile` handles the TypeScript compilation (`npm run build`) during the image build process. This means the resulting Docker image contains the compiled JavaScript code from the `dist/` directory and is self-contained, ready to run.
    -   Ensure your GCP service is configured to use the `npm start` command (which runs `node dist/server.js`). The `gcp-build` script in `package.json` (which also runs `npm run build`) can be used by Google Cloud Build if you are using it as your CI/CD for building Docker images.
