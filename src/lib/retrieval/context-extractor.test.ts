import { describe, expect, test } from 'bun:test';
import { heuristicContext } from './context-extractor';

describe('heuristicContext', () => {
  test('detects solo technical SaaS founder at idea stage', () => {
    const context = heuristicContext(
      'I am a solo developer, how do I validate my SaaS idea?'
    );
    expect(context.founderType).toBe('solo');
    expect(context.technical).toBe(true);
    expect(context.startupType).toBe('SaaS');
    expect(context.stage).toBe('idea');
  });

  test('detects team and growth stage', () => {
    const context = heuristicContext(
      'My co-founders and I want to grow our marketplace'
    );
    expect(context.founderType).toBe('team');
    expect(context.stage).toBe('growth');
    expect(context.startupType).toBe('marketplace');
  });

  test('detects non-technical and free budget', () => {
    const context = heuristicContext(
      "I can't code and have no budget, how do I start?"
    );
    expect(context.technical).toBe(false);
    expect(context.budget).toBe('free');
  });

  test('detects mobile app', () => {
    const context = heuristicContext('How to market an iOS app?');
    expect(context.startupType).toBe('mobile app');
  });

  test('returns empty context for unrelated question', () => {
    const context = heuristicContext('What is the weather today?');
    expect(context).toEqual({});
  });
});
