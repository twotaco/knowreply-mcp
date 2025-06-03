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

// --- Output Schemas ---

// Reusable schema for fields like title, content, excerpt, guid which have a 'rendered' property
const WordPressRenderedContentSchema = z.object({
  rendered: z.string(),
  protected: z.boolean().optional(), // Often present for content/excerpt
}).passthrough(); // Allows other potential sub-fields like 'raw' (e.g. with context=edit)

// Zod Schema for an individual WordPress Page
const WordPressPageSchema = z.object({
  id: z.number().int(),
  date: z.string().datetime({ message: "Invalid ISO date format for date" }),
  date_gmt: z.string().datetime({ message: "Invalid ISO date format for date_gmt" }),
  guid: WordPressRenderedContentSchema,
  modified: z.string().datetime({ message: "Invalid ISO date format for modified" }),
  modified_gmt: z.string().datetime({ message: "Invalid ISO date format for modified_gmt" }),
  slug: z.string(),
  status: z.enum(['publish', 'future', 'draft', 'pending', 'private', 'trash', 'auto-draft'])
            .describe("Page status."), // Added 'auto-draft'
  type: z.literal('page').describe("Post type, should always be 'page' for this endpoint."),
  link: z.string().url(),
  title: WordPressRenderedContentSchema,
  content: WordPressRenderedContentSchema,
  excerpt: WordPressRenderedContentSchema,
  author: z.number().int().describe("User ID of the author."),
  featured_media: z.number().int().optional().describe("ID of the featured media (image/video). 0 if none."),
  parent: z.number().int().optional().describe("ID of the parent page. 0 if it's a top-level page."),
  menu_order: z.number().int().optional(),
  comment_status: z.enum(['open', 'closed']).describe("Whether comments are open or closed."),
  ping_status: z.enum(['open', 'closed']).describe("Whether pings are open or closed."),
  template: z.string().optional().describe("The page template file, e.g., 'default', 'template-full-width.php'."),
  meta: z.record(z.string(), z.any()).optional().describe("Meta fields. Structure can vary greatly."),
  // Common ACF (Advanced Custom Fields) structure, if present (highly variable)
  // acf: z.record(z.string(), z.any()).optional(),
  _links: z.record(z.string(), z.array(z.object({ href: z.string().url() }).merge(z.any()))).optional().describe("WordPress REST API links object."),
}).passthrough(); // Allow other fields WordPress or plugins might add

// The OutputSchema for the handler is now an object containing an array of Page objects.
// It's not nullable because an error is thrown on failure, and an empty array (within the 'pages' field) is a valid success response.
const OutputSchema = z.object({
  pages: z.array(WordPressPageSchema)
}).describe("A list of WordPress pages.");
// --- End of Output Schemas ---

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
  ConnectionSchema,
  OutputSchema, // Export the OutputSchema
  meta: {
    description: "Fetches pages from WordPress. Supports filtering by search term or slug. Authentication is optional for public pages but required for private/draft pages.",
    parameters: ArgsSchema.shape,
    auth: ['baseUrl', 'token (optional)'],
    authRequirements: "Requires WordPress Base URL. An Authentication Token is needed for non-public pages.",
  }
};
