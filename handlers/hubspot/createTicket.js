const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  subject: z.string().min(1, { message: "Ticket subject cannot be empty." }),
  contactId: z.string().min(1, { message: "Associated contact ID cannot be empty." }),
  description: z.string().min(1, { message: "Ticket description cannot be empty." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "API token cannot be empty." }) // For HubSpot API key
});

// Internal function to simulate a call to the HubSpot API
async function _mockHubspotApi_createTicket({ subject, contactId, description, apiKey }) {
  console.log(`_mockHubspotApi_createTicket: Simulating HubSpot API call to create ticket.`);
  console.log(`_mockHubspotApi_createTicket: Subject: ${subject}, ContactID: ${contactId}, Description: ${description}`);
  console.log(`_mockHubspotApi_createTicket: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  // Basic validation for mock
  if (contactId === "hub_contact_nonexistent") {
    return "mock_api_error_contact_not_found";
  }

  const newTicketId = `hub_ticket_mock_${Math.random().toString(36).substring(2, 9)}`;
  const newTicket = {
    id: newTicketId,
    properties: {
      subject: subject,
      content: description,
      hs_pipeline: "0", // Default to Support Pipeline
      hs_pipeline_stage: "1", // Default to "New" or "Open" stage
      createdate: new Date().toISOString(),
      lastmodifieddate: new Date().toISOString(),
    },
    associations: {
        "contacts": {
            "results": [
                { "id": contactId, "type": "ticket_to_contact" }
            ]
        }
    }
  };
  
  // Optionally, store in a mock DB if needed for other operations, but not strictly for create
  // mockTicketsDb[newTicketId] = newTicket; 

  return newTicket; // Return the newly created ticket object
}

async function handleCreateTicket({ args, auth }) {
  console.log('Executing MCP: hubspot.createTicket');
  
  // Validate args
  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: hubspot.createTicket - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
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
    console.warn('MCP: hubspot.createTicket - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information.",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  // Use validated data
  const { subject, contactId, description } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data; // HubSpot API Key

  console.log('Received auth token (simulated use for HubSpot API key):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const ticketCreationResult = await _mockHubspotApi_createTicket({ subject, contactId, description, apiKey });

    if (ticketCreationResult === "mock_api_error_contact_not_found") {
      return {
        success: false,
        message: "Associated contact not found (simulated). Cannot create ticket.",
        data: null,
      };
    } else if (ticketCreationResult && ticketCreationResult.id) {
      // As per design doc: "Return ticket ID and status."
      const stageMap = { "0": "Support Pipeline" }; // Example mapping
      const statusMap = { "1": "New" }; // Example mapping

      const responseData = {
        ticketId: ticketCreationResult.id,
        subject: ticketCreationResult.properties.subject,
        status: statusMap[ticketCreationResult.properties.hs_pipeline_stage] || ticketCreationResult.properties.hs_pipeline_stage,
        pipeline: stageMap[ticketCreationResult.properties.hs_pipeline] || ticketCreationResult.properties.hs_pipeline,
        createdAt: ticketCreationResult.properties.createdate
      };
      return {
        success: true,
        data: responseData,
        message: "Ticket created successfully."
      };
    } else {
      return {
        success: false,
        message: "An unexpected error or response occurred during ticket creation.",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error calling _mockHubspotApi_createTicket:", error);
    return {
      success: false,
      message: "An unexpected error occurred while trying to create the ticket.",
      data: null,
    };
  }
}

module.exports = handleCreateTicket;
