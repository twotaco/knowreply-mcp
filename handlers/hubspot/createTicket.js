const { z } = require('zod');

// Zod Schema for arguments
const ArgsSchema = z.object({
  subject: z.string().min(1, { message: "Ticket subject cannot be empty." }),
  contactId: z.string().min(1, { message: "Associated contact ID cannot be empty." }),
  description: z.string().min(1, { message: "Ticket description cannot be empty." })
});

// Zod Schema for connection object
const ConnectionSchema = z.object({
  token: z.string().optional().describe("HubSpot API key (placeholder for mock).")
});

// Internal function to simulate a call to the HubSpot API
async function createTicketInternal({ subject, contactId, description, apiKey }) {
  console.log(`MOCK: hubspot.createTicketInternal - Simulating HubSpot API call.`);
  // console.log(`MOCK: hubspot.createTicketInternal - Subject: ${subject}, ContactID: ${contactId}, Description: ${description}`);
  // console.log(`MOCK: hubspot.createTicketInternal - Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  if (contactId === "hub_contact_nonexistent") {
    throw new Error("Mock HubSpot API Error: Associated contact not found. Cannot create ticket.");
  }

  const newTicketId = `hub_ticket_mock_${Math.random().toString(36).substring(2, 9)}`;
  const mockCreatedTicket = {
    id: newTicketId,
    properties: {
      subject: subject,
      content: description, // HubSpot usually uses 'content' for ticket description
      hs_pipeline: "0", // Default to Support Pipeline (ID '0' is common)
      hs_pipeline_stage: "1", // Default to "New" or "Open" stage (ID '1' is common for 'New')
      createdate: new Date().toISOString(),
      lastmodifieddate: new Date().toISOString(),
    },
    // HubSpot API v3 for tickets might not directly return associations like this in a simple create.
    // Associations are typically managed via a separate associations API.
    // For a mock, we can include it if our transformed response expects it.
    // associations: {
    //     "contacts": {
    //         "results": [
    //             { "id": contactId, "type": "ticket_to_contact" }
    //         ]
    //     }
    // }
  };

  // Transform to desired MCP response structure
  // These maps are illustrative; actual IDs/names depend on the HubSpot instance.
  const pipelineMap = { "0": "Support Pipeline" };
  const stageMap = { "1": "New" }; // hs_pipeline_stage '1' often means "New" in default Support pipeline

  return {
    ticketId: mockCreatedTicket.id,
    subject: mockCreatedTicket.properties.subject,
    // Assuming 'status' means the pipeline stage name for this MCP response
    status: stageMap[mockCreatedTicket.properties.hs_pipeline_stage] || mockCreatedTicket.properties.hs_pipeline_stage,
    pipeline: pipelineMap[mockCreatedTicket.properties.hs_pipeline] || mockCreatedTicket.properties.hs_pipeline,
    createdAt: mockCreatedTicket.properties.createdate,
    // description: mockCreatedTicket.properties.content, // Optionally return description
    // contactId: contactId // Optionally confirm associated contactId
  };
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = ConnectionSchema.parse(auth);

  try {
    const ticketData = await createTicketInternal({
      subject: parsedArgs.subject,
      contactId: parsedArgs.contactId,
      description: parsedArgs.description,
      apiKey: parsedAuth.token
    });
    return ticketData;
  } catch (error) {
    console.error(`Error in hubspot.createTicket handler: ${error.message}`);
    throw new Error(`HubSpot Handler Error: ${error.message}`);
  }
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  meta: {
    description: "MOCK: Creates a new ticket in HubSpot and associates it with a contact.",
    parameters: ArgsSchema.shape,
    auth: ['token (optional)'],
    authRequirements: "HubSpot API Key (placeholder for mock, passed as 'token' in auth object).",
  }
};
