# 🎥 YouTube Transcript RAG System for SaaS Building

A powerful system to scrape YouTube channel videos, extract transcripts, and use them as a knowledge base for building SaaS products. Perfect for analyzing user interviews, competitor research, and educational content.

## 🚀 Quick Start

### 1. Start ChromaDB
```bash
docker-compose up -d
```

### 2. Start the Server
```bash
bun run dev
```

### 3. Scrape Your First Channel
```bash
curl -X POST http://localhost:3000/api/youtube/scrape-channel \
  -H "Content-Type: application/json" \
  -d '{
    "channelUrl": "https://www.youtube.com/@IndieHackers",
    "maxVideos": 10,
    "storeInDB": true
  }'
```

### 4. Search the Transcripts
```bash
curl -X POST http://localhost:3000/api/youtube/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What problems do users face?",
    "limit": 5
  }'
```

## 📚 Full Documentation

See [YOUTUBE_GUIDE.md](./YOUTUBE_GUIDE.md) for complete documentation including:
- All API endpoints
- Example scripts
- Use cases for SaaS building
- Advanced features
- Troubleshooting

## 🎯 Key Features

✅ **No API Key Required** - Uses unofficial transcript API and RSS feeds
✅ **Semantic Search** - Find relevant content using natural language
✅ **RAG Integration** - Ready for AI chat applications
✅ **Smart Chunking** - Maintains context with overlap
✅ **Timestamp Links** - Jump directly to relevant moments
✅ **Batch Processing** - Handle entire channels efficiently

## 📊 Use Cases

### 1. User Research Database
Scrape channels with user interviews to understand:
- Pain points and problems
- Feature requests
- Pricing expectations
- Real-world use cases

### 2. Competitive Intelligence
Analyze competitor demos and content:
- Feature comparisons
- Market positioning
- User feedback on competitors

### 3. Knowledge Base
Build from educational content:
- Startup advice (Y Combinator)
- Founder stories (Indie Hackers)
- Product management insights

### 4. AI Training Data
Use transcripts to:
- Train custom assistants
- Build domain-specific chatbots
- Power RAG applications

## 🏗️ Architecture

```
┌─────────────────┐
│  YouTube API    │
│   (RSS Feed)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Transcript     │
│   Extractor     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Text Chunker   │
│  (with overlap) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Embeddings     │
│  (@xenova/      │
│  transformers)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   ChromaDB      │
│  Vector Store   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Semantic       │
│  Search API     │
└─────────────────┘
```

## 🛠️ Tech Stack

- **Runtime**: Bun
- **Framework**: Elysia/Hono
- **Vector DB**: ChromaDB
- **Embeddings**: Transformers.js (local, no API needed)
- **Transcript API**: youtube-transcript

## 📋 Example Queries for SaaS Building

```typescript
// Pain points
"What problems do users face?"
"What frustrates customers the most?"
"Why do users struggle with existing solutions?"

// Feature requests
"What features do users want?"
"What would make the product better?"
"What capabilities are missing?"

// Pricing
"How much are users willing to pay?"
"What pricing model do customers prefer?"
"What's the perceived value?"

// Competition
"Why did users switch from competitors?"
"What do competitors lack?"
"What makes this product different?"

// Success stories
"What results did users achieve?"
"How did the product help users?"
"What outcomes matter most?"
```

## 📈 Storage Strategy

### Vector Database
- Transcript chunks with embeddings
- Semantic similarity search
- Fast retrieval (~100ms)

### Metadata Tracking
- Video ID, title, URL
- Channel information
- Timestamps (with direct links)
- Chunk indices

### Chunking Logic
- Size: 1000 characters (configurable)
- Overlap: 200 characters
- Preserves context across boundaries
- Maintains timestamp accuracy

## 🔄 Workflow Example

```typescript
// 1. Scrape channel
const scrapeResult = await fetch('/api/youtube/scrape-channel', {
  method: 'POST',
  body: JSON.stringify({
    channelUrl: 'https://www.youtube.com/@YourChannel',
    maxVideos: 50
  })
});

// 2. Search for insights
const searchResult = await fetch('/api/youtube/search', {
  method: 'POST',
  body: JSON.stringify({
    query: 'user pain points with onboarding'
  })
});

// 3. Use with AI (Claude, GPT-4, etc.)
const chatResult = await fetch('/api/youtube/chat', {
  method: 'POST',
  body: JSON.stringify({
    question: 'What are common onboarding issues?'
  })
});

// 4. Send context to LLM for answer
const answer = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  messages: [{
    role: 'user',
    content: `${chatResult.contextText}\n\nQuestion: ${question}`
  }]
});
```

## 🎓 Getting Started Guide

### Step 1: Choose Your Channel

Pick a YouTube channel with content relevant to your SaaS:
- **User Interviews**: Direct feedback channels
- **Product Reviews**: Tech review channels
- **Educational**: Startup/SaaS advice channels
- **Competitor Channels**: Feature demos and updates

### Step 2: Scrape the Content

Start with a small batch (10-20 videos) to test:
```bash
bun run example
```

### Step 3: Explore with Search

Try different queries to understand what you have:
- Broad: "What do users want?"
- Specific: "Payment processing issues"
- Temporal: "Getting started challenges"

### Step 4: Build Your Application

Use the search/chat endpoints to:
- Power a chatbot
- Generate insights dashboard
- Create automated reports
- Train custom models

## 🐛 Troubleshooting

**No transcripts found?**
- Some videos don't have captions
- Try a different channel
- Check if videos are public

**ChromaDB connection error?**
- Ensure Docker is running
- Check `docker-compose ps`
- Verify port 8000 is available

**Out of memory?**
- Reduce maxVideos parameter
- Process in smaller batches
- Adjust chunk size in config

## 🔜 Next Steps

After scraping your first channel:

1. **Analyze patterns** - What themes emerge?
2. **Categorize insights** - Group by topic/theme
3. **Build visualizations** - Show trends over time
4. **Integrate with AI** - Create automated summaries
5. **Share findings** - Generate reports

## 📝 License

MIT - Build awesome SaaS products with this!

---

**Ready to start?** Check out [YOUTUBE_GUIDE.md](./YOUTUBE_GUIDE.md) for detailed instructions!

**Need help?** Open an issue or check the troubleshooting section.

**Built something cool?** Share it with the community!
