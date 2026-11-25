const byId = id => document.getElementById(id);
const radar = window.RADAR_DATA;

if (radar) {
  start(radar);
} else {
  byId('snapshot').textContent = 'Board data is unavailable. Open this page from the generated output directory.';
}

function start({ rows, as_of, watchlist_total, category_multiples, model }) {
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const integer = new Intl.NumberFormat('en-US');
  const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });
  const percent = new Intl.NumberFormat('en-US', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 2 });
  const compareText = new Intl.Collator('en-US', { sensitivity: 'base' }).compare;
  const formatChange = value => value === null ? '—' : percent.format(value / 100);
  const times = value => `${decimal.format(value)}×`;
  const columns = [
    { key: 'rank', label: 'Rank', numeric: true, format: integer.format },
    { key: 'name', label: 'Protocol' },
    { key: 'category', label: 'Category' },
    { key: 'chains', label: 'Chains', format: value => value.join(', ') || '—' },
    { key: 'tvl_usd', label: 'TVL', numeric: true, format: usd.format },
    { key: 'change_7d', label: '7d change', numeric: true, format: formatChange },
    { key: 'implied_value_usd', label: 'Implied value', numeric: true, format: usd.format },
    { key: 'multiple_used', label: 'Multiple', numeric: true, format: times },
  ];
  const categories = new Map(category_multiples.map(peer => [peer.category, peer]));
  let sort = { key: 'rank', descending: false };
  let selected = rows[0]?.slug;

  function element(tag, text, className) {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  }

  function definitions(entries) {
    return entries.map(([label, value]) => {
      const pair = element('div');
      pair.append(element('dt', label), element('dd', value));
      return pair;
    });
  }

  function addOptions(id, values) {
    const select = byId(id);
    for (const value of [...new Set(values)].sort(compareText)) {
      const option = element('option', value);
      option.value = value;
      select.append(option);
    }
  }

  function showProfile(row) {
    byId('profile-title').textContent = row?.name ?? 'Protocol profile';
    const profile = byId('profile-body');
    if (!row) {
      profile.replaceChildren(element('p', 'No protocols match these filters.', 'context'));
      return;
    }
    const peers = categories.get(row.category);
    const breakdown = element('div', undefined, 'calculation');
    const factors = element('dl');
    factors.append(...definitions([
      ['TVL', usd.format(row.tvl_usd)],
      ['× Category multiple', times(peers.used)],
      ['× Growth multiplier', times(row.growth_multiplier)],
      ['× Maturity multiplier', times(row.maturity_multiplier)],
    ]));
    breakdown.append(factors, element('output', `= ${usd.format(row.implied_value_usd)}`));
    const categoryStats = `${integer.format(peers.category_n)} category peers · category median ${peers.category_median === null ? 'unavailable' : times(peers.category_median)}`;
    const calibrationStats = peers.n === 0
      ? ` Global median ${times(model.global_median)} used.`
      : peers.n !== peers.category_n
        ? ` Family pool of ${integer.format(peers.n)} peers · pooled median ${times(peers.median)}.`
        : '';
    const facts = element('dl', undefined, 'facts');
    facts.append(...definitions([
      ['Chains', row.chains.join(', ') || 'Unknown'],
      ['Listed date', row.listed_at ?? 'Unknown'],
      ['Tokenless age', row.listed_at ? `${integer.format(row.age_days)} days` : '365 days (model default)'],
      ['7d TVL change', formatChange(row.change_7d)],
    ]));
    const plan = element('ol');
    plan.append(...row.farm_steps.map(step => element('li', step)));
    profile.replaceChildren(
      element('p', [`Rank ${row.rank}`, row.category ?? 'Uncategorized', row.watchlist ? 'Watchlist' : null].filter(Boolean).join(' · '), 'context'),
      element('h3', 'Implied value calculation'), breakdown, element('p', categoryStats + '.' + calibrationStats, 'peer-summary'),
      element('h3', 'Protocol facts'), facts, element('h3', 'Farm plan'), plan,
    );
  }

  function compareRows(a, b) {
    const left = a[sort.key];
    const right = b[sort.key];
    if (left === null || right === null) {
      return (left === null ? 1 : 0) - (right === null ? 1 : 0) || a.rank - b.rank;
    }
    const result = typeof left === 'number' ? left - right : compareText(String(left), String(right));
    return (sort.descending ? -result : result) || a.rank - b.rank;
  }

  function render() {
    const query = byId('search').value.trim().toLowerCase();
    const category = byId('category').value;
    const chain = byId('chain').value;
    const onlyWatchlist = byId('watchlist').checked;
    const visible = rows.filter(row =>
      (!query || row.name.toLowerCase().includes(query) || row.slug.toLowerCase().includes(query))
      && (!category || (row.category ?? 'Uncategorized') === category)
      && (!chain || row.chains.includes(chain))
      && (!onlyWatchlist || row.watchlist)).sort(compareRows);

    const active = visible.find(row => row.slug === selected) ?? visible[0];
    selected = active?.slug;
    showProfile(active);
    byId('count').textContent = `${integer.format(visible.length)} of ${integer.format(rows.length)} protocols`;
    for (const { key, label, header, button } of columns) {
      if (key === sort.key) {
        header.setAttribute('aria-sort', sort.descending ? 'descending' : 'ascending');
      } else {
        header.removeAttribute('aria-sort');
      }
      button.textContent = key === sort.key ? `${label} ${sort.descending ? '↓' : '↑'}` : label;
    }

    const fragment = document.createDocumentFragment();
    for (const row of visible) {
      const line = element('tr');
      line.classList.toggle('selected', row.slug === selected);
      for (const { key, numeric, format } of columns) {
        const cell = element(key === 'name' ? 'th' : 'td', undefined, numeric ? 'number' : '');
        if (key === 'name') {
          cell.scope = 'row';
          const button = element('button', row.name, 'protocol');
          button.type = 'button';
          button.setAttribute('aria-controls', 'profile');
          if (row.slug === selected) button.setAttribute('aria-current', 'true');
          button.addEventListener('click', () => {
            const previous = byId('rows').querySelector('[aria-current]');
            previous?.removeAttribute('aria-current');
            previous?.closest('tr').classList.remove('selected');
            selected = row.slug;
            line.classList.add('selected');
            button.setAttribute('aria-current', 'true');
            showProfile(row);
            byId('profile-title').focus();
          });
          cell.append(button);
          if (row.watchlist) cell.append(element('span', 'Watchlist', 'watch'));
        } else {
          cell.textContent = format ? format(row[key]) : row[key] ?? '—';
        }
        line.append(cell);
      }
      fragment.append(line);
    }
    byId('rows').replaceChildren(fragment);
  }

  const headers = element('tr');
  for (const column of columns) {
    const { key, numeric } = column;
    const header = element('th', undefined, numeric ? 'number' : '');
    header.scope = 'col';
    const button = element('button');
    button.type = 'button';
    button.addEventListener('click', () => {
      sort = { key, descending: sort.key === key ? !sort.descending : numeric && key !== 'rank' };
      render();
    });
    column.header = header;
    column.button = button;
    header.append(button);
    headers.append(header);
  }

  byId('columns').append(headers);
  addOptions('category', rows.map(row => row.category ?? 'Uncategorized'));
  addOptions('chain', rows.flatMap(row => row.chains));
  byId('filters').addEventListener('submit', event => event.preventDefault());
  byId('search').addEventListener('input', render);
  for (const id of ['category', 'chain', 'watchlist']) byId(id).addEventListener('change', render);

  const watched = rows.filter(row => row.watchlist).length;
  byId('snapshot').textContent = `Snapshot ${as_of}`;
  byId('coverage').textContent = `${integer.format(rows.length)} eligible protocols · ${watched}/${watchlist_total} watchlist coverage`;
  byId('method').append(...definitions([
    ['Eligibility', model.eligibility],
    ['Implied value', model.formula],
    ['Calibrating the multiple', `${model.winsorization} ${model.shrinkage} The global median is ${times(model.global_median)}.`],
    ['Category families', Object.entries(model.families).map(([name, members]) => `${name[0].toUpperCase()}${name.slice(1)} (${members.join(', ')})`).join('. ') + '.'],
    ['Growth adjustment', model.growth],
    ['Maturity adjustment', model.maturity],
    ['Consistent scoring', model.scoring],
  ]));
  byId('radar').hidden = false;
  render();
}
