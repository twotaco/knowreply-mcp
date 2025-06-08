const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  eventId: z.string().min(1, { message: "Event ID (UUID) cannot be empty." }),
  newTime: z.string().datetime({ message: "Invalid newTime format. Must be an ISO 8601 datetime string." })
  // Note: Calendly API might require more details for rescheduling, like event type URI.
  // This mock simplifies it to just eventId and newTime.
});

const ConnectionSchema = z.object({ calendly_api_token: z.string().min(1, { message: "Calendly API token cannot be empty." }) }).describe("Schema for storing Calendly connection parameters, primarily the API token.");

// Mock data for Calendly events
const mockCalendlyEventsDb = {
  "event_uuid_123": {
    uri: "https://api.calendly.com/scheduled_events/event_uuid_123",
    name: "Project Kickoff Meeting",
    status: "active",
    start_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
    end_time: new Date(Date.now() + (3 * 24 * 60 * 60 * 1000) + (60 * 60 * 1000)).toISOString(), // +1 hour
    event_type: "https://api.calendly.com/event_types/ETYPE123",
    invitee_email: "invitee@example.com" // For context, not directly used in reschedule by ID
  },
  "event_uuid_past": {
    uri: "https://api.calendly.com/scheduled_events/event_uuid_past",
    name: "Old Sync-Up",
    status: "active", // Or could be 'finished' depending on how Calendly handles past events
    start_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    end_time: new Date(Date.now() - (5 * 24 * 60 * 60 * 1000) + (30 * 60 * 1000)).toISOString(),
    event_type: "https://api.calendly.com/event_types/ETYPE456",
    invitee_email: "another@example.com"
  }
};

// Internal function to simulate a call to the Calendly API
async function _mockCalendlyApi_rescheduleMeeting({ eventId, newTime, apiKey }) {
  console.log(`_mockCalendlyApi_rescheduleMeeting: Simulating Calendly API call to reschedule eventId: ${eventId} to newTime: ${newTime}`);
  console.log(`_mockCalendlyApi_rescheduleMeeting: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  const event = mockCalendlyEventsDb[eventId];

  if (!event) {
    return "mock_api_error_event_not_found";
  }

  // Basic validation for mock: Can't reschedule past events in this simple mock
  if (new Date(event.start_time) < new Date()) {
    // Or more realistically, Calendly API might just return an error if the event is too old or unchangeable
    return "mock_api_error_event_not_reschedulable";
  }

  // Simulate successful reschedule: update times and potentially generate a new URI or ID (Calendly behavior varies)
  // For this mock, we'll update in-place and assume URI remains the same.
  const oldStartTime = event.start_time;
  const duration = new Date(event.end_time).getTime() - new Date(event.start_time).getTime();

  event.start_time = newTime;
  event.end_time = new Date(new Date(newTime).getTime() + duration).toISOString();
  event.status = "active"; // Ensure it's active

  console.log(`Mock: Event ${eventId} rescheduled from ${oldStartTime} to ${event.start_time}`);

  return { // Simulates a successful reschedule response
    resource: {
      uri: event.uri,
      name: event.name,
      status: event.status,
      start_time: event.start_time,
      end_time: event.end_time,
      event_type: event.event_type
      // Calendly API often returns the full event object upon reschedule
    },
    message: "Meeting rescheduled successfully." // Custom message for our MCP
  };
}

async function handleRescheduleMeeting({ args, auth }) {
  console.log('Executing MCP: calendly.rescheduleMeeting');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: calendly.rescheduleMeeting - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  // Retrieve token from connection
  const calendlyApiKey = auth?.connection?.calendly_api_token;
  if (!calendlyApiKey) {
    console.warn('MCP: calendly.rescheduleMeeting - Calendly API token not found in connection.');
    return {
      success: false,
      message: "Calendly API token not found in connection configuration.",
      errors: { connection: "Calendly API token is missing." },
      data: null
    };
  }

  const { eventId, newTime } = parsedArgs.data;
  // Use calendlyApiKey from connection
  console.log('Using Calendly API token from connection (simulated use):', calendlyApiKey ? calendlyApiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    // Validate newTime is in the future (basic check)
    if (new Date(newTime) <= new Date()) {
        return {
            success: false,
            message: "New meeting time must be in the future.",
            data: null
        };
    }

    const rescheduleResult = await _mockCalendlyApi_rescheduleMeeting({ eventId, newTime, apiKey: calendlyApiKey });

    if (rescheduleResult === "mock_api_error_event_not_found") {
      return {
        success: false,
        message: "Event not found (simulated).",
        data: null,
      };
    } else if (rescheduleResult === "mock_api_error_event_not_reschedulable") {
      return {
        success: false,
        message: "Event is not reschedulable (e.g., it's in the past or already cancelled).",
        data: { eventId }
      };
    } else if (rescheduleResult && rescheduleResult.resource && rescheduleResult.resource.uri) {
      // As per design doc: "Return confirmation."
      const eventDetails = rescheduleResult.resource;
      return {
        success: true,
        data: {
          eventId: eventDetails.uri.split('/').pop(), // Extract UUID from URI
          name: eventDetails.name,
          status: eventDetails.status,
          newStartTime: eventDetails.start_time,
          newEndTime: eventDetails.end_time,
          eventType: eventDetails.event_type
        },
        message: rescheduleResult.message || "Meeting rescheduled successfully."
      };
    } else {
      return {
        success: false,
        message: "An unexpected error or response occurred during meeting reschedule.",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error calling _mockCalendlyApi_rescheduleMeeting:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to reschedule the meeting.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleRescheduleMeeting,
  ArgsSchema: ArgsSchema,
  ConnectionSchema: ConnectionSchema,
  meta: {
    description: "Reschedules an existing Calendly meeting. Uses API token from connection."
  }
};
