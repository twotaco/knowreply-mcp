const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  invitee_email: z.string().email({ message: "Invalid email format for invitee." })
  // Optional filters based on Calendly API:
  // count: z.number().optional(),
  // page_token: z.string().optional(),
  // sort: z.string().optional(), // e.g., "start_time:asc"
  // status: z.enum(['active', 'canceled']).optional(),
});

// REMOVE or comment out AuthSchema
// const AuthSchema = z.object({
//   token: z.string().min(1, { message: "Calendly API token cannot be empty." })
// });

// Mock data for Calendly scheduled events
const mockScheduledEventsDb = {
  "customer@example.com": [
    {
      uri: "https://api.calendly.com/scheduled_events/event_uuid_1",
      name: "Discovery Call",
      status: "active",
      start_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days from now
      end_time: new Date(Date.now() + (2 * 24 * 60 * 60 * 1000) + (30 * 60 * 1000)).toISOString(), // +30 mins
      event_type: "https://api.calendly.com/event_types/ETYPE_DISCOVERY",
      location: {
        type: "physical", // or 'google_conference', 'zoom_conference', etc.
        location: "Client Office, 123 Main St"
      },
      invitee_details: { // Simplified for this mock
        email: "customer@example.com",
        name: "John Doe",
        first_name: "John",
        last_name: "Doe"
      },
      event_membership: { // Information about the event organizer (user)
          user: "https://api.calendly.com/users/user_uuid_organizer1",
          user_email: "organizer1@example.com",
          user_name: "Organizer One"
      },
      reschedule_url: "https://calendly.com/reschedulings/event_uuid_1", // Example reschedule URL
      cancel_url: "https://calendly.com/cancellations/event_uuid_1" // Example cancel URL
    },
    {
      uri: "https://api.calendly.com/scheduled_events/event_uuid_2",
      name: "Follow-up Meeting",
      status: "active",
      start_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      end_time: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000) + (60 * 60 * 1000)).toISOString(), // +1 hour
      event_type: "https://api.calendly.com/event_types/ETYPE_FOLLOWUP",
      location: {
        type: "zoom_conference",
        join_url: "https://zoom.us/j/1234567890"
      },
      invitee_details: {
        email: "customer@example.com",
        name: "John Doe"
      },
      event_membership: {
          user: "https://api.calendly.com/users/user_uuid_organizer2",
          user_email: "organizer2@example.com",
          user_name: "Organizer Two"
      },
      reschedule_url: "https://calendly.com/reschedulings/event_uuid_2",
      cancel_url: "https://calendly.com/cancellations/event_uuid_2"
    }
  ],
  "anothercustomer@example.com": [
    {
      uri: "https://api.calendly.com/scheduled_events/event_uuid_3",
      name: "Past Project Review",
      status: "active", // Or 'finished' if Calendly updates this post-event
      start_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      end_time: new Date(Date.now() - (5 * 24 * 60 * 60 * 1000) + (60 * 60 * 1000)).toISOString(),
      event_type: "https://api.calendly.com/event_types/ETYPE_REVIEW",
      location: {
        type: "google_conference",
        join_url: "https://meet.google.com/abc-def-ghi"
      },
      invitee_details: {
        email: "anothercustomer@example.com",
        name: "Jane Smith"
      },
      event_membership: {
          user: "https://api.calendly.com/users/user_uuid_organizer1",
          user_email: "organizer1@example.com",
          user_name: "Organizer One"
      },
      reschedule_url: "https://calendly.com/reschedulings/event_uuid_3",
      cancel_url: "https://calendly.com/cancellations/event_uuid_3"
    }
  ],
  "noevents@example.com": []
};

// Internal function to simulate Calendly API: List Scheduled Events
async function _mockCalendlyApi_listScheduledEvents({ apiKey, inviteeEmail, status }) {
  console.log(`_mockCalendlyApi_listScheduledEvents: Simulating Calendly GET /scheduled_events`);
  console.log(`_mockCalendlyApi_listScheduledEvents: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);
  console.log(`_mockCalendlyApi_listScheduledEvents: Filtering by invitee_email: ${inviteeEmail}, status: ${status || 'any'}`);

  let events = mockScheduledEventsDb[inviteeEmail] || [];

  if (status) {
    events = events.filter(event => event.status === status);
  }

  // Calendly typically returns events sorted by start_time.
  events.sort((a,b) => new Date(a.start_time) - new Date(b.start_time));

  return {
    collection: events,
    pagination: { count: events.length, next_page_token: null }
  };
}

async function handleViewAppointmentDetails({ args, auth }) {
  console.log('Executing MCP: calendly.viewAppointmentDetails');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: calendly.viewAppointmentDetails - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
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
    console.warn('MCP: calendly.viewAppointmentDetails - Calendly API token not found in connection.');
    return {
      success: false,
      message: "Calendly API token not found in connection configuration.",
      errors: { connection: "Calendly API token is missing." },
      data: null
    };
  }

  console.log('Using Calendly API token from connection (simulated use):', calendlyApiKey ? calendlyApiKey.substring(0,5) + '...' : 'No API key provided');

  const { invitee_email } = parsedArgs.data;

  try {
    const eventsResult = await _mockCalendlyApi_listScheduledEvents({
      apiKey: calendlyApiKey, // Use token from connection
      inviteeEmail: invitee_email,
    });

    if (eventsResult && Array.isArray(eventsResult.collection)) {
      const simplifiedEvents = eventsResult.collection.map(event => ({
        event_uuid: event.uri.split('/').pop(),
        name: event.name,
        start_time: event.start_time,
        end_time: event.end_time,
        status: event.status,
        location: event.location.type === "physical" ? event.location.location : event.location.join_url,
        location_type: event.location.type,
        organizer_name: event.event_membership?.user_name,
        organizer_email: event.event_membership?.user_email,
        event_link: event.uri, // Link to the event resource itself
        reschedule_link: event.reschedule_url,
        cancel_link: event.cancel_url
        // Consider adding event_type_name if fetching event_type details is an option
      }));

      return {
        success: true,
        data: {
          invitee_email: invitee_email,
          scheduled_events: simplifiedEvents
        },
        message: simplifiedEvents.length > 0 ? "Scheduled event details retrieved successfully (simulated)." : "No scheduled events found for this email (simulated)."
      };
    } else {
      return {
        success: false,
        message: "An unexpected error or response occurred while fetching scheduled events (simulated).",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error in handleViewAppointmentDetails:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to view appointment details.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleViewAppointmentDetails,
  ArgsSchema: ArgsSchema,
  // AuthSchema: AuthSchema, // Ensure this is removed if it existed
  meta: {
    description: "Retrieves details of scheduled Calendly events for a given invitee email, using API token from connection.",
    // authRequirements might be removed if ConnectionSchema handles this at provider level discovery
  }
};
