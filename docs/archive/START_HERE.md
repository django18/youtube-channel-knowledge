# 🎬 START HERE - Scrape Starter Story in 3 Steps

## ✅ System Status

- ✅ ChromaDB: Running on port 8000
- ✅ Code: Ready to scrape
- 🔄 API Server: Need to start

## Quick Start (3 Commands)

### 1. Start the API Server

Open a terminal and run:

```bash
cd /Users/avinashdangi/Desktop/personal/web-scraper-vector-db
bun run dev
```

Keep this running in the background.

### 2. Scrape Starter Story (New Terminal)

Open a **new terminal** and run:

```bash
cd /Users/avinashdangi/Desktop/personal/web-scraper-vector-db
bun run scripts/scrape-starter-story.ts 30
```

This will:
- Scrape 30 Starter Story videos (~3 minutes)
- Extract and chunk transcripts
- Generate embeddings (local, no API needed)
- Store in ChromaDB vector database
- Run example searches for insights

### 3. Search for Insights

Once scraping completes, try searching:

```bash
curl -X POST http://localhost:3000/api/youtube/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How did they get their first customers?",
    "limit": 5
  }' | jq
```

## What You'll Get

After scraping 30 videos, you'll have access to:

✅ **Customer Acquisition Strategies**
- How founders got first 10, 100, 1000 customers
- Which marketing channels worked
- Validation tactics before building

✅ **Revenue Insights**
- Revenue numbers and timelines
- When founders reached profitability
- Growth strategies that worked

✅ **Product Development**
- MVP scope and features
- How long it took to build
- Common mistakes to avoid

✅ **Pricing Strategies**
- How founders set prices
- Pricing models that work
- When to increase prices

✅ **Lessons Learned**
- Biggest challenges faced
- Mistakes made and avoided
- What they'd do differently

## Example Searches

Try these queries after scraping:

```bash
# Customer acquisition
curl -X POST http://localhost:3000/api/youtube/search \
  -H "Content-Type: application/json" \
  -d '{"query": "first customers marketing channel", "limit": 5}'

# Revenue numbers
curl -X POST http://localhost:3000/api/youtube/search \
  -H "Content-Type: application/json" \
  -d '{"query": "how much revenue making per month MRR", "limit": 5}'

# Mistakes to avoid
curl -X POST http://localhost:3000/api/youtube/search \
  -H "Content-Type: application/json" \
  -d '{"query": "mistake regret wish I had not", "limit": 5}'

# Pricing insights
curl -X POST http://localhost:3000/api/youtube/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pricing strategy how much charge", "limit": 5}'
```

## Troubleshooting

### "ECONNREFUSED"
**Problem**: API server not running
**Solution**: Run `bun run dev` in a terminal

### "ChromaDB connection failed"
**Problem**: ChromaDB not running
**Solution**: Run `docker-compose up -d`

### "No transcript available"
**Problem**: Some videos don't have captions
**Solution**: Normal - system skips these and continues

## What's Next?

1. **Scrape more videos** - Try 50 or 100 for deeper insights
2. **Use AI analysis** - Integrate with Claude API (see `scripts/ai-analysis.ts`)
3. **Build a dashboard** - Create a web UI for easy searching
4. **Extract patterns** - Use AI to categorize and summarize insights

## Documentation

- `STARTER_STORY_GUIDE.md` - Detailed guide with query examples
- `YOUTUBE_GUIDE.md` - Complete API documentation
- `SETUP.md` - Full setup instructions
- `SUMMARY.md` - System overview

## Ready to Start?

Just run these two commands:

```bash
# Terminal 1: Start server
bun run dev

# Terminal 2: Start scraping
bun run scripts/scrape-starter-story.ts 30
```

**That's it!** The system will handle everything else. ⚡

---

**Estimated time:** 3-5 minutes for 30 videos
**Storage:** ~10-15MB for 30 videos
**Next scrape:** Add more videos anytime with the same command
