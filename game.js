/* MileStory: a daily geography game.
   Each day's puzzle lives in puzzles/YYYY-MM-DD.json and is listed in puzzles/index.json.
   Add ?date=YYYY-MM-DD to the URL to play a specific puzzle while testing. */

const R_EARTH = 3958.8; // miles
const W = 400, H = 300, FIT = 128;
const NS = "http://www.w3.org/2000/svg";
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
  if (!window.d3) return;
  try {
    const m = await (await fetch("data/map.json")).json();
    geo = {
      land: m.land, borders: m.borders, stateLines: m.stateLines, lakes: m.lakes, rivers: m.rivers,
      mountains: m.relief.filter(r => r.g).map(r => r.g),
      relief: m.relief, labels: m.labels,
      cities: m.cities,
      riverLabels: Object.values(m.rivers.features.reduce((acc, f) => {
        const { n, r } = f.properties;
        if (!n) return acc;
        const pts = f.geometry.coordinates.flat().filter((_, i) => i % 3 === 0);
        if (!acc[n]) acc[n] = { n, r, pts: [] };
        acc[n].r = Math.min(acc[n].r, r);
        acc[n].pts.push(...pts);
        return acc;
      }, {})),
    };
  } catch (e) { geo = null; }
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

/* ---------- Map drawing ----------
   Basemap (water, land, relief, rivers, borders) is painted on a canvas so zooming stays smooth.
   Rings, labels and event dots sit on an SVG layer on top. */
const svg = $("map");
const canvas = $("base");
const ctx = canvas.getContext("2d");
let colors = {}, graticule = null;

function mk(tag, attrs, text) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  ["sea", "land", "border", "coast", "river", "relief", "grat", "muted"].forEach(k => colors[k] = cs.getPropertyValue("--" + k).trim());
}
function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || W;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(w * dpr * H / W);
  return (canvas.width / W);
}

function paintBase(range) {
  const k = sizeCanvas();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = colors.sea; ctx.fillRect(0, 0, W, H);
  if (!projection) return;
  projection.scale(pxPerMile(range) * R_EARTH);
  const path = d3.geoPath(projection, ctx);
  const stroke = (geom, color, width, dash) => {
    ctx.beginPath(); path(geom); ctx.strokeStyle = color; ctx.lineWidth = width / k * k;
    ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
  };
  // graticule every 10 degrees
  stroke(graticule, colors.grat, 0.6);
  if (!geo) return;
  // land
  ctx.beginPath(); path(geo.land); ctx.fillStyle = colors.land; ctx.fill();
  // mountain ranges as a soft tint
  ctx.globalAlpha = 0.75;
  ctx.beginPath(); geo.mountains.forEach(g => path(g)); ctx.fillStyle = colors.relief; ctx.fill();
  ctx.globalAlpha = 1;
  // lakes
  ctx.beginPath(); path(geo.lakes); ctx.fillStyle = colors.sea; ctx.fill();
  // rivers: fewer, thinner ones as the map zooms out
  const maxRank = range < 400 ? 6 : range < 1200 ? 5 : range < 2500 ? 4 : 3;
  [[0, 2, 1.4], [3, 4, 1], [5, 6, 0.7]].forEach(([lo, hi, w]) => {
    const fs = geo.rivers.features.filter(f => f.properties.r >= lo && f.properties.r <= hi && f.properties.r <= maxRank);
    if (fs.length) stroke({ type: "FeatureCollection", features: fs }, colors.river, w * (range < 300 ? 1.3 : 1));
  });
  stroke(geo.lakes, colors.coast, 0.5);
  // state and country lines, then coastline
  if (range < 3500) stroke(geo.stateLines, colors.border, 0.6, [2, 2]);
  stroke(geo.borders, colors.border, 1.1);
  stroke(geo.land, colors.coast, 0.7);
}

/* label placement with simple collision boxes */
function placer() {
  const boxes = [];
  return function tryPlace(x, y, text, size, anchor, pad = 2) {
    const w = text.length * size * 0.6 + pad * 2, h = size + pad * 2;
    const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    const box = [x0, y - size - pad, x0 + w, y + pad];
    if (box[0] < 2 || box[2] > W - 2 || box[1] < 2 || box[3] > H - 2) return false;
    if (boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return false;
    boxes.push(box);
    return true;
  };
}
function inView(x, y, m = 0) { return x >= m && x <= W - m && y >= m && y <= H - m; }

function drawMap(range, newId, fast) {
  if (!fast) paintBase(range);
  svg.innerHTML = "";
  const ppm = pxPerMile(range), cx = W / 2, cy = H / 2;
  const place = placer();
  place(cx - 8, cy + 8, "xx", 8, "start", 0); // keep the anchor clear
  place(4, 22, "Centered on " + ANCHOR.short, 9, "start", 4); // keep the map badge clear

  // distance rings
  NICE.filter(m => m * ppm >= 22 && m * ppm <= FIT * 1.25).slice(-3).forEach(m => {
    const r = m * ppm;
    svg.appendChild(mk("circle", { cx, cy, r, fill: "none", stroke: "var(--water)", "stroke-width": 0.9, "stroke-dasharray": "3 4", opacity: 0.85 }));
    const lx = cx + r * 0.707 + 3, ly = cy + r * 0.707 + 10, t = m.toLocaleString() + " mi";
    if (place(lx, ly, t, 9, "start", 1)) svg.appendChild(mk("text", { x: lx, y: ly, class: "ringlb halo" }, t));
  });

  // event dots first, so their labels win
  const pts = (S ? S.placed : []).map(id => ({ e: EVENTS[id], p: screen(EVENTS[id].lat, EVENTS[id].lon, range) }));
  const later = [];
  svg.appendChild(mk("circle", { cx, cy, r: 6, fill: "var(--survey)", stroke: "var(--ink)", "stroke-width": 2 }));
  if (range < 60 && place(cx + 9, cy + 4, ANCHOR.short, 10, "start")) later.push(mk("text", { x: cx + 9, y: cy + 4, class: "lb-event halo" }, ANCHOR.short));
  pts.forEach(({ e, p }) => {
    const [x, y] = p;
    if (!inView(x, y, -10)) return;
    const isNew = e.id === newId;
    const g = mk("g", { class: "dot" + (isNew ? " new" : "") });
    g.appendChild(mk("circle", { cx: x, cy: y, r: 5.5, fill: isNew ? "var(--survey)" : "var(--ink)", stroke: "var(--sheet)", "stroke-width": 1.5 }));
    later.push(g);
    if (Math.hypot(x - cx, y - cy) > 14) {
      const right = x < W - 80, lx = right ? x + 8 : x - 8;
      if (place(lx, y + 4, e.short, 10.5, right ? "start" : "end") || isNew)
        later.push(mk("text", { x: lx, y: y + 4, "text-anchor": right ? "start" : "end", class: "lb-event halo" }, e.short));
    }
  });

  if (geo && !fast) {
    const L = geo.labels;
    const label = (lb, text, cls, size, halo) => {
      const [x, y] = screen(lb.y, lb.x, range);
      if (!inView(x, y, 4)) return;
      if (miles(lb.y, lb.x) > range * 3) return;
      if (place(x, y + size / 2, text, size, "middle"))
        svg.appendChild(mk("text", { x, y: y + size / 2 - 1, "text-anchor": "middle", class: cls + " " + halo }, text));
    };
    // seas and oceans
    const seaRank = range > 3000 ? 0 : range > 1200 ? 1 : range > 500 ? 2 : 3;
    L.filter(l => l.t === "sea" && l.r <= seaRank).forEach(l => label(l, l.n, "lb-sea", 9, "halo-sea"));
    // countries
    if (range >= 900) {
      const cRank = range > 3500 ? 2 : range > 2000 ? 3 : 4;
      L.filter(l => l.t === "country" && l.r <= cRank).sort((a, b) => a.r - b.r)
        .forEach(l => label(l, l.n, "lb-country", 8.5, "halo"));
    }
    // states and provinces
    if (range <= 2600) {
      const full = range <= 700;
      L.filter(l => l.t === "state").sort((a, b) => a.r - b.r)
        .forEach(l => label(l, full ? l.n : l.a, "lb-state", 8.5, "halo"));
    }
    // mountain ranges, plains, deserts
    if (range >= 150) {
      const rRank = range > 2500 ? 1 : range > 700 ? 2 : 3;
      geo.relief.filter(r => r.r <= rRank).forEach(r => label(r, r.n, "lb-relief", 8, "halo"));
    }
    // rivers: label each named river at a visible stretch away from the center
    if (range <= 900) {
      const vRank = range <= 250 ? 6 : range <= 500 ? 4 : 2;
      geo.riverLabels.filter(r => r.r <= vRank).forEach(r => {
        for (const [lon, lat] of r.pts) {
          const [x, y] = screen(lat, lon, range);
          const d = Math.hypot(x - cx, y - cy);
          if (!inView(x, y, 10) || d < 35 || d > 130) continue;
          if (place(x + 5, y - 3, r.n, 8.5, "start")) {
            svg.appendChild(mk("text", { x: x + 5, y: y - 3, class: "lb-river halo" }, r.n));
            break;
          }
        }
      });
    }
    // cities: more of them as the map zooms in
    const cityRank = range <= 200 ? 7 : range <= 500 ? 6 : range <= 1200 ? 3 : range <= 3000 ? 2 : 0;
    geo.cities.filter(c => c.r <= cityRank).forEach(c => {
      const [x, y] = screen(c.y, c.x, range);
      if (!inView(x, y, 8) || Math.hypot(x - cx, y - cy) < 14) return;
      if (!place(x + 4, y - 2, c.n, 9, "start")) return;
      svg.appendChild(mk("circle", { cx: x, cy: y, r: 1.8, fill: "var(--ink)" }));
      svg.appendChild(mk("text", { x: x + 4, y: y - 2, class: "lb-city halo" }, c.n));
    });
  }
  // reference cities from the puzzle file
  if (!fast) (P.landmarks || []).forEach(([name, la, lo]) => {
    const [x, y] = screen(la, lo, range);
    if (!inView(x, y, 8) || Math.hypot(x - cx, y - cy) < 20) return;
    if (!place(x + 4, y - 2, name, 9, "start")) return;
    svg.appendChild(mk("circle", { cx: x, cy: y, r: 1.8, fill: "var(--ink)" }));
    svg.appendChild(mk("text", { x: x + 4, y: y - 2, class: "lb-city halo" }, name));
  });
  later.forEach(n => svg.appendChild(n));
}
/* Zooming on an azimuthal map centered on the anchor is a pure scale around the center,
   so the animation scales two pre-rendered snapshots and cross-fades them instead of
   redrawing every coastline on every frame. */
function snapshot(range) {
  paintBase(range);
  const c = document.createElement("canvas");
  c.width = canvas.width; c.height = canvas.height;
  c.getContext("2d").drawImage(canvas, 0, 0);
  return c;
}
function zoomTo(target, newId) {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const from = curRange;
  if (reduce || Math.abs(Math.log(target / from)) < 0.01) { curRange = target; drawMap(target, newId); return; }
  const a = snapshot(from), b = snapshot(target);
  const t0 = performance.now(), dur = 900;
  function blit(img, scale, alpha) {
    const w = canvas.width, h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, w / 2 - (w * scale) / 2, h / 2 - (h * scale) / 2, w * scale, h * scale);
    ctx.globalAlpha = 1;
  }
  function step(now) {
    const k = Math.min(1, (now - t0) / dur), ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    curRange = Math.exp(Math.log(from) + (Math.log(target) - Math.log(from)) * ease);
    if (k < 1) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = colors.sea; ctx.fillRect(0, 0, canvas.width, canvas.height);
      blit(b, target / curRange, 1);
      blit(a, from / curRange, 1 - ease);
      drawMap(curRange, null, true);
      requestAnimationFrame(step);
    } else {
      drawMap(target, newId);
    }
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
function routeHTML(withGaps) {
  const sorted = [...S.placed].sort((a, b) => EVENTS[a].miles - EVENTS[b].miles);
  let html = `<li class="rung anchorrow"><span class="n">★</span><span><span class="place">${ANCHOR.place}</span><span class="ev">${ANCHOR.label}</span></span><span class="mi">0 mi</span></li>`;
  sorted.forEach((id, i) => {
    html += withGaps ? `<li><button class="gap" data-gap="${i}">Place here</button></li>` : `<li class="spacer"></li>`;
    const cls = S.last && id === S.last.id && S.phase === "feedback" ? "fresh " + (S.last.ok ? "right" : "wrong") : "";
    html += rung(EVENTS[id], i + 1, cls);
  });
  if (withGaps) html += `<li><button class="gap" data-gap="${sorted.length}">Place here</button></li>`;
  return html;
}
function render() {
  renderPips();
  $("roundLabel").textContent = `Round ${S.round + 1} of ${ROUNDS}`;
  const stage = $("stage");
  if (S.phase === "opening") {
    const [a, b] = P.openingPair.map(id => EVENTS[id]);
    stage.innerHTML = `<h2>Which happened closer to ${ANCHOR.short}?</h2>
      ${eventCard(a, `<button class="pick" data-pick="${a.id}">This one is closer</button>`)}
      <p class="vs">or</p>
      ${eventCard(b, `<button class="pick" data-pick="${b.id}">This one is closer</button>`)}`;
  } else if (S.phase === "place") {
    stage.innerHTML = `<h2>Where does this one fit?</h2>${eventCard(EVENTS[S.current])}<p class="note">Tap the gap where it belongs on your route below.</p>`;
  } else if (S.phase === "feedback") {
    const last = S.round + 1 >= ROUNDS;
    stage.innerHTML = `<p class="verdict ${S.last.ok ? "right" : "wrong"}">${S.last.msg}</p>
      <button class="primary" id="next">${last ? "See your result" : "Next event"}</button>`;
  }
  $("route").innerHTML = routeHTML(S.phase === "place");
}
function judgeOpening(pick) {
  const [a, b] = P.openingPair.map(id => EVENTS[id]);
  const closer = a.miles < b.miles ? a : b, farther = closer === a ? b : a;
  const ok = pick === closer.id;
  S.placed.push(a.id, b.id);
  S.results.push(ok);
  S.last = { id: pick, ok, msg: `${ok ? "Right on course." : "Recalculating…"} ${closer.what}: ${closer.place}, ${fmt(closer.miles)} away. ${farther.what}: ${farther.place}, ${fmt(farther.miles)} away.` };
  S.phase = "feedback";
  render();
  zoomTo(rangeFor(S.placed), null);
}
function judgeGap(k) {
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
  S.current = P.incoming[S.round - 1];
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
  $("finalRoute").innerHTML = routeHTML(false);
  $("copy").textContent = "Copy result";
  show("result");
  zoomTo(rangeFor(S.placed), null);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", ev => {
  const t = ev.target.closest("button");
  if (!t || !P) return;
  if (t.id === "start" || t.id === "again") {
    S = fresh(); S.phase = "opening"; show("play"); render(); zoomTo(rangeFor([]), null);
    $("play").scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (t.dataset.hint) { S.hints.add(t.dataset.hint); render(); }
  else if (t.dataset.pick) judgeOpening(t.dataset.pick);
  else if (t.dataset.gap != null) judgeGap(+t.dataset.gap);
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
  ROUNDS = 1 + P.incoming.length;

  const [y, m, d] = PUZZLE_DATE.split("-").map(Number);
  $("meta").innerHTML = `No. ${PUZZLE_NO}<br>${new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  $("anchorWhen").textContent = ANCHOR.date;
  $("anchorWhat").textContent = ANCHOR.text;
  $("anchorPlace").textContent = ANCHOR.place;
  $("routeLabel").textContent = `Nearest to ${ANCHOR.short}, top to bottom`;
  $("mapbar").textContent = `Centered on ${ANCHOR.short}`;

  if (window.d3) {
    projection = d3.geoAzimuthalEquidistant().rotate([-ANCHOR.lon, -ANCHOR.lat]).translate([W / 2, H / 2])
      .clipAngle(170).precision(0).clipExtent([[-2, -2], [W + 2, H + 2]]);
    pathGen = d3.geoPath(projection);
    graticule = d3.geoGraticule10();
  }
  readColors();
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); drawMap(curRange, null); });
  window.addEventListener("resize", () => drawMap(curRange, null));
  S = fresh();
  drawMap(curRange, null);
  await loadMap();
  drawMap(curRange, null);
})();
