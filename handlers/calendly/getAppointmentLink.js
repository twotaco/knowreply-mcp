const z = require('zod');

// ConnectionSchema REMOVED from here

// Zod Schemas for validation
const ArgsSchema = z.object({
  event_type_uuid: z.string().min(1, { message: "Event Type UUID cannot be empty." }),
  // Future considerations:
  // max_event_count: z.number().optional(), // For POST /scheduling_links
  // owner_type: z.enum(['EventType', 'User']).default('EventType'), // For POST /scheduling_links
  // utm_source: z.string().optional(),
  // utm_campaign: z.string().optional(),
  // utm_medium: z.string().optional(),
  // utm_content: z.string().optional(),
  // utm_term: z.string().optional(),
  // prefill_name: z.string().optional(),
  // prefill_email: z.string().email().optional(),
  // prefill_custom_answers: z.record(z.string()).optional() // e.g. { "a1": "value1" }
});

// REMOVE the AuthSchema or ensure it doesn't ask for the token anymore.
// For now, let's assume no other auth fields are needed directly in the call for these actions.
// const AuthSchema = z.object({
//   token: z.string().min(1, { message: "Calendly API token cannot be empty." })
// });

// Mock data
const mockEventTypesDb = {
  "event_type_uuid_123": {
    uri: "https://api.calendly.com/event_types/event_type_uuid_123",
    name: "30 Minute Meeting",
    active: true,
    scheduling_url: "https://calendly.com/acme/30min",
    // other fields as needed
  },
  "event_type_uuid_456": {
    uri: "https://api.calendly.com/event_types/event_type_uuid_456",
    name: "60 Minute Consultation",
    active: true,
    scheduling_url: "https://calendly.com/acme/60min",
  }
};

const mockSchedulingLinksDb = {}; // To store created links if needed for other mocks

// Internal function to simulate Calendly API: List Event Types
async function _mockCalendlyApi_listEventTypes({ apiKey, userUri, organizationUri }) {
  console.log(`_mockCalendlyApi_listEventTypes: Simulating Calendly GET /event_types`);
  console.log(`_mockCalendlyApi_listEventTypes: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);
  // In a real scenario, userUri or organizationUri might be used for filtering.
  // For this mock, we return all defined event types.
  return {
    collection: Object.values(mockEventTypesDb),
    pagination: { count: Object.keys(mockEventTypesDb).length, next_page_token: null }
  };
}

// Internal function to simulate Calendly API: Create Scheduling Link
async function _mockCalendlyApi_createSchedulingLink({ apiKey, ownerUri, maxEventCount }) {
  console.log(`_mockCalendlyApi_createSchedulingLink: Simulating Calendly POST /scheduling_links`);
  console.log(`_mockCalendlyApi_createSchedulingLink: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);
  console.log(`_mockCalendlyApi_createSchedulingLink: Owner URI: ${ownerUri}`);

  const eventTypeUuid = ownerUri.split('/').pop();
  const eventType = mockEventTypesDb[eventTypeUuid];

  if (!eventType || !eventType.active) {
    return "mock_api_error_event_type_not_found_or_inactive";
  }

  // Construct a plausible booking URL. In reality, Calendly generates this.
  const bookingUrl = `${eventType.scheduling_url}/scl-${Date.now()}${maxEventCount ? `?max_event_count=${maxEventCount}`: ''}`;
  const schedulingLinkResource = {
    booking_url: bookingUrl,
    owner: ownerUri,
    owner_type: "EventType", // Assuming EventType for this mock
  };

  // Store it for potential future reference in mocks
  mockSchedulingLinksDb[bookingUrl] = schedulingLinkResource;

  return { resource: schedulingLinkResource };
}

async function handleGetAppointmentLink({ args, auth }) { // auth might now contain auth.connection
  console.log('Executing MCP: calendly.getAppointmentLink');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    // ... error handling ...
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  // Assuming the validated connection object is passed in auth.connection by the MCP server
  const calendlyApiKey = auth?.connection?.calendly_api_token;
  if (!calendlyApiKey) {
    console.warn('MCP: calendly.getAppointmentLink - Calendly API token not found in connection.');
    return {
      success: false,
      message: "Calendly API token not found in connection configuration.",
      errors: { connection: "Calendly API token is missing." }, // Or a more structured error
      data: null
    };
  }

  // Use calendlyApiKey instead of the old auth.token
  console.log('Using Calendly API token from connection (simulated use):', calendlyApiKey ? calendlyApiKey.substring(0,5) + '...' : 'No API key provided');

  const { event_type_uuid } = parsedArgs.data;

  try {
    // ... (rest of the try block remains largely the same, but uses 'calendlyApiKey')
    // Example modification for an internal mock call:
    // const schedulingLinkResult = await _mockCalendlyApi_createSchedulingLink({
    //   apiKey: calendlyApiKey, // Pass the key from connection
    //   ownerUri: ownerUri,
    // });

    // For this mock, we'll directly use the provided event_type_uuid to construct the owner URI.
    const targetEventType = mockEventTypesDb[event_type_uuid];
    if (!targetEventType) {
        console.warn(`MCP: calendly.getAppointmentLink - Event Type UUID ${event_type_uuid} not found in mock DB.`);
        return {
            success: false,
            message: `Event Type UUID ${event_type_uuid} not found (simulated).`,
            data: null
        };
    }
    if (!targetEventType.active) {
        console.warn(`MCP: calendly.getAppointmentLink - Event Type UUID ${event_type_uuid} is not active.`);
        return {
            success: false,
            message: `Event Type ${targetEventType.name} is not active (simulated).`,
            data: null
        };
    }

    const ownerUri = `https://api.calendly.com/event_types/${event_type_uuid}`;

    const schedulingLinkResult = await _mockCalendlyApi_createSchedulingLink({
      apiKey: calendlyApiKey, // Use the token from connection
      ownerUri: ownerUri,
    });

    if (schedulingLinkResult === "mock_api_error_event_type_not_found_or_inactive") {
      return {
        success: false,
        message: "Failed to create scheduling link: The specified event type was not found or is inactive (simulated).",
        data: null,
      };
    } else if (schedulingLinkResult && schedulingLinkResult.resource && schedulingLinkResult.resource.booking_url) {
      return {
        success: true,
        data: {
          scheduling_link_url: schedulingLinkResult.resource.booking_url,
          owner: schedulingLinkResult.resource.owner,
          owner_type: schedulingLinkResult.resource.owner_type
        },
        message: "Scheduling link created successfully (simulated)."
      };
    } else {
      return {
        success: false,
        message: "An unexpected error or response occurred while creating the scheduling link (simulated).",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error in handleGetAppointmentLink:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to get an appointment link.",
      data: null,
    };
  }
}

module.exports = {
  // ConnectionSchema REMOVED from exports
  handler: handleGetAppointmentLink,
  ArgsSchema: ArgsSchema,
  meta: {
    description: "Creates a new one-time scheduling link for a specific Calendly event type. Uses API token from connection.",
  }
};
