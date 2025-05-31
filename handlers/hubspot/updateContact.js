const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  contactId: z.string().min(1, { message: "Contact ID cannot be empty." }),
  updates: z.object({}).passthrough() // Allows any properties for updates, can be refined
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "API token cannot be empty." }) // For HubSpot API key
});

// Mock data store for contacts (to simulate updates)
const mockContactsDb = {
  "hub_contact_12345": {
    id: "hub_contact_12345",
    properties: {
      email: "contact@example.com",
      firstname: "Test",
      lastname: "Contact",
      company: "Example Corp",
      lifecyclestage: "customer"
    },
    createdAt: new Date(Date.now() - 100000).toISOString(),
    updatedAt: new Date(Date.now() - 100000).toISOString(),
  }
};

// Internal function to simulate a call to the HubSpot API
async function _mockHubspotApi_updateContact({ contactId, updates, apiKey }) {
  console.log(`_mockHubspotApi_updateContact: Simulating HubSpot API call to update contactId: ${contactId}`);
  console.log(`_mockHubspotApi_updateContact: Updates: ${JSON.stringify(updates)}`);
  console.log(`_mockHubspotApi_updateContact: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  if (mockContactsDb[contactId]) {
    // Simulate updating the contact
    mockContactsDb[contactId].properties = {
      ...mockContactsDb[contactId].properties,
      ...updates
    };
    mockContactsDb[contactId].updatedAt = new Date().toISOString();
    return { // Simulates a successful update response from HubSpot
      id: contactId,
      properties: mockContactsDb[contactId].properties,
      updatedAt: mockContactsDb[contactId].updatedAt
    };
  } else if (contactId === "hub_contact_nonexistent") {
    return "mock_api_error_contact_not_found";
  } else {
    return "mock_api_error_update_failed";
  }
}

async function handleUpdateContact({ args, auth }) {
  console.log('Executing MCP: hubspot.updateContact');

  // Validate args
  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: hubspot.updateContact - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
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
    console.warn('MCP: hubspot.updateContact - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information.",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  // Use validated data
  const { contactId, updates } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data; // HubSpot API Key

  console.log('Received auth token (simulated use for HubSpot API key):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const updateResult = await _mockHubspotApi_updateContact({ contactId, updates, apiKey });

    if (updateResult === "mock_api_error_contact_not_found") {
      return {
        success: false,
        message: "Contact not found (simulated).",
        data: null,
      };
    } else if (updateResult === "mock_api_error_update_failed") {
      return {
        success: false,
        message: "Failed to update contact (simulated).",
        data: null,
      };
    } else if (updateResult && updateResult.id) {
      // As per design doc: "Return confirmation with new values."
      return {
        success: true,
        data: {
          id: updateResult.id,
          updatedProperties: updateResult.properties, // Send back all properties after update
          updatedAt: updateResult.updatedAt
        },
        message: "Contact updated successfully."
      };
    } else {
      return {
        success: false,
        message: "An unexpected error or response occurred during contact update.",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error calling _mockHubspotApi_updateContact:", error);
    return {
      success: false,
      message: "An unexpected error occurred while trying to update contact data.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleUpdateContact,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
