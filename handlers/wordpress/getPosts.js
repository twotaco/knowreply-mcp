const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  search: z.string().optional().describe("Limit results to those matching a search term."),
  categories: z.union([
    z.number().int().positive(),
    z.string().regex(/^\d+(,\d+)*$/, { message: "Categories must be a positive integer or a comma-separated string of positive integers." })
  ]).optional().describe("Limit result set to posts assigned to specific category IDs (comma-separated string or single number)."),
  tags: z.union([
    z.number().int().positive(),
    z.string().regex(/^\d+(,\d+)*$/, { message: "Tags must be a positive integer or a comma-separated string of positive integers." })
  ]).optional().describe("Limit result set to posts assigned to specific tag IDs (comma-separated string or single number)."),
  // Common params for listing posts: per_page, page, order, orderby, context, etc.
  // context: z.enum(['view', 'embed', 'edit']).default('view').optional(),
  // per_page: z.number().int().positive().max(100).optional().default(10),
});

// Zod Schema for authentication object (optional for public posts)
const AuthSchema = z.object({
  baseUrl: z.string().url({ message: "WordPress base URL is required." }),
  token: z.string().optional().describe("WordPress authentication token (e.g., Application Password). Needed for non-public posts.")
});

async function getPostsInternal({ baseUrl, token, search, categories, tags /*, context, per_page*/ }) {
  const params = {
    // context: context,
    // per_page: per_page,
  };
  if (search) params.search = search;
  if (categories) params.categories = String(categories); // WP API expects comma-separated string for multiple IDs
  if (tags) params.tags = String(tags);       // WP API expects comma-separated string for multiple IDs

  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await axios.get(url, { headers, params });
    return response.data; // Returns an array of post objects
  } catch (error) {
    console.error(`Error fetching posts from WordPress: ${error.message}`, error.response?.data);
    let errorMessage = 'Failed to fetch posts from WordPress.';
    if (error.response) {
      // WordPress errors often come with a 'code' and 'message' in the response data
      if (error.response.data && error.response.data.message) {
        errorMessage = `WordPress API Error: ${error.response.data.message}`;
      } else if (error.response.statusText) {
        errorMessage = `WordPress API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `WordPress API Error: Status code ${error.response.status}`;
      }

      if ((error.response.status === 401 || error.response.status === 403) && token) {
        errorMessage = `WordPress API Authorization Error: ${error.response.data?.message || 'Check your token and permissions for posts.'}`;
      } else if (error.response.status === 401 && !token) { // If no token was provided and got 401
        errorMessage = `WordPress API Error: This resource may require authentication. ${error.response.data?.message || ''}`.trim();
      }
    } else if (error.request) {
      errorMessage = 'No response received from WordPress API when fetching posts. Check network connectivity.';
    } else if (error.message) { // Non-HTTP errors or setup issues with axios
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = AuthSchema.parse(auth);

  return getPostsInternal({
    baseUrl: parsedAuth.baseUrl,
    token: parsedAuth.token,
    search: parsedArgs.search,
    categories: parsedArgs.categories,
    tags: parsedArgs.tags,
    // context: parsedArgs.context,
    // per_page: parsedArgs.per_page,
  });
}

module.exports = {
  handler,
  ArgsSchema,
  AuthSchema,
  meta: {
    description: "Fetches posts from WordPress. Supports filtering by search term, category IDs, or tag IDs. Authentication is optional for public posts.",
    parameters: ArgsSchema.shape,
    auth: ['baseUrl', 'token (optional)'],
    authRequirements: "Requires WordPress Base URL. An Authentication Token is needed for non-public posts.",
  }
};
