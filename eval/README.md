# Eval Framework

End-to-end quality measurement for the YouTube knowledge engine.

## What it measures

| Category | Metric | What it tells you |
|----------|--------|-------------------|
| Embedding (intrinsic) | Triplet accuracy + margin | Whether the embedder encodes semantic similarity for *your* domain. If accuracy < 80% or margin < 0.05, the embedder is the bottleneck. |
| Retrieval (extrinsic) | Recall@1/5/10, Precision@5/10, MRR, nDCG@10, latency p50/p95 | Whether ChromaDB returns the right chunks for a query, ranked correctly, fast enough. |
| Graph | Entity recall + precision per label, missing entities | Whether the dual-memory pipeline can surface the right Startup/Tool/Strategy/Founder for a question. |

A weighted **composite score** rolls these up. Default weights: embedding 0.2, retrieval 0.5, graph 0.3. Skipped categories renormalize.

## Golden set format

`eval/golden.jsonl` — one JSON object per line. Each case can exercise one or more sub-evals:

```jsonl
{"id":"q1","query":"how to find first 10 customers","relevantChunkIds":["abc_0","abc_2"]}
{"id":"q2","query":"low budget marketing","expectedEntities":{"strategies":["cold outreach","SEO"],"tools":["Twitter"]}}
{"id":"q3","triplet":{"anchor":"customer acquisition","positive":"first paying users","negative":"kubernetes networking"}}
```

Field cheat sheet:
- `query` + `relevantChunkIds` → retrieval eval
- `query` + `expectedEntities` → graph eval
- `triplet` → embedding eval
- One case can have all three

## Run

```bash
# CLI (writes report to eval/results/, prints markdown to stdout)
bun run eval

# Custom golden file
bun run eval ./eval/my-golden.jsonl

# HTTP (server must be running)
curl -X POST http://localhost:3000/api/eval/run
curl http://localhost:3000/api/eval/latest?format=markdown
curl http://localhost:3000/api/eval/history?limit=20
```

## Bootstrap golden cases from scraped data

After scraping some YouTube channels, auto-generate domain-specific golden cases:

```bash
export OPENAI_API_KEY=sk-...
export BOOTSTRAP_SAMPLE=20      # how many chunks to sample
bun run eval:bootstrap
```

This:
1. Samples N chunks from ChromaDB.
2. Asks GPT-4o-mini to write 2 queries each chunk should answer.
3. Looks up the source video's entities in Neo4j → adds as expected entities.
4. Builds embedding triplets from same-video / different-video chunk pairs.
5. Appends results to `eval/golden.jsonl`.

**Always review auto-generated cases before trusting them.** LLM-generated queries can be ambiguous, leading or off-topic.

## Composite score interpretation

| Score | Meaning |
|-------|---------|
| > 0.85 | Production-grade. Synthesizer can rely on retrieval. |
| 0.65–0.85 | Usable. Some drift on edge queries. Investigate worst per-query results. |
| 0.45–0.65 | Marginal. Tune chunk size, switch embedder, or add a re-ranker. |
| < 0.45 | Broken. Check that golden cases reference chunks that actually exist; check provider/dim lock. |

## Troubleshooting

**Retrieval recall = 0**: golden `relevantChunkIds` reference IDs that don't exist in the collection. Re-run bootstrap, or check chunk-id format.

**Graph recall = 0**: either no entities have been extracted yet (run `/api/youtube/scrape-channel` first), or expected entity names don't match what was extracted (case/whitespace handled, but exact spelling matters).

**Latency p95 > 1000ms**: ChromaDB cold-start cost. Run a warm-up query first, or measure after at least 5 queries.
