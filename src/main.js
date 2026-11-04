// Boot, the game loop, input, menus and the HUD.

import { SPECIALS, statLines, TOWERS, WORLD } from './content.js';
import { ATTRACT, LEVELS, ZONES } from './levels.js';
import { choosePad, createGame, sendNextWave, starsFor, stepGame, STEP } from './sim.js';
import { audio } from './audio.js';
import { View } from './render/view.js';
import { Overlay } from './render/overlay.js';

const $ = (id) => document.getElementById(id);

const SAVE_KEY = 'breakwater.save.v2';

// Each browser keeps its own save, so a reset has to ship with the game to reach all of them.
// These are from before the 50-level rebalance, and their bolts mean nothing on the new levels.
const RETIRED_KEYS = ['breakwater.save.v1', 'breakwater.log.v1'];

function clearRetiredSaves() {
  try {
    for (const key of RETIRED_KEYS) localStorage.removeItem(key);
  } catch {
    // Storage can be refused in a private window, and then there's nothing to clear.
  }
}

function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    return { stars: raw?.stars ?? {}, muted: !!raw?.muted };
  } catch {
    return { stars: {}, muted: false };
  }
}

clearRetiredSaves();
const save = loadSave();

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Private windows can refuse storage. The game still plays, it just won't remember.
  }
}

const LOG_KEY = 'breakwater.log.v2';
const LOG_LIMIT = 300;

// A record of how each attempt went, for checking the difficulty curve against real play.
// It stays in this browser and is never sent anywhere.
function logRun(outcome) {
  try {
    const runs = JSON.parse(localStorage.getItem(LOG_KEY)) ?? [];
    runs.push({
      at: Date.now(),
      level: level.id,
      name: level.name,
      threat: level.threat,
      outcome,
      hp: Math.ceil(game.hp),
      hpMax: game.hpMax,
      bolts: starsFor(game),
      secs: Math.round(game.time),
      wave: game.waveIndex,
      waves: game.def.waves.length,
      kills: game.stats.kills,
      leaked: game.stats.leaked,
      collected: Math.round(game.stats.collected),
      unspent: Math.floor(game.parts),
      stalled: Math.round(game.stats.stalled),
      pads: game.pads.map((p) => `${p.type ?? 'empty'}:${p.level}`).join(' '),
    });
    localStorage.setItem(LOG_KEY, JSON.stringify(runs.slice(-LOG_LIMIT)));
  } catch {
    // Same as the save: if storage is refused, the game carries on without it.
  }
}

const isUnlocked = (level) => level.id === 1 || (save.stars[level.id - 1] ?? 0) > 0;

// ---------- Input ----------

const joy = { active: false, ox: 0, oy: 0, x: 0, y: 0, radius: 46, id: null, mx: 0, mz: 0 };
const keys = new Set();
const input = { mx: 0, mz: 0 };

function readInput() {
  let kx = 0;
  let kz = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) kx -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) kx += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) kz -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) kz += 1;
  if (kx || kz) {
    const len = Math.hypot(kx, kz);
    input.mx = kx / len;
    input.mz = kz / len;
  } else {
    input.mx = joy.mx;
    input.mz = joy.mz;
  }
}

function bindInput(surface) {
  // A long press is just standing still with your thumb down, not a request for a menu.
  surface.addEventListener('contextmenu', (e) => e.preventDefault());
  surface.addEventListener('pointerdown', (e) => {
    audio.unlock();
    if (joy.active) return;
    joy.active = true;
    joy.id = e.pointerId;
    joy.ox = joy.x = e.clientX;
    joy.oy = joy.y = e.clientY;
    joy.mx = joy.mz = 0;
    surface.setPointerCapture(e.pointerId);
  });
  surface.addEventListener('pointermove', (e) => {
    if (!joy.active || e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox;
    let dy = e.clientY - joy.oy;
    let d = Math.hypot(dx, dy);
    // The base trails your thumb, so changing direction never means dragging all the way back.
    if (d > joy.radius) {
      const pull = (d - joy.radius) / d;
      joy.ox += dx * pull;
      joy.oy += dy * pull;
      dx -= dx * pull;
      dy -= dy * pull;
      d = joy.radius;
    }
    joy.x = e.clientX;
    joy.y = e.clientY;
    // Full speed comes early, so you don't have to reach for the rim to run.
    const eased = d < 4 ? 0 : 0.5 + 0.5 * Math.min(1, d / (joy.radius * 0.6));
    joy.mx = d ? dx / d * eased : 0;
    joy.mz = d ? dy / d * eased : 0;
  });
  const end = (e) => {
    if (e.pointerId !== joy.id) return;
    joy.active = false;
    joy.mx = joy.mz = 0;
  };
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', end);

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (/^(Arrow|Key[WASD])/.test(e.code)) {
      keys.add(e.code);
      audio.unlock();
      if (mode === 'playing') e.preventDefault();
    }
    if ((e.code === 'Escape' || e.code === 'KeyP') && (mode === 'playing' || mode === 'paused')) togglePause();
    const digit = /^Digit([1-6])$/.exec(e.code);
    const pad = mode === 'playing' && game.pads.find((p) => p.active);
    if (digit && pad && pad.level === 0 && game.offer[digit[1] - 1]) pickTower(pad, game.offer[digit[1] - 1]);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    joy.active = false;
    joy.mx = joy.mz = 0;
  });
}

// ---------- Screens ----------

let mode = 'title';
let view;
let overlay;
let game;
let level = null;
let speed = 1;
let accumulator = 0;
let resultShown = 0;

const SCREENS = ['screen-title', 'screen-levels', 'screen-pause', 'screen-result'];

function showScreen(id) {
  for (const name of SCREENS) $(name).hidden = name !== id;
  $('hud').hidden = !(mode === 'playing' || mode === 'paused' || mode === 'ended');
}

function goTitle() {
  mode = 'title';
  startAttract();
  showScreen('screen-title');
}

function goLevels() {
  mode = 'levels';
  if (!game || game.def !== ATTRACT) startAttract();
  renderLevelList();
  showScreen('screen-levels');
  $('screen-levels').scrollTop = 0;
}

function startAttract() {
  level = null;
  game = createGame(ATTRACT);
  view.loadLevel(game);
  game.hero.x = -7.6;
  game.hero.z = 4.6;
}

function boltsHtml(count) {
  return [0, 1, 2].map((i) => `<span class="bolt${i < count ? ' on' : ''}"></span>`).join('');
}

function renderLevelList() {
  const list = $('level-list');
  list.textContent = '';
  const next = LEVELS.find((l) => !(save.stars[l.id] > 0));
  let total = 0;
  for (const zone of ZONES) {
    const heading = document.createElement('h3');
    heading.className = 'zone-name';
    heading.textContent = zone.name;
    const grid = document.createElement('div');
    grid.className = 'zone-grid';
    for (const l of LEVELS.filter((x) => x.zone === zone.key)) {
      const stars = save.stars[l.id] ?? 0;
      total += stars;
      const button = document.createElement('button');
      button.className = `plate level-plate${l === next ? ' current' : ''}`;
      button.disabled = !isUnlocked(l);
      button.setAttribute('aria-label', `Level ${l.id}, ${l.name}. ${button.disabled ? 'Locked' : `${stars} of 3 bolts`}`);
      button.innerHTML = `<span class="num">${l.id}</span><span class="name"></span><span class="bolts">${boltsHtml(stars)}</span>`;
      button.querySelector('.name').textContent = l.name;
      button.addEventListener('click', () => startLevel(l));
      grid.append(button);
    }
    list.append(heading, grid);
  }
  $('bolt-total').innerHTML = `<span class="bolt"></span>${total} of ${LEVELS.length * 3}`;
}

// ---------- Playing ----------

const hudCache = {};
let bannerT = 0;
let coachStep = 0;
let coachT = 0;

// ---------- The pad panel: choosing a tower and seeing what an upgrade buys ----------

let panelSignature = null;

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pickTower(pad, type) {
  audio.unlock();
  choosePad(game, pad, type);
  panelSignature = null;
}

function statsBlock(pad) {
  const def = TOWERS[pad.type];
  const maxed = pad.level >= def.costs.length;
  const box = $('pad-stats');
  box.textContent = '';
  let title = `${def.name}, level ${pad.level} \u2192 ${pad.level + 1}`;
  if (pad.level === 0) title = def.name;
  if (maxed) title = `${def.name}, max level`;
  box.append(make('h3', '', title), make('p', 'stat-blurb', def.blurb));

  for (const line of statLines(pad.type, pad.level)) {
    const row = make('div', 'stat-row');
    row.append(make('span', '', line.label));
    const value = make('span', 'stat-value');
    if (line.next === null) {
      value.textContent = line.now;
    } else if (line.now === null || line.now === line.next) {
      value.append(make('b', '', line.next));
    } else {
      value.append(`${line.now} \u2192 `, make('b', '', line.next));
    }
    row.append(value);
    box.append(row);
  }
  if (!maxed && pad.level > 0) {
    box.append(make('p', 'stat-note', pad.armed ? `Upgrade costs ${def.costs[pad.level]}` : 'Step off and back on to buy the next level'));
  }
}

function choiceCards(pad) {
  const box = $('pad-panel');
  box.textContent = '';
  const benchTaken = game.pads.some((p) => p !== pad && p.type === 'bench');
  for (const type of game.offer) {
    if (type === 'bench' && benchTaken) continue;
    const def = TOWERS[type];
    const cost = def.costs[0];
    const card = make('button', `plate tower-card${pad.type === type ? ' selected' : ''}${game.parts < cost ? ' short' : ''}`);
    const swatch = make('span', 'tower-swatch');
    swatch.style.background = `#${def.color.toString(16).padStart(6, '0')}`;
    card.append(swatch, make('span', 'tower-name', def.name), make('span', 'tower-cost', String(cost)), make('span', 'tower-role', def.role));
    if (level.newTowers?.includes(type)) card.append(make('span', 'tower-new', 'New'));
    card.addEventListener('click', () => pickTower(pad, type));
    box.append(card);
  }
}

function updatePadPanel() {
  const panel = $('pad-panel');
  const stats = $('pad-stats');
  const pad = mode === 'playing' ? game.pads.find((p) => p.active) : null;
  if (!pad) {
    panel.hidden = true;
    stats.hidden = true;
    panelSignature = null;
    return;
  }
  const choosing = pad.level === 0 && game.offer.length > 1;
  const canAfford = choosing ? game.offer.map((type) => game.parts >= TOWERS[type].costs[0]).join() : '';
  const signature = [game.pads.indexOf(pad), pad.type, pad.level, pad.armed, canAfford].join('|');
  if (signature === panelSignature) return;
  panelSignature = signature;
  if (pad.type) {
    statsBlock(pad);
    // They share a spot on screen, and these stats are what matters while you're on a pad.
    $('banner').hidden = true;
    bannerT = 0;
  }
  stats.hidden = !pad.type;
  if (choosing) choiceCards(pad);
  panel.hidden = !choosing;
}

function setText(id, value) {
  if (hudCache[id] !== value) {
    hudCache[id] = value;
    $(id).textContent = value;
  }
}

function showBanner(text, seconds = 3, alert = false) {
  const el = $('banner');
  el.textContent = text;
  el.hidden = false;
  el.classList.toggle('alert', alert);
  bannerT = seconds;
}

function startLevel(l) {
  level = l;
  game = createGame(l);
  view.loadLevel(game);
  mode = 'playing';
  speed = 1;
  $('btn-speed').textContent = '1x';
  accumulator = 0;
  resultShown = 0;
  coachStep = 0;
  coachT = 0;
  for (const key of Object.keys(hudCache)) delete hudCache[key];
  $('banner').hidden = true;
  $('coach').hidden = true;
  $('pad-panel').hidden = true;
  $('pad-stats').hidden = true;
  panelSignature = null;
  showScreen(null);
  if (l.intro) showBanner(l.intro, 7);
  audio.unlock();
}

function togglePause() {
  if (mode === 'playing') {
    mode = 'paused';
    showScreen('screen-pause');
  } else if (mode === 'paused') {
    mode = 'playing';
    showScreen(null);
  }
}

function endTip(g) {
  const unspent = Math.floor(g.parts);
  if (unspent >= 100) return `You finished holding ${unspent} parts. Spend them sooner.`;
  if (g.stats.stalled > g.time * 0.4) return 'Your hydrants sat full for a long time, and a full hydrant stops its belt. Empty them more often.';
  const empty = g.pads.filter((p) => p.level === 0).length;
  if (empty > 0) return `${empty} pad${empty > 1 ? 's' : ''} never got built. Keep the plates moving and build earlier.`;
  return 'Every pad was built. Upgrade the towers nearest the gate first.';
}

function showResult() {
  mode = 'ended';
  const won = game.phase === 'won';
  const stars = starsFor(game);
  const nextLevel = LEVELS[level.id];
  logRun(won ? 'won' : 'lost');
  if (won && stars > (save.stars[level.id] ?? 0)) {
    save.stars[level.id] = stars;
    writeSave();
  }
  $('result-title').textContent = won ? 'Causeway held' : 'Pump house flooded';
  $('result-bolts').innerHTML = won ? boltsHtml(stars) : '';
  $('result-bolts').hidden = !won;
  if (won) {
    const share = Math.round(game.hp / game.hpMax * 100);
    const goal = stars < 3 ? ' 3 bolts takes 90%.' : '';
    $('result-text').textContent = nextLevel
      ? `Pump house at ${share}%.${goal}`
      : `Pump house at ${share}%.${goal} That was the last level. The causeway is yours.`;
  } else {
    $('result-text').textContent = endTip(game);
  }
  $('btn-next').hidden = !(won && nextLevel);
  $('btn-retry').textContent = won ? 'Play again' : 'Try again';
  $('btn-retry').classList.toggle('primary', !won || !nextLevel);
  showScreen('screen-result');
}

function coach(dt) {
  // First level only: walks a new player through one full loop of the game.
  const el = $('coach');
  if (level?.id !== 1 || mode !== 'playing') { el.hidden = true; return null; }
  const built = game.pads.filter((p) => p.level > 0);
  const cheapest = game.pads.find((p) => p.level === 0);
  const fullest = [...game.belts].sort((a, b) => b.tank - a.tank)[0];
  let message = null;
  let arrow = null;

  if (coachStep === 0 && game.stats.collected > 0) coachStep = 1;
  if (coachStep === 1 && built.length > 0) { coachStep = 2; coachT = 7; }
  if (coachStep === 0) {
    message = 'Drag anywhere to walk, or use WASD. Step into a hydrant ring to open its valve.';
    arrow = { x: fullest.x, y: 4.6, z: fullest.z };
  } else if (coachStep === 1) {
    const need = TOWERS[cheapest.type].costs[0] - cheapest.paid;
    if (game.parts >= need) {
      message = 'Now stand on a pad. Your parts pay for the tower.';
      arrow = { x: cheapest.x, y: 2.2, z: cheapest.z };
    } else {
      message = 'Collect a few more parts. Belts keep feeding the hydrants.';
      arrow = { x: fullest.x, y: 4.6, z: fullest.z };
    }
  } else if (coachStep === 2) {
    coachT -= dt;
    message = 'You and your towers fire on their own. Keep collecting and building.';
    if (coachT <= 0) { coachStep = 3; coachT = 6; }
  } else if (coachStep === 3) {
    coachT -= dt;
    message = 'Stand on a tower to upgrade it. Walking through crabs slows you down.';
    if (coachT <= 0) coachStep = 4;
  }
  // The pad panel sits in the same spot, and it's what matters while you're standing on a pad.
  el.hidden = !message || !$('pad-panel').hidden;
  if (message) setText('coach', message);
  return arrow;
}

function updateHud(dt) {
  const partsText = String(Math.floor(game.parts + 1e-6));
  if (hudCache.parts !== partsText) {
    setText('parts', partsText);
  }
  const share = Math.max(0, game.hp / game.hpMax);
  if (hudCache.share !== share) {
    hudCache.share = share;
    $('gauge-fill').style.transform = `scaleX(${share})`;
    const gauge = $('gauge');
    gauge.classList.toggle('warn', share <= 0.6 && share > 0.3);
    gauge.classList.toggle('danger', share <= 0.3);
    gauge.setAttribute('aria-label', `Pump house health ${game.hp} of ${game.hpMax}`);
  }
  setText('hp', String(Math.ceil(game.hp)));

  const total = game.def.waves.length;
  let waveText;
  let canSend = false;
  if (game.waveIndex < total) {
    waveText = game.waveIndex === 0
      ? `First wave in ${Math.ceil(game.waveT)}s`
      : `Wave ${game.waveIndex} of ${total}. Next in ${Math.ceil(game.waveT)}s`;
    canSend = true;
  } else {
    waveText = `Final wave: ${game.crabs.length} crabs left`;
  }
  setText('wave-text', waveText);
  $('btn-send').hidden = !canSend;

  const chips = [];
  if (game.fx.chill > 0) chips.push(['chill', game.fx.chill]);
  if (game.fx.surge > 0) chips.push(['surge', game.fx.surge]);
  const signature = chips.map(([k, t]) => `${k}${Math.ceil(t)}`).join();
  if (hudCache.fx !== signature) {
    hudCache.fx = signature;
    const box = $('effects');
    box.textContent = '';
    for (const [kind, t] of chips) {
      const def = SPECIALS[kind];
      const chip = document.createElement('span');
      chip.className = 'effect';
      chip.style.background = def.plate;
      chip.style.color = def.ink;
      chip.textContent = `${def.label} ${Math.ceil(t)}s`;
      box.append(chip);
    }
  }

  if (bannerT > 0) {
    bannerT -= dt;
    if (bannerT <= 0) $('banner').hidden = true;
  }
}

function drainEvents() {
  const playing = mode === 'playing' || mode === 'ended';
  for (const e of game.events) {
    if (!playing) break;
    if (e.t === 'built') navigator.vibrate?.(15);
    if (e.t === 'special') showBanner(SPECIALS[e.kind].banner, 2.6);
    if (e.t === 'wave' && e.index === e.total) showBanner('Final wave', 2.2, true);
    if (e.t === 'wave' && game.def.waves[e.index - 1].groups.some((g) => g.type === 'king')) showBanner('A King crab is coming', 3, true);
  }
  view.handleEvents(game, game.events, mode !== 'title' && mode !== 'levels');
}

function advance(seconds) {
  accumulator += seconds;
  let steps = 0;
  while (accumulator >= STEP && steps < 16) {
    accumulator -= STEP;
    steps++;
    readInput();
    stepGame(game, mode === 'playing' ? input : null);
  }
  if (steps >= 16) accumulator = 0;
}

let lastFrame = performance.now();

function frame(now) {
  const real = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  tick(real);
  requestAnimationFrame(frame);
}

function tick(real) {
  let simDt = 0;
  if (mode === 'playing') {
    simDt = real * speed;
    advance(simDt);
    if (game.phase !== 'playing' && !resultShown) {
      // Hold a beat so the last explosion or leak can land before the dialog.
      resultShown = performance.now();
    }
    if (resultShown && performance.now() - resultShown > 1100) showResult();
  } else if (mode === 'title' || mode === 'levels') {
    simDt = real;
    advance(simDt);
    if (game.phase !== 'playing') startAttract();
  }
  drainEvents();

  view.update(game, mode === 'paused' ? 0 : Math.max(simDt, real * 0.0001));
  view.render();

  const inPlay = mode === 'playing' || mode === 'paused' || mode === 'ended';
  if (inPlay) updatePadPanel();
  const arrow = inPlay ? coach(simDt) : null;
  if (inPlay) updateHud(simDt);
  overlay.draw(game, joy, { dt: real, time: performance.now() / 1000, labels: inPlay, arrow });
}

function bindUi() {
  $('btn-play').addEventListener('click', () => { audio.unlock(); goLevels(); });
  $('btn-install').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('btn-install').hidden = true;
  });
  $('btn-levels-back').addEventListener('click', goTitle);
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-resume').addEventListener('click', togglePause);
  $('btn-restart').addEventListener('click', () => { logRun('quit'); startLevel(level); });
  $('btn-quit').addEventListener('click', () => { logRun('quit'); goLevels(); });
  $('btn-retry').addEventListener('click', () => startLevel(level));
  $('btn-result-levels').addEventListener('click', goLevels);
  $('btn-next').addEventListener('click', () => startLevel(LEVELS[level.id]));
  $('btn-send').addEventListener('click', () => sendNextWave(game));
  $('btn-speed').addEventListener('click', () => {
    speed = speed === 1 ? 2 : 1;
    $('btn-speed').textContent = `${speed}x`;
  });
  const soundLabel = () => { $('btn-sound').textContent = audio.muted ? 'Sound off' : 'Sound on'; };
  $('btn-sound').addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    save.muted = audio.muted;
    writeSave();
    soundLabel();
  });
  audio.setMuted(save.muted);
  soundLabel();

  addEventListener('resize', () => {
    view.resize();
    overlay.resize();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'playing') togglePause();
  });
}

function showGraphicsProblem(message) {
  $('fatal-text').textContent = message;
  $('fatal').hidden = false;
}

function webglAvailable() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

// A driver crash or graphics card reset can take 3D away while the game is running.
function watchForGraphicsResets(canvas) {
  canvas.addEventListener('webglcontextlost', () => {
    if (mode === 'playing') togglePause();
    showGraphicsProblem('Your graphics card reset, so the game has paused until it comes back. If this message stays, reload the game. Reloading restarts the level you are on and keeps your bolts.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    $('fatal').hidden = true;
  });
}

function setUpOffline() {
  // Browsers only allow a service worker on HTTPS or localhost. Anywhere else the game still
  // plays, it just needs the connection each time.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline copy unavailable:', err));
  }
}

// Chrome offers an install prompt we can trigger from our own button. iOS has no equivalent:
// people use Add to Home Screen in the share menu.
let installPrompt = null;

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('btn-install').hidden = false;
});

addEventListener('appinstalled', () => {
  installPrompt = null;
  $('btn-install').hidden = true;
});

async function boot() {
  $('btn-fatal-reload').addEventListener('click', () => location.reload());

  // Plates are drawn to canvases, so their font has to be ready before the first one.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('800 64px "Barlow Condensed"'), document.fonts.load('400 64px "Saira Stencil One"')]),
      new Promise((resolve) => { setTimeout(resolve, 2500); }),
    ]);
  } catch {
    // Falls back to system fonts.
  }

  try {
    view = new View($('world'));
  } catch (err) {
    showGraphicsProblem(webglAvailable()
      ? `The game hit an error while starting: ${err.message}`
      : "This browser isn't providing 3D graphics, which the game needs. Check that graphics or hardware acceleration is on in the browser's settings, then quit the browser completely and reopen it.");
    throw err;
  }
  watchForGraphicsResets($('world'));
  overlay = new Overlay($('overlay'), view);
  view.onSound = (name, opts) => audio.play(name, opts);

  setUpOffline();
  bindInput($('overlay'));
  bindUi();
  goTitle();

  // A debugging handle for driving the game from the console or an automated browser.
  window.__breakwater = {
    get game() { return game; },
    get mode() { return mode; },
    view,
    input,
    startLevel: (id) => startLevel(LEVELS[id - 1]),
    frame,
    run(seconds, mx = 0, mz = 0) {
      joy.mx = mx;
      joy.mz = mz;
      const dt = 1 / 30;
      for (let t = 0; t < seconds; t += dt) tick(dt);
      joy.mx = joy.mz = 0;
    },
    WORLD,
  };

  requestAnimationFrame(frame);
}

boot();
