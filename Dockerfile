FROM node:18-alpine

WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock, etc.)
# This allows us to leverage Docker layer caching for dependencies
COPY package*.json ./

# Install ALL dependencies first (including devDependencies needed for the build step)
RUN npm install

# Copy the rest of your application source code
# This includes your tsconfig.json and src/ directory
COPY . .

# Run the TypeScript build to compile .ts files into .js files in the /app/dist directory
RUN npm run build

# Prune devDependencies after the build to make the final image smaller
# This step is optional but good practice for production images
RUN npm prune --omit=dev

# Expose the port the app runs on (should match PORT env var used in server.ts)
EXPOSE 3000

# Define the command to run the application
# This now correctly uses the compiled output from dist/
CMD [ "npm", "start" ]
