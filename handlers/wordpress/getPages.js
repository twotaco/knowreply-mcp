const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  search: z.string().optional().describe("Limit results to those matching a search term."),
  slug: z.string().optional().describe("Limit result set to pages with one or more specific slugs."),
  // context: z.enum(['view', 'embed', 'edit']).default('view').optional(),
});

// Zod Schema for WordPress connection/authentication object
const ConnectionSchema = z.object({
  baseUrl: z.string().url({ message: "WordPress base URL is required." }),
  token: z.string().optional().describe("WordPress authentication token (e.g., Application Password). Needed for non-public pages.")
});

async function getPagesInternal({ baseUrl, token, search, slug /*, context*/ }) {
  const params = {
    // context: context,
  };
  if (search) params.search = search;
  if (slug) params.slug = slug;

  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/pages`;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) { // Token is optional, add Authorization header only if token is present
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await axios.get(url, { headers, params });
    return response.data;
  } catch (error) {
    console.error(`Error fetching pages from WordPress: ${error.message}`, error.response?.data);
    let errorMessage = 'Failed to fetch pages from WordPress.';
    if (error.response) {
      if (error.response.data && error.response.data.message) {
        errorMessage = `WordPress API Error: ${error.response.data.message}`;
      } else if (error.response.statusText) {
        errorMessage = `WordPress API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `WordPress API Error: Status code ${error.response.status}`;
      }

      if ((error.response.status === 401 || error.response.status === 403) && token) {
        errorMessage = `WordPress API Authorization Error: ${error.response.data?.message || 'Check your token and permissions for pages.'}`;
      } else if (error.response.status === 401 && !token) {
        errorMessage = `WordPress API Error: This page/resource may require authentication. ${error.response.data?.message || ''}`.trim();
      }
    } else if (error.request) {
      errorMessage = 'No response received from WordPress API when fetching pages. Check network connectivity.';
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

  return getPagesInternal({
    baseUrl: parsedAuth.baseUrl,
    token: parsedAuth.token,
    search: parsedArgs.search,
    slug: parsedArgs.slug,
    // context: parsedArgs.context,
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema, // Export ConnectionSchema instead of AuthSchema
  meta: {
    description: "Fetches pages from WordPress. Supports filtering by search term or slug. Authentication is optional for public pages but required for private/draft pages.",
    parameters: ArgsSchema.shape,
    auth: ['baseUrl', 'token (optional)'],
    authRequirements: "Requires WordPress Base URL. An Authentication Token is needed for non-public pages.",
  }
};
