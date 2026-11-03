// Bots that play levels headless. They bracket a real player:
// idle should lose nearly everything, casual stands in for a distracted first attempt, and expert
// never hesitates or walks the wrong way. Expert tries several styles and keeps the best, so the
// difficulty curve isn't measured against one bot's bad habit.
// None of them time the special plates, so a sharp player can still beat the expert.

import { TOWERS, WORLD } from '../src/content.js';
import { createGame, stepGame, STEP } from '../src/sim.js';

const MAX_SECONDS = 1200;

const remaining = (p) => TOWERS[p.type].costs[p.level] - p.paid;

// Each one picks what to buy next from the pads that can still be upgraded.
const BUILD_ORDERS = {
  buildAllFirst: (open) => open.sort((a, b) => a.level - b.level)[0],
  cheapest: (open) => open.sort((a, b) => remaining(a) - remaining(b))[0],
  finishEach: (open) => open[0],
  buildThenCheapest: (open) => open.sort((a, b) => (a.level === 0) - (b.level === 0) || remaining(a) - remaining(b)).find((p) => p.level === 0) ?? open.sort((a, b) => remaining(a) - remaining(b))[0],
};

export const BOTS = {
  idle: null,
  casual: { think: 1.6, walk: 0.7, minTank: 25, order: 'cheapest' },
};

// Every build order, both emptying hydrants constantly and staying put to shoot for longer.
// Casual is in the list too: if its slower play happens to work best on a level, that's what counts.
export const EXPERT_STYLES = [
  ...Object.keys(BUILD_ORDERS).flatMap((order) => [12, 45].map((minTank) => ({ think: 0.1, walk: 1, minTank, order }))),
  BOTS.casual,
];

function nextPurchase(game, cfg) {
  const open = game.pads.filter((p) => p.level < TOWERS[p.type].costs.length);
  return open.length ? BUILD_ORDERS[cfg.order](open) : null;
}

function chooseGoal(game, cfg) {
  const want = nextPurchase(game, cfg);
  if (want && want.armed) {
    const need = TOWERS[want.type].costs[want.level] - want.paid;
    if (game.parts >= need || (want.active && game.parts > 0 && want.paid > 0)) {
      return { x: want.x, z: want.z, stop: WORLD.padR * 0.6 };
    }
  }
  const worth = (b) => b.tank + b.specials.length * 50;
  const tank = [...game.belts].sort((a, b) => worth(b) - worth(a))[0];
  if (tank && (tank.tank >= cfg.minTank || tank.specials.length || (tank.open && tank.tank > 0))) {
    return { x: tank.x, z: tank.z, stop: WORLD.ringR * 0.7 };
  }
  // Nothing to do: wait just south of the nearest hydrant, which is never in a lane.
  const near = [...game.belts].sort((a, b) => Math.abs(a.x - game.hero.x) - Math.abs(b.x - game.hero.x))[0];
  return { x: near.x, z: near.z + WORLD.ringR + 0.4, stop: 0.5 };
}

function play(def, cfg, seed, onStep) {
  const game = createGame(def, seed);
  let goal = null;
  let thinkT = 0;
  const input = { mx: 0, mz: 0 };
  const limit = MAX_SECONDS / STEP;

  for (let i = 0; i < limit && game.phase === 'playing'; i++) {
    if (cfg) {
      thinkT -= STEP;
      if (thinkT <= 0) {
        goal = chooseGoal(game, cfg);
        thinkT = cfg.think;
      }
      const dx = goal.x - game.hero.x;
      const dz = goal.z - game.hero.z;
      const d = Math.hypot(dx, dz);
      input.mx = d > goal.stop ? dx / d * cfg.walk : 0;
      input.mz = d > goal.stop ? dz / d * cfg.walk : 0;
    }
    stepGame(game, input);
    game.events.length = 0;
    onStep?.(game);
  }
  return game;
}

export const playLevel = (def, botName, seed = 1) => play(def, BOTS[botName], seed);

export const hpShare = (game) => (game.phase === 'won' ? game.hp / game.hpMax : 0);

export const playStyle = (def, style, seed = 1, onStep) => play(def, style, seed, onStep);

// The best result any style gets on this seed.
export function bestExpert(def, seed = 1) {
  let best = null;
  for (const style of EXPERT_STYLES) {
    const game = playStyle(def, style, seed);
    game.style = style;
    if (!best || hpShare(game) > hpShare(best)) best = game;
  }
  return best;
}
