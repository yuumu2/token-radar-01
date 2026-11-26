'use strict';

const byId = id => document.getElementById(id);
const radar = window.RADAR_DATA;
const integer = new Intl.NumberFormat('en-US');
const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const hourly = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 1, maximumFractionDigits: 1,
});
const compactDollars = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const detailPercent = new Intl.NumberFormat('en-US', { style: 'percent', minimumSignificantDigits: 3, maximumSignificantDigits: 3 });
const roundedTotal = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 0,
});
const number = value => integer.format(value);
const usd = value => dollars.format(value);
const compact = value => compactDollars.format(value);
const pct = value => percent.format(value);
const fixed = value => value.toFixed(2);
const sig4 = value => String(Number(value.toPrecision(4)));
const miss = metrics => `x${fixed(metrics.typical_error_x)}`;
const categoryName = category => category ?? 'Uncategorized';
const range = (row, format) => `${format(row.range_low_usd)} – ${format(row.range_high_usd)}`;

function launchFormula(row, fit, offset) {
  return row.tvl_usd === 0
    ? 'Zero recorded TVL gives a launch value of'
    : `10^(${sig4(fit.intercept)} + ${sig4(fit.slope)} × log10(${number(row.tvl_usd)})) × ${offset.offset_x.toFixed(3)} category offset ≈`;
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function facts(entries, className = 'facts') {
  const list = el('dl', undefined, className);
  for (const [label, value] of entries) {
    const item = el('div');
    item.append(el('dt', label), el('dd', value));
    list.append(item);
  }
  return list;
}

function pill(label) {
  const styles = {
    Farm: 'farm', Marginal: 'marginal', Skip: 'skip', kept: 'kept',
    dropped: 'dropped', 'mixed - not used': 'mixed', 'not used': 'unused',
  };
  return el('span', label, `pill ${styles[label] ?? ''}`);
}

function checksum(rows) {
  const bytes = new TextEncoder().encode(JSON.stringify({ rows }));
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function renderOverview() {
  const { accounting, evidence, rows, validation, watchlist_total } = radar;
  const { loo, walk_forward, odds, range_coverage, value_peers } = validation;
  const farmCount = rows.filter(row => row.verdict === 'Farm').length;
  const watchCount = rows.filter(row => row.watchlist).length;
  const valueKept = evidence.value_terms.filter(term => term.verdict === 'kept').length;
  const oddsKept = evidence.odds_terms.filter(term => term.verdict === 'kept').length;
  const young = rows.filter(row => row.age_days < 730).length;
  const cards = [
    ['Leave-one-out miss', miss(loo.size_offsets), `Typical error · ${number(value_peers)} peers`],
    ['Walk-forward miss', miss(walk_forward.size_offsets), 'Typical error · later-listed half'],
    ['Held-out central-50% interval coverage', pct(range_coverage)],
    ['Odds Brier · ten-fold', odds.tenfold_brier.toFixed(4), `Null Brier ${odds.base_brier_tenfold.toFixed(4)} · base rate ${(odds.base_rate * 100).toFixed(1)}%`,
      `${young} of ${rows.length} rows are younger than the odds peer cohort — odds extrapolated`],
    ['Terms surviving', `${valueKept} value · ${oddsKept} odds`, `Odds kept ${oddsKept} of ${evidence.odds_terms.length} tested`],
    ['Farm-worthy', number(farmCount), `Of ${number(accounting.ranked)} ranked protocols`],
    ['Watchlist coverage', `${watchCount}/${watchlist_total}`, 'Watchlist protocols ranked'],
  ];
  byId('snapshot').textContent = `Snapshot · ${radar.as_of}`;
  for (const [label, value, ...details] of cards) {
    const metric = el('article', undefined, 'metric');
    metric.append(el('h3', label), el('strong', value), ...details.map(detail => el('p', detail)));
    byId('validation').append(metric);
  }

  const { total, tokenized, pretoken, ranked, excluded_total, excluded_by_reason } = accounting;
  const exclusionText = excluded_by_reason.map(item => `${item.reason} ${number(item.count)}`).join(' · ');
  byId('accounting').append(
    el('strong', `${number(total)} snapshot protocols`),
    ` = ${number(tokenized)} tokenized + ${number(pretoken)} pre-token. `,
    `${number(pretoken)} pre-token = ${number(ranked)} ranked + ${number(excluded_total)} excluded (${exclusionText}).`,
  );

  const sum = rows.reduce((value, row) => value + row.implied_value_usd, 0);
  const excluded = excluded_by_reason.reduce((value, item) => value + item.count, 0);
  const accounted = tokenized + rows.length + excluded;
  const actualChecksum = checksum(rows);
  const checksumMatches = actualChecksum === radar.checksum;
  const checks = [
    [`${number(rows.length)} ranked rows`, rows.length === ranked],
    [`${roundedTotal.format(sum)} total implied`, sum === radar.board_value_sum_usd],
    [`${watchCount}/${watchlist_total} watchlist rows`, watchCount === watchlist_total],
    [checksumMatches
      ? `Board checksum ${actualChecksum} · ${number(rows.length)} / ${number(rows.length)} rows recomputed in this page · matched`
      : `Board checksum ${actualChecksum} · in-page recompute mismatch`, checksumMatches],
    [`${number(accounted)} / ${number(total)} accounted`,
      accounted === total && total === tokenized + pretoken && pretoken === ranked + excluded_total
        && excluded === excluded_total && rows.length === ranked],
  ];
  for (const [label, passes] of checks) {
    const check = el('li', undefined, passes ? 'pass' : 'fail');
    check.append(el('span', passes ? '✓ ' : '✕ '), label);
    check.setAttribute('aria-label', `${passes ? 'Pass' : 'Mismatch'} — ${label}`);
    byId('integrity').append(check);
  }
}

function steps(row) {
  const list = el('ol');
  for (const text of row.farm_steps) list.append(el('li', text));
  return list;
}

function transactionCost(row) {
  const assumptions = radar.farm_assumptions;
  return row.chains[0] === 'Ethereum' ? assumptions.tx_eth_usd : assumptions.tx_other_usd;
}

function evidenceRow(term, cells, verdict, detail) {
  const row = el('tr');
  const name = el('th', term);
  name.scope = 'row';
  if (detail) name.append(el('small', detail));
  row.append(name);
  for (const { value, note } of cells) {
    const cell = el('td', value, 'num');
    if (note) cell.append(el('small', note));
    row.append(cell);
  }
  const status = el('td');
  status.append(pill(verdict));
  row.append(status);
  return row;
}

function renderMethod() {
  const { evidence, category_offsets, model, validation } = radar;
  const valueCell = metrics => metrics ? {
    value: miss(metrics),
    note: `${pct(metrics.within2x)} within 2× · median ${fixed(metrics.median_ratio)}×`,
  } : { value: '—' };
  for (const term of evidence.value_terms) {
    byId('value-terms').append(evidenceRow(
      term.term, [valueCell(term.loo), valueCell(term.walk_forward)], term.verdict, term.detail,
    ));
  }
  const base = validation.odds;
  const oddsTerms = byId('odds-terms');
  oddsTerms.append(evidenceRow('Null Brier (base-rate predictor)', [
    { value: base.base_brier_tenfold.toFixed(4) }, { value: base.base_brier_walk_forward.toFixed(4) },
  ], 'reference', `Base rate ${(base.base_rate * 100).toFixed(1)}% — every peer predicted at the base rate`));
  for (const term of evidence.odds_terms) {
    oddsTerms.append(evidenceRow(term.term, [
      { value: term.tenfold_brier.toFixed(4) }, { value: term.walk_forward_brier.toFixed(4) },
    ], term.verdict));
  }
  const young = radar.rows.filter(row => row.age_days < 730).length;
  oddsTerms.closest('section').append(el('p',
    'A term is kept only if it improves both ten-fold and walk-forward Brier.', 'evidence-note'),
  el('p', `${young} of ${radar.rows.length} ranked rows are younger than the 730-day peer cohort; their odds are extrapolations of the age fit.`, 'evidence-note'));

  const fit = evidence.fitted;
  byId('coefficients').append(...facts([
    ['Log10 value intercept', sig4(fit.intercept)],
    ['Log10 TVL slope', sig4(fit.slope)],
    ['Category offset range (log10)', `${fixed(fit.category_offset_min)} to ${fixed(fit.category_offset_max)}`],
    ['Logit intercept', fixed(fit.logit_intercept)],
    ['Log-age coefficient', fixed(fit.logit_coef_log_age)],
  ]).children);
  for (let i = 0; i < 3; i++) {
    const start = Math.ceil(i * category_offsets.length / 3);
    const end = Math.ceil((i + 1) * category_offsets.length / 3);
    const table = el('table');
    table.setAttribute('aria-label', `Category offsets, part ${i + 1} of 3`);
    const head = table.createTHead().insertRow();
    for (const title of ['Category', 'Peers', 'Offset']) {
      const cell = el('th', title, title === 'Category' ? undefined : 'num');
      cell.scope = 'col';
      head.append(cell);
    }
    const body = table.createTBody();
    for (const entry of category_offsets.slice(start, end)) {
      const row = body.insertRow();
      const label = el('th', categoryName(entry.category));
      label.scope = 'row';
      row.append(label, el('td', number(entry.peers), 'num'), el('td', `${fixed(entry.offset_x)}×`, 'num'));
    }
    byId('offsets').append(table);
  }
  const sensitivity = byId('sensitivity');
  const comparison = evidence.sensitivity;
  sensitivity.append(el('p', `${comparison.thin_categories} of ${comparison.categories} snapshot categories and ${comparison.thin_ranked_categories} of ${comparison.ranked_categories} ranked categories have at most one value peer.`, 'evidence-note'));
  const onre = radar.rows.find(row => row.slug === 'onre');
  if (onre) {
    const offset = category_offsets.find(entry => entry.category === onre.category);
    sensitivity.append(el('p', `${onre.name} worked example`, 'worked-label'),
      el('p', `${launchFormula(onre, fit, offset)} ${usd(onre.launch_value_usd)}`, 'formula evidence-note'));
  }
  const top = el('ol', undefined, 'neutral-ranks');
  for (const row of comparison.neutral_top) {
    top.append(el('li', `${row.name} · #${row.actual_rank} → #${row.neutral_rank}`));
  }
  sensitivity.append(el('h4', 'Top five with all offsets set to 1.0×'), top);
  const displaced = comparison.actual_top.filter(row => row.neutral_rank > comparison.neutral_top.length);
  if (displaced.length) {
    sensitivity.append(el('p', `Out of the original top five: ${displaced.map(row =>
      `${row.name} (#${row.actual_rank} → #${row.neutral_rank})`).join(', ')}.`, 'evidence-note'));
  }
  const labels = {
    formula: 'Scoring formula', fit: 'Size curve', offsets: 'Category offsets', odds: 'Token odds',
    tvl: 'Zero or missing TVL', range: 'Valuation range', verdict: 'Farm planning assumptions', eligibility: 'Eligibility', scoring: 'Scoring rules',
  };
  byId('method-copy').append(...facts(Object.entries(model).map(([key, value]) => [labels[key] ?? key, value])).children);
}

function detailBlock(title, entries) {
  const section = el('section', undefined, 'detail-block');
  section.append(el('h3', title), facts(entries));
  return section;
}

function renderProfile(row, offsets) {
  const title = byId('profile-title');
  const body = byId('profile-body');
  if (!row) {
    title.textContent = 'Protocol profile';
    body.replaceChildren(el('p', 'Select a protocol to see its valuation and farm plan.'));
    return;
  }
  const { evidence: { fitted }, farm_assumptions: farm, validation: { odds } } = radar;
  const offset = offsets.get(row.category);
  const tx = transactionCost(row);
  const participating = Math.max(row.tvl_usd * farm.participation_rate, farm.participation_floor_usd);
  const share = row.farm_budget_usd / (row.farm_budget_usd + participating);

  // Recover the full-precision inputs used before the row values were rounded.
  const logTvl = Math.log10(row.tvl_usd);
  const launch = row.tvl_usd === 0 ? 0 : 10 ** (fitted.intercept + fitted.slope * logTvl + offset.offset_log10);
  const years = Math.max(row.age_days, 1) / 365;
  const logit = fitted.logit_intercept + fitted.logit_coef_log_age * Math.log(years);
  const probability = Math.max(0.01, Math.min(0.99, 1 / (1 + Math.exp(-logit))));
  const expected = probability * launch * farm.alloc_share * share;
  const displayedOdds = detailPercent.format(row.odds);

  title.textContent = row.name;
  const context = el('div', undefined, 'profile-context');
  context.append(pill(row.verdict), el('span', `Rank ${number(row.rank)}`));
  if (row.watchlist) context.append(el('span', 'Watchlist'));
  const protocol = detailBlock('Protocol', [
    ['TVL', usd(row.tvl_usd)],
    ['Category', categoryName(row.category)],
    ['Chains', row.chains.join(', ') || 'Unrecorded'],
    ['Listed', row.listed_at ?? 'Unrecorded'],
    ['Age at snapshot', `${number(row.age_days)} days${row.listed_at === null ? ' (assumed)' : ''}`],
  ]);
  const valuation = detailBlock('Valuation', [
    ['Fitted launch value', usd(row.launch_value_usd)],
    ['Token odds', displayedOdds],
    ['Implied value', usd(row.implied_value_usd)],
    ['P25–P75 range', range(row, usd)],
  ]);
  const arithmetic = el('p', `${launchFormula(row, fitted, offset)} `, 'formula');
  arithmetic.append(el('strong', usd(row.launch_value_usd)));
  const oddsLine = `Logistic on log age fitted on ${number(odds.peers)} peers (base rate ${(odds.base_rate * 100).toFixed(1)}%). At ${fixed(years)} years, this row’s odds are ${displayedOdds}.`;
  valuation.append(arithmetic, el('p', oddsLine));
  if (row.age_days < 730) {
    valuation.append(el('p', 'Extrapolated — this protocol is younger than the 2-year peer cohort (protocols listed at least 730 days before the snapshot) that the odds were fitted on, so its odds extend the age fit below the cohort’s range.', 'caution'));
  }
  valuation.append(el('p', `${usd(row.launch_value_usd)} launch × ${displayedOdds} odds ≈ ${usd(row.implied_value_usd)} implied.`, 'formula'));
  const economics = detailBlock('Farm economics', [
    ['Position band top', usd(row.farm_budget_usd)],
    ['Participating capital', usd(participating)],
    ['Budget share of pool', `${(share * 100).toFixed(4)}%`],
    ['Early-user allocation', pct(farm.alloc_share)],
    ['Peer-record-weighted value before cost', usd(expected)],
    ['Estimated transaction cost', usd(tx)],
    [`Net after fees at ${usd(row.farm_budget_low_usd)} (band bottom)`, usd(row.farm_net_low_usd)],
    [`Net after fees at ${usd(row.farm_budget_usd)} (band top)`, usd(row.farm_net_usd)],
    ['Time over 26 weeks', `${farm.hours} hours`],
    ['Net per hour', hourly.format(row.farm_per_hour_usd)],
  ]);
  economics.append(
    el('p', `Planning estimate. Participating capital uses the larger of ${pct(farm.participation_rate)} of TVL and ${usd(farm.participation_floor_usd)}. Peer-record-weighted value multiplies launch value by odds, early-user allocation, and budget share.`),
    el('p', `Farm requires at least ${usd(farm.verdict_net_min)} net and ${usd(farm.verdict_per_hour_min)} per hour. Other positive net values are Marginal. Zero or negative net values are Skip.`),
  );
  const grid = el('div', undefined, 'profile-grid');
  grid.append(protocol, valuation, economics);
  const plan = el('section', undefined, 'profile-steps');
  plan.append(el('h3', 'Farm steps'), steps(row));
  body.replaceChildren(context, grid, plan);
}

function renderRankRow(row, index, expanded) {
  const tr = el('tr', undefined, `rank-row${index % 2 ? ' alternate' : ''}${expanded ? ' expanded' : ''}`);
  tr.dataset.slug = row.slug;

  const protocol = el('td', undefined, 'protocol-cell');
  const button = el('button', row.name, 'protocol-button ellipsis');
  button.type = 'button';
  button.title = row.name;
  button.setAttribute('aria-expanded', String(expanded));
  if (expanded) button.setAttribute('aria-controls', `plan-${row.slug}`);
  const category = el('span', categoryName(row.category), 'ellipsis category-name');
  category.title = category.textContent;
  protocol.append(button, category);

  const chains = el('td', undefined, 'chain-cell');
  const preview = el('div', undefined, 'chain-preview');
  preview.title = row.chains.join(', ');
  preview.append(el('span', row.chains.slice(0, 2).join(', ') || '—', 'ellipsis'));
  if (row.chains.length > 2) {
    const extra = row.chains.length - 2;
    const badge = el('span', `+${extra}`, 'chain-more');
    badge.setAttribute('aria-label', `${extra} more chains`);
    preview.append(badge);
  }
  chains.append(preview);
  const verdict = el('td');
  verdict.append(pill(row.verdict));
  const expand = el('td', expanded ? '−' : '+', 'expand-icon');
  expand.setAttribute('aria-hidden', 'true');
  tr.append(
    el('td', number(row.rank), 'num'), protocol, chains, el('td', compact(row.tvl_usd), 'num'),
    el('td', compact(row.launch_value_usd), 'num'), el('td', compact(row.implied_value_usd), 'num implied'),
    el('td', pct(row.odds), 'num'), el('td', range(row, compact), 'num'), verdict,
    el('td', compact(row.farm_net_usd), 'num'), el('td', hourly.format(row.farm_per_hour_usd), 'num'), expand,
  );
  return tr;
}

function renderInlinePlan(row) {
  const tr = el('tr', undefined, 'inline-plan');
  const cell = el('td');
  cell.colSpan = 12;
  const content = el('div', undefined, 'plan-content');
  content.id = `plan-${row.slug}`;
  const tx = transactionCost(row);
  const budgetLine = `Position band top ${usd(row.farm_budget_usd)} · Estimated transaction cost ${usd(tx)} · ${radar.farm_assumptions.hours} hours · Net after fees ${usd(row.farm_net_usd)} · ${hourly.format(row.farm_per_hour_usd)}/hour`;
  content.append(el('h3', `${row.name} farm steps`), el('p', budgetLine), steps(row));
  cell.append(content);
  tr.append(cell);
  return tr;
}

function setupBoard() {
  const rows = radar.rows;
  const rowsBySlug = new Map(rows.map(row => [row.slug, row]));
  const offsets = new Map(radar.category_offsets.map(entry => [entry.category, entry]));
  const category = byId('category');
  const chain = byId('chain');
  const search = byId('search');
  const verdict = byId('verdict');
  const watchlist = byId('watchlist');
  const container = byId('rows');
  const sortButtons = [...document.querySelectorAll('[data-sort]')];
  const scroller = container.closest('.ranking-scroll');
  let sortKey = 'rank';
  let direction = 1;
  let expandedSlug = null;

  const categoryValues = [...new Set(rows.map(row => row.category))]
    .sort((a, b) => categoryName(a).localeCompare(categoryName(b)));
  for (const value of categoryValues) category.add(new Option(categoryName(value), JSON.stringify(value)));
  for (const value of [...new Set(rows.flatMap(row => row.chains))].sort()) chain.add(new Option(value, value));

  function renderRows(resetScroll = false, focusSlug = null) {
    const query = search.value.trim().toLowerCase();
    const chosenCategory = category.value ? JSON.parse(category.value) : undefined;
    const visible = rows.filter(row => (!query || `${row.name} ${row.slug}`.toLowerCase().includes(query))
      && (chosenCategory === undefined || row.category === chosenCategory)
      && (!chain.value || row.chains.includes(chain.value))
      && (!verdict.value || row.verdict === verdict.value)
      && (!watchlist.checked || row.watchlist));
    visible.sort((a, b) => direction * (a[sortKey] - b[sortKey]) || a.rank - b.rank);

    const fragment = document.createDocumentFragment();
    let focusButton;
    visible.forEach((row, index) => {
      const expanded = row.slug === expandedSlug;
      const tr = renderRankRow(row, index, expanded);
      fragment.append(tr);
      if (expanded) fragment.append(renderInlinePlan(row));
      if (row.slug === focusSlug) focusButton = tr.querySelector('button');
    });
    if (!visible.length) {
      const empty = el('tr');
      const cell = el('td', 'No protocols match these filters.', 'empty');
      cell.colSpan = 12;
      empty.append(cell);
      fragment.append(empty);
    }
    const scrollTop = resetScroll ? 0 : scroller.scrollTop;
    container.replaceChildren(fragment);
    scroller.scrollTop = scrollTop;
    byId('count').textContent = `${number(visible.length)} of ${number(rows.length)} protocols`;
    focusButton?.focus({ preventScroll: true });
  }

  byId('filters').addEventListener('submit', event => event.preventDefault());
  search.addEventListener('input', () => renderRows(true));
  for (const control of [category, chain, verdict, watchlist]) {
    control.addEventListener('change', () => renderRows(true));
  }
  for (const button of sortButtons) {
    button.addEventListener('click', () => {
      if (sortKey === button.dataset.sort) direction *= -1;
      else {
        sortKey = button.dataset.sort;
        direction = sortKey === 'rank' ? 1 : -1;
      }
      for (const header of sortButtons) {
        const th = header.closest('th');
        const arrow = header.querySelector('span');
        if (header.dataset.sort === sortKey) {
          th.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending');
          arrow.textContent = direction === 1 ? '↑' : '↓';
        } else {
          th.removeAttribute('aria-sort');
          arrow.textContent = '↕';
        }
      }
      renderRows(true);
    });
  }
  container.addEventListener('click', event => {
    const tr = event.target.closest('tr[data-slug]');
    if (!tr) return;
    const row = rowsBySlug.get(tr.dataset.slug);
    expandedSlug = expandedSlug === row.slug ? null : row.slug;
    renderProfile(row, offsets);
    renderRows(false, row.slug);
  });

  renderRows();
  renderProfile(rows[0], offsets);
}

if (radar && Array.isArray(radar.rows) && radar.farm_assumptions && typeof radar.checksum === 'string') {
  renderOverview();
  setupBoard();
  renderMethod();
  byId('radar').hidden = false;
} else {
  byId('load-error').textContent = 'Launch Radar data is missing or out of date. Open the dashboard alongside the generated v2 data.js.';
  byId('load-error').hidden = false;
}
