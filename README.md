# MCP Server

The Mock Centralized Provider (MCP) Server provides a unified interface to interact with various third-party provider APIs in a mocked or simulated environment. This is useful for development and testing when direct access to live APIs is not desirable or available.

## Setup

1.  **Clone the Repository** (or ensure you have the `mcp_server` directory and its contents).
    ```bash
    # git clone <repository_url> # If applicable
    # cd <path_to_repository>/mcp_server
    ```

2.  **Navigate to the `mcp_server` directory:**
    ```bash
    cd /path/to/your/mcp_server 
    ```
    (Replace `/path/to/your/mcp_server` with the actual path on your system, e.g., if it's in `/app/mcp_server` in a development container).

3.  **Install Dependencies:**
    ```bash
    npm install
    ```

## Environment Variables

A `.env` file is required in the root of the `mcp_server` directory to configure the server.

Create a file named `.env` with the following content:

```env
PORT=3001
MCP_SERVER_INTERNAL_API_KEY=supersecretkey_for_now_change_later
```

**Variables:**

*   `PORT`: The port on which the MCP server will listen. Defaults to `3000` if not set, but `3001` is recommended to avoid conflicts.
*   `MCP_SERVER_INTERNAL_API_KEY`: A shared secret key used to authorize requests to the MCP server. Ensure this is kept secure.

## Running the Server

To start the server, run the following command from the `mcp_server` directory:

```bash
npm start
```

Expected output (or similar):

```
MCP Server listening at http://localhost:3001
```

The server will also log requests and responses to the console.

## Testing MCP Endpoints

### General Notes:

*   All MCP calls are `POST` requests.
*   The base URL path for MCP calls is `/mcp/:provider/:action`.
    *   Replace `:provider` with the name of the provider (e.g., `stripe`).
    *   Replace `:action` with the name of the action (e.g., `getCustomerByEmail`).
*   Requests must include the `Content-Type: application/json` header.
*   Requests must include the `X-Internal-API-Key` header with the value specified in your `.env` file for `MCP_SERVER_INTERNAL_API_KEY`.

### `stripe.getCustomerByEmail` Examples

Here are `curl` examples for testing the `stripe.getCustomerByEmail` MCP:

**1. Valid Request (Customer Found)**

This request should succeed and return mock customer data.

```bash
curl -X POST http://localhost:3001/mcp/stripe/getCustomerByEmail \
-H "Content-Type: application/json" \
-H "X-Internal-API-Key: supersecretkey_for_now_change_later" \
-d '{
  "args": { "email": "customer@example.com" },
  "auth": { "token": "sk_test_mock_stripe_key" }
}'
```
Expected Response:
```json
{
  "success": true,
  "data": {
    "id": "cus_mock_12345",
    "name": "Test Customer",
    "email": "customer@example.com",
    "created": "2024-01-01T10:00:00Z"
  },
  "message": "Customer found."
}
```

**2. Valid Request (Customer Not Found)**

This request should succeed but indicate that the customer was not found.

```bash
curl -X POST http://localhost:3001/mcp/stripe/getCustomerByEmail \
-H "Content-Type: application/json" \
-H "X-Internal-API-Key: supersecretkey_for_now_change_later" \
-d '{
  "args": { "email": "notfound@example.com" },
  "auth": { "token": "sk_test_mock_stripe_key" }
}'
```
Expected Response:
```json
{
  "success": true,
  "data": null,
  "message": "Customer not found."
}
```

**3. Invalid Email (Zod Validation Error)**

This request provides an improperly formatted email, triggering Zod validation.

```bash
curl -X POST http://localhost:3001/mcp/stripe/getCustomerByEmail \
-H "Content-Type: application/json" \
-H "X-Internal-API-Key: supersecretkey_for_now_change_later" \
-d '{
  "args": { "email": "invalid-email" },
  "auth": { "token": "sk_test_mock_stripe_key" }
}'
```
Expected Response:
```json
{
  "success": false,
  "message": "Invalid arguments.",
  "errors": {
    "email": [
      "Invalid email format."
    ]
  },
  "data": null
}
```

**4. Missing `args` in Payload (Server Validation)**

This request is missing the `args` field in the JSON payload.

```bash
curl -X POST http://localhost:3001/mcp/stripe/getCustomerByEmail \
-H "Content-Type: application/json" \
-H "X-Internal-API-Key: supersecretkey_for_now_change_later" \
-d '{
  "auth": { "token": "sk_test_mock_stripe_key" }
}'
```
Expected Response (Status 400):
```json
{
  "error": "Missing 'args' or 'auth' in request body"
}
```

**5. Missing `X-Internal-API-Key` Header (Auth Failure)**

This request is missing the required `X-Internal-API-Key` header.

```bash
curl -X POST http://localhost:3001/mcp/stripe/getCustomerByEmail \
-H "Content-Type: application/json" \
-d '{
  "args": { "email": "customer@example.com" },
  "auth": { "token": "sk_test_mock_stripe_key" }
}'
```
Expected Response (Status 401):
```json
{
  "error": "Unauthorized access to MCP server"
}
```

**6. Incorrect `X-Internal-API-Key` (Auth Failure)**

This request provides an incorrect value for the `X-Internal-API-Key` header.

```bash
curl -X POST http://localhost:3001/mcp/stripe/getCustomerByEmail \
-H "Content-Type: application/json" \
-H "X-Internal-API-Key: wrongkey" \
-d '{
  "args": { "email": "customer@example.com" },
  "auth": { "token": "sk_test_mock_stripe_key" }
}'
```
Expected Response (Status 401):
```json
{
  "error": "Unauthorized access to MCP server"
}
```
