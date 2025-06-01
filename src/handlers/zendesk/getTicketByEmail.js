const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Zendesk API token cannot be empty." })
  // Note: Zendesk API auth can be token-based (api_token/email) or OAuth.
  // For simplicity, this mock assumes a single token is passed.
});

// Mock data for Zendesk tickets
const mockZendeskTicketsDb = {
  "user@example.com": { // Requester email
    tickets: [
      {
        id: "zd_ticket_12345",
        subject: "Issue with my recent order",
        description: "I haven't received my package yet.",
        status: "open", // e.g., new, open, pending, hold, solved, closed
        priority: "normal",
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()  // 1 day ago
      },
      {
        id: "zd_ticket_00789",
        subject: "Login problem",
        description: "Can't log in to my account.",
        status: "pending",
        priority: "high",
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      }
    ]
  },
  "another@example.com": {
    tickets: [
      { id: "zd_ticket_67890", subject: "Billing question", status: "solved", priority: "low", created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), updated_at: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()}
    ]
  }
};

// Internal function to simulate a call to the Zendesk API
async function _mockZendeskApi_getTicketByEmail({ email, apiKey }) {
  console.log(`_mockZendeskApi_getTicketByEmail: Simulating Zendesk API call for email: ${email}`);
  console.log(`_mockZendeskApi_getTicketByEmail: Using (simulated) API Key/Auth: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  const userData = mockZendeskTicketsDb[email];

  if (userData && userData.tickets && userData.tickets.length > 0) {
    // Simulate returning the most recent ticket (by updated_at or created_at)
    const sortedTickets = [...userData.tickets].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return sortedTickets[0]; // Return the most recent ticket object
  } else if (email === "notfound@example.com") {
    return "mock_api_error_user_not_found";
  } else {
    // For other emails, simulate user found but no tickets
    return null;
  }
}

async function handleGetTicketByEmail({ args, auth }) {
  console.log('Executing MCP: zendesk.getTicketByEmail');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: zendesk.getTicketByEmail - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: zendesk.getTicketByEmail - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information (Zendesk API token).",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  const { email } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data;

  console.log('Received auth token (simulated use for Zendesk API):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const ticketData = await _mockZendeskApi_getTicketByEmail({ email, apiKey });

    if (ticketData === "mock_api_error_user_not_found") {
      return {
        success: true,
        message: "Zendesk user/requester not found (simulated).",
        data: { // Design doc: "Return most recent ticket with status." - null if no user/ticket
            email: email,
            ticket: null
        }
      };
    } else if (ticketData && ticketData.id) {
      // As per design doc: "Return most recent ticket with status."
      const responseData = {
        ticketId: ticketData.id,
        subject: ticketData.subject,
        description: ticketData.description, // Added for context
        status: ticketData.status,
        priority: ticketData.priority, // Added for context
        createdAt: ticketData.created_at,
        updatedAt: ticketData.updated_at
      };
      return {
        success: true,
        data: {
            email: email,
            ticket: responseData
        },
        message: "Most recent ticket retrieved successfully."
      };
    } else { // ticketData is null (user found, but no tickets)
      return {
        success: true,
        data: {
            email: email,
            ticket: null
        },
        message: "User found, but no tickets associated with this email."
      };
    }
  } catch (error) {
    console.error("Error calling _mockZendeskApi_getTicketByEmail:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to retrieve ticket data.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleGetTicketByEmail,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
