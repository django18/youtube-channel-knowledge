import { Hono } from 'hono';
import { loadHistory, loadLatest, runEval, formatReport } from '../eval/runner';

const router = new Hono();

/**
 * POST /api/eval/run
 * body: { goldenPath?: string, skip?: {...} }
 */
router.post('/run', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as any;
    const report = await runEval(body);
    return c.json({ success: true, report });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message ?? String(err) }, 500);
  }
});

/**
 * GET /api/eval/latest
 * Returns last report. Optional ?format=markdown for human-readable.
 */
router.get('/latest', async (c) => {
  const report = await loadLatest();
  if (!report) return c.json({ success: false, error: 'no eval has run yet' }, 404);

  const format = c.req.query('format');
  if (format === 'markdown') {
    return c.text(formatReport(report));
  }
  return c.json({ success: true, report });
});

/**
 * GET /api/eval/history?limit=20
 * Returns recent reports (descending by timestamp).
 */
router.get('/history', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '20', 10);
  const reports = await loadHistory(limit);
  return c.json({ success: true, count: reports.length, reports });
});

export default router;
