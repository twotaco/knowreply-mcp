const { z } = require('zod');

// Zod Schema for arguments
const ArgsSchema = z.object({
  ticketId: z.string().min(1, { message: "Ticket ID cannot be empty." })
});

// Zod Schema for connection object
const ConnectionSchema = z.object({
  token: z.string().optional().describe("HubSpot API key (placeholder for mock).")
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
      createdate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      lastmodifieddate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
    // associations: { /* ... */ } // Not directly used in transformed response for this mock
  }
};

// Internal function to simulate a call to the HubSpot API
async function getTicketStatusInternal({ ticketId, apiKey }) {
  console.log(`MOCK: hubspot.getTicketStatusInternal - Simulating HubSpot API call for ticketId: ${ticketId}`);
  // console.log(`MOCK: hubspot.getTicketStatusInternal - Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  const ticketData = mockTicketsDb[ticketId];

  if (ticketData) {
    // Illustrative mapping, actual values depend on HubSpot setup
    const pipelineMap = { "0": "Support Pipeline" };
    const stageMap = { "1": "New", "2": "Waiting on customer", "3": "Waiting on us", "4": "Closed" };

    return {
      id: ticketData.id,
      subject: ticketData.properties.subject,
      status: stageMap[ticketData.properties.hs_pipeline_stage] || ticketData.properties.hs_pipeline_stage,
      pipeline: pipelineMap[ticketData.properties.hs_pipeline] || ticketData.properties.hs_pipeline,
      lastUpdate: ticketData.properties.lastmodifieddate,
      // description: ticketData.properties.content, // Optionally include description
      // createdAt: ticketData.properties.createdate, // Optionally include creation date
    };
  } else if (ticketId === "hub_ticket_nonexistent") {
    return null;
  } else if (ticketId === "hub_ticket_error") {
    throw new Error("Mock HubSpot API Error: Failed to fetch ticket status.");
  }
  return null;
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = ConnectionSchema.parse(auth);

  try {
    const ticketStatusData = await getTicketStatusInternal({
      ticketId: parsedArgs.ticketId,
      apiKey: parsedAuth.token
    });

    return ticketStatusData;

  } catch (error) {
    console.error(`Error in hubspot.getTicketStatus handler: ${error.message}`);
    throw new Error(`HubSpot Handler Error: ${error.message}`);
  }
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  meta: {
    description: "MOCK: Fetches the status and details of a HubSpot ticket by its ID.",
    parameters: ArgsSchema.shape,
    auth: ['token (optional)'],
    authRequirements: "HubSpot API Key (placeholder for mock, passed as 'token' in auth object).",
  }
};
