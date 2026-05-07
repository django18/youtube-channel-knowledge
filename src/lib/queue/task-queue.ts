import { getRedis } from './redis';
import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job<T = any> {
  id: string;
  type: 'scrape-video' | 'scrape-channel';
  payload: T;
  status: JobStatus;
  progress: number;
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const JOBS_KEY = 'knowledge_engine:jobs';
const QUEUE_KEY = 'knowledge_engine:queue';

/**
 * Push a new job to the queue
 */
export async function enqueueJob(type: Job['type'], payload: any): Promise<string> {
  const redis = getRedis();
  const id = uuidv4();
  
  const job: Job = {
    id,
    type,
    payload,
    status: 'pending',
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Store job details
  await redis.hset(JOBS_KEY, id, JSON.stringify(job));
  
  // Push to queue
  await redis.lpush(QUEUE_KEY, id);
  
  return id;
}

/**
 * Get job status and details
 */
export async function getJobStatus(id: string): Promise<Job | null> {
  const redis = getRedis();
  const data = await redis.hget(JOBS_KEY, id);
  return data ? JSON.parse(data) : null;
}

/**
 * Update job status/progress
 */
export async function updateJob(id: string, updates: Partial<Job>): Promise<void> {
  const redis = getRedis();
  const existing = await getJobStatus(id);
  
  if (existing) {
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await redis.hset(JOBS_KEY, id, JSON.stringify(updated));
  }
}

/**
 * Pop the next job from the queue
 */
export async function popNextJob(): Promise<Job | null> {
  const redis = getRedis();
  const id = await redis.rpop(QUEUE_KEY);
  
  if (!id) return null;
  
  const job = await getJobStatus(id);
  if (job) {
    await updateJob(id, { status: 'processing' });
    return { ...job, status: 'processing' };
  }
  
  return null;
}
