import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [snapshotPath, boardPath] = process.argv.slice(2);
assert(snapshotPath && boardPath, 'Usage: node tools/self_check.mjs <snapshot.json> <board.json>');
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const { rows } = JSON.parse(readFileSync(boardPath, 'utf8'));
const watchlist = new Set(snapshot.watchlist);
const excludedCategory = category => /Bridge/.test(category ?? '')
  || ['CEX', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC'].includes(category);
const eligible = new Map(snapshot.protocols
  .filter(protocol => protocol.gecko_id === null && protocol.symbol === null)
  .filter(({ category, name }) => !excludedCategory(category)
    && !/\s(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i.test(name)
    && !/\b(?:wrapped|staked|staking)\b/i.test(name)
    && !/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i.test(name))
  .map(protocol => [protocol.slug, protocol]));
assert(Array.isArray(rows) && rows.length >= 100 && rows.length <= 4000, 'Board row count must be 100–4000');
assert.equal(rows.length, eligible.size, 'Board must include every eligible protocol');

const seen = new Set();
let previous;
let shortestStep = Infinity;
let longestStep = 0;
let fewestSteps = Infinity;
let mostSteps = 0;
for (const [index, row] of rows.entries()) {
  assert(row && typeof row === 'object', `Invalid board row at rank ${index + 1}`);
  const protocol = eligible.get(row.slug);
  assert(protocol && !seen.has(row.slug), `Invalid or duplicate slug: ${row.slug}`);
  seen.add(row.slug);
  for (const field of ['name', 'category', 'chains', 'tvl_usd', 'change_7d', 'listed_at']) {
    assert.deepEqual(row[field], protocol[field], `Incorrect ${field} for ${row.slug}`);
  }
  const age = protocol.listed_at === null ? 365
    : (Date.parse(snapshot.as_of) - Date.parse(protocol.listed_at)) / 86_400_000;
  assert.equal(row.age_days, age, `Incorrect age for ${row.slug}`);
  assert.equal(row.watchlist, watchlist.has(row.slug), `Incorrect watchlist flag for ${row.slug}`);
  assert.equal(row.rank, index + 1, `Incorrect rank for ${row.slug}`);
  assert(Number.isInteger(row.implied_value_usd) && row.implied_value_usd >= 1, `Invalid value for ${row.slug}`);
  for (const field of ['launch_value_usd', 'range_low_usd', 'range_high_usd']) {
    assert(Number.isInteger(row[field]) && row[field] >= 0, `Invalid ${field} for ${row.slug}`);
  }
  assert(row.range_low_usd <= row.range_high_usd, `Reversed range for ${row.slug}`);
  assert(Number.isFinite(row.odds) && row.odds >= 0.01 && row.odds <= 0.99
    && row.odds === Number(row.odds.toFixed(4)), `Invalid odds for ${row.slug}`);
  if (previous) {
    assert(previous.implied_value_usd > row.implied_value_usd
      || (previous.implied_value_usd === row.implied_value_usd && (previous.tvl_usd > row.tvl_usd
        || (previous.tvl_usd === row.tvl_usd && previous.slug < row.slug))),
    `Incorrect sort order at rank ${row.rank}`);
  }
  previous = row;

  const budget = row.tvl_usd >= 500_000_000 ? 10_000 : row.tvl_usd >= 100_000_000 ? 5_000
    : row.tvl_usd >= 50_000_000 ? 2_500 : 1_500;
  assert.equal(row.farm_budget_usd, budget, `Incorrect farm budget for ${row.slug}`);
  assert(Number.isInteger(row.farm_net_usd), `Invalid farm net for ${row.slug}`);
  const perHour = Math.round(row.farm_net_usd / 6.3 * 10) / 10;
  assert(Number.isFinite(row.farm_per_hour_usd) && row.farm_per_hour_usd === perHour,
    `Incorrect farm value per hour for ${row.slug}`);
  const verdict = row.farm_net_usd >= 150 && perHour >= 20 ? 'Farm'
    : row.farm_net_usd > 0 ? 'Marginal' : 'Skip';
  assert.equal(row.verdict, verdict, `Incorrect farm verdict for ${row.slug}`);
  const expectedSteps = row.slug === 'onre' || row.slug === 'plume-vaults' ? 6 : 5;
  assert(Array.isArray(row.farm_steps) && row.farm_steps.length === expectedSteps,
    `Invalid step count for ${row.slug}`);
  fewestSteps = Math.min(fewestSteps, row.farm_steps.length);
  mostSteps = Math.max(mostSteps, row.farm_steps.length);
  for (const step of row.farm_steps) {
    assert(typeof step === 'string', `Invalid step for ${row.slug}`);
    const length = step.trim().length;
    assert(length >= 20 && length <= 600, `Invalid step length for ${row.slug}`);
    shortestStep = Math.min(shortestStep, length);
    longestStep = Math.max(longestStep, length);
  }
}
for (const slug of snapshot.watchlist) assert(seen.has(slug), `Missing watchlist slug: ${slug}`);

console.log(`PASS: ${rows.length} eligible rows, ${snapshot.watchlist.length}/${snapshot.watchlist.length} watchlist coverage`);
console.log(`PASS: ranks 1–${rows.length}, positive implied values sorted with TVL and slug tie-breakers`);
console.log('PASS: v2 row metadata, odds, ranges, farm budgets, hourly values, and verdicts');
console.log(`PASS: ${fewestSteps}–${mostSteps} farm steps per row, ${shortestStep}–${longestStep} characters per step`);
