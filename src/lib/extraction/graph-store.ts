import neo4j, { Driver } from 'neo4j-driver';
import { config } from '../../config';
import type { ExtractedEntities } from '../schemas/entities';

let driver: Driver | null = null;

/**
 * Get or initialize the Neo4j driver
 */
export function getNeo4jDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      config.neo4jUri,
      neo4j.auth.basic(config.neo4jUser, config.neo4jPassword)
    );
  }
  return driver;
}

/**
 * Close the Neo4j driver
 */
export async function closeNeo4jDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Save extracted entities to Neo4j
 */
export async function saveToGraph(entities: ExtractedEntities): Promise<void> {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const { videoId, videoTitle, videoUrl, founder, startup, strategies, tools, outcomes, workflows } = entities;

    // 1. Create Video Node
    await session.executeWrite(tx => 
      tx.run(
        'MERGE (v:Video {id: $videoId}) SET v.title = $videoTitle, v.url = $videoUrl RETURN v',
        { videoId, videoTitle, videoUrl }
      )
    );

    // 2. Create Startup Node
    if (startup) {
      await session.executeWrite(tx =>
        tx.run(
          `MERGE (s:Startup {name: $name}) 
           SET s.type = $type, s.niche = $niche, s.stage = $stage
           MERGE (v:Video {id: $videoId})
           MERGE (s)-[:MENTIONED_IN]->(v)
           RETURN s`,
          { ...startup, videoId }
        )
      );
    }

    // 3. Create Founder Node
    if (founder) {
      await session.executeWrite(tx =>
        tx.run(
          `MERGE (f:Founder {name: $name}) 
           SET f.type = $type, f.technical = $technical, f.background = $background
           MERGE (s:Startup {name: $startupName})
           MERGE (f)-[:FOUNDED]->(s)
           RETURN f`,
          { ...founder, startupName: startup.name }
        )
      );
    }

    // 4. Create Tool Nodes and Relationships
    for (const tool of tools) {
      await session.executeWrite(tx =>
        tx.run(
          `MERGE (t:Tool {name: $name}) 
           SET t.category = $category
           MERGE (s:Startup {name: $startupName})
           MERGE (s)-[:USED_TOOL {purpose: $purpose}]->(t)
           RETURN t`,
          { ...tool, startupName: startup.name, purpose: tool.purpose || '' }
        )
      );
    }

    // 5. Create Strategy Nodes and Relationships
    for (const strategy of strategies) {
      await session.executeWrite(tx =>
        tx.run(
          `MERGE (st:Strategy {name: $name}) 
           SET st.category = $category
           MERGE (s:Startup {name: $startupName})
           MERGE (s)-[:IMPLEMENTED_STRATEGY {details: $details, success: $success}]->(st)
           RETURN st`,
          { ...strategy, startupName: startup.name }
        )
      );
    }

    // 6. Create Outcome Node
    if (outcomes) {
      await session.executeWrite(tx =>
        tx.run(
          `MERGE (o:Outcome {videoId: $videoId}) 
           SET o.revenue = $revenue, o.users = $users, o.timeline = $timeline
           MERGE (s:Startup {name: $startupName})
           MERGE (s)-[:ACHIEVED_OUTCOME]->(o)
           RETURN o`,
          { ...outcomes, videoId, startupName: startup.name }
        )
      );
    }

    console.log(`✓ Successfully saved entities for ${videoId} to Graph Memory (Neo4j)`);

  } catch (error) {
    console.error(`✗ Failed to save entities to Neo4j for ${entities.videoId}:`, error);
    throw error;
  } finally {
    await session.close();
  }
}
