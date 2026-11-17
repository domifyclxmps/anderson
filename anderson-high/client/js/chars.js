// Cartoon students drawn with canvas paths: unique colour, hats, idle/walk animation, ghost + knocked-out forms.
import { COLORS } from '/shared/constants.js';

export const hexOf = (ci) => COLORS[ci]?.hex || '#888';
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function drawHat(c, hat, hy, tint) {
  switch (hat) {
    case 'cap':
      c.fillStyle = '#e8453c'; c.beginPath(); c.arc(0, hy - 2, 9.6, Math.PI, 0); c.fill();
      c.fillStyle = '#b92f28'; rr(c, 3, hy - 3, 11, 3.2, 1.6); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, hy - 8, 1.4, 0, 7); c.fill(); break;
    case 'beanie':
      c.fillStyle = '#4f7de8'; c.beginPath(); c.arc(0, hy - 2.5, 10, Math.PI, 0); c.fill();
      c.fillStyle = '#3459b8'; rr(c, -10, hy - 4, 20, 3.4, 1.7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, hy - 12.5, 3, 0, 7); c.fill(); break;
    case 'headphones':
      c.strokeStyle = '#222b3f'; c.lineWidth = 2.4; c.beginPath(); c.arc(0, hy, 10.4, Math.PI * 1.02, Math.PI * 1.98); c.stroke();
      c.fillStyle = '#e0457b'; rr(c, -12.6, hy - 3.5, 4.4, 8, 2); c.fill(); rr(c, 8.2, hy - 3.5, 4.4, 8, 2); c.fill(); break;
    case 'glasses':
      c.strokeStyle = '#1b2236'; c.lineWidth = 1.5; c.beginPath(); c.arc(1.2, hy + 1, 3.2, 0, 7); c.arc(7.4, hy + 1, 3.2, 0, 7); c.moveTo(4.4, hy + 1); c.lineTo(4.2, hy + 1); c.stroke();
      c.fillStyle = 'rgba(160,220,255,.35)'; c.beginPath(); c.arc(1.2, hy + 1, 3.1, 0, 7); c.arc(7.4, hy + 1, 3.1, 0, 7); c.fill(); break;
    case 'bow':
      c.fillStyle = '#ff5fa2'; c.beginPath(); c.moveTo(-3, hy - 9); c.lineTo(-10, hy - 14); c.lineTo(-10, hy - 5); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(-3, hy - 9); c.lineTo(4, hy - 14); c.lineTo(4, hy - 5); c.closePath(); c.fill();
      c.fillStyle = '#d63a80'; c.beginPath(); c.arc(-3, hy - 9, 2.4, 0, 7); c.fill(); break;
    case 'crown':
      c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(-8, hy - 7); c.lineTo(-8, hy - 16); c.lineTo(-4, hy - 11); c.lineTo(0, hy - 17); c.lineTo(4, hy - 11); c.lineTo(8, hy - 16); c.lineTo(8, hy - 7); c.closePath(); c.fill();
      c.fillStyle = '#e8453c'; c.beginPath(); c.arc(0, hy - 10, 1.5, 0, 7); c.fill(); break;
    case 'headband':
      c.fillStyle = '#ff7b2e'; rr(c, -9.8, hy - 6.5, 19.6, 3.6, 1.8); c.fill();
      c.fillStyle = '#fff'; c.fillRect(-1, hy - 6.5, 2, 3.6); break;
    case 'flower':
      for (let i = 0; i < 5; i++) { const a = i * 1.2566; c.fillStyle = '#ff9ccf'; c.beginPath(); c.arc(-6 + Math.cos(a) * 3.2, hy - 9 + Math.sin(a) * 3.2, 2.3, 0, 7); c.fill(); }
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(-6, hy - 9, 1.8, 0, 7); c.fill(); break;
    case 'gradcap':
      c.fillStyle = '#20263a'; c.beginPath(); c.moveTo(0, hy - 16); c.lineTo(13, hy - 10); c.lineTo(0, hy - 5); c.lineTo(-13, hy - 10); c.closePath(); c.fill();
      c.fillStyle = '#2d3550'; rr(c, -6, hy - 8, 12, 5, 2); c.fill();
      c.strokeStyle = '#ffd23f'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, hy - 10.5); c.lineTo(11, hy - 9); c.lineTo(11, hy - 3); c.stroke(); break;
    default:
  }
}

/** o: {x,y,color,hat,facing,moving,t,ghost,scale,alpha,shadow,blink} */
export function drawChar(c, o) {
  const { x, y, facing = 1, moving = false, t = 0, ghost = false, scale = 1, hat = 'none' } = o;
  const base = hexOf(o.color), dark = shade(base, -0.3), light = shade(base, 0.32);
  c.save(); c.translate(x, y); c.scale(scale * facing, scale);
  if (o.lean) c.rotate(o.lean);
  if (o.squash && o.squash !== 1) c.scale(1 / Math.sqrt(o.squash), o.squash);
  c.globalAlpha = (o.alpha ?? 1) * (ghost ? 0.55 : 1);
  const bob = moving ? -Math.abs(Math.sin(t * 12)) * 1.8 : Math.sin(t * 2.4) * 0.7;
  const swing = moving ? Math.sin(t * 12) * 3.4 : 0;
  const lift = ghost ? Math.sin(t * 3) * 2.5 - 5 : 0;
  if (ghost) c.rotate(Math.sin(t * 2.2) * 0.07);
  if (o.shadow !== false) { c.fillStyle = 'rgba(0,0,0,.26)'; c.beginPath(); c.ellipse(0, 13, 11.5, 4.2, 0, 0, 7); c.fill(); }
  c.translate(0, lift);
  if (!ghost) {
    c.fillStyle = '#2b3556';
    rr(c, -8, 8 + swing * 0.5, 6.4, 6.2, 2.6); c.fill(); rr(c, 1.6, 8 - swing * 0.5, 6.4, 6.2, 2.6); c.fill();
    c.fillStyle = dark; rr(c, -17.5, -5 + bob, 9, 15, 3.5); c.fill(); // backpack
    c.fillStyle = light; rr(c, -16.2, -3 + bob, 6.2, 3, 1.5); c.fill();
  }
  // body
  c.fillStyle = base;
  if (ghost) {
    c.beginPath(); c.moveTo(-10.5, -4 + bob); c.quadraticCurveTo(-10.5, -9, 0, -9 + bob); c.quadraticCurveTo(10.5, -9, 10.5, -4 + bob); c.lineTo(10.5, 12);
    for (let i = 0; i < 4; i++) c.quadraticCurveTo(10.5 - i * 5.25 - 2.6, 17 + (i % 2) * -2 + Math.sin(t * 5 + i) * 1.4, 10.5 - (i + 1) * 5.25, 12);
    c.closePath(); c.fill();
  } else {
    rr(c, -10.5, -8 + bob, 21, 19, 8); c.fill();
    c.fillStyle = dark; rr(c, -10.5, 4 + bob, 21, 7, 5); c.fill();
    c.fillStyle = light; rr(c, -7.5, -6 + bob, 9, 3.4, 1.7); c.fill();
    c.fillStyle = dark; rr(c, -5, 3 + bob, 10, 4.6, 2); c.fill(); // pocket
  }
  // Rounded suit and reflective visor give the crew a chunky spacesuit silhouette.
  const hy = -13 + bob * 0.9;
  if (!ghost) {
    c.fillStyle = '#10182a'; rr(c, -11.5, hy - 10, 23, 23, 10); c.fill();
    c.fillStyle = base; rr(c, -9.5, hy - 8.5, 19, 21, 9); c.fill();
    c.fillStyle = light; rr(c, -7, hy - 7, 8, 3, 1.5); c.fill();
  }
  c.fillStyle = '#10182a'; rr(c, -2, hy - 4, 16, 11, 5); c.fill();
  c.fillStyle = '#75c9e3'; rr(c, -0.5, hy - 2.8, 13, 8, 4); c.fill();
  c.fillStyle = '#e6fbff'; rr(c, 1, hy - 2, 7.5, 2.8, 1.4); c.fill();
  drawHat(c, hat, hy - 4, base);
  c.restore();
}

/** An eliminated crewmate: lying down with swirly eyes (family friendly). */
export function drawBody(c, o) {
  const { x, y, t = 0 } = o; const base = hexOf(o.color), dark = shade(base, -0.3);
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(0, 7, 16, 6, 0, 0, 7); c.fill();
  c.fillStyle = dark; rr(c, -16, -6, 8, 13, 3); c.fill();
  c.fillStyle = base; rr(c, -10, -7, 22, 15, 7); c.fill();
  c.fillStyle = dark; rr(c, -10, 2, 22, 6, 4); c.fill();
  c.fillStyle = '#2b3556'; rr(c, 10, -6, 7, 5, 2); c.fill(); rr(c, 10, 1, 7, 5, 2); c.fill();
  c.fillStyle = '#142033'; rr(c, -18, -5, 11, 8, 4); c.fill();
  c.fillStyle = '#83d5e9'; rr(c, -17, -4, 8, 5, 2); c.fill();
  for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1; c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(-14 + Math.cos(a) * 11, -12 + Math.sin(a) * 3.4, 1.8, 0, 7); c.fill(); }
  c.restore();
}
