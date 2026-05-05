# Web Scraper with Vector Database

A powerful TypeScript-based web scraper using Bun runtime that leverages Jina.ai for content extraction, recursively crawls websites respecting robots.txt, and stores data with embeddings in ChromaDB vector database for similarity search.

## Features

- 🚀 **Fast**: Built with Bun runtime for blazing-fast TypeScript execution
- 🔍 **Smart Scraping**: Uses Jina.ai Reader API for clean markdown content extraction
- 🤖 **Recursive Crawling**: Automatically follows links with configurable depth
- 📜 **Robots.txt Compliant**: Respects website scraping rules
- 🧠 **Vector Search**: Stores content with embeddings in ChromaDB
- 🔎 **Similarity Search**: Fast semantic search across scraped content
- 🐳 **Docker Ready**: Complete Docker setup with docker-compose
- 🎯 **REST API**: Clean API endpoints for scraping and searching

## Architecture

### Components

1. **Jina.ai Reader**: Converts web pages to clean markdown
2. **Recursive Crawler**: BFS crawling with depth limits and domain filtering
3. **Robots.txt Parser**: Respects website crawling rules
4. **Embeddings**:
   - Simple hash-based embeddings (default, no API required)
   - Jina AI Embeddings API (optional, better quality)
5. **ChromaDB**: Vector database for storing and searching embeddings
6. **Hono Server**: Fast, lightweight web framework

## Strategy & Planning

### Do We Need LLM API Calls?

**No, LLM API calls are NOT required** for basic functionality. The project works with:

- **Jina.ai Reader**: Free tier available, converts HTML to markdown
- **Local Embeddings**: Simple hash-based embeddings work without any API
- **Optional Enhancement**: Jina AI Embeddings API for production-quality embeddings

### Workflow

```
1. User submits URL → API endpoint
2. Crawler fetches robots.txt → Validates URL
3. Jina.ai Reader API → Clean markdown content
4. Extract links → Queue for recursive crawling
5. Split content into chunks → Generate embeddings
6. Store in ChromaDB → With metadata
7. User searches → Semantic similarity search
8. Return ranked results → With scores
```

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [Docker](https://www.docker.com/) and Docker Compose (optional)
- Jina.ai API key (optional, for better embeddings)

## Installation

### Option 1: Docker (Recommended)

```bash
# Clone the repository
cd web-scraper-vector-db

# Copy environment file
cp .env.example .env

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f app
```

The API will be available at `http://localhost:3000` and ChromaDB at `http://localhost:8000`.

### Option 2: Local Development

```bash
# Install Bun if not already installed
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Start ChromaDB separately (required)
docker run -p 8000:8000 -v ./data/chroma:/chroma/chroma chromadb/chroma:latest

# Copy environment file
cp .env.example .env

# Start the development server
bun run dev
```

## Configuration

Edit `.env` file:

```env
# Server
PORT=3000

# ChromaDB
CHROMA_URL=http://localhost:8000
COLLECTION_NAME=scraped_content

# Scraper
MAX_DEPTH=3              # How deep to crawl
MAX_CONCURRENT=5         # Parallel requests
REQUEST_DELAY=1000       # Delay between batches (ms)

# Chunking
CHUNK_SIZE=1000         # Characters per chunk
CHUNK_OVERLAP=200       # Overlap between chunks

# Embeddings (Optional)
USE_JINA_EMBEDDINGS=true
JINA_EMBEDDING_API_KEY=your_key_here
```

## API Endpoints

### 1. Start Scraping

```bash
# POST /api/scrape
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "maxDepth": 2,
    "respectRobots": true,
    "allowedDomains": ["example.com"]
  }'

# Response
{
  "jobId": "uuid",
  "message": "Scraping job started",
  "status": "running"
}
```

### 2. Check Scrape Job Status

```bash
# GET /api/scrape/:jobId
curl http://localhost:3000/api/scrape/uuid

# Response
{
  "id": "uuid",
  "status": "completed",
  "startedAt": "2025-10-08T10:00:00Z",
  "completedAt": "2025-10-08T10:05:00Z",
  "pagesScraped": 15
}
```

### 3. Similarity Search (POST)

```bash
# POST /api/search
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "machine learning tutorials",
    "limit": 5
  }'

# Response
{
  "query": "machine learning tutorials",
  "results": [
    {
      "id": "url_chunk_0",
      "url": "https://example.com/ml",
      "content": "...",
      "score": 0.95,
      "metadata": {...}
    }
  ],
  "count": 5
}
```

### 4. Similarity Search (GET)

```bash
# GET /api/search?q=query&limit=10
curl "http://localhost:3000/api/search?q=python+programming&limit=5"
```

### 5. Get Statistics

```bash
# GET /api/stats
curl http://localhost:3000/api/stats

# Response
{
  "collectionName": "scraped_content",
  "totalChunks": 150
}
```

### 6. Delete URL

```bash
# DELETE /api/url?url=https://example.com
curl -X DELETE "http://localhost:3000/api/url?url=https://example.com"
```

### 7. Health Check

```bash
curl http://localhost:3000/health
```

## Project Structure

```
web-scraper-vector-db/
├── src/
│   ├── lib/
│   │   ├── scraper.ts       # Jina.ai integration
│   │   ├── crawler.ts       # Recursive crawler
│   │   ├── embeddings.ts    # Embedding providers
│   │   └── vectorstore.ts   # ChromaDB client
│   ├── routes/
│   │   ├── scrape.ts        # Scraping endpoints
│   │   └── search.ts        # Search endpoints
│   ├── types/
│   │   └── index.ts         # TypeScript types
│   ├── config.ts            # Configuration
│   └── index.ts             # Main server
├── data/
│   └── chroma/              # ChromaDB data
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

## Usage Examples

### Example 1: Scrape a Documentation Site

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://docs.example.com",
    "maxDepth": 3,
    "respectRobots": true,
    "allowedDomains": ["docs.example.com"]
  }'
```

### Example 2: Search for Content

```bash
curl "http://localhost:3000/api/search?q=authentication+tutorial&limit=10"
```

### Example 3: Check Progress

```bash
# List all jobs
curl http://localhost:3000/api/scrape

# Check specific job
curl http://localhost:3000/api/scrape/<job-id>
```

## Advanced Configuration

### Using Jina AI Embeddings (Recommended for Production)

1. Get API key from [Jina.ai](https://jina.ai/)
2. Update `.env`:
```env
USE_JINA_EMBEDDINGS=true
JINA_EMBEDDING_API_KEY=your_api_key
```

### Custom Scraping Rules

Modify `src/config.ts` to adjust:
- Chunk size and overlap
- Concurrent requests
- Request delays
- User agent

### Domain Filtering

Restrict crawling to specific domains:

```json
{
  "url": "https://example.com",
  "allowedDomains": ["example.com", "docs.example.com"]
}
```

## How It Works

### 1. Web Scraping with Jina.ai

Jina.ai Reader API (`r.jina.ai`) converts any webpage to clean markdown:

```typescript
const response = await fetch(`https://r.jina.ai/${url}`);
const markdown = await response.text();
```

### 2. Recursive Crawling

- Starts from seed URL
- Extracts all links from markdown
- Queues links respecting depth limit
- Processes in batches with delays
- Checks robots.txt before each request

### 3. Content Chunking

Large content is split into overlapping chunks:

```typescript
const chunks = splitIntoChunks(content, {
  size: 1000,
  overlap: 200
});
```

### 4. Embedding Generation

Each chunk is converted to a vector embedding:

- **Simple mode**: Hash-based (no API, demo purposes)
- **Production mode**: Jina AI Embeddings API

### 5. Vector Storage

Chunks stored in ChromaDB with metadata:

```typescript
await collection.add({
  ids: [...],
  embeddings: [...],
  documents: [...],
  metadatas: [...],
});
```

### 6. Similarity Search

Query is embedded and compared to stored vectors:

```typescript
const results = await collection.query({
  queryEmbeddings: [queryVector],
  nResults: 10,
});
```

## Development

```bash
# Run in development mode with hot reload
bun run dev

# Build for production
bun run build

# Run tests
bun test
```

## Troubleshooting

### ChromaDB Connection Issues

```bash
# Check if ChromaDB is running
curl http://localhost:8000/api/v1/heartbeat

# Restart ChromaDB
docker-compose restart chromadb
```

### Scraping Blocked

- Check robots.txt: `curl https://example.com/robots.txt`
- Increase `REQUEST_DELAY` in config
- Check if site blocks User-Agent

### Memory Issues

- Reduce `MAX_CONCURRENT`
- Reduce `MAX_DEPTH`
- Increase `CHUNK_SIZE` to create fewer chunks

## Production Deployment

1. Set production environment variables
2. Use Jina AI embeddings for quality
3. Configure proper logging
4. Set up monitoring
5. Use persistent volumes for ChromaDB
6. Configure reverse proxy (nginx)
7. Enable HTTPS

## Limitations

- Hash-based embeddings are for demo only
- Jina.ai Reader has rate limits
- ChromaDB stores data locally
- No authentication on endpoints (add as needed)
- Background jobs not persisted across restarts

## Future Enhancements

- [ ] Add authentication/API keys
- [ ] Implement job queue (Bull, BullMQ)
- [ ] Add support for multiple embedding models
- [ ] Implement rate limiting
- [ ] Add web UI dashboard
- [ ] Support PDF/document scraping
- [ ] Add webhook notifications
- [ ] Implement caching layer

## License

MIT

## Contributing

Pull requests welcome! Please read contributing guidelines first.

## Support

For issues and questions, please open an issue on GitHub.
