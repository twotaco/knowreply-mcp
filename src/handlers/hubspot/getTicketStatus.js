const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  ticketId: z.string().min(1, { message: "Ticket ID cannot be empty." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "API token cannot be empty." }) // For HubSpot API key
});

// Mock data store for tickets
const mockTicketsDb = {
  "hub_ticket_78901": {
    id: "hub_ticket_78901",
    properties: {
      subject: "Issue with login",
      hs_pipeline: "0", // Support Pipeline
      hs_pipeline_stage: "2", // Waiting on customer
      content: "User reported they cannot log in to their account.",
      createdate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      lastmodifieddate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      // hs_ticket_priority: "HIGH" // Example other property
    },
    associations: {
        "contacts": {
            "results": [
                { "id": "hub_contact_12345", "type": "ticket_to_contact" }
            ]
        }
    }
  }
};

// Internal function to simulate a call to the HubSpot API
async function _mockHubspotApi_getTicketStatus({ ticketId, apiKey }) {
  console.log(`_mockHubspotApi_getTicketStatus: Simulating HubSpot API call for ticketId: ${ticketId}`);
  console.log(`_mockHubspotApi_getTicketStatus: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  if (mockTicketsDb[ticketId]) {
    return mockTicketsDb[ticketId]; // Return the full ticket object
  } else if (ticketId === "hub_ticket_nonexistent") {
    return "mock_api_error_ticket_not_found";
  } else {
    return "mock_api_error_fetch_failed";
  }
}

async function handleGetTicketStatus({ args, auth }) {
  console.log('Executing MCP: hubspot.getTicketStatus');

  // Validate args
  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: hubspot.getTicketStatus - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  // Validate auth
  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: hubspot.getTicketStatus - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information.",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  // Use validated data
  const { ticketId } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data; // HubSpot API Key

  console.log('Received auth token (simulated use for HubSpot API key):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const ticketData = await _mockHubspotApi_getTicketStatus({ ticketId, apiKey });

    if (ticketData === "mock_api_error_ticket_not_found") {
      return {
        success: false,
        message: "Ticket not found (simulated).",
        data: null,
      };
    } else if (ticketData === "mock_api_error_fetch_failed") {
      return {
        success: false,
        message: "Failed to fetch ticket status (simulated).",
        data: null,
      };
    } else if (ticketData && ticketData.id) {
      // As per design doc: "Return status, pipeline, and recent updates."
      // Mapping mock HubSpot stage IDs to human-readable names (example)
      const stageMap = { "0": "Support Pipeline", "1": "Sales Pipeline" };
      const statusMap = { "1": "New", "2": "Waiting on customer", "3": "Waiting on us", "4": "Closed" };

      const responseData = {
        id: ticketData.id,
        subject: ticketData.properties.subject,
        status: statusMap[ticketData.properties.hs_pipeline_stage] || ticketData.properties.hs_pipeline_stage,
        pipeline: stageMap[ticketData.properties.hs_pipeline] || ticketData.properties.hs_pipeline,
        lastUpdate: ticketData.properties.lastmodifieddate,
        // recentUpdates: "Could include a summary of recent activities if available" // Placeholder
      };
      return {
        success: true,
        data: responseData,
        message: "Ticket status retrieved successfully."
      };
    } else {
      return {
        success: false,
        message: "An unexpected error or response occurred while fetching ticket status.",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error calling _mockHubspotApi_getTicketStatus:", error);
    return {
      success: false,
      message: "An unexpected error occurred while trying to retrieve ticket status.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleGetTicketStatus,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
