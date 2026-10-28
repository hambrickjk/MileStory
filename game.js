/* MileStory: a daily geography game.
   Each day's puzzle lives in puzzles/YYYY-MM-DD.json and is listed in puzzles/index.json.
   Add ?date=YYYY-MM-DD to the URL to play a specific puzzle while testing. */

const R_EARTH = 3958.8; // miles
const W = 400, H = 300, FIT = 128;
const NS = "http://www.w3.org/2000/svg";
const MAP_URLS = {
  world: "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json",
  states: "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json",
};
const NICE = [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 3000, 4000, 5000];

const $ = id => document.getElementById(id);
let P, ANCHOR, EVENTS, ROUNDS, PUZZLE_NO, PUZZLE_DATE, S;
let geo = null, projection = null, pathGen = null, curRange = 120;

/* ---------- Loading ---------- */
function localISO(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 86400000);
}
async function loadPuzzle() {
  const index = await (await fetch("puzzles/index.json", { cache: "no-cache" })).json();
  const wanted = new URLSearchParams(location.search).get("date") || localISO();
  const dates = [...index.dates].sort();
  const pick = dates.includes(wanted) ? wanted : (dates.filter(d => d <= wanted).pop() || dates[0]);
  const puzzle = await (await fetch(`puzzles/${pick}.json`, { cache: "no-cache" })).json();
  return { puzzle, date: pick, number: daysBetween(index.launch, pick) + 1 };
}
async function loadMap() {
  if (!window.d3 || !window.topojson) return;
  const [world, states] = await Promise.all(
    [MAP_URLS.world, MAP_URLS.states].map(u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null)));
  if (!world) return;
  geo = {
    land: topojson.feature(world, world.objects.land || world.objects.countries),
    borders: topojson.mesh(world, world.objects.countries, (a, b) => a !== b),
    states: states ? topojson.mesh(states, states.objects.states, (a, b) => a !== b) : null,
  };
}

/* ---------- Geometry ---------- */
function miles(lat, lon) {
  const r = Math.PI / 180, p1 = ANCHOR.lat * r, p2 = lat * r, dl = (lon - ANCHOR.lon) * r;
  return 2 * R_EARTH * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2));
}
function bearing(lat, lon) {
  const r = Math.PI / 180, p1 = ANCHOR.lat * r, p2 = lat * r, dl = (lon - ANCHOR.lon) * r;
  return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
}
const fmt = m => m < 50 ? Math.round(m) + " mi" : Math.round(m).toLocaleString() + " mi";
const pxPerMile = range => FIT / range;
function screen(lat, lon, range) {
  if (projection) { projection.scale(pxPerMile(range) * R_EARTH); return projection([lon, lat]); }
  const d = miles(lat, lon) * pxPerMile(range), b = bearing(lat, lon);
  return [W / 2 + d * Math.sin(b), H / 2 - d * Math.cos(b)];
}

/* ---------- Map drawing ---------- */
const svg = $("map");
function mk(tag, attrs, text) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}
function drawMap(range, newId) {
  svg.innerHTML = "";
  svg.appendChild(mk("rect", { x: 0, y: 0, width: W, height: H, fill: "var(--sea)" }));
  if (geo && projection) {
    projection.scale(pxPerMile(range) * R_EARTH);
    svg.appendChild(mk("path", { d: pathGen(geo.land) || "", fill: "var(--land)", stroke: "none" }));
    if (geo.states) svg.appendChild(mk("path", { d: pathGen(geo.states) || "", fill: "none", stroke: "var(--border)", "stroke-width": 0.6 }));
    svg.appendChild(mk("path", { d: pathGen(geo.borders) || "", fill: "none", stroke: "var(--border)", "stroke-width": 1 }));
  }
  const ppm = pxPerMile(range), cx = W / 2, cy = H / 2;
  NICE.filter(m => m * ppm >= 22 && m * ppm <= FIT * 1.25).slice(-3).forEach(m => {
    const r = m * ppm;
    svg.appendChild(mk("circle", { cx, cy, r, fill: "none", stroke: "var(--water)", "stroke-width": 0.9, "stroke-dasharray": "3 4", opacity: 0.8 }));
    svg.appendChild(mk("text", { x: cx + r * 0.707 + 3, y: cy + r * 0.707 + 10, "font-family": "var(--f-mono)", "font-size": 9, fill: "var(--water)" }, m.toLocaleString() + " mi"));
  });
  const pts = (S ? S.placed : []).map(id => ({ e: EVENTS[id], p: screen(EVENTS[id].lat, EVENTS[id].lon, range) }));
  (P.landmarks || []).forEach(([name, la, lo]) => {
    const [x, y] = screen(la, lo, range);
    if (x < 10 || x > W - 40 || y < 22 || y > H - 8) return;
    if (Math.hypot(x - cx, y - cy) < 22) return;
    if (pts.some(({ p }) => Math.hypot(p[0] - x, p[1] - y) < 26)) return;
    svg.appendChild(mk("circle", { cx: x, cy: y, r: 1.8, fill: "var(--muted)" }));
    svg.appendChild(mk("text", { x: x + 4, y: y - 3, "font-family": "var(--f-body)", "font-size": 9, fill: "var(--muted)" }, name));
  });
  svg.appendChild(mk("circle", { cx, cy, r: 6, fill: "var(--survey)", stroke: "var(--ink)", "stroke-width": 2 }));
  if (range < 60) svg.appendChild(mk("text", { x: cx + 9, y: cy + 4, "font-family": "var(--f-body)", "font-weight": 700, "font-size": 10, fill: "var(--ink)" }, ANCHOR.short));
  pts.forEach(({ e, p }) => {
    const [x, y] = p;
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) return;
    const isNew = e.id === newId;
    const g = mk("g", { class: "dot" + (isNew ? " new" : "") });
    g.appendChild(mk("circle", { cx: x, cy: y, r: 5.5, fill: isNew ? "var(--survey)" : "var(--ink)", stroke: "var(--sheet)", "stroke-width": 1.5 }));
    svg.appendChild(g);
    if (Math.hypot(x - cx, y - cy) > 16) {
      const right = x < W - 70;
      svg.appendChild(mk("text", { x: right ? x + 8 : x - 8, y: y + 4, "text-anchor": right ? "start" : "end", "font-family": "var(--f-body)", "font-weight": 700, "font-size": 10.5, fill: "var(--ink)", stroke: "var(--land)", "stroke-width": 3, "paint-order": "stroke" }, e.short));
    }
  });
}
function zoomTo(target, newId) {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const from = curRange;
  if (reduce || Math.abs(Math.log(target / from)) < 0.01) { curRange = target; drawMap(target, newId); return; }
  const t0 = performance.now(), dur = 900;
  function step(now) {
    const k = Math.min(1, (now - t0) / dur), ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    curRange = Math.exp(Math.log(from) + (Math.log(target) - Math.log(from)) * ease);
    drawMap(curRange, k < 1 ? null : newId);
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
const rangeFor = ids => Math.max(120, Math.max(0, ...ids.map(id => EVENTS[id].miles)) * 1.12);

/* ---------- Game ---------- */
function fresh() { return { round: 0, placed: [], results: [], hints: new Set(), current: null, last: null, phase: "intro" }; }
function show(id) { ["intro", "play", "result"].forEach(s => $(s).hidden = s !== id); }

function renderPips() {
  $("pips").innerHTML = Array.from({ length: ROUNDS }, (_, i) => {
    const r = S.results[i];
    return `<i class="${r === true ? "ok" : r === false ? "no" : i === S.round ? "now" : ""}"></i>`;
  }).join("");
}
function eventCard(e, extra) {
  return `<div class="card new">
    <span class="year">${e.year}</span>
    <p class="clue">${e.clue}</p>
    ${S.hints.has(e.id) ? `<p class="hint">${e.hint}</p>` : `<button class="hintbtn" data-hint="${e.id}">Show hint</button>`}
    ${extra || ""}
  </div>`;
}
function rung(e, n, cls) {
  return `<li class="rung ${cls || ""}"><span class="n">${n}</span><span><span class="place">${e.place}</span><span class="ev">${e.what}, ${e.year}</span></span><span class="mi">${fmt(e.miles)}</span></li>`;
}
function ladderHTML(withSlots) {
  const sorted = [...S.placed].sort((a, b) => EVENTS[a].miles - EVENTS[b].miles);
  let html = `<li class="rung anchorrow"><span class="n">★</span><span><span class="place">${ANCHOR.place}</span><span class="ev">${ANCHOR.label}</span></span><span class="mi">0 mi</span></li>`;
  sorted.forEach((id, i) => {
    html += withSlots ? `<li><button class="slot" data-slot="${i}">Place here</button></li>` : `<li class="gap"></li>`;
    const cls = S.last && id === S.last.id && S.phase === "feedback" ? "fresh " + (S.last.ok ? "right" : "wrong") : "";
    html += rung(EVENTS[id], i + 1, cls);
  });
  if (withSlots) html += `<li><button class="slot" data-slot="${sorted.length}">Place here</button></li>`;
  return html;
}
function render() {
  renderPips();
  $("roundLabel").textContent = `Round ${S.round + 1} of ${ROUNDS}`;
  const stage = $("stage");
  if (S.phase === "pair") {
    const [a, b] = P.pair.map(id => EVENTS[id]);
    stage.innerHTML = `<h2>Which happened closer to ${ANCHOR.short}?</h2>
      ${eventCard(a, `<button class="pick" data-pick="${a.id}">This one is closer</button>`)}
      <p class="vs">or</p>
      ${eventCard(b, `<button class="pick" data-pick="${b.id}">This one is closer</button>`)}`;
  } else if (S.phase === "place") {
    stage.innerHTML = `<h2>Where does this one fit?</h2>${eventCard(EVENTS[S.current])}<p class="note">Tap the gap where it belongs in the list below.</p>`;
  } else if (S.phase === "feedback") {
    const last = S.round + 1 >= ROUNDS;
    stage.innerHTML = `<p class="verdict ${S.last.ok ? "right" : "wrong"}">${S.last.msg}</p>
      <button class="primary" id="next">${last ? "See your result" : "Next event"}</button>`;
  }
  $("ladder").innerHTML = ladderHTML(S.phase === "place");
}
function judgePair(pick) {
  const [a, b] = P.pair.map(id => EVENTS[id]);
  const closer = a.miles < b.miles ? a : b, farther = closer === a ? b : a;
  const ok = pick === closer.id;
  S.placed.push(a.id, b.id);
  S.results.push(ok);
  S.last = { id: pick, ok, msg: `${ok ? "Right on course." : "Recalculating…"} ${closer.what}: ${closer.place}, ${fmt(closer.miles)} away. ${farther.what}: ${farther.place}, ${fmt(farther.miles)} away.` };
  S.phase = "feedback";
  render();
  zoomTo(rangeFor(S.placed), null);
}
function judgeSlot(k) {
  const e = EVENTS[S.current];
  const sorted = [...S.placed].sort((a, b) => EVENTS[a].miles - EVENTS[b].miles);
  const lo = k === 0 ? 0 : EVENTS[sorted[k - 1]].miles, hi = k < sorted.length ? EVENTS[sorted[k]].miles : Infinity;
  const ok = e.miles > lo && e.miles < hi;
  S.placed.push(e.id);
  S.results.push(ok);
  S.last = { id: e.id, ok, msg: `${ok ? "Right on course." : "Recalculating…"} ${e.what}: ${e.place}, ${fmt(e.miles)} from ${ANCHOR.short}.` };
  S.phase = "feedback";
  render();
  zoomTo(rangeFor(S.placed), e.id);
}
function next() {
  S.round++;
  if (S.round >= ROUNDS) return finish();
  S.current = P.deal[S.round - 1];
  S.phase = "place";
  render();
  $("play").scrollIntoView({ behavior: "smooth", block: "start" });
}
function finish() {
  S.phase = "done";
  const score = S.results.filter(Boolean).length;
  $("resultEyebrow").textContent = `${score} of ${ROUNDS} placed right`;
  $("resultHead").textContent = score === ROUNDS ? "You have arrived. A perfect route."
    : score >= ROUNDS - 2 ? "Well navigated. Here's the full map." : "You got there. Here's how it all lays out.";
  const h = S.hints.size ? `  💡×${S.hints.size}` : "";
  $("share").textContent = `MileStory No. ${PUZZLE_NO} · ${ANCHOR.short}\n${score}/${ROUNDS}${h}\n${S.results.map(r => r ? "🟩" : "🟥").join("")}\n${location.origin}${location.pathname}`;
  $("finalLadder").innerHTML = ladderHTML(false);
  $("copy").textContent = "Copy result";
  show("result");
  zoomTo(rangeFor(S.placed), null);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", ev => {
  const t = ev.target.closest("button");
  if (!t || !P) return;
  if (t.id === "start" || t.id === "again") {
    S = fresh(); S.phase = "pair"; show("play"); render(); zoomTo(rangeFor([]), null);
    $("play").scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (t.dataset.hint) { S.hints.add(t.dataset.hint); render(); }
  else if (t.dataset.pick) judgePair(t.dataset.pick);
  else if (t.dataset.slot != null) judgeSlot(+t.dataset.slot);
  else if (t.id === "next") next();
  else if (t.id === "copy") {
    const sel = () => { const r = document.createRange(); r.selectNodeContents($("share")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); t.textContent = "Selected, copy it"; };
    try { navigator.clipboard.writeText($("share").textContent).then(() => { t.textContent = "Copied"; }, sel); } catch (e) { sel(); }
  }
});

/* ---------- Boot ---------- */
(async function boot() {
  try {
    const loaded = await loadPuzzle();
    P = loaded.puzzle; PUZZLE_NO = loaded.number; PUZZLE_DATE = loaded.date;
  } catch (e) {
    $("intro").hidden = true;
    $("loadError").hidden = false;
    $("loadError").textContent = "Today's puzzle didn't load. Check that puzzles/index.json lists it and the file name matches the date.";
    return;
  }
  ANCHOR = P.anchor;
  EVENTS = P.events;
  for (const id in EVENTS) Object.assign(EVENTS[id], { id, miles: miles(EVENTS[id].lat, EVENTS[id].lon) });
  ROUNDS = 1 + P.deal.length;

  const [y, m, d] = PUZZLE_DATE.split("-").map(Number);
  $("meta").innerHTML = `No. ${PUZZLE_NO}<br>${new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  $("anchorWhen").textContent = ANCHOR.date;
  $("anchorWhat").textContent = ANCHOR.text;
  $("anchorPlace").textContent = ANCHOR.place;
  $("ladderLabel").textContent = `Nearest to ${ANCHOR.short}, top to bottom`;
  $("mapbar").textContent = `Centered on ${ANCHOR.short}`;

  if (window.d3) {
    projection = d3.geoAzimuthalEquidistant().rotate([-ANCHOR.lon, -ANCHOR.lat]).translate([W / 2, H / 2])
      .clipAngle(170).clipExtent([[-2, -2], [W + 2, H + 2]]);
    pathGen = d3.geoPath(projection);
  }
  S = fresh();
  drawMap(curRange, null);
  await loadMap();
  drawMap(curRange, null);
})();
