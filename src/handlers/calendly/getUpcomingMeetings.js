const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format for invitee." })
  // Optionally, could add count, page_token, sort, status filters as per Calendly API
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Calendly API token cannot be empty." })
});

// Mock data for Calendly events (can reuse/extend from rescheduleMeeting)
const mockCalendlyEventsDbForListing = {
  "invitee@example.com": [
    {
      uri: "https://api.calendly.com/scheduled_events/event_uuid_123",
      name: "Project Kickoff Meeting",
      status: "active",
      start_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
      end_time: new Date(Date.now() + (3 * 24 * 60 * 60 * 1000) + (60 * 60 * 1000)).toISOString(),
      event_type: "https://api.calendly.com/event_types/ETYPE123",
      invitees_counter: { total: 1, active: 1, limit: 1 }
    },
    {
      uri: "https://api.calendly.com/scheduled_events/event_uuid_future_sync",
      name: "Future Sync-Up",
      status: "active",
      start_time: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days from now
      end_time: new Date(Date.now() + (10 * 24 * 60 * 60 * 1000) + (30 * 60 * 1000)).toISOString(),
      event_type: "https://api.calendly.com/event_types/ETYPE789",
      invitees_counter: { total: 1, active: 1, limit: 1 }
    }
  ],
  "another@example.com": [
    // This user has a past event, which shouldn't be returned by "getUpcoming"
     {
      uri: "https://api.calendly.com/scheduled_events/event_uuid_past_for_another",
      name: "Old Meeting for Another",
      status: "active",
      start_time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000) + (60 * 60 * 1000)).toISOString(),
      event_type: "https://api.calendly.com/event_types/ETYPEPAST",
      invitees_counter: { total: 1, active: 1, limit: 1 }
    }
  ],
  "userwithno_upcoming@example.com": []
};

// Internal function to simulate a call to the Calendly API
async function _mockCalendlyApi_getUpcomingMeetings({ email, apiKey }) {
  console.log(`_mockCalendlyApi_getUpcomingMeetings: Simulating Calendly API call for invitee email: ${email}`);
  console.log(`_mockCalendlyApi_getUpcomingMeetings: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  const allUserEvents = mockCalendlyEventsDbForListing[email];

  if (!allUserEvents && email === "notfound_invitee@example.com") {
      return "mock_api_error_invitee_not_found"; // Specific case for not found
  }

  if (!allUserEvents) {
      return []; // User exists but no events at all, or no upcoming ones
  }

  const upcomingEvents = allUserEvents.filter(event => new Date(event.start_time) > new Date());

  // Simulate sorting by start_time ascending (common for upcoming meetings)
  upcomingEvents.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  return upcomingEvents;
}

async function handleGetUpcomingMeetings({ args, auth }) {
  console.log('Executing MCP: calendly.getUpcomingMeetings');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: calendly.getUpcomingMeetings - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: calendly.getUpcomingMeetings - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information (Calendly API token).",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  const { email } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data;

  console.log('Received auth token (simulated use for Calendly API):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const events = await _mockCalendlyApi_getUpcomingMeetings({ email, apiKey });

    if (events === "mock_api_error_invitee_not_found") {
      return {
        success: true, // Request was valid, but invitee not found
        message: "Invitee email not found in Calendly (simulated).",
        data: { // Design doc: "Return sorted array of future bookings." - empty if not found
            email: email,
            upcomingMeetings: []
        }
      };
    } else if (Array.isArray(events)) {
      // As per design doc: "Return sorted array of future bookings."
      const simplifiedEvents = events.map(event => ({
        eventId: event.uri.split('/').pop(), // Extract UUID
        name: event.name,
        startTime: event.start_time,
        endTime: event.end_time,
        status: event.status,
        eventType: event.event_type
      }));

      return {
        success: true,
        data: {
            email: email, // Include queried email for context
            upcomingMeetings: simplifiedEvents
        },
        message: events.length > 0 ? "Upcoming meetings retrieved successfully." : "No upcoming meetings found for this email."
      };
    } else {
      // Should not happen with current mock logic
      return {
        success: false,
        message: "An unexpected error or response occurred while fetching upcoming meetings.",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error calling _mockCalendlyApi_getUpcomingMeetings:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to retrieve upcoming meetings.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleGetUpcomingMeetings,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
