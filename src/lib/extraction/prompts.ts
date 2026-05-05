/**
 * LLM prompts for entity extraction from Starter Story transcripts
 */

export const SYSTEM_PROMPT = `You are an expert at extracting structured information from startup founder interviews.

Your task is to analyze transcripts from the Starter Story YouTube channel and extract:
- Founder information (background, technical skills, team size)
- Startup details (product type, niche, stage)
- Growth strategies used (with specific details)
- Tools and platforms mentioned
- Concrete outcomes (users, revenue, timeline)
- Step-by-step workflows when described

IMPORTANT RULES:
1. Only extract information that is explicitly stated
2. Use exact numbers when mentioned (e.g., "$10K/month", "1,000 users")
3. If something is unclear or not mentioned, omit it
4. Focus on ACTIONABLE information (what they did, how they did it)
5. Workflows must be step-by-step processes, not vague strategies

Output valid JSON matching the provided schema.`;

export const EXTRACTION_PROMPT = (transcript: string) => `
Analyze this Starter Story transcript and extract structured entities:

TRANSCRIPT:
${transcript}

Extract the following in JSON format:

{
  "founder": {
    "name": "founder name if mentioned",
    "type": "solo or team",
    "technical": true/false,
    "background": "previous experience"
  },
  "startup": {
    "name": "product name",
    "type": "SaaS | mobile app | marketplace | etc",
    "niche": "specific market",
    "stage": "idea | MVP | growth | scale"
  },
  "strategies": [
    {
      "name": "strategy name (e.g., SEO, Product Hunt)",
      "category": "content marketing | paid ads | SEO | etc",
      "details": "HOW they executed this",
      "success": true/false,
      "timeToResults": "how long until results"
    }
  ],
  "tools": [
    {
      "name": "tool name",
      "category": "framework | database | hosting | etc",
      "purpose": "why they used it"
    }
  ],
  "outcomes": {
    "users": number if mentioned,
    "revenue": monthly revenue in USD,
    "timeline": "time taken to reach this"
  },
  "workflows": [
    {
      "name": "workflow name",
      "goal": "what this achieves",
      "steps": [
        {
          "order": 1,
          "action": "what to do",
          "details": "how to do it"
        }
      ],
      "outcome": "result achieved"
    }
  ],
  "keyInsights": ["important takeaway 1", "takeaway 2"]
}

CRITICAL:
- Extract workflows ONLY when a clear step-by-step process is described
- Be specific in strategy details (not just "used SEO" but HOW they did SEO)
- Use exact numbers from the transcript
- If founder name not mentioned, use the startup name or "Unknown"
`;

export const FEW_SHOT_EXAMPLE = `
EXAMPLE INPUT:
"I built a SaaS called EmailThing that helps businesses automate cold outreach. I'm a solo developer with a background in sales. I started by building an MVP in Next.js and Supabase, took about 2 weeks. Then I posted on Reddit in r/entrepreneur and got my first 10 signups. I spent $200 on Google Ads targeting 'cold email software' and that brought in 50 more users. After 3 months, I hit $5K MRR with 100 paying customers."

EXAMPLE OUTPUT:
{
  "founder": {
    "name": "Unknown",
    "type": "solo",
    "technical": true,
    "background": "sales background, developer"
  },
  "startup": {
    "name": "EmailThing",
    "type": "SaaS",
    "niche": "cold email automation for businesses",
    "stage": "growth"
  },
  "strategies": [
    {
      "name": "Reddit marketing",
      "category": "community",
      "details": "Posted in r/entrepreneur subreddit",
      "success": true,
      "timeToResults": "immediate - first 10 signups"
    },
    {
      "name": "Google Ads",
      "category": "paid ads",
      "details": "Targeted keyword 'cold email software', spent $200",
      "success": true,
      "timeToResults": "brought 50 users"
    }
  ],
  "tools": [
    {
      "name": "Next.js",
      "category": "framework",
      "purpose": "build the application"
    },
    {
      "name": "Supabase",
      "category": "database",
      "purpose": "backend and database"
    }
  ],
  "outcomes": {
    "users": 100,
    "revenue": 5000,
    "timeline": "3 months"
  },
  "workflows": [
    {
      "name": "MVP to first customers",
      "goal": "Launch and get initial traction",
      "steps": [
        {
          "order": 1,
          "action": "Build MVP",
          "details": "Used Next.js and Supabase, took 2 weeks"
        },
        {
          "order": 2,
          "action": "Launch on Reddit",
          "details": "Posted in r/entrepreneur subreddit"
        },
        {
          "order": 3,
          "action": "Run paid ads",
          "details": "Google Ads targeting 'cold email software', $200 budget"
        }
      ],
      "outcome": "100 paying customers, $5K MRR in 3 months"
    }
  ],
  "keyInsights": [
    "Built MVP in 2 weeks with Next.js and Supabase",
    "Reddit provided first validation and signups",
    "Paid ads ($200) brought 50 users",
    "Reached $5K MRR in 3 months with 100 customers"
  ]
}
`;

export function buildExtractionPrompt(transcript: string): string {
  return `${SYSTEM_PROMPT}

${FEW_SHOT_EXAMPLE}

Now extract from this new transcript:

${EXTRACTION_PROMPT(transcript)}`;
}
