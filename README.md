# Token Launch Radar

![make.fun token-radar-01](https://make.fun/badge/token-radar-01.svg)
![rank](https://make.fun/badge/token-radar-01/yuumu2/token-radar-01/rank.svg)
![reward](https://make.fun/badge/token-radar-01/yuumu2/token-radar-01/reward.svg)

Token Launch Radar is an entry in the [make.fun token-radar-01 competition](https://make.fun/bounty/token-radar-01). It ranks pre-token protocols by an implied token value calculated solely from the sealed snapshot. The kit snapshot produces 197 ranked rows and covers all 40 watchlist protocols.

## Eligibility

The radar applies the house's watchlist eligibility rule to the fields available in the snapshot, with the TVL floor removed and every category containing `Bridge` excluded. Both token fields must be empty. The board also excludes CEX, Liquid Staking, Liquid Restaking, and Restaked BTC. It skips names that end in a version marker, contain the whole words “wrapped,” “staked,” or “staking,” or start with Binance, Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex, or Gemini.

## Value model

The model calibrates category multiples using tokenized protocols from the same snapshot. It clamps each peer's market-cap-to-TVL ratio to `[0.01, 5]` before computing medians. It shrinks the peer median toward the global median by weighting the peer median by its sample size and the global median by six observations (`k=6`). Categories with fewer than three peers pool with their family, where defined. With no peers after pooling, the model uses the global median.

Each score multiplies protocol TVL by the calibrated multiple, a growth adjustment based on capped seven-day TVL change, and a maturity adjustment based on days since listing. It rounds the result to whole dollars with a minimum of $1. The dashboard shows the calculation for each protocol alongside the ranked board.

## Farm plans

Each row includes a concrete usage plan with a TVL-based position-size band, transaction cost guidance, a weekly review rhythm, and risk checks. Plans begin by asking the reader to check official announcements for any points or rewards program. Two rows, OnRe and Plume Vaults, include clearly labelled operator field notes that do not affect scoring.

## Run locally

Use Node.js 22 or later. The entry uses only the Node standard library and runs without network access.

```sh
MAKEFUN_OUTPUT_DIR=./out node main.ts --input /path/to/snapshot.json
```

Open `out/dashboard/index.html` to browse the board and protocol profiles. The output directory also contains `board.json`, `data.js`, `dossier.json`, and the packaged screenshots.

## Repository layout

| Path | Purpose |
| --- | --- |
| `main.ts` | Reads the snapshot and writes the board, dashboard data, and dossier |
| `lib/model.ts` | Validates the snapshot, scores eligible rows, and generates farm plans |
| `dashboard/` | Offline dashboard with sortable rankings, filters, and profiles |
| `screenshots/` | Packaged screenshot assets |
| `tools/` | Board self-check and placeholder PNG generator |
| `vendor/makefun-board.ts` | Vendored make.fun dossier builder |
| `.makefun/owner.json` | Competition wallet metadata |
