# Mock Centralized Provider (MCP) Server

The Mock Centralized Provider (MCP) Server is a Node.js application built with Express that provides a unified interface to interact with mock versions of various third-party services like Stripe and HubSpot. It's designed for development and testing purposes, allowing you to simulate API calls without hitting actual external services.

## Features

-   **Unified Interface**: Access different mock providers (Stripe, HubSpot) through a consistent API endpoint structure.
-   **Mock Implementations**: Includes mock handlers for common actions.
-   **Request Validation**: Uses Zod to validate incoming request arguments and authentication details.
-   **Secure API Key Management**:
    -   Supports fetching the server's internal API key from Google Cloud Secret Manager for GCP deployments.
    -   Uses a fallback environment variable for local development.
-   **Authentication**: Protects server access using an internal API key (dynamically configured) and expects third-party API keys (mocked) to be passed for individual provider calls.

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

MCP endpoints follow a structured path and require specific headers and a JSON body.

-   **Base URL Structure**: `http://localhost:<PORT>/mcp/:provider/:action`
    -   `:provider`: The name of the third-party service (e.g., `stripe`, `hubspot`).
    -   `:action`: The specific function to call on that provider.

-   **Headers**:
    -   `Content-Type: application/json`
    -   `x-internal-api-key`: The MCP server's internal API key (configured via Secret Manager or `MCP_SERVER_INTERNAL_API_KEY_FALLBACK`).

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

### Example `curl` Commands (Local)

Replace `YOUR_FALLBACK_API_KEY_HERE` with the value you set for `MCP_SERVER_INTERNAL_API_KEY_FALLBACK` in your `.env` file. Replace `YOUR_STRIPE_API_KEY_HERE` and `YOUR_HUBSPOT_API_KEY_HERE` with placeholder or actual test keys for those services.

1.  **Stripe - Get Customer By Email:**
    ```bash
    curl -X POST http://localhost:3000/mcp/stripe/getCustomerByEmail \
    -H "Content-Type: application/json" \
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
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
    -H "x-internal-api-key: YOUR_FALLBACK_API_KEY_HERE" \
    -d '{
      "args": {
        "email": "contact@example.com"
      },
      "auth": {
        "token": "YOUR_HUBSPOT_API_KEY_HERE"
      }
    }'
    ```

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
