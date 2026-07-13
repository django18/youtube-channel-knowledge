import { describe, expect, test } from 'bun:test';
import { contextCacheKey, QueryContextSchema } from './context';

describe('QueryContextSchema', () => {
  test('accepts empty context', () => {
    expect(QueryContextSchema.parse({})).toEqual({});
  });

  test('accepts full valid context', () => {
    const context = {
      founderType: 'solo',
      technical: true,
      stage: 'MVP',
      startupType: 'SaaS',
      businessModel: 'subscription',
      budget: 'low',
      goal: 'first customers',
    } as const;
    expect(QueryContextSchema.parse(context)).toEqual(context);
  });

  test('rejects invalid founderType', () => {
    expect(() => QueryContextSchema.parse({ founderType: 'duo' })).toThrow();
  });

  test('rejects invalid stage', () => {
    expect(() => QueryContextSchema.parse({ stage: 'unicorn' })).toThrow();
  });
});

describe('contextCacheKey', () => {
  test('empty context maps to "all"', () => {
    expect(contextCacheKey({})).toBe('all');
  });

  test('is stable regardless of property order', () => {
    const a = contextCacheKey({ founderType: 'solo', stage: 'MVP' });
    const b = contextCacheKey({ stage: 'MVP', founderType: 'solo' });
    expect(a).toBe(b);
  });

  test('excludes goal from the key', () => {
    const withGoal = contextCacheKey({ founderType: 'solo', goal: 'first customers' });
    const withoutGoal = contextCacheKey({ founderType: 'solo' });
    expect(withGoal).toBe(withoutGoal);
  });

  test('includes boolean dimensions', () => {
    expect(contextCacheKey({ technical: true })).toBe('technical=true');
  });

  test('different contexts produce different keys', () => {
    expect(contextCacheKey({ founderType: 'solo' })).not.toBe(
      contextCacheKey({ founderType: 'team' })
    );
  });
});
