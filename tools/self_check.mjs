import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [snapshotPath, boardPath] = process.argv.slice(2);
assert(snapshotPath && boardPath, 'Usage: node tools/self_check.mjs <snapshot.json> <board.json>');
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const { rows } = JSON.parse(readFileSync(boardPath, 'utf8'));
const watchlist = new Set(snapshot.watchlist);
const excludedCategory = category => /Bridge/.test(category ?? '')
  || ['CEX', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC'].includes(category);
const expectedSlugs = new Set(snapshot.protocols
  .filter(protocol => protocol.gecko_id === null && protocol.symbol === null)
  .filter(({ category, name }) => !excludedCategory(category)
    && !/\s(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i.test(name)
    && !/\b(?:wrapped|staked|staking)\b/i.test(name)
    && !/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i.test(name))
  .map(protocol => protocol.slug));
assert(Array.isArray(rows) && rows.length >= 100 && rows.length <= 4000, 'Board row count must be 100–4000');
assert.equal(rows.length, expectedSlugs.size, 'Board must include every eligible protocol');

const seen = new Set();
const ranks = [];
let previousValue = Infinity;
let shortestStep = Infinity;
let longestStep = 0;
let fewestSteps = Infinity;
let mostSteps = 0;
for (const row of rows) {
  assert(expectedSlugs.has(row.slug) && !seen.has(row.slug), `Invalid or duplicate slug: ${row.slug}`);
  seen.add(row.slug);
  assert(!excludedCategory(row.category), `Excluded category for ${row.slug}`);
  assert.equal(row.watchlist, watchlist.has(row.slug), `Incorrect watchlist flag for ${row.slug}`);
  assert(Number.isFinite(row.multiple_used) && row.multiple_used <= 2, `Invalid multiple for ${row.slug}`);
  ranks.push(row.rank);
  assert(Number.isFinite(row.implied_value_usd) && row.implied_value_usd > 0, `Invalid value for ${row.slug}`);
  assert(row.implied_value_usd <= previousValue, `Value increased at rank ${row.rank}`);
  previousValue = row.implied_value_usd;
  assert(Array.isArray(row.farm_steps) && row.farm_steps.length >= 3 && row.farm_steps.length <= 12,
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
assert.deepEqual(ranks, rows.map((_, index) => index + 1), 'Ranks must be exactly 1 through N');
assert.equal(new Set(rows.map(row => row.implied_value_usd)).size, rows.length, 'Implied values must be distinct');
for (const slug of snapshot.watchlist) assert(seen.has(slug), `Missing watchlist slug: ${slug}`);

console.log(`PASS: ${rows.length} eligible rows, ${snapshot.watchlist.length}/${snapshot.watchlist.length} watchlist coverage`);
console.log(`PASS: ranks 1–${rows.length}, positive and distinct values non-increasing by rank`);
console.log(`PASS: no CEX or Bridge-category rows, highest row multiple ${Math.max(...rows.map(row => row.multiple_used))}`);
console.log(`PASS: ${fewestSteps}–${mostSteps} farm steps per row, ${shortestStep}–${longestStep} characters per step`);
