# Mock Centralized Provider (MCP) Server

The Mock Centralized Provider (MCP) Server is a Node.js application built with Express that provides a unified interface to interact with mock versions of various third-party services like Stripe, HubSpot, Shopify, Klaviyo, Zendesk, and Calendly. It's designed for development and testing purposes, allowing you to simulate API calls without hitting actual external services.

## Features

-   **Unified Interface**: Access different mock providers through a consistent API endpoint structure.
-   **Service Discovery**: A `GET /discover` endpoint to dynamically fetch available providers, actions, argument schemas, and sample payloads.
-   **Mock Implementations**: Includes mock handlers for common actions.
-   **Request Validation**: Uses Zod to validate incoming request arguments and authentication details.
-   **Secure API Key Management**:
    -   Supports fetching the server's internal API key from Google Cloud Secret Manager for GCP deployments.
    -   Uses a fallback environment variable for local development.
-   **Authentication**: Protects server access (except for `/health` and `/discover`) using an internal API key (dynamically configured) and expects third-party API keys (mocked) to be passed for individual provider calls.

## Service Discovery (`/discover` Endpoint)

The `/discover` endpoint allows clients (like `hub.knowreply.email` or other API consumers) to dynamically fetch a list of all available MCP providers and their actions, along with metadata for each.

-   **Endpoint:** `GET /discover`
-   **Authentication:** This endpoint does **not** require the `x-internal-api-key` header. It is public.
-   **Response Structure Example:**
    ```json
    {
      "providers": [
        {
          "provider_name": "stripe",
          "display_name": "Stripe",
          "description": "Actions related to Stripe.",
          "actions": [
            {
              "action_name": "getCustomerByEmail",
              "display_name": "Get Customer By Email",
              "description": "Handles Get Customer By Email for Stripe.",
              "args_schema": {
                "email": "ZodString"
              },
              "sample_payload": {
                "email": "user@example.com"
              }
            },
            {
              "action_name": "issueRefund",
              "display_name": "Issue Refund",
              "description": "Handles Issue Refund for Stripe.",
              "args_schema": {
                "chargeId": "ZodString",
                "amount": "ZodOptional<ZodNumber>"
              },
              "sample_payload": {
                "chargeId": "identifier_123",
                "amount": 123
              }
            }
            // ... more Stripe actions
          ]
        },
        {
          "provider_name": "hubspot",
          "display_name": "Hubspot",
          "description": "Actions related to Hubspot.",
          "actions": [
            {
              "action_name": "getContactByEmail",
              "display_name": "Get Contact By Email",
              "description": "Handles Get Contact By Email for Hubspot.",
              "args_schema": {
                "email": "ZodString"
              },
              "sample_payload": {
                "email": "user@example.com"
              }
            }
            // ... more HubSpot actions
          ]
        }
        // ... more providers
      ]
    }
    ```
-   **Important Note on Metadata:**
    The `description`, `args_schema`, and `sample_payload` fields are dynamically generated. Descriptions are currently placeholders based on action and provider names. The `args_schema` provides a simplified view of argument names and their Zod types (e.g., "ZodString", "ZodOptional<ZodNumber>", "ZodObject"). If an action's handler does not export a Zod `ArgsSchema`, or if there's an error loading it, the `args_schema` may be empty and the description will indicate this. For richer, more detailed metadata, future enhancements may involve handlers exporting specific metadata objects.
-   **Up-to-date Information:**
    This endpoint always reflects the current state of available MCP handlers in the `handlers/` directory. If new MCPs are added or existing ones are modified (specifically their exported `ArgsSchema`), their information will be automatically updated here.

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
The server uses environment variables for configuration. Create a `.env` file by copying the example:
```bash
cp .env.example .env
```
Edit the `.env` file based on your environment (Local Development or GCP Deployment).

**Key Environment Variables:**

-   `PORT`: Optional. The port the server will listen on. Defaults to `3000`.

-   **For Local Development:**
    -   `MCP_SERVER_INTERNAL_API_KEY_FALLBACK`: **Required for local use.** This is your chosen secret key to protect access to this MCP server when not running on GCP or when GCP Secret Manager is not configured.

-   **For GCP Deployment (e.g., Cloud Run, GKE):**
    -   `GCLOUD_PROJECT`: **Required.** Your Google Cloud Project ID where the secret is stored.
    -   `MCP_API_KEY_SECRET_NAME`: **Required.** The name of the secret in Google Cloud Secret Manager that holds the MCP server's internal API key (e.g., `mcp-internal-api-key`).
    -   The `MCP_SERVER_INTERNAL_API_KEY_FALLBACK` can be omitted or left blank if GCP settings are correctly configured.

**Note on `MCP_SERVER_INTERNAL_API_KEY`**: This environment variable is now set *internally* by the application at startup. The server will attempt to fetch it from Google Cloud Secret Manager if `GCLOUD_PROJECT` and `MCP_API_KEY_SECRET_NAME` are defined. If these are not available, or if the fetch fails, it will use the value from `MCP_SERVER_INTERNAL_API_KEY_FALLBACK`. The `x-internal-api-key` header sent by clients must match this dynamically configured key.

## Running the Server

To start the MCP server:
```bash
npm start
```
The server will attempt to configure its internal API key and then listen on the specified port. You should see log messages indicating the API key configuration status and the listening port.

## Calling MCP Endpoints

To understand which MCPs are available and their required arguments, clients should first consult the `GET /discover` endpoint. The details below provide further examples and context.

-   **Base URL Structure**: `http://localhost:<PORT>/mcp/:provider/:action`
    -   `:provider`: The name of the third-party service (e.g., `stripe`, `hubspot`, `shopify`, `klaviyo`, `zendesk`, `calendly`).
    -   `:action`: The specific function to call on that provider.

-   **Headers**:
    -   `Content-Type: application/json`
    -   `x-internal-api-key`: The MCP server's internal API key (configured via Secret Manager or `MCP_SERVER_INTERNAL_API_KEY_FALLBACK`). This is required for all `/mcp/*` routes.

-   **JSON Body Structure**:
    ```json
    {
      "args": {
        // Arguments specific to the :action, as discovered via /discover endpoint
      },
      "auth": {
        "token": "THIRD_PARTY_API_KEY_PLACEHOLDER" // The (mock) API key for the target :provider
      }
    }
    ```

## Available Mock MCP Handlers

This list is dynamically generated and available via the `GET /discover` endpoint. The providers and actions currently include:

**Stripe (`/mcp/stripe/*`)**
*   `getCustomerByEmail`
*   `createCheckoutSession`
*   `getLastInvoice`
*   `getNextBillingDate`
*   `issueRefund`

**HubSpot (`/mcp/hubspot/*`)**
*   `getContactByEmail`
*   `updateContact`
*   `getTicketStatus`
*   `createTicket`

**Shopify (`/mcp/shopify/*`)**
*   `getOrderStatus`
*   `cancelOrder`
*   `getCustomerOrders`

**Klaviyo (`/mcp/klaviyo/*`)**
*   `getEmailHistory`
*   `getCartStatus`

**Zendesk (`/mcp/zendesk/*`)**
*   `getTicketByEmail`
*   `updateTicketStatus`

**Calendly (`/mcp/calendly/*`)**
*   `rescheduleMeeting`
*   `getUpcomingMeetings`

Refer to the `handlers/` directory for the source code of these mock implementations. For detailed argument schemas and sample payloads, use the `GET /discover` endpoint.

---

## Provider Specific MCP Documentation (Examples)

The `GET /discover` endpoint is the authoritative source for available actions and their request structures. The examples below illustrate how to use some of the MCPs by showing example `curl` commands. The specific `args` and expected `auth.token` format can be inferred from the `/discover` output.

### Stripe MCPs
(Example: `stripe.getCustomerByEmail`)
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/stripe/getCustomerByEmail \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "email": "customer@example.com" }, "auth": { "token": "sk_test_YOUR_STRIPE_KEY_HERE" } }'
    ```

### HubSpot MCPs
(Example: `hubspot.getContactByEmail`)
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/hubspot/getContactByEmail \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "email": "contact@example.com" }, "auth": { "token": "YOUR_HUBSPOT_API_KEY_HERE" } }'
    ```

### Shopify MCPs
(Example: `shopify.getOrderStatus`)
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/shopify/getOrderStatus \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "orderId": "shopify_order_12345" }, "auth": { "token": "YOUR_SHOPIFY_ADMIN_API_TOKEN" } }'
    ```

### Klaviyo MCPs
(Example: `klaviyo.getEmailHistory`)
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/klaviyo/getEmailHistory \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "email": "user@example.com" }, "auth": { "token": "YOUR_KLAVIYO_API_TOKEN" } }'
    ```

### Zendesk MCPs
(Example: `zendesk.getTicketByEmail`)
-   **Example `curl` (local):**
    ```bash
    curl -X POST http://localhost:3000/mcp/zendesk/getTicketByEmail \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{ "args": { "email": "user@example.com" }, "auth": { "token": "YOUR_ZENDESK_API_TOKEN" } }'
    ```

### Calendly MCPs
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
    -   `PORT`: The port your service should listen on (e.g., `8080` for Cloud Run, though Cloud Run adapts this automatically).
    -   `MCP_SERVER_INTERNAL_API_KEY_FALLBACK` can be omitted if Secret Manager is the primary source.
