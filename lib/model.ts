const FARM_ALLOC_SHARE = 0.10;
const FARM_PARTICIPATION_RATE = 0.10;
const FARM_PARTICIPATION_FLOOR_USD = 2_000_000;
const FARM_HOURS = 6.3; // 1.5 hours setup, 26 weekly ten-minute checks, and 0.5 hours exit.
const FARM_TX_ETH_USD = 60;
const FARM_TX_OTHER_USD = 10;
const FARM_VERDICT_NET_MIN = 150;
const FARM_VERDICT_PER_HOUR_MIN = 20;

const EXPERIMENT_GROWTH_AGE_LOO_ERROR_X = 3.84;
const EXPERIMENT_FULL_COMBO_LOO_ERROR_X = 4.22;

interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  launch_value_usd: number;
  odds: number;
  range_low_usd: number;
  range_high_usd: number;
  verdict: 'Farm' | 'Marginal' | 'Skip';
  farm_net_usd: number;
  farm_per_hour_usd: number;
  farm_budget_usd: number;
  farm_budget_low_usd: number;
  farm_net_low_usd: number;
  watchlist: boolean;
}

const families = {
  vaults: ['Risk Curators', 'Onchain Capital Allocator', 'Yield Aggregator', 'Collateral Markets', 'Collateral Management', 'Yield'],
  staking: ['Liquid Staking', 'Liquid Restaking', 'Restaking', 'Staking Pool'],
  bridges: ['Bridge', 'Canonical Bridge', 'Cross Chain Bridge'],
};
type Family = keyof typeof families;
const familyByCategory = new Map(
  (Object.keys(families) as Family[]).flatMap(family =>
    families[family].map(category => [category, family] as const)),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTextArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText);
}

function nullable(value: unknown, check: (item: unknown) => boolean): boolean {
  return value === null || check(value);
}

// Gregorian calendar day number, independent of timezone and wall clock.
function calendarDay(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > lengths[month - 1]) return NaN;
  const previousYear = year - 1;
  return 365 * previousYear + Math.floor(previousYear / 4) - Math.floor(previousYear / 100)
    + Math.floor(previousYear / 400) + lengths.slice(0, month - 1).reduce((sum, days) => sum + days, 0) + day;
}

export function parseSnapshot(text: string): Snapshot {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || !Number.isFinite(calendarDay(value.as_of)) || !isText(value.source)
      || !isNumber(value.floor_usd) || value.floor_usd < 0 || !Array.isArray(value.protocols)
      || !isTextArray(value.watchlist)) {
    throw new Error('Invalid snapshot metadata or protocol/watchlist arrays');
  }

  const slugs = new Set<string>();
  for (const [index, protocol] of value.protocols.entries()) {
    if (!isRecord(protocol) || !isText(protocol.slug) || !isText(protocol.name)
        || !nullable(protocol.category, isText) || !isTextArray(protocol.chains)
        || !isNumber(protocol.tvl_usd) || protocol.tvl_usd < 0
        || !nullable(protocol.change_7d, isNumber) || !nullable(protocol.mcap_usd, isNumber)
        || !nullable(protocol.listed_at, item => Number.isFinite(calendarDay(item)))
        || !nullable(protocol.gecko_id, isText) || !nullable(protocol.symbol, isText)) {
      throw new Error(`Invalid protocol at index ${index}`);
    }
    if (slugs.has(protocol.slug)) throw new Error(`Duplicate protocol slug: ${protocol.slug}`);
    slugs.add(protocol.slug);
  }
  return value as unknown as Snapshot;
}

function isPreToken(protocol: Protocol): boolean {
  return protocol.gecko_id === null && protocol.symbol === null;
}

const excludedCategories = new Set(['Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

const exclusionRules: [string, (p: Protocol) => boolean][] = [
  ['Category excluded (CEX, Liquid Staking, Liquid Restaking, Restaked BTC)', p => excludedCategories.has(p.category ?? '')],
  ['Bridge category', p => p.category?.includes('Bridge') ?? false],
  ['Name ends in a version marker', p => /\s(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i.test(p.name)],
  ['Name contains wrapped, staked or staking', p => /\b(?:wrapped|staked|staking)\b/i.test(p.name)],
  ['Name starts with an exchange brand', p => /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i.test(p.name)],
];

function exclusionIndex(protocol: Protocol): number {
  return exclusionRules.findIndex(([, matches]) => matches(protocol));
}

function isEligible(protocol: Protocol): boolean {
  return isPreToken(protocol) && exclusionIndex(protocol) === -1;
}

// Editorial field notes from the operator. These only extend the generated farm plans.
const OPERATOR_NOTES = new Map([
  ['onre', 'Field note from the operator, who farms OnRe directly: the reinsurance vaults have run since its July 2025 listing without a depeg the operator can recall, liquidity has always been sufficient to enter and exit, and the points balance keeps accruing while the position is held.'],
  ['plume-vaults', "Caution from the operator's desk check (late November 2026): Plume Vaults routes exposure into RWA yield vaults such as YieldFi yUSD, whose redemption is not instant - NAV is updated twice a week, redemptions wait for two updates and depend on the manager setting funds aside - and the only yUSD pool on Plume held about $5 of liquidity with no trades. Verify your exit route with a small test redemption before depositing size."],
]);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const categoryActions = {
  vaults: 'If the official docs confirm a curated vault is available, deposit a supported stablecoin or ETH, keep the receipt or vault shares, and review allocations monthly before rebalancing.',
  staking: 'Stake a supported asset through the documented route, keep any receipt token, and review validator exposure, slashing terms, and the unstaking window before adding to the position.',
  bridges: 'Confirm both endpoints and the supported asset in the official docs, bridge a small test amount, and verify receipt and the return route before transferring more.',
  lending: 'Where collateralized borrowing is available, supply supported collateral, borrow below 50% loan-to-value, monitor liquidation thresholds, then repay and withdraw.',
  dexs: 'Choose a core supported pair, provide a small amount of liquidity, and make modest swaps for actual needs. Track fees and impermanent loss before adding liquidity.',
  rwa: 'Complete onboarding and KYC where required. If eligible, subscribe to a documented tokenized treasury or credit product and hold through a full interest cycle, subject to redemption terms.',
  generic: 'Pick one documented core action, try it with a small test amount, verify the resulting balance or receipt, and check that you can exit before committing more.',
};

const entrySurfaces = {
  vaults: 'the vault deposit page',
  staking: 'the staking page',
  bridges: 'the bridge transfer page',
  lending: 'the supply markets page',
  dexs: 'the liquidity pools page',
  rwa: 'the subscription and onboarding page',
  generic: 'the main app dashboard',
};

function positionTier(tvl: number) {
  if (tvl >= 500_000_000) return { band: '$2,000-$10,000', budgetLow: 2_000, budgetHigh: 10_000 };
  if (tvl >= 100_000_000) return { band: '$1,000-$5,000', budgetLow: 1_000, budgetHigh: 5_000 };
  if (tvl >= 50_000_000) return { band: '$500-$2,500', budgetLow: 500, budgetHigh: 2_500 };
  return { band: '$250-$1,500', budgetLow: 250, budgetHigh: 1_500 };
}

const typicalFees = new Map([
  ['Solana', 'Typical Solana fees are well under $0.10 per transaction.'],
  ['Ethereum', 'Typical Ethereum mainnet fees are $5–$25 per transaction in normal conditions.'],
]);
const layerTwoChains = new Set(['Base', 'Arbitrum', 'Optimism', 'Starknet', 'zkSync Era', 'Ink', 'Mantle', 'Morph', 'World Chain']);

function farmPlan(protocol: Protocol): string[] {
  const { name, category, chains, tvl_usd } = protocol;
  const chain = chains[0] ?? 'its main chain as identified in the official docs';
  const { band } = positionTier(tvl_usd);
  const fee = typicalFees.get(chain) ?? (layerTwoChains.has(chain)
    ? `Typical ${chain} fees are under $0.50 per transaction.`
    : "Check the chain's typical transaction fee before sizing.");
  const family = category === null ? undefined : familyByCategory.get(category);
  const action = family ?? (category === 'Lending' || category === 'Uncollateralized Lending' ? 'lending'
    : category === 'Dexs' ? 'dexs' : category === 'RWA' ? 'rwa' : 'generic');
  return [
    `Read ${name}'s official docs and announcements, confirm whether a points or rewards program is currently announced, and use the official app to locate ${entrySurfaces[action]} on ${chain}.`,
    `For ${name} on ${chain}, follow the documented workflow. ${categoryActions[action]}`,
    `Use ${band} as the position-size band if proceeding on ${chain}. ${fee} Check the live fee before signing.`,
    `Spend 10 minutes weekly reviewing the position over a 3-6 month horizon. Keep records of deposits, including amounts, dates, and transaction hashes, for any future snapshot.`,
    `Review smart-contract and depeg risk before depositing. Keep an exit route available and never farm with funds needed elsewhere.`,
  ];
}

interface ValuePeer {
  category: Protocol['category'];
  logTvl: number;
  logMcap: number;
  listed: number;
}

function fitValue(peers: ValuePeer[]) {
  // Solve the two normal equations for the intercept and log-TVL slope.
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (const { logTvl: x, logMcap: y } of peers) {
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
  }
  const n = peers.length;
  const determinant = n * sumXX - sumX * sumX;
  const slope = determinant > 0 && peers.some(p => p.logTvl !== peers[0].logTvl)
    ? (n * sumXY - sumX * sumY) / determinant : 0;
  const intercept = (sumY - slope * sumX) / n;
  const size = (logTvl: number) => intercept + slope * logTvl;

  const counts = new Map<Protocol['category'], { sum: number; n: number }>();
  let sumResidual = 0;
  for (const peer of peers) {
    const residual = peer.logMcap - size(peer.logTvl);
    sumResidual += residual;
    const group = counts.get(peer.category) ?? { sum: 0, n: 0 };
    group.sum += residual;
    group.n++;
    counts.set(peer.category, group);
  }
  const globalMean = sumResidual / n;
  const offset = (category: Protocol['category']) => {
    const group = counts.get(category);
    return group ? (group.sum + globalMean * 6) / (group.n + 6) : globalMean;
  };
  return { intercept, slope, counts, size, offset };
}

function halfSplit<T extends { listed: number }>(peers: T[]) {
  const sorted = [...peers].sort((a, b) => a.listed - b.listed);
  const midpoint = Math.floor(sorted.length / 2);
  return { train: sorted.slice(0, midpoint), test: sorted.slice(midpoint) };
}

function valueMetrics(residuals: number[]) {
  return {
    median_ratio: 10 ** median(residuals),
    typical_error_x: 10 ** median(residuals.map(Math.abs)),
    within2x: residuals.filter(r => Math.abs(r) <= Math.log10(2)).length / residuals.length,
  };
}

function fitAndValidateValue(peers: ValuePeer[]) {
  if (peers.length < 2) throw new Error('Value validation requires at least two peers');
  const fit = fitValue(peers);
  const sizeResiduals: number[] = [];
  const offsetResiduals: number[] = [];
  peers.forEach((p, i) => {
    const fold = fitValue(peers.filter((_, j) => j !== i));
    sizeResiduals.push(fold.size(p.logTvl) - p.logMcap);
    offsetResiduals.push(fold.size(p.logTvl) + fold.offset(p.category) - p.logMcap);
  });
  const { train, test } = halfSplit(peers);
  const earlierFit = fitValue(train);
  const walkForwardSize = test.map(p => earlierFit.size(p.logTvl) - p.logMcap);
  const walkForwardOffsets = test.map(p => earlierFit.size(p.logTvl) + earlierFit.offset(p.category) - p.logMcap);
  const sorted = [...offsetResiduals].sort((a, b) => a - b);
  const quantile = (f: number) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(f * sorted.length)))];
  const q25 = quantile(0.25);
  const q75 = quantile(0.75);
  return {
    fit,
    validation: {
      value_peers: peers.length,
      loo: { size_only: valueMetrics(sizeResiduals), size_offsets: valueMetrics(offsetResiduals) },
      walk_forward: {
        size_only: valueMetrics(walkForwardSize),
        size_offsets: valueMetrics(walkForwardOffsets),
      },
      residual_q25: q25,
      residual_q75: q75,
      range_coverage: offsetResiduals.filter(r => r >= q25 && r <= q75).length / peers.length,
    },
  };
}

interface OddsPeer {
  category: Protocol['category'];
  listed: number;
  hasToken: number;
  logAge: number;
  logTvl: number;
  logChains: number;
  growth: number;
}

const oddsTerms = [
  { term: 'Age (log years listed)', verdict: 'kept' },
  { term: '+ Category token share (k=10 shrinkage)', verdict: 'mixed - not used' },
  { term: '+ Size (log10 TVL)', verdict: 'not used' },
  { term: '+ Chain count (log)', verdict: 'not used' },
  { term: '+ 7d growth', verdict: 'not used' },
];

function tokenCount(peers: OddsPeer[]): number {
  return peers.reduce((sum, p) => sum + p.hasToken, 0);
}

function sigmoid(logit: number): number {
  return 1 / (1 + Math.exp(-logit));
}

function fitLogit(train: OddsPeer[], featureCount: number) {
  const n = train.length;
  const tokens = tokenCount(train);
  const baseRate = tokens / n;
  const categories = new Map<Protocol['category'], { tokens: number; n: number }>();
  for (const p of train) {
    const group = categories.get(p.category) ?? { tokens: 0, n: 0 };
    group.tokens += p.hasToken;
    group.n++;
    categories.set(p.category, group);
  }

  const features = (p: OddsPeer) => {
    const group = categories.get(p.category);
    const share = group ? (group.tokens + baseRate * 10) / (group.n + 10) : baseRate;
    return [p.logAge, share, p.logTvl, p.logChains, p.growth].slice(0, featureCount);
  };
  const matrix = train.map(features);
  const means = matrix[0].map((_, j) => matrix.reduce((sum, row) => sum + row[j], 0) / n);
  const deviations = means.map((mean, j) =>
    Math.max(Math.sqrt(matrix.reduce((sum, row) => sum + (row[j] - mean) ** 2, 0) / n), 1e-9));
  const standardize = (row: number[]) => row.map((value, j) => (value - means[j]) / deviations[j]);
  const standardized = matrix.map(standardize);
  let weights: number[] = Array(featureCount).fill(0);
  let intercept = Math.log((tokens + 0.5) / (n - tokens + 0.5));
  const predictStandardized = (row: number[]) =>
    sigmoid(intercept + row.reduce((sum, value, j) => sum + value * weights[j], 0));

  for (let i = 0; i < 300; i++) {
    let interceptGradient = 0;
    const gradients: number[] = Array(featureCount).fill(0);
    standardized.forEach((row, k) => {
      const error = predictStandardized(row) - train[k].hasToken;
      interceptGradient += error;
      row.forEach((value, j) => { gradients[j] += error * value; });
    });
    intercept -= 0.1 * interceptGradient / n;
    weights = weights.map((weight, j) => weight - 0.1 * gradients[j] / n - 0.001 * weight);
  }

  const coefficients = weights.map((weight, j) => weight / deviations[j]);
  return {
    intercept: intercept - coefficients.reduce((sum, weight, j) => sum + weight * means[j], 0),
    coefficients,
    predict: (p: OddsPeer) => predictStandardized(standardize(features(p))),
  };
}

function brier(peers: OddsPeer[], predict: (peer: OddsPeer, index: number) => number): number {
  return peers.reduce((sum, peer, index) => sum + (predict(peer, index) - peer.hasToken) ** 2, 0) / peers.length;
}

function fitAndValidateOdds(peers: OddsPeer[]) {
  if (peers.length < 2) throw new Error('Odds validation requires at least two peers');
  const fit = fitLogit(peers, 1);
  const { train, test } = halfSplit(peers);
  const walkForwardBase = tokenCount(train) / train.length;
  const withToken = tokenCount(peers);
  const baseRate = withToken / peers.length;
  const terms = oddsTerms.map((term, index) => {
    const featureCount = index + 1;
    const folds = Array.from({ length: Math.min(10, peers.length) }, (_, fold) =>
      fitLogit(peers.filter((_, i) => i % 10 !== fold), featureCount));
    const earlierFit = fitLogit(train, featureCount);
    return {
      ...term,
      tenfold_brier: brier(peers, (peer, i) => folds[i % 10].predict(peer)),
      walk_forward_brier: brier(test, earlierFit.predict),
    };
  });
  return {
    fit,
    terms,
    validation: {
      peers: peers.length,
      with_token: withToken,
      base_rate: baseRate,
      // The experiment uses the overall base rate as its ten-fold reference.
      base_brier_tenfold: brier(peers, () => baseRate),
      base_brier_walk_forward: brier(test, () => walkForwardBase),
      tenfold_brier: terms[0].tenfold_brier,
      walk_forward_brier: terms[0].walk_forward_brier,
    },
  };
}

export function buildRadar(snapshot: Snapshot) {
  const asOf = calendarDay(snapshot.as_of);
  const valuePeers = snapshot.protocols.flatMap(p =>
    !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 ? [{
      category: p.category,
      logTvl: Math.log10(p.tvl_usd),
      logMcap: Math.log10(p.mcap_usd),
      listed: p.listed_at === null ? asOf - 365 : calendarDay(p.listed_at),
    }] : []);
  const oddsPeers = snapshot.protocols.flatMap(p => {
    if (p.listed_at === null) return [];
    const listed = calendarDay(p.listed_at);
    const age = asOf - listed;
    if (age < 730) return [];
    return [{
      category: p.category,
      listed,
      hasToken: Number(!isPreToken(p)),
      logAge: Math.log(age / 365),
      logTvl: Math.log10(Math.max(p.tvl_usd, 1)),
      logChains: Math.log(Math.max(p.chains.length, 1)),
      growth: Math.max(-30, Math.min(60, (p.change_7d ?? 0) * 100)) / 100,
    }];
  });
  const value = fitAndValidateValue(valuePeers);
  const oddsModel = fitAndValidateOdds(oddsPeers);
  const { intercept, slope } = value.fit;
  const { residual_q25: q25, residual_q75: q75 } = value.validation;
  const logitIntercept = oddsModel.fit.intercept;
  const logitAge = oddsModel.fit.coefficients[0];
  const watchlist = new Set(snapshot.watchlist);
  const excludedCounts = exclusionRules.map(() => 0);
  const board: BoardRow[] = [];
  const neutralValues = new Map<string, number>();
  let pretoken = 0;

  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    pretoken++;
    const reason = exclusionIndex(p);
    if (reason !== -1) {
      excludedCounts[reason]++;
      continue;
    }
    const ageDays = p.listed_at === null ? 365 : asOf - calendarDay(p.listed_at);
    const logSize = value.fit.size(Math.log10(p.tvl_usd));
    const launch = p.tvl_usd === 0 ? 0 : 10 ** (logSize + value.fit.offset(p.category));
    // A calendar-day snapshot can include a same-day or future listing.
    const logAge = Math.log(Math.max(ageDays, 1) / 365);
    const odds = Math.max(0.01, Math.min(0.99, sigmoid(logitIntercept + logitAge * logAge)));
    const { budgetHigh: budget, budgetLow } = positionTier(p.tvl_usd);
    const participating = Math.max(FARM_PARTICIPATION_RATE * p.tvl_usd, FARM_PARTICIPATION_FLOOR_USD);
    const share = budget / (budget + participating);
    const expected = odds * launch * FARM_ALLOC_SHARE * share;
    const tx = p.chains[0] === 'Ethereum' ? FARM_TX_ETH_USD : FARM_TX_OTHER_USD;
    const net = Math.round(expected - tx);
    const lowShare = budgetLow / (budgetLow + participating);
    const lowNet = Math.round(odds * launch * FARM_ALLOC_SHARE * lowShare - tx);
    neutralValues.set(p.slug, Math.max(1, Math.round((p.tvl_usd === 0 ? 0 : 10 ** logSize) * odds)));
    const perHour = Math.round(net / FARM_HOURS * 10) / 10;
    const verdict = net >= FARM_VERDICT_NET_MIN && perHour >= FARM_VERDICT_PER_HOUR_MIN
      ? 'Farm' : net > 0 ? 'Marginal' : 'Skip';
    board.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: Math.max(1, Math.round(launch * odds)),
      farm_steps: farmPlan(p).concat(OPERATOR_NOTES.get(p.slug) ?? []),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays,
      launch_value_usd: Math.round(launch),
      odds: Number(odds.toFixed(4)),
      range_low_usd: Math.round(launch * 10 ** -q75 * odds),
      range_high_usd: Math.round(launch * 10 ** -q25 * odds),
      verdict,
      farm_net_usd: net,
      farm_per_hour_usd: perHour,
      farm_budget_usd: budget,
      farm_budget_low_usd: budgetLow,
      farm_net_low_usd: lowNet,
      watchlist: watchlist.has(p.slug),
    });
  }
  board.sort((a, b) => b.implied_value_usd - a.implied_value_usd
    || b.tvl_usd - a.tvl_usd || compareText(a.slug, b.slug));
  board.forEach((row, index) => { row.rank = index + 1; });
  const neutral = [...board].sort((a, b) => neutralValues.get(b.slug)! - neutralValues.get(a.slug)!
    || b.tvl_usd - a.tvl_usd || compareText(a.slug, b.slug));
  const neutralRanks = new Map(neutral.map((row, i) => [row.slug, i + 1]));
  const rankComparison = (row: BoardRow) => ({
    name: row.name, actual_rank: row.rank, neutral_rank: neutralRanks.get(row.slug)!,
  });

  const categoryOffsets = [...new Set(snapshot.protocols.map(p => p.category))]
    .sort((a, b) => compareText(a ?? '', b ?? ''))
    .map(category => {
      const offset = value.fit.offset(category);
      return { category, peers: value.fit.counts.get(category)?.n ?? 0, offset_log10: offset, offset_x: 10 ** offset };
    });
  const offsets = categoryOffsets.map(row => row.offset_log10);
  const rankedCategories = new Set(board.map(row => row.category));
  const thinCategories = categoryOffsets.filter(entry => entry.peers <= 1);
  const total = snapshot.protocols.length;
  const { loo, walk_forward: walkForward } = value.validation;
  const looSize = loo.size_only.typical_error_x.toFixed(2);
  const looOff = loo.size_offsets.typical_error_x.toFixed(2);
  const w2Size = (loo.size_only.within2x * 100).toFixed(1) + '%';
  const w2Off = (loo.size_offsets.within2x * 100).toFixed(1) + '%';
  const wfSize = walkForward.size_only.typical_error_x.toFixed(2);
  const wfOff = walkForward.size_offsets.typical_error_x.toFixed(2);
  const radar = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    watchlist_total: snapshot.watchlist.length,
    board_value_sum_usd: board.reduce((sum, row) => sum + row.implied_value_usd, 0),
    farm_assumptions: {
      alloc_share: FARM_ALLOC_SHARE,
      participation_rate: FARM_PARTICIPATION_RATE,
      participation_floor_usd: FARM_PARTICIPATION_FLOOR_USD,
      hours: FARM_HOURS,
      tx_eth_usd: FARM_TX_ETH_USD,
      tx_other_usd: FARM_TX_OTHER_USD,
      verdict_net_min: FARM_VERDICT_NET_MIN,
      verdict_per_hour_min: FARM_VERDICT_PER_HOUR_MIN,
    },
    rows: board,
    model: {
      formula: 'Estimate launch value with the fitted log-log TVL size curve plus a shrunk category offset. Multiply launch value by token odds to get implied value, rounded to whole dollars with a minimum of $1.',
      fit: `The size curve fits market cap as recorded in the snapshot against snapshot TVL for ${valuePeers.length} tokenized peers with positive market cap and TVL. Launch value estimates the market cap a protocol of this TVL carries among those peers. It does not reconstruct a launch-day price.`,
      tvl: 'Rows with zero TVL receive a zero launch value and a $1 implied-value floor. Snapshot validation rejects missing or null TVL.',
      offsets: 'Each category’s mean residual is weighted by its peer count and shrunk toward the global mean residual with six observations (k=6). Categories without peers use the global mean.',
      odds: `Age-only logistic regression uses ${oddsPeers.length} peers listed at least 730 days before the snapshot, with a recorded token base rate of ${oddsModel.validation.base_rate.toFixed(3)}. These odds are the recorded history of comparable peers, not a forecast of whether or when any protocol launches a token.`,
      range: 'The P25–P75 range reflects leave-one-out value-model residuals only. Odds are applied as point estimates.',
      verdict: `This planning estimate assumes early users receive 10% of launch supply, with participating capital = max(${FARM_PARTICIPATION_RATE * 100}% of TVL, $${FARM_PARTICIPATION_FLOOR_USD.toLocaleString('en-US')}) per protocol. Your share uses the top of the position-size band. Net subtracts $60 on Ethereum or $10 on other chains. The 26-week plan budgets 6.3 hours for setup, weekly checks, and exit. Farm requires at least $150 net and $20 per hour. Other positive net values are Marginal. Zero or negative net values are Skip.`,
      eligibility: 'The board requires both token fields to be empty and applies no TVL floor. It excludes CEX, Liquid Staking, Liquid Restaking, Restaked BTC, and every category containing Bridge. Names ending in a version marker such as V2 or 2.0, containing the whole words wrapped, staked, or staking, or starting with Binance, Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex, or Gemini are excluded.',
      scoring: 'Every eligible protocol uses the same scoring formula. Protocol names determine eligibility only. Operator notes appear in farm plans and have no effect on values or ranks.',
    },
    validation: { ...value.validation, odds: oddsModel.validation },
    evidence: {
      value_terms: [
        { term: 'Size curve (log-log OLS)', verdict: 'kept', loo: loo.size_only, walk_forward: walkForward.size_only },
        {
          term: '+ Category offsets (k=6 shrinkage)', verdict: 'kept',
          loo: loo.size_offsets, walk_forward: walkForward.size_offsets,
          detail: `Kept for the within-2x and walk-forward gains: LOO typical error worsens (x${looSize} → x${looOff}) while LOO within-2x improves (${w2Size} → ${w2Off}) and walk-forward typical error improves (x${wfSize} → x${wfOff}).`,
        },
        { term: '+ 7d growth', verdict: 'dropped', detail: `Project experiment: growth + age OLS increased LOO typical error to ${EXPERIMENT_GROWTH_AGE_LOO_ERROR_X.toFixed(2)}x.` },
        { term: '+ Age', verdict: 'dropped', detail: `Project experiment: the full combination of size, category offsets, growth, and age increased LOO typical error to ${EXPERIMENT_FULL_COMBO_LOO_ERROR_X.toFixed(2)}x.` },
      ],
      odds_terms: oddsModel.terms,
      sensitivity: {
        categories: categoryOffsets.length,
        thin_categories: thinCategories.length,
        ranked_categories: rankedCategories.size,
        thin_ranked_categories: thinCategories.filter(entry => rankedCategories.has(entry.category)).length,
        neutral_top: neutral.slice(0, 5).map(rankComparison),
        actual_top: board.slice(0, 5).map(rankComparison),
      },
      fitted: {
        intercept,
        slope,
        category_offset_min: Math.min(...offsets),
        category_offset_max: Math.max(...offsets),
        logit_intercept: logitIntercept,
        logit_coef_log_age: logitAge,
      },
    },
    accounting: {
      total,
      tokenized: total - pretoken,
      pretoken,
      ranked: board.length,
      excluded_total: pretoken - board.length,
      excluded_by_reason: exclusionRules.map(([reason], i) => ({ reason, count: excludedCounts[i] })),
    },
    category_offsets: categoryOffsets,
  };
  return { board, radar };
}

export function boardIssue(board: unknown, snapshot: Snapshot): string | null {
  const validSlugs = new Set(snapshot.protocols.filter(isEligible).map(p => p.slug));
  const ineligible = snapshot.watchlist.filter(slug => !validSlugs.has(slug));
  if (ineligible.length) return `Ineligible watchlist protocols: ${ineligible.join(', ')}`;
  if (!Array.isArray(board) || board.length < 100 || board.length > 4000) {
    return 'Expected 100 to 4000 board rows';
  }
  const seen = new Set<string>();
  let previousValue = Infinity;

  for (const [index, row] of board.entries()) {
    const rank = index + 1;
    if (!isRecord(row) || !isText(row.slug) || !validSlugs.has(row.slug) || seen.has(row.slug)) {
      return `Invalid or duplicate slug at row ${rank}`;
    }
    seen.add(row.slug);
    if (!isText(row.name)) return `Missing protocol name for ${row.slug}`;
    if (row.rank !== rank) return `Expected rank ${rank} for ${row.slug}`;
    if (!isNumber(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > previousValue) {
      return `Invalid or out-of-order implied value for ${row.slug}`;
    }
    previousValue = row.implied_value_usd;
    if (!isTextArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12
        || row.farm_steps.some(step => step.trim().length < 20 || step.trim().length > 600)) {
      return `Invalid farm steps for ${row.slug}`;
    }
  }
  const missing = snapshot.watchlist.find(slug => !seen.has(slug));
  return missing === undefined ? null : `Missing watchlist protocol: ${missing}`;
}

export function dataScript(radar: ReturnType<typeof buildRadar>['radar'], checksum: string): string {
  return `window.RADAR_DATA = ${JSON.stringify({ ...radar, checksum })};\n`;
}
