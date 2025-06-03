const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." }).optional()
         .describe("The email address of the user to search for."),
  search: z.string().optional()
          .describe("A search term to find users by (e.g., username, nickname, display name)."),
  // WordPress API also supports roles, slug, etc. for filtering users.
  // roles: z.array(z.string()).optional().describe("Limit results to users with specific roles."),
  // slug: z.string().optional().describe("Limit result set to users with one or more specific slugs."),
  // context: z.enum(['view', 'embed', 'edit']).default('view').optional(), // Scope under which the request is made
});

// Zod Schema for WordPress connection/authentication object
const ConnectionSchema = z.object({
  baseUrl: z.string().url({ message: "WordPress base URL is required." }),
  token: z.string().min(1, { message: "WordPress authentication token (e.g., Application Password) is required." })
});

// --- Output Schemas ---

// Zod Schema for an individual WordPress User
const WordPressUserSchema = z.object({
  id: z.number().int(),
  username: z.string().describe("Login username for the user."),
  name: z.string().describe("Display name for the user."),
  first_name: z.string().optional().describe("First name of the user."),
  last_name: z.string().optional().describe("Last name of the user."),
  email: z.string().email().optional().describe("The email address for the user (only visible with appropriate permissions)."),
  url: z.string().url().optional().describe("URL of the user's website."),
  description: z.string().optional().describe("Biographical info for the user."),
  link: z.string().url().describe("URL to the user's author archive."),
  locale: z.string().optional().describe("Locale for the user, e.g., 'en_US'."),
  nickname: z.string().optional().describe("The user's nickname."),
  slug: z.string().describe("An alphanumeric identifier for the user."),
  registered_date: z.string().datetime({ message: "Invalid ISO date format for registered_date" }).optional()
                      .describe("Registration date for the user (usually requires 'edit' context)."),
  roles: z.array(z.string()).optional().describe("Roles assigned to the user."),
  password: z.string().optional().describe("User password (only available with 'edit' context and specific permissions, generally not returned)."),
  capabilities: z.record(z.string(), z.boolean()).optional().describe("All capabilities of the user."),
  extra_capabilities: z.record(z.string(), z.boolean()).optional().describe("Any extra capabilities attributed to the user (e.g., 'administrator', 'editor')."),
  avatar_urls: z.record(z.string(), z.string().url())
                  .optional().describe("URLs for user avatars of different sizes (keys are pixel sizes like '24', '48', '96')."),
  meta: z.record(z.string(), z.any()).optional().describe("Meta fields associated with the user. Structure can vary."),
  // Common ACF (Advanced Custom Fields) structure, if present
  // acf: z.record(z.string(), z.any()).optional(),
  _links: z.record(z.string(), z.array(z.object({ href: z.string().url() }).merge(z.any()))).optional().describe("WordPress REST API links object."),
}).passthrough(); // Allow other fields WordPress or plugins might add

// The OutputSchema for the handler is now an object containing an array of User objects.
// It's not nullable because an error is thrown on failure, and an empty array (within the 'users' field) is a valid success response.
const OutputSchema = z.object({
  users: z.array(WordPressUserSchema)
}).describe("A list of WordPress users.");
// --- End of Output Schemas ---

async function getUsersInternal({ baseUrl, token, email, search /*, roles, slug, context*/ }) {
  const params = {
    // context: context,
  };
  if (email) {
    params.search = email;
  } else if (search) {
    params.search = search;
  }
  // if (roles && roles.length > 0) params.roles = roles.join(',');
  // if (slug) params.slug = slug;

  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/users`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      params,
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching users from WordPress: ${error.message}`, error.response?.data);
    let errorMessage = 'Failed to fetch users from WordPress.';
    if (error.response) {
      if (error.response.data && error.response.data.message) {
        errorMessage = `WordPress API Error: ${error.response.data.message}`;
      } else if (error.response.statusText) {
        errorMessage = `WordPress API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `WordPress API Error: Status code ${error.response.status}`;
      }

      if (error.response.status === 401 || error.response.status === 403) {
        errorMessage = `WordPress API Authorization Error: ${error.response.data?.message || 'Check your token and permissions.'}`;
      }
    } else if (error.request) {
      errorMessage = 'No response received from WordPress API when fetching users. Check network connectivity.';
    } else if (error.message) {
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = ConnectionSchema.parse(auth); // Use ConnectionSchema here

  return getUsersInternal({
    baseUrl: parsedAuth.baseUrl,
    token: parsedAuth.token,
    email: parsedArgs.email,
    search: parsedArgs.search,
    // roles: parsedArgs.roles,
    // slug: parsedArgs.slug,
    // context: parsedArgs.context,
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  OutputSchema, // Export the OutputSchema
  meta: {
    description: "Fetches users from WordPress. Supports searching by email (via general search) or a search term. Requires authentication.",
    parameters: ArgsSchema.shape,
    auth: ['baseUrl', 'token'],
    authRequirements: "Requires WordPress Base URL and an Authentication Token (e.g., Application Password) in the auth object.",
  }
};
