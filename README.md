# World Cup 2026 Match Centre

A static GitHub Pages site for browsing every FIFA World Cup 2026 match, group, host venue, kickoff time, and result-ready scorecard.

## Run Locally

Install dependencies once, then build the Tailwind stylesheet:

```powershell
npm install
npm run build:css
```

Serve the repository root so `fetch("data/matches.json")` works:

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Update Results

Fixtures live in `data/matches.json`. To add a result, set the match to final and add the score:

```json
{
  "status": "final",
  "score": { "home": 2, "away": 1 }
}
```

For live matches, use `"status": "live"` and include the current score.

## Refresh Team Values

Team reports live in `data/teams.json` and are generated from Transfermarkt:

```powershell
node scripts/import-transfermarkt.mjs
node scripts/validate-data.mjs
```

The import includes squad value, average value, top-11 value, player list, positions, clubs, and player market values. Treat it as a Transfermarkt snapshot, not FIFA's official squad registry.

## GitHub Pages

This repo includes `.github/workflows/pages.yml`. In GitHub, go to `Settings > Pages` and set the source to `GitHub Actions`. Pushing to `main` will deploy the static site.

The generated `styles.css` is committed, so GitHub Pages can still host the repository root as a static site. When editing Tailwind styles, change `src/styles.css` and run `npm run build:css` before committing.

## Data Sources

- FIFA updated match schedule PDF: <https://digitalhub.fifa.com/asset/4b5d4417-3343-4732-9cdf-14b6662af407/FWC26-Match-Schedule_English.pdf>
- WorldCuply structured fixture list: <https://worldcuply.com/schedule.html>
- Transfermarkt World Cup participants and squad market values: <https://www.transfermarkt.us/world-cup/teilnehmer/pokalwettbewerb/FIWC>
