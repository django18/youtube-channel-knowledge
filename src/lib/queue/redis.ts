import Redis from 'ioredis';
import { config } from '../../config';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    // Default to localhost if not specified
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(url);
    
    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
  }
  return redis;
}
