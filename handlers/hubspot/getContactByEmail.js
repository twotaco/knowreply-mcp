const { z } = require('zod');

// Zod Schema for arguments
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." })
});

// Zod Schema for connection object
// For mock handlers, the token might be a placeholder or not strictly validated if the mock doesn't use it.
// However, for consistency in /discover, we define it.
const ConnectionSchema = z.object({
  token: z.string().optional().describe("HubSpot API key (placeholder for mock).")
});

// Internal function to simulate a call to the HubSpot API
async function getContactByEmailInternal({ email, apiKey }) {
  console.log(`MOCK: hubspot.getContactByEmailInternal - Simulating HubSpot API call for email: ${email}`);
  // apiKey is available from ConnectionSchema but might not be used by the mock
  // console.log(`MOCK: hubspot.getContactByEmailInternal - Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  if (email === "contact@example.com") {
    const mockHubspotContact = {
      id: "hub_contact_12345",
      properties: {
        email: "contact@example.com",
        firstname: "Test",
        lastname: "Contact",
        company: "Example Corp",
        lifecyclestage: "customer"
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return {
      id: mockHubspotContact.id,
      email: mockHubspotContact.properties.email,
      name: `${mockHubspotContact.properties.firstname || ''} ${mockHubspotContact.properties.lastname || ''}`.trim(),
      company: mockHubspotContact.properties.company,
      lifecycleStage: mockHubspotContact.properties.lifecyclestage
    };
  } else if (email === "notfound@example.com") {
    return null;
  } else if (email === "error@example.com") {
    throw new Error("Mock HubSpot API Error: Unable to process this email.");
  }
  return null;
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = ConnectionSchema.parse(auth);

  try {
    const contactData = await getContactByEmailInternal({
      email: parsedArgs.email,
      apiKey: parsedAuth.token
    });

    return contactData;

  } catch (error) {
    console.error(`Error in hubspot.getContactByEmail handler: ${error.message}`);
    throw new Error(`HubSpot Handler Error: ${error.message}`);
  }
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  meta: {
    description: "MOCK: Fetches a contact from HubSpot by their email address.",
    parameters: ArgsSchema.shape,
    auth: ['token (optional)'],
    authRequirements: "HubSpot API Key (placeholder for mock, passed as 'token' in auth object).",
  }
};
