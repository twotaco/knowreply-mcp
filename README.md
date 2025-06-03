# Mock Centralized Provider (MCP) Server

The Mock Centralized Provider (MCP) Server is a Node.js application that provides a unified interface to interact with various third-party services. This server connects to **live third-party APIs** for services like Stripe, WooCommerce, and WordPress. It also includes mock implementations for others (e.g., HubSpot, Zendesk, Calendly) and some specific live API MCPs that are safer to mock for certain operations (e.g., Stripe's `createCheckoutSession`). It's designed for development, testing, and abstracting service interactions.

## Features

-   **Unified Interface**: Access different providers through a consistent API endpoint structure.
-   **Live & Mock Implementations**:
    -   Connects to live Stripe, WooCommerce, and WordPress APIs for real-time data interaction.
    -   Includes mock handlers for other services like HubSpot, Zendesk, and Calendly, and some specific Stripe MCPs (e.g. `createCheckoutSession`) for predictable testing environments.
-   **Service Discovery**: A `GET /discover` endpoint to dynamically fetch available providers, actions, argument schemas, and sample payloads.
-   **CORS Support**: Configurable Cross-Origin Resource Sharing to allow requests from authorized frontend origins.
-   **Request Validation**: Uses Zod to validate incoming request arguments and authentication details for all handlers.
-   **Secure API Key Management**:
    -   Supports fetching the server's internal API key from Google Cloud Secret Manager for GCP deployments.
    -   Uses a fallback environment variable for local development.
-   **Authentication**:
    -   Protects MCP server access (except for `/health` and `/discover`) using an internal API key.
    -   Expects third-party API keys to be passed in the `auth.token` field for individual provider calls (e.g., Stripe Secret Key for Stripe MCPs).

## Service Discovery (`/discover` Endpoint)

The `/discover` endpoint allows clients to dynamically fetch a list of all available MCP providers and their actions, along with metadata for each.

-   **Endpoint:** `GET /discover`
-   **Authentication:** This endpoint does **not** require the `x-internal-api-key` header. It is public.
-   **Response Structure Example:**
    ```json
    {
      "providers": [
        {
          "provider_name": "stripe",
          "display_name": "Stripe",
          "description": "Actions related to Woocommerce.",
          "auth_requirements_general": "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.",
          "connection_schema": {
            "baseUrl": { "type": "ZodString", "description": "WooCommerce site URL e.g. https://yourstore.com" },
            "consumerKey": { "type": "ZodString", "description": "WooCommerce API Consumer Key" },
            "consumerSecret": { "type": "ZodString", "description": "WooCommerce API Consumer Secret" }
          },
          "actions": [
            {
              "action_name": "getOrders",
              "display_name": "Get Orders",
              "description": "Fetches orders from WooCommerce...",
              "auth_requirements": "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.",
              "args_schema": {
                "email": { "type": "ZodString", "optional": true }
                // ... other action-specific args
              },
              "sample_payload": {
                "email": "customer@example.com"
              }
            }
            // ... more WooCommerce actions
          ]
        },
        {
          "provider_name": "stripe",
          "display_name": "Stripe",
          "description": "Actions related to Stripe.",
          "auth_requirements_general": "Requires a Stripe Secret Key as 'token' in the auth object.",
          "connection_schema": {
            "token": { "type": "ZodString", "description": "Stripe Secret Key (sk_live_... or sk_test_...)" }
          },
          "actions": [
            {
              "action_name": "getCustomerByEmail",
              "display_name": "Get Customer By Email",
              "description": "Fetches a customer from Stripe by their email address. Returns the first customer if multiple exist with the same email.",
              "auth_requirements": "Requires a Stripe Secret Key as 'token' in the auth object.",
              "args_schema": {
                "email": { "type": "ZodString", "description": "Invalid email format."}
              },
              "sample_payload": {
                "email": "user@example.com"
              }
            }
            // ... more Stripe actions
          ]
        }
        // ... more providers
      ]
    }
    ```
-   **Important Note on Metadata:**
    The `description`, `args_schema`, and `sample_payload` fields are dynamically generated. The `args_schema` provides a simplified view of Zod types.
    -   **`connection_schema`**: Each provider entry may now include a `connection_schema`. This object defines the structure and Zod types for the connection/authentication parameters (e.g., API keys, base URLs) expected by that provider. These parameters should be passed in the `auth` object of your MCP request.
    -   **`auth_requirements_general` / `auth_requirements`**: These fields provide a human-readable string describing the authentication needs, found at both the provider level and potentially at the individual action level if an action has specific requirements.
-   **Up-to-date Information:**
    This endpoint always reflects the current state of available MCP handlers in the `handlers/` directory.

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
-   **Allowed Headers**: `Content-Type, Authorization, x-internal-api-key` (custom headers needed by the application).
-   **Credentials**: `credentials: true` is set, allowing credentials like `Authorization` headers or cookies (if applicable) to be passed in cross-origin requests.

## Running the Server
```bash
npm start
```

## Calling MCP Endpoints

Consult `GET /discover` for available MCPs and arguments.
-   **Base URL**: `http://localhost:<PORT>/mcp/:provider/:action`
-   **Headers**:
    -   `Content-Type: application/json`
    -   `x-internal-api-key`: Your `MCP_SERVER_INTERNAL_API_KEY_FALLBACK` (for local) or the configured server key. Required for `/mcp/*` routes.
-   **JSON Body**:
    ```json
    {
      "args": { /* ... arguments for the action ... */ },
      "auth": { "token": "THIRD_PARTY_API_KEY_PLACEHOLDER" }
    }
    ```
Note: The structure of the `auth` object is defined by the `connection_schema` for each provider, found in the `/discover` endpoint response. This object contains the necessary credentials (like API keys, URLs, etc.) for the MCP server to authenticate with the third-party service. The `args` object contains parameters specific to the action being called.

## Available MCP Handlers

This list is dynamically generated and available via `GET /discover`. Handlers for **Stripe (most actions) are live**, others are mock implementations.

**Stripe (`/mcp/stripe/*`)** (Mostly Live API)
*   `getCustomerByEmail` (Live)
*   `getCustomerById` (Live)
*   `getPaymentIntentById` (Live)
*   `getInvoices` (Live)
*   `sendInvoice` (Live)
*   `getLastInvoice` (Live)
*   `getNextBillingDate` (Live)
*   `issueRefund` (Live)
*   `createCheckoutSession` (Mock)

**HubSpot (`/mcp/hubspot/*`)** (Mock)
*   `getContactByEmail`
*   `updateContact`
*   `getTicketStatus`
*   `createTicket`

**WooCommerce (`/mcp/woocommerce/*`)** (Live API)
*   `getOrders`
*   `getOrderById`
*   `getCustomers`
*   `getProducts`
*   `createOrderNote`
*   `createDraftOrder`

**WordPress (`/mcp/wordpress/*`)** (Live API)
*   `getUsers` (Requires Auth)
*   `getPages` (Auth optional for public content)
*   `getPosts` (Auth optional for public content)

**Zendesk (`/mcp/zendesk/*`)** (Mock)
*   `getTicketByEmail`
*   `updateTicketStatus`

**Calendly (`/mcp/calendly/*`)** (Mock)
*   `rescheduleMeeting`
*   `getUpcomingMeetings`

For detailed argument schemas and sample payloads, use `GET /discover`. For source code, see `handlers/`.

---

## Provider Specific MCP Documentation (Examples)

The `GET /discover` endpoint is the authoritative source for available actions and their request structures.

### Stripe MCPs
**Note:** Most Stripe MCPs now make **live calls to the Stripe API**. You must provide a valid Stripe Secret Key (preferably a **Test Mode** key like `sk_test_...`) in the `auth.token` field of your requests. The `createCheckoutSession` MCP is currently still a mock.

#### 1. `stripe.getCustomerByEmail` (Live)
-   **Purpose**: Retrieves a customer's details from Stripe by their email address.
-   **Args**: As per `/discover` (e.g., `{"email": "customer@example.com"}`)
-   **Auth Token**: "Stripe Secret Key" (e.g., `sk_test_YOUR_STRIPE_TEST_KEY`)
-   **Stripe API Docs**: [List Customers (filter by email)](https://stripe.com/docs/api/customers/list)
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/stripe/getCustomerByEmail \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "email": "customer@example.com" }, "auth": { "token": "sk_test_YOUR_STRIPE_TEST_KEY" } }'
    ```

#### Stripe `getCustomerById` (Live)
-   **Purpose**: Retrieves a specific customer's details from Stripe by their ID.
-   **Args**: `{"customerId": "cus_xxxxxxxxxxxxxx"}`
-   **Auth Token**: "Stripe Secret Key"
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/stripe/getCustomerById \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "customerId": "cus_xxxxxxxxxxxxxx" }, "auth": { "token": "sk_test_YOUR_STRIPE_TEST_KEY" } }'
    ```

#### Stripe `getInvoices` (Live)
-   **Purpose**: Lists invoices, optionally filtered by customer, subscription, or status.
-   **Args**: `{"customerId": "cus_xxxxxxxxxxxxxx", "limit": 5}` (see `/discover` for all options)
-   **Auth Token**: "Stripe Secret Key"
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/stripe/getInvoices \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "customerId": "cus_xxxxxxxxxxxxxx", "limit": 5 }, "auth": { "token": "sk_test_YOUR_STRIPE_TEST_KEY" } }'
    ```

#### Stripe `sendInvoice` (Live)
-   **Purpose**: Sends or re-sends an invoice to the customer.
-   **Args**: `{"invoiceId": "in_xxxxxxxxxxxxxx"}`
-   **Auth Token**: "Stripe Secret Key"
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/stripe/sendInvoice \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "invoiceId": "in_xxxxxxxxxxxxxx" }, "auth": { "token": "sk_test_YOUR_STRIPE_TEST_KEY" } }'
    ```

*(Other Stripe examples for live MCPs like `getLastInvoice`, `getNextBillingDate`, `issueRefund` follow a similar structure. `stripe.createCheckoutSession` is still a mock.)*
**Note:** Stripe MCPs require your Stripe Secret Key to be passed as `token` in the `auth` object, as defined by its `connection_schema` in `/discover`.

### HubSpot MCPs (Mock)
**Note:** HubSpot MCPs are mock implementations. The `connection_schema` in `/discover` indicates an optional `token` field in the `auth` object, which serves as a placeholder.
(Example: `hubspot.getContactByEmail`)
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/hubspot/getContactByEmail \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "email": "contact@example.com" }, "auth": { "token": "YOUR_HUBSPOT_API_KEY_PLACEHOLDER" } }'
    ```

### WooCommerce MCPs (Live)
**Note:** WooCommerce MCPs require `baseUrl`, `consumerKey`, and `consumerSecret` to be passed in the `auth` object for each request. Consult the `connection_schema` from `/discover` for details.

#### WooCommerce `getOrders` (Live)
-   **Purpose**: Retrieves a list of orders, can be filtered by email, status, etc.
-   **Args**: `{"email": "customer@example.com"}`
-   **Auth**: `{"baseUrl": "https://yourstore.com", "consumerKey": "ck_xxx", "consumerSecret": "cs_xxx"}`
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/woocommerce/getOrders \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{
      "args": { "email": "customer@example.com" },
      "auth": {
        "baseUrl": "https://yourstore.com",
        "consumerKey": "ck_xxxx",
        "consumerSecret": "cs_xxxx"
      }
    }'
    ```

#### WooCommerce `createOrderNote` (Live)
-   **Purpose**: Adds a note to an existing order. Can be private (default) or customer-visible.
-   **Args**: `{"orderId": 123, "note": "Customer requested an update.", "customer_note": false}` (Set `customer_note: true` to make the note visible to the customer, defaults to `false` for a private note)
-   **Auth**: `{"baseUrl": "https://yourstore.com", "consumerKey": "ck_xxx", "consumerSecret": "cs_xxx"}`
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/woocommerce/createOrderNote \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{
      "args": {
        "orderId": 123,
        "note": "Your order update: dispatched.",
        "customer_note": true
      },
      "auth": {
        "baseUrl": "https://yourstore.com",
        "consumerKey": "ck_xxxx",
        "consumerSecret": "cs_xxxx"
      }
    }'
    ```

### WordPress MCPs (Live)
**Note:** WordPress MCPs require `baseUrl` and an authentication `token` (e.g., Application Password) to be passed in the `auth` object, as defined by its `connection_schema` in `/discover`. For `getPages` and `getPosts`, the `token` is optional for public content.

#### WordPress `getUsers` (Live)
-   **Purpose**: Retrieves WordPress users. Can be searched by email or search term.
-   **Args**: `{"email": "user@example.com"}`
-   **Auth**: `{"baseUrl": "https://yourwp.site", "token": "YOUR_WP_APP_PASSWORD"}`
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/wordpress/getUsers \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "email": "user@example.com" }, "auth": { "baseUrl": "https://yourwp.site", "token": "YOUR_WP_APP_PASSWORD_OR_TOKEN" } }'
    ```

#### WordPress `getPages` (Live)
-   **Purpose**: Retrieves WordPress pages. Can be filtered by search or slug. Token optional for public pages.
-   **Args**: `{"slug": "about-us"}`
-   **Auth**: `{"baseUrl": "https://yourwp.site", "token": "YOUR_WP_APP_PASSWORD_OPTIONAL"}`
-   **Example `curl` (local for public page):**
    ```bash
    curl -X POST http://localhost:3000/mcp/wordpress/getPages \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "slug": "about-us" }, "auth": { "baseUrl": "https://yourwp.site" } }'
    ```

### Zendesk MCPs (Mock)
(Example: `zendesk.getTicketByEmail`)
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/zendesk/getTicketByEmail \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "email": "user@example.com" }, "auth": { "token": "YOUR_ZENDESK_API_TOKEN" } }'
    ```

### Calendly MCPs (Mock)
(Example: `calendly.rescheduleMeeting`)
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/calendly/rescheduleMeeting \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "eventId": "event_uuid_123", "newTime": "2025-01-15T14:00:00.000Z" }, "auth": { "token": "YOUR_CALENDLY_API_TOKEN" } }'
    ```
(For detailed `args` and expected `data` object structures for each action, please refer to the output of the `GET /discover` endpoint.)

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
