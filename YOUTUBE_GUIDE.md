# YouTube Transcript Scraper & RAG System

This guide explains how to scrape YouTube channel videos, extract transcripts, and use them for building SaaS products with AI-powered semantic search.

## Features

- **No API Key Required**: Uses `youtube-transcript-api` and YouTube RSS feeds
- **Channel Scraping**: Automatically fetch all videos from a channel
- **Transcript Extraction**: Get full transcripts with timestamps
- **Semantic Search**: ChromaDB + embeddings for intelligent search
- **RAG System**: Retrieve relevant context for AI chat
- **Chunk Processing**: Smart text chunking with overlap for better context

## Setup

### 1. Start ChromaDB

```bash
docker-compose up -d
```

### 2. Install Dependencies

Already done! The following packages are installed:
- `youtube-transcript` - Fetch YouTube transcripts
- `@xenova/transformers` - Local embeddings (no API needed)
- `chromadb` - Vector database

### 3. Start the Server

```bash
bun run dev
```

Server starts at `http://localhost:3000`

## API Endpoints

### 1. Scrape Single Video

```bash
POST /api/youtube/scrape-video
Content-Type: application/json

{
  "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "storeInDB": true
}
```

**Response:**
```json
{
  "success": true,
  "video": {
    "videoId": "VIDEO_ID",
    "title": "Video Title",
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "chunksCount": 25,
    "transcriptLength": 15000
  },
  "chunks": [...],
  "stored": true
}
```

### 2. Scrape Entire Channel

```bash
POST /api/youtube/scrape-channel
Content-Type: application/json

{
  "channelUrl": "https://www.youtube.com/@channelname",
  "maxVideos": 50,
  "storeInDB": true
}
```

**Supported Channel URL Formats:**
- `https://www.youtube.com/@username`
- `https://www.youtube.com/channel/CHANNEL_ID`
- `https://www.youtube.com/c/CustomName`

**Response:**
```json
{
  "success": true,
  "videosProcessed": 45,
  "totalChunks": 1250,
  "stored": true,
  "videos": [
    {
      "videoId": "abc123",
      "title": "How we built our SaaS",
      "url": "https://www.youtube.com/watch?v=abc123",
      "chunksCount": 28
    }
  ]
}
```

### 3. Semantic Search

Search across all stored transcripts using natural language:

```bash
POST /api/youtube/search
Content-Type: application/json

{
  "query": "What pain points do users face with payment processing?",
  "limit": 5
}
```

**Response:**
```json
{
  "success": true,
  "query": "What pain points do users face with payment processing?",
  "resultsCount": 5,
  "results": [
    {
      "videoId": "abc123",
      "videoTitle": "User Interview #5",
      "videoUrl": "https://www.youtube.com/watch?v=abc123",
      "text": "The biggest issue we had was with payment processing...",
      "timestamp": "12:34",
      "timestampUrl": "https://www.youtube.com/watch?v=abc123&t=754s",
      "similarity": 0.87,
      "metadata": {
        "channelTitle": "SaaS Interviews",
        "thumbnailUrl": "..."
      }
    }
  ]
}
```

### 4. RAG Chat (Context Retrieval)

Get relevant context for AI chat applications:

```bash
POST /api/youtube/chat
Content-Type: application/json

{
  "question": "What features should I prioritize for my SaaS MVP?",
  "contextLimit": 3
}
```

**Response:**
```json
{
  "success": true,
  "question": "What features should I prioritize for my SaaS MVP?",
  "context": [
    {
      "videoTitle": "Building SaaS MVP",
      "videoUrl": "https://www.youtube.com/watch?v=abc&t=120s",
      "text": "Focus on core value proposition first...",
      "timestamp": "2:00"
    }
  ],
  "contextText": "[1] Building SaaS MVP (2:00)\nFocus on core value proposition first...",
  "message": "Use this context with your preferred LLM (Claude, GPT-4, etc.) to answer the question"
}
```

### 5. Get Stats

```bash
GET /api/youtube/stats
```

## Example Usage Scripts

### Example 1: Scrape Y Combinator's Channel

```typescript
// scripts/scrape-yc.ts
const channelUrl = "https://www.youtube.com/@ycombinator";

const response = await fetch('http://localhost:3000/api/youtube/scrape-channel', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channelUrl,
    maxVideos: 100,
    storeInDB: true,
  }),
});

const result = await response.json();
console.log(`Processed ${result.videosProcessed} videos`);
console.log(`Total chunks: ${result.totalChunks}`);
```

### Example 2: Search for User Pain Points

```typescript
const queries = [
  "What problems do users face?",
  "Why did customers choose this product?",
  "What features are most requested?",
  "How much are users willing to pay?",
];

for (const query of queries) {
  const response = await fetch('http://localhost:3000/api/youtube/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 3 }),
  });

  const result = await response.json();
  console.log(`\n## ${query}`);

  result.results.forEach(r => {
    console.log(`- ${r.videoTitle} (${r.timestamp})`);
    console.log(`  ${r.text.slice(0, 200)}...`);
  });
}
```

### Example 3: Build a RAG Chat Interface

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function chatWithTranscripts(question: string) {
  // Get relevant context
  const contextResponse = await fetch('http://localhost:3000/api/youtube/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, contextLimit: 5 }),
  });

  const { contextText } = await contextResponse.json();

  // Ask Claude with context
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Answer this question based on the YouTube interview transcripts below:

Question: ${question}

Transcripts:
${contextText}

Provide a comprehensive answer citing specific videos and timestamps.`
    }],
  });

  return message.content[0].text;
}

// Usage
const answer = await chatWithTranscripts(
  "What are the most common mistakes when building a SaaS product?"
);
console.log(answer);
```

## Use Cases for SaaS Building

### 1. **User Research Database**
Store interviews with potential customers to understand:
- Pain points and problems
- Feature requests
- Willingness to pay
- Use cases and workflows

### 2. **Competitive Intelligence**
Scrape competitor demo videos and interviews to:
- Understand their positioning
- Identify gaps in the market
- Learn from their mistakes

### 3. **Educational Content Library**
Build from educational channels like:
- Y Combinator (startup advice)
- Indie Hackers (founder stories)
- Product-focused channels

### 4. **AI Assistant Training**
Use transcripts to:
- Train custom AI assistants
- Build domain-specific chatbots
- Create automated support systems

## Storage Strategy

The system uses a multi-layer approach:

### 1. **Vector Database (ChromaDB)**
- Stores transcript chunks with embeddings
- Enables semantic search
- Fast similarity queries

### 2. **Metadata Structure**
Each chunk stores:
```typescript
{
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  text: string;
  startTime: number;  // milliseconds
  endTime: number;
  timestamp: string;  // "12:34"
  chunkIndex: number;
  metadata: {
    channelTitle: string;
    thumbnailUrl: string;
    segmentCount: number;
  }
}
```

### 3. **Chunking Strategy**
- Default chunk size: 1000 characters
- Overlap: 200 characters (preserves context)
- Maintains timestamp information
- Each chunk is independently searchable

## Advanced Features

### Extract Structured Insights

You can further process transcripts to extract:

```typescript
// Example: Extract pain points
async function extractPainPoints(videoId: string) {
  const results = await fetch('http://localhost:3000/api/youtube/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'problems challenges pain points difficulties struggled',
      limit: 10,
    }),
  });

  // Use Claude to categorize and extract structured data
  // Store in a separate database table
}
```

### Build Analytics Dashboard

Aggregate insights across all videos:
- Most mentioned features
- Common price points
- Recurring themes
- Timeline of product evolution

## Rate Limiting & Best Practices

1. **Rate Limiting**: Built-in 1-second delay between video requests
2. **Batch Processing**: Process embeddings in batches of 10
3. **Error Handling**: Continues processing even if some videos fail
4. **Progress Tracking**: Console logs show real-time progress

## Troubleshooting

### No Transcript Available
Some videos don't have transcripts. The system will:
- Log an error
- Skip to the next video
- Continue processing

### ChromaDB Connection Failed
Ensure Docker is running:
```bash
docker-compose ps
```

### Out of Memory
If processing large channels, reduce batch size in `youtube-vectorstore.ts`

## Next Steps

1. **Provide your YouTube channel URL** and I'll help you scrape it
2. **Set up Claude API** integration for the chat endpoint
3. **Build a frontend** using the search and chat APIs
4. **Create structured analytics** by categorizing insights

What channel would you like to scrape?
