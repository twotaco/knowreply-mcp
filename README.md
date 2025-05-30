# Mock Centralized Provider (MCP) Server

The Mock Centralized Provider (MCP) Server is a Node.js application built with Express that provides a unified interface to interact with mock versions of various third-party services like Stripe and HubSpot. It's designed for development and testing purposes, allowing you to simulate API calls without hitting actual external services.

## Features

-   **Unified Interface**: Access different mock providers (Stripe, HubSpot) through a consistent API endpoint structure.
-   **Mock Implementations**: Includes mock handlers for common actions like fetching customer data, managing subscriptions, retrieving contact information, etc.
-   **Request Validation**: Uses Zod to validate incoming request arguments and authentication details.
-   **Authentication**: Protects server access using an internal API key and expects third-party API keys (mocked) to be passed for individual provider calls.

## Setup

Follow these steps to set up and run the MCP server locally:

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure environment variables:**
    Create a `.env` file by copying the example:
    ```bash
    cp .env.example .env
    ```
    Open the `.env` file and set the `MCP_SERVER_INTERNAL_API_KEY`. This is a secret key you define to protect access to this MCP server.
    ```env
    MCP_SERVER_INTERNAL_API_KEY="YOUR_CHOSEN_STRONG_INTERNAL_API_KEY"
    ```
    The `.env` file can also store placeholder third-party API keys for convenience during testing, but these are passed in the request body, not directly used by the server configuration.

## Running the Server

To start the MCP server, run:

```bash
npm start
```

The server will typically start on port 3000 (or as configured). You should see a message like:
`MCP Server listening on port 3000`
`MCP Server Internal API Key Loaded: true` (or false if not set)

## Calling MCP Endpoints

MCP endpoints follow a structured path and require specific headers and a JSON body.

-   **Base URL Structure**: `/mcp/:provider/:action`
    -   `:provider`: The name of the third-party service (e.g., `stripe`, `hubspot`).
    -   `:action`: The specific function to call on that provider (e.g., `getCustomerByEmail`, `getContactByEmail`).

-   **Headers**:
    -   `Content-Type: application/json`
    -   `x-internal-api-key`: Your defined `MCP_SERVER_INTERNAL_API_KEY` from the `.env` file.

-   **JSON Body Structure**:
    ```json
    {
      "args": {
        // Arguments specific to the :action
      },
      "auth": {
        "token": "THIRD_PARTY_API_KEY_PLACEHOLDER" // The (mock) API key for the target :provider
      }
    }
    ```

### Example `curl` Commands

Replace placeholders like `YOUR_MCP_INTERNAL_API_KEY`, `YOUR_STRIPE_API_KEY_HERE`, and `YOUR_HUBSPOT_API_KEY_HERE` with your actual values.

1.  **Stripe - Get Customer By Email:**
    ```bash
    curl -X POST http://localhost:3000/mcp/stripe/getCustomerByEmail \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_MCP_INTERNAL_API_KEY" \
    -d '{
      "args": {
        "email": "customer@example.com"
      },
      "auth": {
        "token": "sk_test_YOUR_STRIPE_API_KEY_HERE"
      }
    }'
    ```

2.  **HubSpot - Get Contact By Email:**
    ```bash
    curl -X POST http://localhost:3000/mcp/hubspot/getContactByEmail \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_MCP_INTERNAL_API_KEY" \
    -d '{
      "args": {
        "email": "contact@example.com"
      },
      "auth": {
        "token": "YOUR_HUBSPOT_API_KEY_HERE"
      }
    }'
    ```

3.  **Stripe - Get Last Invoice for a Customer:**
    ```bash
    curl -X POST http://localhost:3000/mcp/stripe/getLastInvoice \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_MCP_INTERNAL_API_KEY" \
    -d '{
      "args": {
        "customerId": "cus_mock_12345"
      },
      "auth": {
        "token": "sk_test_YOUR_STRIPE_API_KEY_HERE"
      }
    }'
    ```

## Available Mock Handlers

The server currently supports the following mock providers and actions:

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

Refer to the `handlers/` directory for details on the mock logic and expected arguments for each action.
