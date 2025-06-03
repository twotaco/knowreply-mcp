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
  ConnectionSchema, // Export ConnectionSchema instead of AuthSchema
  meta: {
    description: "Fetches users from WordPress. Supports searching by email (via general search) or a search term. Requires authentication.",
    parameters: ArgsSchema.shape,
    auth: ['baseUrl', 'token'],
    authRequirements: "Requires WordPress Base URL and an Authentication Token (e.g., Application Password) in the auth object.",
  }
};
