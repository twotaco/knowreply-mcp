const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  event_uuid: z.string().min(1, { message: "Event UUID cannot be empty." })
  // Alternative: could take invitee_email and try to find a unique, upcoming event.
  // However, event_uuid is more precise for changing a specific appointment.
});

const ConnectionSchema = z.object({ calendly_api_token: z.string().min(1, { message: "Calendly API token cannot be empty." }) }).describe("Schema for storing Calendly connection parameters, primarily the API token.");

// Re-use or adapt mock data from viewAppointmentDetails.js for consistency
// For this specific handler, we only need to look up an event by its UUID.
// A more comprehensive mock might share a single DB instance.
const mockScheduledEventsDbForChange = {
  "event_uuid_1": {
    uri: "https://api.calendly.com/scheduled_events/event_uuid_1",
    name: "Discovery Call (for change handler)",
    status: "active",
    start_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() + (2 * 24 * 60 * 60 * 1000) + (30 * 60 * 1000)).toISOString(),
    event_type: "https://api.calendly.com/event_types/ETYPE_DISCOVERY",
    reschedule_url: "https://calendly.com/reschedulings/event_uuid_1_mocklink", // Key piece of info
    cancel_url: "https://calendly.com/cancellations/event_uuid_1_mocklink",
    invitee_details: { email: "customer@example.com" }
  },
  "event_uuid_past_for_change": {
    uri: "https://api.calendly.com/scheduled_events/event_uuid_past_for_change",
    name: "Old Meeting (for change handler)",
    status: "active", // Or 'finished'
    start_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() - (5 * 24 * 60 * 60 * 1000) + (30 * 60 * 1000)).toISOString(),
    event_type: "https://api.calendly.com/event_types/ETYPE_OLD",
    // Past events might not have a reschedule_url or it might behave differently.
    // Calendly's actual API might return an error or a specific page if rescheduling is not possible.
    reschedule_url: null, // Or "https://calendly.com/reschedulings/event_uuid_past_for_change_mocklink_expired"
    cancel_url: "https://calendly.com/cancellations/event_uuid_past_for_change_mocklink",
    invitee_details: { email: "another@example.com" }
  }
};

// Internal function to simulate Calendly API: Get Scheduled Event by UUID
async function _mockCalendlyApi_getScheduledEvent({ apiKey, eventUuid }) {
  console.log(`_mockCalendlyApi_getScheduledEvent: Simulating Calendly GET /scheduled_events/{uuid}`);
  console.log(`_mockCalendlyApi_getScheduledEvent: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);
  console.log(`_mockCalendlyApi_getScheduledEvent: Fetching event UUID: ${eventUuid}`);

  const event = mockScheduledEventsDbForChange[eventUuid];
  if (!event) {
    return "mock_api_error_event_not_found";
  }
  return { resource: event }; // Calendly API wraps single event in 'resource'
}

async function handleChangeAppointment({ args, auth }) {
  console.log('Executing MCP: calendly.changeAppointment');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: calendly.changeAppointment - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
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
    console.warn('MCP: calendly.changeAppointment - Calendly API token not found in connection.');
    return {
      success: false,
      message: "Calendly API token not found in connection configuration.",
      errors: { connection: "Calendly API token is missing." },
      data: null
    };
  }

  console.log('Using Calendly API token from connection (simulated use):', calendlyApiKey ? calendlyApiKey.substring(0,5) + '...' : 'No API key provided');

  const { event_uuid } = parsedArgs.data;

  try {
    const eventResult = await _mockCalendlyApi_getScheduledEvent({
      apiKey: calendlyApiKey, // Use token from connection
      eventUuid: event_uuid
    });

    if (eventResult === "mock_api_error_event_not_found") {
      return {
        success: false,
        message: `Scheduled event with UUID ${event_uuid} not found (simulated).`,
        data: null,
      };
    } else if (eventResult && eventResult.resource) {
      const event = eventResult.resource;
      // Check if the event is in a state that allows rescheduling (e.g., not too far in the past, not cancelled)
      // This mock keeps it simple: if a reschedule_url exists, provide it.
      if (event.status !== 'active') { // A more robust check might be needed for 'canceled' status
         return {
            success: false,
            message: `Event '${event.name}' is not active (current status: ${event.status}) and may not be reschedulable.`,
            data: { event_uuid: event_uuid, status: event.status }
        };
      }

      if (new Date(event.start_time) < new Date() && !event.reschedule_url) {
         // Simple check for past events if no reschedule_url is explicitly set to null for them
         // Calendly's actual behavior for past events might differ.
         return {
            success: false,
            message: `Event '${event.name}' is in the past and may not be reschedulable (simulated).`,
            data: { event_uuid: event_uuid, start_time: event.start_time }
        };
      }

      if (event.reschedule_url) {
        return {
          success: true,
          data: {
            event_uuid: event_uuid,
            event_name: event.name,
            reschedule_link: event.reschedule_url,
            message: "Customer can use this link to reschedule their appointment via Calendly."
          },
          message: "Reschedule link retrieved successfully (simulated)."
        };
      } else {
        return {
          success: false,
          message: `Event '${event.name}' does not have an available reschedule link (simulated). It might be too old or already cancelled.`,
          data: { event_uuid: event_uuid },
        };
      }
    } else {
      return {
        success: false,
        message: "An unexpected error or response occurred while fetching event details for change (simulated).",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error in handleChangeAppointment:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to facilitate an appointment change.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleChangeAppointment,
  ArgsSchema: ArgsSchema,
  ConnectionSchema: ConnectionSchema,
  meta: {
    description: "Provides the reschedule link for a specific Calendly event, using API token from connection.",
    // authRequirements might be removed
  }
};
