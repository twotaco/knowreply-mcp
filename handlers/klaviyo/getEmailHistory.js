const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Klaviyo API token cannot be empty." })
  // Klaviyo might use public/private keys; for simplicity, assuming a single token here.
  // Actual implementation would depend on Klaviyo's specific auth scheme.
});

// Mock data for Klaviyo email history
const mockKlaviyoEmailHistoryDb = {
  "user@example.com": {
    profileId: "klaviyo_prof_123",
    emailHistory: [
      {
        campaign_name: "Welcome Series - Email 1",
        subject: "Welcome to KnowReply!",
        sent_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        status: "Sent"
      },
      {
        campaign_name: "Weekly Digest",
        subject: "Your Weekly News",
        sent_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        status: "Opened"
      },
      {
        campaign_name: "Special Offer",
        subject: "A Special Deal Just For You",
        sent_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        status: "Clicked"
      }
    ]
  },
  "another@example.com": {
    profileId: "klaviyo_prof_456",
    emailHistory: [
      { campaign_name: "Onboarding Tips", subject: "Getting Started with Our Service", sent_at: new Date().toISOString(), status: "Sent" }
    ]
  }
};

// Internal function to simulate a call to the Klaviyo API
async function _mockKlaviyoApi_getEmailHistory({ email, apiKey }) {
  console.log(`_mockKlaviyoApi_getEmailHistory: Simulating Klaviyo API call for email: ${email}`);
  console.log(`_mockKlaviyoApi_getEmailHistory: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  const profileData = mockKlaviyoEmailHistoryDb[email];

  if (profileData) {
    // Simulate returning email history for the profile
    return profileData.emailHistory;
  } else if (email === "notfound@example.com") {
    return "mock_api_error_profile_not_found";
  } else {
    // For other emails, simulate profile found but no email history
    return [];
  }
}

async function handleGetEmailHistory({ args, auth }) {
  console.log('Executing MCP: klaviyo.getEmailHistory');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: klaviyo.getEmailHistory - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: klaviyo.getEmailHistory - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information (Klaviyo API token).",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  const { email } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data;

  console.log('Received auth token (simulated use for Klaviyo API key):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const history = await _mockKlaviyoApi_getEmailHistory({ email, apiKey });

    if (history === "mock_api_error_profile_not_found") {
      return {
        success: true,
        message: "Klaviyo profile not found (simulated).",
        data: { // Design doc: "[ { "subject": "Welcome", "sentAt": "..." }, ... ]" - empty if no profile
            email: email,
            history: []
        }
      };
    } else if (Array.isArray(history)) {
      // As per design doc: "[ { "subject": "Welcome", "sentAt": "..." }, ... ]"
      const simplifiedHistory = history.map(entry => ({
        campaignName: entry.campaign_name, // Added campaign name for more context
        subject: entry.subject,
        sentAt: entry.sent_at,
        status: entry.status
      }));

      return {
        success: true,
        data: {
            email: email, // Include the queried email for context
            history: simplifiedHistory
        },
        message: history.length > 0 ? "Email history retrieved successfully." : "Profile found, but no email history."
      };
    } else {
      return {
        success: false,
        message: "An unexpected error or response occurred while fetching email history.",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error calling _mockKlaviyoApi_getEmailHistory:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to retrieve email history.",
      data: null,
    };
  }
}

module.exports = handleGetEmailHistory;
