import neo4j, { Driver, ManagedTransaction } from 'neo4j-driver';
import { config } from '../../config';
import type { ExtractedEntities } from '../schemas/entities';

let driver: Driver | null = null;
let constraintsInitialized = false;

export function getNeo4jDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      config.neo4jUri,
      neo4j.auth.basic(config.neo4jUser, config.neo4jPassword)
    );
  }
  return driver;
}

export async function closeNeo4jDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
    constraintsInitialized = false;
  }
}

/**
 * Idempotent constraint setup. Runs once per process.
 * Composite keys: Founder(name+startup), Outcome(videoId+startup) prevent
 * collisions across unrelated videos.
 */
export async function initGraph(): Promise<void> {
  if (constraintsInitialized) return;

  const session = getNeo4jDriver().session();
  try {
    const statements = [
      'CREATE CONSTRAINT video_id IF NOT EXISTS FOR (v:Video) REQUIRE v.id IS UNIQUE',
      'CREATE CONSTRAINT startup_name IF NOT EXISTS FOR (s:Startup) REQUIRE s.name IS UNIQUE',
      'CREATE CONSTRAINT tool_name IF NOT EXISTS FOR (t:Tool) REQUIRE t.name IS UNIQUE',
      'CREATE CONSTRAINT strategy_name IF NOT EXISTS FOR (st:Strategy) REQUIRE st.name IS UNIQUE',
      'CREATE CONSTRAINT workflow_key IF NOT EXISTS FOR (w:Workflow) REQUIRE w.key IS UNIQUE',
      'CREATE CONSTRAINT founder_key IF NOT EXISTS FOR (f:Founder) REQUIRE f.key IS UNIQUE',
      'CREATE CONSTRAINT outcome_key IF NOT EXISTS FOR (o:Outcome) REQUIRE o.key IS UNIQUE',
    ];
    for (const stmt of statements) {
      await session.executeWrite(tx => tx.run(stmt));
    }
    constraintsInitialized = true;
    console.log('✓ Neo4j constraints initialized');
  } catch (error) {
    console.error('Failed to initialize Neo4j constraints:', error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Save extracted entities to Neo4j in a single atomic transaction.
 * Partial failure rolls back the entire write — no orphan nodes.
 */
export async function saveToGraph(entities: ExtractedEntities): Promise<void> {
  await initGraph();

  const { videoId, videoTitle, videoUrl, founder, startup, strategies, tools, outcomes, workflows } = entities;

  if (!startup?.name) {
    throw new Error(`saveToGraph: startup.name required for video ${videoId}`);
  }

  const startupName = startup.name;
  const session = getNeo4jDriver().session();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      await tx.run(
        'MERGE (v:Video {id: $videoId}) SET v.title = $videoTitle, v.url = $videoUrl',
        { videoId, videoTitle, videoUrl }
      );

      await tx.run(
        `MERGE (s:Startup {name: $name})
         SET s.type = $type, s.niche = $niche, s.stage = $stage,
             s.platform = $platform, s.businessModel = $businessModel
         WITH s
         MATCH (v:Video {id: $videoId})
         MERGE (s)-[:MENTIONED_IN]->(v)`,
        {
          name: startupName,
          type: startup.type ?? null,
          niche: startup.niche ?? null,
          stage: startup.stage ?? null,
          platform: startup.platform ?? null,
          businessModel: startup.businessModel ?? null,
          videoId,
        }
      );

      if (founder) {
        const founderKey = `${startupName}::${founder.name}`;
        await tx.run(
          `MERGE (f:Founder {key: $key})
           SET f.name = $name, f.type = $type, f.technical = $technical,
               f.background = $background, f.experience = $experience
           WITH f
           MATCH (s:Startup {name: $startupName})
           MERGE (f)-[:FOUNDED]->(s)`,
          {
            key: founderKey,
            name: founder.name,
            type: founder.type ?? null,
            technical: founder.technical ?? null,
            background: founder.background ?? null,
            experience: founder.experience ?? null,
            startupName,
          }
        );
      }

      for (const tool of tools ?? []) {
        await tx.run(
          `MERGE (t:Tool {name: $name})
           SET t.category = $category
           WITH t
           MATCH (s:Startup {name: $startupName})
           MERGE (s)-[r:USED_TOOL]->(t)
           SET r.purpose = $purpose`,
          {
            name: tool.name,
            category: tool.category ?? null,
            purpose: tool.purpose ?? '',
            startupName,
          }
        );
      }

      for (const strategy of strategies ?? []) {
        await tx.run(
          `MERGE (st:Strategy {name: $name})
           SET st.category = $category
           WITH st
           MATCH (s:Startup {name: $startupName})
           MERGE (s)-[r:IMPLEMENTED_STRATEGY]->(st)
           SET r.details = $details, r.success = $success,
               r.cost = $cost, r.timeToResults = $timeToResults`,
          {
            name: strategy.name,
            category: strategy.category ?? null,
            details: strategy.details ?? null,
            success: strategy.success ?? null,
            cost: strategy.cost ?? null,
            timeToResults: strategy.timeToResults ?? null,
            startupName,
          }
        );
      }

      if (outcomes) {
        const outcomeKey = `${videoId}::${startupName}`;
        await tx.run(
          `MERGE (o:Outcome {key: $key})
           SET o.videoId = $videoId, o.revenue = $revenue, o.users = $users,
               o.mrr = $mrr, o.timeline = $timeline,
               o.metric = $metric, o.value = $value
           WITH o
           MATCH (s:Startup {name: $startupName})
           MERGE (s)-[:ACHIEVED_OUTCOME]->(o)`,
          {
            key: outcomeKey,
            videoId,
            revenue: outcomes.revenue ?? null,
            users: outcomes.users ?? null,
            mrr: outcomes.mrr ?? null,
            timeline: outcomes.timeline ?? null,
            metric: outcomes.metric ?? null,
            value: outcomes.value ?? null,
            startupName,
          }
        );
      }

      for (const workflow of workflows ?? []) {
        const workflowKey = `${startupName}::${workflow.name}`;
        await tx.run(
          `MERGE (w:Workflow {key: $key})
           SET w.name = $name, w.goal = $goal, w.outcome = $outcome,
               w.steps = $steps, w.successFactors = $successFactors
           WITH w
           MATCH (s:Startup {name: $startupName})
           MERGE (s)-[:HAS_WORKFLOW]->(w)`,
          {
            key: workflowKey,
            name: workflow.name,
            goal: workflow.goal ?? null,
            outcome: workflow.outcome ?? null,
            steps: JSON.stringify(workflow.steps ?? []),
            successFactors: workflow.successFactors ?? [],
            startupName,
          }
        );
      }
    });

    console.log(`✓ Saved entities for ${videoId} to Neo4j (atomic)`);
  } catch (error) {
    console.error(`✗ Failed to save entities to Neo4j for ${videoId} (rolled back):`, error);
    throw error;
  } finally {
    await session.close();
  }
}
