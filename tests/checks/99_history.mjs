// Checks for the monthly history workbook (tools/monthly_history.py), built
// for RAC each month from the master sheet and the aggregated Eploy import
// (EM decision, 25 September 2026).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../lib/planner.mjs';

function python(args) {
  for (const exe of ['python', 'python3']) {
    const r = spawnSync(exe, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    if (!r.error) return r;
  }
  return null;
}

export default function (check, { assert }) {
  check('Monthly history: groupings, formulas and safeguards on a made-up master sheet', () => {
    const r = python(['tests/tools/test_monthly_history.py']);
    if (!r) return 'SKIPPED: Python not found';
    const lines = (r.stdout || '').trim().split(/\r?\n/);
    assert(r.status === 0, 'failed:\n' + lines.filter(l => l.startsWith('FAIL')).join('\n') + (r.stderr || ''));
    return `${lines.filter(l => l.startsWith('PASS')).length} cases: every row in one group, figures in the right columns, month status, ` +
      'formulas on their own row, no campaign names, check mode writes nothing, a missing column stops it, output checks refuse a bad workbook';
  });

  check('Monthly history: the current master sheet builds and adds back to its totals', () => {
    const dir = process.env.RAC_PACING_DIR;
    if (!dir) return 'SKIPPED: set RAC_PACING_DIR to the data folder, which holds the master sheet (never committed)';
    const file = fs.readdirSync(dir).find(f => /master sheet.*\.xlsx$/i.test(f));
    if (!file) return 'SKIPPED: no master sheet (".. Master Sheet.xlsx") in RAC_PACING_DIR';
    const r = python(['tools/monthly_history.py', path.join(dir, file), '--check']);
    if (!r) return 'SKIPPED: Python not found';
    const out = (r.stdout || '').trim();
    assert(r.status === 0, out + (r.stderr || ''));
    return out.split(/\r?\n/)[0] + '; every row counted once; passed the output checks';
  });
}
