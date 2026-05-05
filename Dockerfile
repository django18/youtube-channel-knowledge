FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb* /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Install production dependencies
RUN mkdir -p /temp/prod
COPY package.json bun.lockb* /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Build the app
FROM base AS build
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Run the app
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json .
COPY --from=build /app/tsconfig.json .

# Create data directory for ChromaDB persistence
RUN mkdir -p /app/data/chroma

# Expose port
EXPOSE 3000

# Set user to non-root
USER bun

# Start the app
ENTRYPOINT ["bun", "run", "src/index.ts"]
