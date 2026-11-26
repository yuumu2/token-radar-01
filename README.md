# Token Launch Radar

![make.fun token-radar-01](https://make.fun/badge/token-radar-01.svg)
![rank](https://make.fun/badge/token-radar-01/yuumu2/token-radar-01/rank.svg)
![reward](https://make.fun/badge/token-radar-01/yuumu2/token-radar-01/reward.svg)

Token Launch Radar is an entry in the [make.fun token-radar-01 competition](https://make.fun/bounty/token-radar-01).

Launch Radar ranks eligible pre-token protocols using only the sealed snapshot. The kit snapshot dated 2026-11-14 yields 197 ranked protocols and covers all 40 watchlist entries.

## Valuation and token odds

The value model fits a line to log10 market cap versus log10 TVL using 128 tokenized peers with positive market cap and TVL. It adds each category’s mean residual to the fitted line after shrinking that mean toward the global residual mean with six observations of weight. Categories without peers use the global mean residual. Exponentiating the resulting log10 value gives the fitted launch value.

The age-only logistic model uses log years since listing. It fits on 302 peers listed at least 730 days before the snapshot, of which 205 have a recorded token (base rate 0.679). Missing listing dates use 365 days for row scoring. The dashboard shows the pre-multiplication launch value next to the implied value and displays the odds used in the calculation. Implied value equals launch value × odds, rounded to whole dollars with a $1 minimum. The odds are the recorded token history of comparable long-listed peers, not a forecast of whether or when a protocol launches a token.

The P25–P75 range comes from leave-one-out residuals from the size curve with category offsets, measured as predicted minus actual log10 market cap. Multiply launch value × odds by 10^(-q75) for the low end and 10^(-q25) for the high end.

No protocol name is special-cased in scoring. Name patterns affect eligibility only. The operator notes for OnRe and Plume Vaults appear in the farm steps and do not affect scoring.

## Validation on the kit snapshot

| Measurement | Result |
| --- | ---: |
| Value peers | 128 |
| OLS intercept / slope | 3.024673 / 0.522266 |
| Leave-one-out typical error, size only | 3.40× |
| Leave-one-out typical error, size + category offsets | 3.78× |
| Walk-forward typical error, size + category offsets | 4.17× |
| Leave-one-out log10 residual q25 / q75 | −0.619717 / 0.558266 |
| Held-out peers inside the P25–P75 band | 50.78% |
| Odds peers / with token / base rate | 302 / 205 / 0.679 |
| Odds ten-fold Brier / base-rate reference | 0.2018 / 0.2180 |
| Odds walk-forward Brier / base-rate reference | 0.2417 / 0.2863 |

Typical error is the median multiplicative miss. Category offsets increased the median leave-one-out error from 3.40× to 3.78× while increasing the share within 2× from 32.0% to 34.4%. Walk-forward tests train on the earlier-listed half and test on the later-listed half. The age-only odds model improved on the base-rate reference in both tests. Adding category token share improved ten-fold Brier and worsened walk-forward Brier relative to age alone, so the shipped odds model uses age alone.

## Eligibility and accounting

Both token fields must be empty, with no TVL floor for ranking. The board excludes CEX, Liquid Staking, Liquid Restaking, Restaked BTC, and any category containing “Bridge”. It also excludes names ending in a version marker, containing the whole words “wrapped”, “staked”, or “staking”, or starting with Binance, Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex, or Gemini.

The 758 snapshot protocols comprise 416 with recorded tokens and 342 pre-token protocols. Of the pre-token protocols, 197 are ranked and 145 are excluded. Counting each exclusion once by its first matching rule gives 85 excluded-category rows, 44 bridge-category rows, 11 version-marker rows, 5 wrapped/staked/staking rows, and 0 exchange-brand rows.

## Farm plans and verdicts

Farm economics are a planning estimate. Assume early users receive 10% of launch supply and competing participating capital is the larger of 10% of TVL or $2 million. Use the top of the TVL-tier position band as the budget ($1,500, $2,500, $5,000, or $10,000). The estimated share is budget ÷ (budget + participating capital). Expected value is launch value × odds × early-user allocation × estimated share.

Subtract $60 in transaction costs when the first listed chain is Ethereum and $10 otherwise. Use 6.3 hours over 26 weeks for setup, weekly checks, and exit. A row earns **Farm** at ≥$150 net and ≥$20 per hour. Other positive net values are **Marginal**, and zero or negative net values are **Skip**. Farm steps ask readers to verify announced rewards in official sources and include a documented entry action, cost guidance, regular reviews, and an exit plan.

## Run locally

Use Node.js 22 or later with TypeScript stripping enabled. The entry uses the Node standard library and runs offline.

```sh
node main.ts --input /path/to/snapshot.json --output ./out
node tools/self_check.mjs /path/to/snapshot.json ./out/board.json
```

Open `out/dashboard/index.html` to browse the rankings and methodology offline. The dashboard recomputes the board checksum and ledger checks from `data.js`. The output also contains `board.json`, `dossier.json`, and the packaged screenshots.
