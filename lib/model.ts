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
  multiple_used: number;
  growth_multiplier: number;
  maturity_multiplier: number;
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

function isEligible(protocol: Protocol): boolean {
  const { category, name } = protocol;
  return isPreToken(protocol)
    && !excludedCategories.has(category ?? '')
    && !category?.includes('Bridge')
    && !/\s(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i.test(name)
    && !/\b(?:wrapped|staked|staking)\b/i.test(name)
    && !/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i.test(name);
}

// Editorial field notes from the operator. These only extend the generated farm plans.
const OPERATOR_NOTES = new Map([
  ['onre', 'Field note from the operator, who farms OnRe directly: the reinsurance vaults have run for years without a depeg the operator can recall, liquidity has always been sufficient to enter and exit, and the points balance keeps accruing while the position is held.'],
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

function farmPlan(protocol: Protocol): string[] {
  const { name, category, chains, tvl_usd } = protocol;
  const chain = chains[0] ?? 'its main chain as identified in the official docs';
  const band = tvl_usd >= 500_000_000 ? '$2,000-$10,000'
    : tvl_usd >= 100_000_000 ? '$1,000-$5,000'
    : tvl_usd >= 50_000_000 ? '$500-$2,500' : '$250-$1,500';
  const family = category === null ? undefined : familyByCategory.get(category);
  const action = family ?? (category === 'Lending' || category === 'Uncollateralized Lending' ? 'lending'
    : category === 'Dexs' ? 'dexs' : category === 'RWA' ? 'rwa' : 'generic');
  return [
    `Read ${name}'s official docs and announcements, confirm whether a points or rewards program is currently announced, and verify the official app for ${chain}.`,
    `For ${name} on ${chain}, follow the documented workflow. ${categoryActions[action]}`,
    `Use ${band} as the position-size band if proceeding on ${chain}. Ethereum mainnet often costs $5-$25 per transaction in normal conditions, while L2s like Base or Arbitrum usually cost under $0.50. Check the live fee before signing.`,
    `Spend 10 minutes weekly reviewing the position over a 3-6 month horizon. Keep records of deposits, including amounts, dates, and transaction hashes, for any future snapshot.`,
    `Review smart-contract and depeg risk before depositing. Keep an exit route available and never farm with funds needed elsewhere.`,
  ];
}

export function buildRadar(snapshot: Snapshot) {
  const ratiosByCategory = new Map<string | null, number[]>();
  const globalRatios: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = Math.max(0.01, Math.min(5, p.mcap_usd / p.tvl_usd));
    const ratios = ratiosByCategory.get(p.category) ?? [];
    ratios.push(ratio);
    ratiosByCategory.set(p.category, ratios);
    globalRatios.push(ratio);
  }
  if (!globalRatios.length) throw new Error('The snapshot contains no tokenized peers with market cap and positive TVL');

  const globalMedian = median(globalRatios);
  const categories = [...new Set(snapshot.protocols.map(p => p.category))]
    .sort((a, b) => compareText(a ?? '', b ?? ''));
  const categoryMultiples = categories.map(category => {
    const categoryRatios = ratiosByCategory.get(category) ?? [];
    let ratios = categoryRatios;
    const family = category === null ? undefined : familyByCategory.get(category);
    if (ratios.length < 3 && family) {
      ratios = families[family].flatMap(member => ratiosByCategory.get(member) ?? []);
    }
    const n = ratios.length;
    const middle = n ? median(ratios) : null;
    const used = middle === null ? globalMedian : (middle * n + globalMedian * 6) / (n + 6);
    return {
      category,
      category_n: categoryRatios.length,
      category_median: categoryRatios.length ? median(categoryRatios) : null,
      n,
      median: middle,
      used,
    };
  });
  const multiples = new Map(categoryMultiples.map(entry => [entry.category, entry.used]));
  const watchlist = new Set(snapshot.watchlist);
  const asOf = calendarDay(snapshot.as_of);

  const board: BoardRow[] = snapshot.protocols.filter(isEligible).map(p => {
    const multiple = multiples.get(p.category)!;
    const ageDays = p.listed_at === null ? 365 : asOf - calendarDay(p.listed_at);
    const growthMultiplier = 1 + Math.max(-30, Math.min(60, p.change_7d ?? 0)) / 100 * 0.5;
    const maturityMultiplier = 0.7 + 0.3 * Math.min(ageDays, 1095) / 1095;
    return {
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: Math.max(1, Math.round(p.tvl_usd * multiple * growthMultiplier * maturityMultiplier)),
      farm_steps: farmPlan(p).concat(OPERATOR_NOTES.get(p.slug) ?? []),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays,
      multiple_used: Number(multiple.toFixed(4)),
      growth_multiplier: growthMultiplier,
      maturity_multiplier: maturityMultiplier,
      watchlist: watchlist.has(p.slug),
    };
  });
  board.sort((a, b) => b.implied_value_usd - a.implied_value_usd
    || b.tvl_usd - a.tvl_usd || compareText(a.slug, b.slug));
  board.forEach((row, index) => { row.rank = index + 1; });

  const radar = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    watchlist_total: snapshot.watchlist.length,
    model: {
      eligibility: 'The board requires both token fields to be empty and applies no TVL floor. It excludes CEX, Liquid Staking, Liquid Restaking, Restaked BTC, and every category containing Bridge. Names ending in a version marker such as V2 or 2.0, containing the whole words wrapped, staked, or staking, or starting with Binance, Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex, or Gemini are excluded.',
      formula: 'Multiply TVL by the peer market-cap-to-TVL multiple, the growth multiplier, and the maturity multiplier. Round to whole dollars with a minimum of $1.',
      winsorization: 'Divide each tokenized peer’s recorded market cap by its positive TVL. Clamp each ratio to the range 0.01× to 5× before taking any median to limit the influence of extreme ratios.',
      growth: 'Clamp seven-day TVL change between -30% and +60%, then add half that change to 1. Missing change gives 1.',
      maturity: 'Start at 0.7 and add up to 0.3 based on days since listing, capped at 1,095 days. Missing listing dates use 365 days.',
      shrinkage: 'Weight the peer median by its sample size and the global median by six observations. With fewer than three category peers, pool the family. Categories outside a listed family pool with themselves. With no pooled peers, use the global median.',
      scoring: 'Every eligible protocol uses the same scoring formula. Protocol names determine eligibility only. Operator notes appear in farm plans and have no effect on values or ranks.',
      families,
      global_median: globalMedian,
    },
    category_multiples: categoryMultiples,
    rows: board,
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

export function dataScript(radar: ReturnType<typeof buildRadar>['radar']): string {
  return `window.RADAR_DATA = ${JSON.stringify(radar)};\n`;
}
