const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  ticketId: z.string().min(1, { message: "Ticket ID cannot be empty." }),
  newStatus: z.enum(["new", "open", "pending", "hold", "solved", "closed"], {
    errorMap: () => ({ message: "Invalid status. Must be one of: new, open, pending, hold, solved, closed." })
  })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Zendesk API token cannot be empty." })
});

// Mock data store for Zendesk tickets (can be shared or extended from getTicketByEmail)
// For simplicity, we'll define a few relevant states here.
// In a real scenario, this might interact with a more complex shared mock DB.
const mockTicketsForUpdate = {
  "zd_ticket_12345": { // Assumed to be open and updatable
    id: "zd_ticket_12345",
    status: "open",
    subject: "Issue with my recent order",
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  },
  "zd_ticket_00789": { // Assumed to be pending
    id: "zd_ticket_00789",
    status: "pending",
    subject: "Login problem",
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  },
  "zd_ticket_closed": { // Already closed, perhaps not updatable to "open" easily
    id: "zd_ticket_closed",
    status: "closed",
    subject: "Old issue, resolved",
    updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  }
};

// Internal function to simulate a call to the Zendesk API
async function _mockZendeskApi_updateTicketStatus({ ticketId, newStatus, apiKey }) {
  console.log(`_mockZendeskApi_updateTicketStatus: Simulating Zendesk API call to update ticketId: ${ticketId} to status: ${newStatus}`);
  console.log(`_mockZendeskApi_updateTicketStatus: Using (simulated) API Key/Auth: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  const ticket = mockTicketsForUpdate[ticketId];

  if (!ticket) {
    return "mock_api_error_ticket_not_found";
  }

  // Simple mock validation: Can't reopen a closed ticket in this mock easily
  if (ticket.status === "closed" && (newStatus === "open" || newStatus === "pending")) {
    return "mock_api_error_update_conflict"; // Or a more specific "cannot reopen"
  }

  if (ticket.status === newStatus) {
    return "mock_api_no_change_needed";
  }

  // Simulate successful update
  ticket.status = newStatus;
  ticket.updated_at = new Date().toISOString();

  return { // Simulates a successful update response (often the updated ticket object)
    id: ticket.id,
    status: ticket.status,
    subject: ticket.subject, // Include some other fields for context
    updated_at: ticket.updated_at
  };
}

async function handleUpdateTicketStatus({ args, auth }) {
  console.log('Executing MCP: zendesk.updateTicketStatus');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: zendesk.updateTicketStatus - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: zendesk.updateTicketStatus - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information (Zendesk API token).",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  const { ticketId, newStatus } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data;

  console.log('Received auth token (simulated use for Zendesk API):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const updateResult = await _mockZendeskApi_updateTicketStatus({ ticketId, newStatus, apiKey });

    if (updateResult === "mock_api_error_ticket_not_found") {
      return {
        success: false,
        message: "Ticket not found (simulated).",
        data: null,
      };
    } else if (updateResult === "mock_api_error_update_conflict") {
      return {
        success: false,
        message: `Ticket status update conflict (e.g., cannot easily reopen a closed ticket in this mock). Current status: ${mockTicketsForUpdate[ticketId]?.status}`,
        data: { ticketId, currentStatus: mockTicketsForUpdate[ticketId]?.status }
      };
    } else if (updateResult === "mock_api_no_change_needed") {
        const ticket = mockTicketsForUpdate[ticketId];
        return {
            success: true, // Or false depending on desired strictness
            message: "Ticket status is already set to the requested status.",
            data: {
                ticketId: ticket.id,
                status: ticket.status,
                updatedAt: ticket.updated_at // Using existing updated_at
            }
        };
    } else if (updateResult && updateResult.id) {
      // As per design doc: "Return confirmation payload."
      return {
        success: true,
        data: {
          ticketId: updateResult.id,
          newStatus: updateResult.status,
          subject: updateResult.subject,
          updatedAt: updateResult.updated_at
        },
        message: "Ticket status updated successfully."
      };
    } else {
      return {
        success: false,
        message: "An unexpected error or response occurred during ticket status update.",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error calling _mockZendeskApi_updateTicketStatus:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to update ticket status.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleUpdateTicketStatus,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
