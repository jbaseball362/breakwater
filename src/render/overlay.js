// World-anchored 2D labels and the joystick, drawn on a canvas above the 3D view.

import { SPECIALS, TOWERS } from '../content.js';

const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';

export class Overlay {
  constructor(canvas, view) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = view;
    this.rain = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random(), v: 0.8 + Math.random() * 0.6 }));
    this.resize();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.unit = Math.max(0.85, Math.min(1.35, this.w / 430));
  }

  text(str, x, y, size, fill, weight = 800) {
    const { ctx } = this;
    ctx.font = `${weight} ${size * this.unit}px ${FONT}`;
    ctx.lineWidth = Math.max(3, size * this.unit * 0.2);
    ctx.strokeStyle = 'rgba(16,28,34,.92)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }

  drawPads(game) {
    for (const pad of game.pads) {
      const def = TOWERS[pad.type];
      if (pad.level >= def.costs.length) continue;
      const left = Math.ceil(def.costs[pad.level] - pad.paid);
      const ready = game.parts >= left;
      if (pad.level === 0) {
        const p = this.view.project(pad.x, 0, pad.z);
        this.text(def.name, p.x, p.y - 11 * this.unit, 13, '#f2f7f5', 700);
        this.text(String(left), p.x, p.y + 7 * this.unit, 21, ready ? '#ffd23f' : '#c9d0d2');
        if (pad.active) {
          const tip = this.view.project(pad.x, 3, pad.z);
          this.text(def.blurb, tip.x, tip.y, 14, '#f2f7f5', 700);
        }
      } else if (pad.active || ready) {
        const p = this.view.project(pad.x, 3.2, pad.z);
        this.text(`Upgrade ${left}`, p.x, p.y, 13, ready ? '#ffd23f' : '#c9d0d2');
      }
    }
  }

  drawHydrants(game) {
    const { ctx } = this;
    for (const b of game.belts) {
      const p = this.view.project(b.x, 3.5, b.z);
      const full = b.tank >= b.cap;
      if (b.tank > 0 || full) this.text(`+${Math.round(b.tank)}`, p.x, p.y, 20, full ? '#ff9a7a' : '#ffffff');
      if (full) this.text('Full', p.x, p.y + 16 * this.unit, 13, '#ff9a7a');
      b.specials.forEach((kind, i) => {
        const def = SPECIALS[kind];
        const y = p.y - (22 + i * 20) * this.unit;
        ctx.font = `800 ${13 * this.unit}px ${FONT}`;
        const width = ctx.measureText(def.label).width + 12;
        ctx.fillStyle = def.plate;
        ctx.fillRect(p.x - width / 2, y - 9 * this.unit, width, 18 * this.unit);
        ctx.fillStyle = def.ink;
        ctx.fillText(def.label, p.x, y + 1);
      });
    }
  }

  drawBossBars(game) {
    const { ctx } = this;
    for (const c of game.crabs) {
      if (!c.def.bar || c.t < 0) continue;
      const p = this.view.project(c.x, c.def.size * 1.25, c.z);
      const w = 120 * this.unit;
      const h = 9 * this.unit;
      ctx.fillStyle = 'rgba(16,28,34,.9)';
      ctx.fillRect(p.x - w / 2 - 2, p.y - h / 2 - 2, w + 4, h + 4);
      ctx.fillStyle = '#d9262c';
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w * Math.max(0, c.hp / c.hpMax), h);
    }
  }

  drawFloaters() {
    const { ctx } = this;
    for (const f of this.view.floaters) {
      const p = this.view.project(f.x, f.y, f.z);
      ctx.globalAlpha = Math.min(1, f.life / f.max * 2);
      this.text(f.text, p.x, p.y, 18 * f.size, f.color);
    }
    ctx.globalAlpha = 1;
  }

  drawArrow(point, time) {
    const p = this.view.project(point.x, point.y ?? 4.4, point.z);
    const bounce = Math.sin(time * 6) * 7;
    const { ctx } = this;
    const s = 15 * this.unit;
    const y = p.y - 26 * this.unit + bounce;
    ctx.beginPath();
    ctx.moveTo(p.x, y + s);
    ctx.lineTo(p.x - s, y - s * 0.4);
    ctx.lineTo(p.x + s, y - s * 0.4);
    ctx.closePath();
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(16,28,34,.92)';
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
  }

  drawJoystick(joy) {
    if (!joy.active) return;
    const { ctx } = this;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.fillStyle = 'rgba(16,28,34,.2)';
    ctx.beginPath();
    ctx.arc(joy.ox, joy.oy, joy.radius, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(246,194,28,.85)';
    ctx.beginPath();
    ctx.arc(joy.x, joy.y, joy.radius * 0.42, 0, 7);
    ctx.fill();
  }

  drawRain(dt) {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(220,235,245,.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const r of this.rain) {
      r.y += r.v * dt;
      if (r.y > 1) { r.y -= 1; r.x = Math.random(); }
      const x = r.x * this.w;
      const y = r.y * this.h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 18);
    }
    ctx.stroke();
  }

  draw(game, joy, opts) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.view.palette?.rain) this.drawRain(opts.dt);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (opts.labels) {
      this.drawPads(game);
      this.drawHydrants(game);
      this.drawBossBars(game);
      this.drawFloaters();
      if (opts.arrow) this.drawArrow(opts.arrow, opts.time);
    }
    this.drawJoystick(joy);
  }
}
