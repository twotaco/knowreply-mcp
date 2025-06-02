"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const zod_1 = require("zod");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: true,
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-internal-api-key"],
    credentials: true,
}));
function buildServer() {
    console.log("[DEBUG] buildServer(): creating new McpServer…");
    // We pass { capabilities: { logging: {} } } so that prompt() and tool() actually register
    const server = new mcp_js_1.McpServer({ name: "debug-mcp-server", version: "1.0.0" }, { capabilities: { logging: {} } });
    // Log what was there before
    console.log("[DEBUG]  _registeredPrompts before →", Object.keys(server._registeredPrompts || {}));
    console.log("[DEBUG]  _registeredTools  before →", Object.keys(server._registeredTools || {}));
    // 1) Register a prompt called “greeting-template”
    server.prompt("greeting-template", "A simple greeting prompt", { name: zod_1.z.string().describe("Name to include in greeting") }, async ({ name }) => {
        console.log(`[DEBUG] running greeting-template → name="${name}"`);
        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Hello, ${name}! This is your friendly greeting.`,
                    },
                },
            ],
        };
    });
    console.log("[DEBUG] Registered prompt → greeting-template");
    // 2) Register a tool called “start-notification-stream” that will send back one SSE event
    server.tool("start-notification-stream", "Sends exactly one notification event then returns", { interval: zod_1.z.number().default(100), count: zod_1.z.number().default(1) }, async ({ interval, count }, { sendNotification }) => {
        console.log(`[DEBUG] start-notification-stream called with interval=${interval}, count=${count}`);
        let i = 0;
        // Send exactly “count” notifications (here count=1 by default)
        while (i < count) {
            i++;
            await sendNotification({
                method: "notifications/message",
                params: {
                    level: "info",
                    data: `Notification #${i} at ${new Date().toISOString()}`,
                },
            });
            console.log(`[DEBUG] sent notification #${i}`);
            await new Promise((r) => setTimeout(r, interval));
        }
        // Finally, return a small piece of content
        return {
            content: [
                {
                    type: "text",
                    text: `Finished sending ${count} notification(s).`,
                },
            ],
        };
    });
    console.log("[DEBUG] Registered tool → start-notification-stream");
    // After registration, log what’s actually in the registry
    console.log("[DEBUG]  _registeredPrompts after →", Object.keys(server._registeredPrompts || {}));
    console.log("[DEBUG]  _registeredTools  after →", Object.keys(server._registeredTools || {}));
    return server;
}
app.post("/mcp", async (req, res) => {
    console.log("[DEBUG] Received HTTP POST /mcp → body:", JSON.stringify(req.body));
    // Step A: build a brand-new McpServer instance with one prompt + one tool
    const mcpServer = buildServer();
    // Step B: create the StreamableHTTPServerTransport
    const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
    });
    // If the client disconnects mid-stream, log and clean up
    res.on("close", () => {
        console.log("[DEBUG] HTTP connection closed by client; cleaning up transport + server.");
        transport.close();
        mcpServer.close();
    });
    try {
        // Connect the McpServer to the transport (this will “advertise” our prompt/tool to the transport)
        await mcpServer.connect(transport);
        console.log("[DEBUG] MCP server connected to transport; calling handleRequest()…");
        // Finally, hand off the raw JSON-RPC body to the transport
        await transport.handleRequest(req, res, req.body);
    }
    catch (err) {
        console.error("[DEBUG] ERROR in transport.handleRequest():", err);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: "2.0",
                error: { code: -32000, message: "Internal server error", data: err.message },
                id: req.body?.id || null,
            });
        }
    }
});
// Just “405 Method Not Allowed” for GET/DELETE
app.get("/mcp", (_req, res) => {
    console.log("[DEBUG] Received HTTP GET /mcp");
    res.status(405).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed" },
        id: null,
    });
});
app.delete("/mcp", (_req, res) => {
    console.log("[DEBUG] Received HTTP DELETE /mcp");
    res.status(405).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed" },
        id: null,
    });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[DEBUG] Server listening on port ${PORT}`);
});
