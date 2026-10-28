# MileStory

A daily geography game. Each puzzle starts at an anchor, something that happened on this date somewhere in the world. Players place historical events by how far they happened from the anchor, as the crow flies, one event per round.

## Files

- `index.html`: the page
- `style.css`: colors, type and layout (light and dark themes)
- `game.js`: game logic and the map
- `data/map.json`: the map (coastlines, borders, rivers, lakes, mountain ranges, place names)
- `tools/build_map.py`: rebuilds `data/map.json` from Natural Earth files
- `puzzles/index.json`: the launch date and the list of puzzle dates
- `puzzles/YYYY-MM-DD.json`: one file per day

## Adding a puzzle

1. Copy an existing file in `puzzles/` and rename it to the new date, like `2026-10-29.json`.
2. Fill in the `anchor` (something that happened on this calendar date) and the `events`.
3. Set `pair` to the two event ids for round 1, and `deal` to the rest in the order they appear.
4. Add the date to the `dates` list in `puzzles/index.json`.

The game shows today's puzzle by the player's local date. If there's no file for today, it shows the most recent earlier one. Add `?date=2026-10-29` to the URL to test a specific day.

### Event fields

| Field | What it is |
| --- | --- |
| `year` | Shown on the card |
| `clue` | Describes the event without naming the place |
| `hint` | One more nudge toward the place |
| `place` | Revealed after placing, e.g. "Dallas, Texas" |
| `short` | Map label, a word or two |
| `what` | Short name of the event, revealed after placing |
| `lat`, `lon` | Decimal coordinates (right-click a spot in Google Maps to copy them) |

### Tips for a good puzzle

- Keep neighboring events at least 20% apart in distance so the order is fair.
- Include one event very close to the anchor and one very far away.
- Write clues that make players work out the place rather than recognize it.

## Map data

The map is drawn from [Natural Earth](https://www.naturalearthdata.com), which is public domain. To rebuild it, download the Natural Earth GeoJSON files and run `python3 tools/build_map.py path/to/geojson`.

## Hosting

Served by GitHub Pages from the `main` branch.
