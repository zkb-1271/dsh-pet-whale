/**
 * Hit-area test for the desktop overlay (overlay/renderer.html).
 *
 * Slices the renderer's <script> out of the real HTML file and drives the
 * pixel-perfect overPet() with a stubbed DOM + synthetic sprite masks, so the
 * shipped code (not a copy) is exercised. Loading the script through
 * new Function also doubles as the renderer's syntax check.
 *
 *   - only the whale's opaque pixels react; the transparent frame margins and
 *     the old +10px padding ring (220px with the menu open) no longer trigger
 *     -- this is the "big invisible circle around the whale" regression guard
 *   - the screen -> sprite mapping follows the live draw transform: position,
 *     shake/bounce fx offset and the pat squash
 *   - a hidden pet never reacts
 *   - before the sprite decodes it degrades to the plain body rect (no ring)
 *   - a real frame lifted from assets/codex/bluewhale/spritesheet.webp
 *     (fixture) produces the same verdicts
 *   - press-on-whale / release-off-whale is not counted as a tap
 *
 *   node test-hit-area.mjs
 */
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./overlay/renderer.html", import.meta.url), "utf8");
const match = html.match(/<script>([\s\S]*)<\/script>/);
if (!match) throw new Error("renderer <script> not found");
const script = match[1];
console.log("sliced renderer script:", script.split("\n").length, "lines\n");

const W = 1440, H = 900, SIZE = 120;
const PET_H = SIZE * 208 / 192;                     // 130
const POS = { x: W - 136, y: 24 };                  // renderer's initial pos
const OX = POS.x + SIZE / 2, OY = POS.y + PET_H;    // draw origin at rest

// Forward copy of the draw transform in tick(): sprite pixel -> screen point.
function spriteToScreen(sx, sy, { fxX = 0, fxY = 0, squash = 1, pos = POS, size = SIZE } = {}) {
  const ph = size * 208 / 192;
  const ox = pos.x + size / 2 + fxX, oy = pos.y + ph + fxY;
  return {
    x: ox + (-size / 2 + sx / 192 * size) * squash,
    y: oy + (-ph + sy / 208 * ph) * (2 - squash)
  };
}
function mouse(type, x, y) {
  return { type, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, target: null, preventDefault() {} };
}
// Synthetic sprite frame: fn(x, y) -> opaque?
function gridOf(fn) {
  const data = new Uint8ClampedArray(192 * 208 * 4);
  for (let y = 0; y < 208; y++) {
    for (let x = 0; x < 192; x++) {
      const i = (y * 192 + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = fn(x, y) ? 255 : 0;
    }
  }
  return data;
}

function loadOverlay() {
  const listeners = {};
  const clickThroughCalls = [];
  const ctx2d = {
    clearRect() {}, save() {}, restore() {}, translate() {}, scale() {}, drawImage() {},
    fillRect() {}, fillText() {}, globalAlpha: 1, fillStyle: "", font: "", imageSmoothingEnabled: true
  };
  const hitCtx = {
    clearRect() {}, drawImage() {},
    // Never expected to run: tests seed the mask directly. Empty = nothing hits.
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
  };
  const elements = {
    stage: { width: 0, height: 0, getContext: () => ctx2d },
    bubble: { style: {}, dataset: {}, querySelector: () => ({ textContent: "" }), offsetWidth: 0, offsetHeight: 0 },
    menu: { style: {}, innerHTML: "", append() {}, contains: () => false }
  };
  const factory = new Function(
    "window", "document", "location", "matchMedia", "fetch", "Image",
    "requestAnimationFrame", "setInterval", "clearInterval", "setTimeout", "clearTimeout",
    "innerWidth", "innerHeight", "overlayAPI", "listeners", "clickThroughCalls",
    script + `
;return {
  overPet, screenToSprite, petRect, petH, state, tick,
  get pos() { return pos; },
  get dragging() { return dragging; },
  get menuOpen() { return menuOpen; },
  get action() { return action; },
  get patrol() { return patrol; },
  get taps() { return taps; },
  get cell() { return drawnCell; },
  get clickThrough() { return clickThrough; },
  clickThroughCalls,
  setSpriteReady(v) { spriteReady = v; },
  setCell(row, col) { drawnCell = { row, col }; },
  setFx(x, y) { drawnFx = { fxX: x, fxY: y }; },
  setSquash(s) { drawnSquash = s; },
  setMask(data) { maskData = { data, width: HIT_W, height: HIT_H }; maskRow = drawnCell.row; maskCol = drawnCell.col; },
  fire(type, event) { for (const fn of listeners[type] ?? []) fn(event); }
};`
  )(
    { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); }, close() {} },
    {
      getElementById: (id) => elements[id],
      createElement: (tag) => tag === "canvas"
        ? { width: 0, height: 0, getContext: () => hitCtx }
        : { style: {}, addEventListener() {}, textContent: "" }
    },
    { search: "" },
    () => ({ matches: false }),
    () => new Promise(() => {}),                       // poll() never resolves
    class { set src(v) { this._src = v; } get src() { return this._src; } },
    () => 0,                                            // tick never auto-runs
    () => 0, () => {}, () => 0, () => {},
    W, H,
    { setClickThrough: (v) => clickThroughCalls.push(v) },
    listeners, clickThroughCalls
  );
  return factory;
}

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok ? "" : "  <- " + detail));
  if (!ok) failures++;
};
const at = (p) => mouse("mousemove", p.x, p.y);

// -------------------------------------------- synthetic whale-shaped silhouette
{
  const pet = loadOverlay();
  pet.setSpriteReady(true);
  pet.setCell(0, 0);
  // A solid blob roughly where the whale sits inside the frame.
  pet.setMask(gridOf((x, y) => x >= 40 && x < 152 && y >= 60 && y < 180));

  const mid = spriteToScreen(96, 120);
  check(pet.overPet(at(mid)), "click on the whale body hits");

  for (const [sx, sy, label] of [
    [2, 2, "top-left frame corner"], [96, 4, "above the head"], [189, 4, "top-right corner"],
    [2, 205, "bottom-left corner"], [189, 205, "bottom-right corner"], [96, 205, "below the belly"]
  ]) {
    const p = spriteToScreen(sx, sy);
    check(!pet.overPet(at(p)), `transparent frame margin misses (${label})`);
  }
  const ring = { x: POS.x + SIZE + 5, y: POS.y + PET_H / 2 };
  check(!pet.overPet(at(ring)), "5px outside the body rect misses (old +10px pad ring)");

  check(pet.overPet(at(spriteToScreen(44, 120))), "just inside the silhouette hits");
  check(!pet.overPet(at(spriteToScreen(36, 120))), "just outside the silhouette misses");

  // Shake offset: the whale is drawn 7px to one side, the mask must follow.
  const edge = spriteToScreen(36, 120);
  pet.setFx(0, 0);
  check(!pet.overPet(at(edge)), "edge point misses at rest");
  pet.setFx(-7, 0);
  check(pet.overPet(at(edge)), "hit mask follows the shake offset");
  pet.setFx(0, 0);

  // Pat squash: a thin horizontal band, only reachable through the squash scale.
  pet.setMask(gridOf((x, y) => x >= 40 && x < 152 && y >= 100 && y < 108));
  pet.setSquash(1.06);
  check(pet.overPet(at(spriteToScreen(96, 104, { squash: 1.06 }))), "hit mask follows the pat squash");
  pet.setSquash(1);

  // A different pet size re-scales the mapping.
  pet.setMask(gridOf((x, y) => x >= 40 && x < 152 && y >= 60 && y < 180));
  pet.state.config.size = 200;
  check(pet.overPet(at(spriteToScreen(96, 120, { size: 200 }))), "size 200: body still hits");
  check(!pet.overPet(at(spriteToScreen(4, 4, { size: 200 }))), "size 200: corner still misses");
  pet.state.config.size = SIZE;

  pet.state.config.visible = false;
  check(!pet.overPet(at(mid)), "hidden pet never reacts");
  pet.state.config.visible = true;

  // Before the sprite decodes: plain body rect, still no padding ring.
  pet.setSpriteReady(false);
  check(pet.overPet(at({ x: POS.x + 2, y: POS.y + 2 })), "sprite not ready: body rect stays clickable");
  check(!pet.overPet(at(ring)), "sprite not ready: no padding ring either");
  pet.setSpriteReady(true);

  // Smoke: tick() records the drawn cell the hit test then uses.
  pet.tick(1000);
  check(pet.cell.row === 0 && pet.cell.col === 0, "tick records the drawn cell");
}

// ------------------------------------- real frame from the shipped spritesheet
{
  const pet = loadOverlay();
  pet.setSpriteReady(true);
  const rows = readFileSync(new URL("./test/fixtures/bluewhale-idle-frame0.txt", import.meta.url), "utf8").trim().split("\n");
  check(rows.length === 208 && rows.every((r) => r.length === 192), "fixture is one 192x208 frame");
  const data = new Uint8ClampedArray(192 * 208 * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < 192; x++) {
      const i = (y * 192 + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = row[x] === "1" ? 255 : 0;
    }
  });
  pet.setCell(0, 0);
  pet.setMask(data);

  const belly = spriteToScreen(96, 150);
  const crown = spriteToScreen(60, 85);
  check(pet.overPet(at(belly)), "real frame: whale belly hits");
  check(pet.overPet(at(crown)), "real frame: spout crown on the whale's head hits");
  for (const [sx, sy, label] of [
    [2, 2, "top-left corner"], [96, 8, "above the head"], [188, 104, "right of the whale"],
    [2, 104, "left of the whale"], [96, 205, "below the whale"],
    [96, 104, "the transparent gap between spout and head"]
  ]) {
    const p = spriteToScreen(sx, sy);
    check(!pet.overPet(at(p)), `real frame: ${label} misses (old rect test hit it)`);
  }
  const ring = { x: POS.x + SIZE + 5, y: POS.y + PET_H / 2 };
  check(!pet.overPet(at(ring)), "real frame: 5px outside the rect misses");

  // --------------------------------- wrongly-targeted taps at the event level
  const mid = belly;
  pet.fire("mousedown", mouse("mousedown", mid.x, mid.y));
  check(pet.dragging != null, "mousedown on the whale grabs it");
  const tapsAfterPat = pet.taps.length + 1;
  pet.fire("mouseup", mouse("mouseup", mid.x, mid.y));
  check(pet.dragging == null && pet.action === "waving", "click on the whale pats it");
  check(pet.taps.length === tapsAfterPat, "the pat counts as exactly one tap");

  pet.fire("mousedown", mouse("mousedown", ring.x, ring.y));
  check(pet.dragging == null, "mousedown next to the whale does not grab it");
  pet.fire("mouseup", mouse("mouseup", ring.x, ring.y));
  check(pet.taps.length === tapsAfterPat, "click next to the whale registers no tap");

  pet.fire("mousedown", mouse("mousedown", mid.x, mid.y));
  pet.fire("mouseup", mouse("mouseup", ring.x, ring.y));
  check(pet.dragging == null, "releasing off the whale ends the grab");
  check(pet.taps.length === tapsAfterPat, "releasing off the whale registers no tap");

  // Seven quick taps still start the patrol easter egg.
  for (let i = 0; i < 7; i++) {
    pet.fire("mousedown", mouse("mousedown", mid.x, mid.y));
    pet.fire("mouseup", mouse("mouseup", mid.x, mid.y));
  }
  check(pet.patrol != null, "seven quick taps still trigger the patrol");

  pet.fire("dblclick", mouse("dblclick", mid.x, mid.y));
  check(pet.action === "jumping", "double-click on the whale jumps");
  pet.fire("dblclick", mouse("dblclick", ring.x, ring.y));
  check(pet.action === "jumping", "double-click next to the whale does nothing");

  pet.fire("contextmenu", mouse("contextmenu", mid.x, mid.y));
  check(pet.menuOpen === true, "right-click on the whale opens the menu");
  pet.fire("mousedown", mouse("mousedown", ring.x, ring.y));
  check(pet.menuOpen === false, "left-click next to the whale closes the menu");
  pet.fire("contextmenu", mouse("contextmenu", ring.x, ring.y));
  check(pet.menuOpen === false, "right-click next to the whale keeps the menu shut");

  pet.fire("mousemove", at(mid));
  check(pet.clickThroughCalls.at(-1) === false, "hovering the whale disables click-through");
  pet.fire("mousemove", at(ring));
  check(pet.clickThroughCalls.at(-1) === true, "moving off the whale re-enables click-through");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
