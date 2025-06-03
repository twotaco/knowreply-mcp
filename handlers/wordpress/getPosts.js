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
  // context: z.enum(['view', 'embed', 'edit']).default('view').optional(),
  // per_page: z.number().int().positive().max(100).optional().default(10),
});

// Zod Schema for WordPress connection/authentication object
const ConnectionSchema = z.object({
  baseUrl: z.string().url({ message: "WordPress base URL is required." }),
  token: z.string().optional().describe("WordPress authentication token (e.g., Application Password). Needed for non-public posts.")
});

// --- Output Schemas ---

// Reusable schema for fields like title, content, excerpt, guid which have a 'rendered' property
const WordPressRenderedContentSchema = z.object({
  rendered: z.string(),
  protected: z.boolean().optional(), // Often present for content/excerpt
}).passthrough();

// Zod Schema for an individual WordPress Post
const WordPressPostSchema = z.object({
  id: z.number().int(),
  date: z.string().datetime({ message: "Invalid ISO date format for date" }),
  date_gmt: z.string().datetime({ message: "Invalid ISO date format for date_gmt" }),
  guid: WordPressRenderedContentSchema,
  modified: z.string().datetime({ message: "Invalid ISO date format for modified" }),
  modified_gmt: z.string().datetime({ message: "Invalid ISO date format for modified_gmt" }),
  slug: z.string(),
  status: z.enum(['publish', 'future', 'draft', 'pending', 'private', 'trash', 'auto-draft'])
            .describe("Post status."),
  type: z.literal('post').describe("Post type, should always be 'post' for this endpoint."),
  link: z.string().url(),
  title: WordPressRenderedContentSchema,
  content: WordPressRenderedContentSchema,
  excerpt: WordPressRenderedContentSchema,
  author: z.number().int().describe("User ID of the author."),
  featured_media: z.number().int().optional().describe("ID of the featured media. 0 if none."),
  comment_status: z.enum(['open', 'closed']).describe("Whether comments are open or closed."),
  ping_status: z.enum(['open', 'closed']).describe("Whether pings are open or closed."),
  sticky: z.boolean().optional().describe("Whether the post is sticky."),
  template: z.string().optional().describe("The theme template file used for the post."),
  format: z.string().optional().describe("Post format (e.g., 'standard', 'aside', 'gallery')."),
  meta: z.record(z.string(), z.any()).optional().describe("Meta fields. Structure can vary."),
  categories: z.array(z.number().int()).describe("Array of category IDs."),
  tags: z.array(z.number().int()).describe("Array of tag IDs."),
  // Common ACF (Advanced Custom Fields) structure, if present (highly variable)
  // acf: z.record(z.string(), z.any()).optional(),
  _links: z.record(z.string(), z.array(z.object({ href: z.string().url() }).merge(z.any()))).optional().describe("WordPress REST API links object."),
}).passthrough(); // Allow other fields WordPress or plugins might add

// The OutputSchema for the handler is now an object containing an array of Post objects.
// It's not nullable because an error is thrown on failure, and an empty array (within the 'posts' field) is a valid success response.
const OutputSchema = z.object({
  posts: z.array(WordPressPostSchema)
}).describe("A list of WordPress posts.");
// --- End of Output Schemas ---

async function getPostsInternal({ baseUrl, token, search, categories, tags /*, context, per_page*/ }) {
  const params = {
    // context: context,
    // per_page: per_page,
  };
  if (search) params.search = search;
  if (categories) params.categories = String(categories);
  if (tags) params.tags = String(tags);

  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await axios.get(url, { headers, params });
    return response.data;
  } catch (error) {
    console.error(`Error fetching posts from WordPress: ${error.message}`, error.response?.data);
    let errorMessage = 'Failed to fetch posts from WordPress.';
    if (error.response) {
      if (error.response.data && error.response.data.message) {
        errorMessage = `WordPress API Error: ${error.response.data.message}`;
      } else if (error.response.statusText) {
        errorMessage = `WordPress API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `WordPress API Error: Status code ${error.response.status}`;
      }

      if ((error.response.status === 401 || error.response.status === 403) && token) {
        errorMessage = `WordPress API Authorization Error: ${error.response.data?.message || 'Check your token and permissions for posts.'}`;
      } else if (error.response.status === 401 && !token) {
        errorMessage = `WordPress API Error: This resource may require authentication. ${error.response.data?.message || ''}`.trim();
      }
    } else if (error.request) {
      errorMessage = 'No response received from WordPress API when fetching posts. Check network connectivity.';
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
  ConnectionSchema,
  OutputSchema, // Export the OutputSchema
  meta: {
    description: "Fetches posts from WordPress. Supports filtering by search term, category IDs, or tag IDs. Authentication is optional for public posts.",
    parameters: ArgsSchema.shape,
    auth: ['baseUrl', 'token (optional)'],
    authRequirements: "Requires WordPress Base URL. An Authentication Token is needed for non-public posts.",
  }
};
