const { z } = require('zod');

// Zod Schema for arguments
const ArgsSchema = z.object({
  contactId: z.string().min(1, { message: "Contact ID cannot be empty." }),
  updates: z.object({}).passthrough().describe("An object containing properties to update on the contact.")
});

// Zod Schema for connection object
const ConnectionSchema = z.object({
  token: z.string().optional().describe("HubSpot API key (placeholder for mock).")
});

// Mock data store for contacts
// Note: This mock DB is reset on each require/test run if tests clear module cache.
// For more persistent mock state across calls *within a single test without cache clearing*,
// this would need to be handled differently (e.g., exporting/importing the DB or more complex setup).
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
async function updateContactInternal({ contactId, updates, apiKey }) {
  console.log(`MOCK: hubspot.updateContactInternal - Simulating HubSpot API call to update contactId: ${contactId}`);
  // console.log(`MOCK: hubspot.updateContactInternal - Updates: ${JSON.stringify(updates)}`);
  // console.log(`MOCK: hubspot.updateContactInternal - Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  if (mockContactsDb[contactId]) {
    // Simulate updating the contact
    mockContactsDb[contactId].properties = {
      ...mockContactsDb[contactId].properties,
      ...updates
    };
    mockContactsDb[contactId].updatedAt = new Date().toISOString();

    return {
      id: contactId,
      updatedProperties: mockContactsDb[contactId].properties,
      updatedAt: mockContactsDb[contactId].updatedAt
    };
  } else if (contactId === "hub_contact_nonexistent") {
    // This specific ID is used to test a "not found" error throw
    throw new Error("Mock HubSpot API Error: Contact not found.");
  } else if (contactId === "hub_contact_update_error") {
    // This specific ID is used to test a generic update error
    throw new Error("Mock HubSpot API Error: Failed to update contact (simulated error).");
  }
  // For any other contactId not in mockContactsDb, simulate as if it's a "not found" during an update attempt.
  throw new Error(`Mock HubSpot API Error: Contact with ID ${contactId} not found for update.`);
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = ConnectionSchema.parse(auth);

  try {
    const updateResult = await updateContactInternal({
      contactId: parsedArgs.contactId,
      updates: parsedArgs.updates,
      apiKey: parsedAuth.token
    });
    return updateResult;
  } catch (error) {
    console.error(`Error in hubspot.updateContact handler: ${error.message}`);
    throw new Error(`HubSpot Handler Error: ${error.message}`);
  }
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  meta: {
    description: "MOCK: Updates properties of an existing contact in HubSpot.",
    parameters: ArgsSchema.shape,
    auth: ['token (optional)'],
    authRequirements: "HubSpot API Key (placeholder for mock, passed as 'token' in auth object).",
  }
};
