const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  invitee_email: z.string().email({ message: "Invalid email format for invitee." }),
  event_uuid: z.string().optional().describe("Optional: Specify a particular event UUID to cancel. If not provided, the API will attempt to find and cancel the soonest upcoming active event for the invitee."),
  reason: z.string().optional().default("Cancellation requested by user.")
});

// REMOVE or comment out AuthSchema
// const AuthSchema = z.object({
//   token: z.string().min(1, { message: "Calendly API token cannot be empty." })
// });

// Mock data: This should ideally be shared or a more robust mock system used.
// For now, define it here, ensuring some events match viewAppointmentDetails.js for consistency.
let mockScheduledEventsDbForCancel = {
  "customer@example.com": [
    {
      uri: "https://api.calendly.com/scheduled_events/event_uuid_1", // Matches viewAppointmentDetails
      name: "Discovery Call",
      status: "active", // This will change to 'canceled'
      start_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + (2 * 24 * 60 * 60 * 1000) + (30 * 60 * 1000)).toISOString(),
      invitee_details: { email: "customer@example.com" },
      cancellation: null // Will be populated upon cancellation
    },
    {
      uri: "https://api.calendly.com/scheduled_events/event_uuid_2", // Matches viewAppointmentDetails
      name: "Follow-up Meeting",
      status: "active",
      start_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000) + (60 * 60 * 1000)).toISOString(),
      invitee_details: { email: "customer@example.com" },
      cancellation: null
    }
  ],
  "alreadycancelled@example.com": [
    {
      uri: "https://api.calendly.com/scheduled_events/event_uuid_cancelled",
      name: "Previously Cancelled Meeting",
      status: "canceled",
      start_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      invitee_details: { email: "alreadycancelled@example.com" },
      cancellation: {
        canceled_by: "Invitee",
        reason: "No longer needed",
        canceler_type: "Invitee"
      }
    }
  ],
  "noeventsforcancel@example.com": []
};

// Helper to find an event by UUID across all invitees in the mock DB
function findEventByUuidInMockDb(eventUuid) {
    for (const email in mockScheduledEventsDbForCancel) {
        const event = mockScheduledEventsDbForCancel[email].find(e => e.uri.endsWith(eventUuid));
        if (event) return event;
    }
    return null;
}


// Internal function to simulate Calendly API: List Scheduled Events (simplified for cancellation needs)
async function _mockCalendlyApi_listScheduledEventsForCancel({ apiKey, inviteeEmail }) {
  console.log(`_mockCalendlyApi_listScheduledEventsForCancel: Simulating Calendly GET /scheduled_events for invitee: ${inviteeEmail}`);
  return mockScheduledEventsDbForCancel[inviteeEmail] || [];
}

// Internal function to simulate Calendly API: Cancel Event
async function _mockCalendlyApi_cancelEvent({ apiKey, eventUuid, reason }) {
  console.log(`_mockCalendlyApi_cancelEvent: Simulating Calendly POST /scheduled_events/${eventUuid}/cancellation`);
  console.log(`_mockCalendlyApi_cancelEvent: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);
  console.log(`_mockCalendlyApi_cancelEvent: Cancelling event UUID: ${eventUuid} with reason: ${reason}`);

  let eventToCancel = null;
  let inviteeEmailForEvent = null;

  // Find the event in the mock DB
  for (const email in mockScheduledEventsDbForCancel) {
    const event = mockScheduledEventsDbForCancel[email].find(e => e.uri.endsWith(eventUuid));
    if (event) {
      eventToCancel = event;
      inviteeEmailForEvent = email;
      break;
    }
  }

  if (!eventToCancel) {
    return "mock_api_error_event_not_found";
  }

  if (eventToCancel.status === "canceled") {
    return "mock_api_error_already_canceled";
  }

  // Simulate cancellation
  eventToCancel.status = "canceled";
  eventToCancel.cancellation = {
    canceled_by: "API User (simulated)", // Or determine based on who is making the call
    reason: reason,
    canceler_type: "Account" // Or 'Invitee' if that's the context
  };

  // Update the event in the mock DB
  const eventIndex = mockScheduledEventsDbForCancel[inviteeEmailForEvent].findIndex(e => e.uri.endsWith(eventUuid));
  if (eventIndex > -1) {
      mockScheduledEventsDbForCancel[inviteeEmailForEvent][eventIndex] = eventToCancel;
  }


  return {
    message: `Event ${eventUuid} has been canceled.`, // Simplified response
    resource: eventToCancel // Calendly might return the updated event resource
  };
}

async function handleCancelAppointment({ args, auth }) {
  console.log('Executing MCP: calendly.cancelAppointment');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: calendly.cancelAppointment - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
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
    console.warn('MCP: calendly.cancelAppointment - Calendly API token not found in connection.');
    return {
      success: false,
      message: "Calendly API token not found in connection configuration.",
      errors: { connection: "Calendly API token is missing." },
      data: null
    };
  }

  console.log('Using Calendly API token from connection (simulated use):', calendlyApiKey ? calendlyApiKey.substring(0,5) + '...' : 'No API key provided');

  const { invitee_email, reason, event_uuid: specificEventUuid } = parsedArgs.data;

  try {
    let eventToCancelUuid = specificEventUuid;
    let eventDetailsForMessage = {};

    if (!eventToCancelUuid) {
      const events = await _mockCalendlyApi_listScheduledEventsForCancel({
        apiKey: calendlyApiKey, // Use token from connection
        inviteeEmail: invitee_email
      });
      const activeUpcomingEvents = events
        .filter(event => event.status === "active" && new Date(event.start_time) > new Date())
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time)); // Sort by soonest

      if (activeUpcomingEvents.length === 0) {
        return {
          success: false, // Or true with a specific message if "no active events to cancel" is not an error
          message: `No active, upcoming scheduled events found for invitee ${invitee_email} to cancel (simulated).`,
          data: { invitee_email }
        };
      }
      eventToCancelUuid = activeUpcomingEvents[0].uri.split('/').pop(); // Pick the soonest one
      eventDetailsForMessage = { name: activeUpcomingEvents[0].name, time: activeUpcomingEvents[0].start_time };
      console.log(`No specific event_uuid provided. Selected event ${eventToCancelUuid} (${eventDetailsForMessage.name}) for cancellation.`);
    } else {
        const event = findEventByUuidInMockDb(specificEventUuid);
        if (event) {
            eventDetailsForMessage = { name: event.name, time: event.start_time };
        } else {
             return { // Event specified by UUID not found
                success: false,
                message: `Event with UUID ${specificEventUuid} not found for cancellation (simulated).`,
                data: { event_uuid: specificEventUuid }
            };
        }
    }

    if (!eventToCancelUuid) {
        return { success: false, message: "Could not determine which event to cancel.", data: null };
    }

    const cancelResult = await _mockCalendlyApi_cancelEvent({
      apiKey: calendlyApiKey, // Use token from connection
      eventUuid: eventToCancelUuid,
      reason
    });

    if (cancelResult === "mock_api_error_event_not_found") {
      // This might happen if event_uuid was provided but is invalid, or a race condition if event was deleted.
      return {
        success: false,
        message: `Failed to cancel: Event with UUID ${eventToCancelUuid} not found (simulated).`,
        data: { event_uuid: eventToCancelUuid },
      };
    } else if (cancelResult === "mock_api_error_already_canceled") {
      return {
        success: true, // Or false, depending on if this is an error state for the MCP user
        message: `Event ${eventDetailsForMessage.name || eventToCancelUuid} was already canceled (simulated).`,
        data: { event_uuid: eventToCancelUuid, details: cancelResult.resource?.cancellation },
      };
    } else if (cancelResult && cancelResult.resource && cancelResult.resource.status === 'canceled') {
      return {
        success: true,
        data: {
          canceled_event_uuid: eventToCancelUuid,
          event_name: eventDetailsForMessage.name || cancelResult.resource.name,
          status: cancelResult.resource.status,
          reason: cancelResult.resource.cancellation.reason,
          message: `Event '${eventDetailsForMessage.name || cancelResult.resource.name}' has been successfully canceled (simulated).`
        },
        message: `Appointment ${eventDetailsForMessage.name || cancelResult.resource.name} canceled successfully (simulated).`
      };
    } else {
      return {
        success: false,
        message: "An unexpected error or response occurred while canceling the appointment (simulated).",
        data: { event_uuid: eventToCancelUuid },
      };
    }
  } catch (error) {
    console.error("Error in handleCancelAppointment:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to cancel the appointment.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleCancelAppointment,
  ArgsSchema: ArgsSchema,
  // AuthSchema: AuthSchema, // Ensure this is removed
  meta: {
    description: "Cancels a scheduled Calendly event. Uses API token from connection.",
    // authRequirements might be removed
  }
};
