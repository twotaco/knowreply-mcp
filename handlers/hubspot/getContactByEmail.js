const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "API token cannot be empty." }) // For HubSpot API key
});

// Internal function to simulate a call to the HubSpot API
async function _mockHubspotApi_getContactByEmail({ email, apiKey }) {
  console.log(`_mockHubspotApi_getContactByEmail: Simulating HubSpot API call for email: ${email}`);
  console.log(`_mockHubspotApi_getContactByEmail: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  if (email === "contact@example.com") {
    return { // Simulates a found contact object from HubSpot
      id: "hub_contact_12345",
      properties: {
        email: "contact@example.com",
        firstname: "Test",
        lastname: "Contact",
        company: "Example Corp",
        lifecyclestage: "customer"
        // other HubSpot specific fields...
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else if (email === "notfound@example.com") {
    return null; // Simulates HubSpot API returning null or an empty list when contact not found
  } else {
    return "mock_api_error_unsupported_email";
  }
}

async function handleGetContactByEmail({ args, auth }) {
  console.log('Executing MCP: hubspot.getContactByEmail');

  // Validate args
  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: hubspot.getContactByEmail - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
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
    console.warn('MCP: hubspot.getContactByEmail - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information.",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  // Use validated data
  const { email } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data; // HubSpot API Key

  console.log('Received auth token (simulated use for HubSpot API key):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const contactData = await _mockHubspotApi_getContactByEmail({ email, apiKey });

    if (contactData === "mock_api_error_unsupported_email") {
      return {
        success: false,
        message: "Unable to process this email with the current mock HubSpot API setup.",
        data: null,
      };
    } else if (contactData) {
      // Extracting key fields as per design doc
      const responseData = {
        id: contactData.id,
        email: contactData.properties.email,
        name: `${contactData.properties.firstname || ''} ${contactData.properties.lastname || ''}`.trim(),
        company: contactData.properties.company,
        lifecycleStage: contactData.properties.lifecyclestage
      };
      return {
        success: true,
        data: responseData,
        message: "Contact found."
      };
    } else { // contactData is null
      return {
        success: true,
        data: null,
        message: "Contact not found."
      };
    }
  } catch (error) {
    console.error("Error calling _mockHubspotApi_getContactByEmail:", error);
    return {
      success: false,
      message: "An unexpected error occurred while trying to retrieve contact data.",
      data: null,
    };
  }
}

module.exports = handleGetContactByEmail;
