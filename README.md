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

## Vocabulary

Terms we use when talking about the game. The code uses the same names.

| Term | Meaning |
| --- | --- |
| Puzzle | One day's game, numbered from launch (No. 1 = Oct 28, 2026) |
| Anchor | The revealed starting point: something that happened on this calendar date. Distances are measured from it. |
| Events | The things players place by distance from the anchor |
| Opening pair | The two events in round 1; the player picks the closer one |
| Incoming event | The one new event added each round after that |
| Round | One decision; a puzzle has 1 + the number of incoming events |
| Clue | Describes an event without naming the place |
| Hint | Optional extra nudge; each one used adds a 💡 to the result |
| Reveal | Shown after placing: the place, the event's name, and its distance |
| Route | The player's list of placed events, nearest to farthest, anchor at the top |
| Gaps | The "Place here" spots between events on the route |
| Map | The picture at the top, centered on the anchor |
| Rings | Dashed distance circles on the map |
| Pips | Small squares showing right or wrong for each round |
| Verdicts | Messages after each move: "Right on course" or "Recalculating…" |
| Result | The end screen |
| Share card | The emoji grid players copy and send |

## Adding a puzzle

1. Copy an existing file in `puzzles/` and rename it to the new date, like `2026-10-29.json`.
2. Fill in the `anchor` (something that happened on this calendar date) and the `events`. See the anchor fields below.
3. Set `openingPair` to the two event ids for round 1, and `incoming` to the rest in the order they appear.
4. Add the date to the `dates` list in `puzzles/index.json`.

The game shows today's puzzle by the player's local date. If there's no file for today, it shows the most recent earlier one. Add `?date=2026-10-29` to the URL to test a specific day.

### Anchor fields

| Field | What it is |
| --- | --- |
| `title` | Headline, e.g. "The Gateway Arch is completed" |
| `date` | Full date as shown, e.g. "Thursday, October 28, 1965" |
| `description` | Two or three sentences about what happened |
| `image` | Optional: `src` (a link, or a file in `images/`), `alt` (describes the picture), `credit`, and `link` to the source page. Use public-domain or openly licensed photos, such as National Park Service, Library of Congress or Wikimedia Commons. |
| `place`, `short`, `label` | Full place name, a short map label, and the one-line name shown at the top of the route |
| `lat`, `lon` | Decimal coordinates |

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
