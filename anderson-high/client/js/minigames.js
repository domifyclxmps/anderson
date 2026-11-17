// Interactive task minigames. Content is generated from the server-provided seed so each attempt differs.
import { $, esc, mulberry, shuffled } from './state.js';
import { audio } from './audio.js';

let cur = null;
const rootEl = () => $('#mg');

export function closeMini(silent) { if (!cur) return; const c = cur; cur = null; c.cleanup?.(); rootEl().classList.add('hidden'); rootEl().innerHTML = ''; if (!silent) c.onCancel?.(); }
export const miniOpen = () => !!cur;

export function openMini({ id, game, title, desc, seed, onDone, onCancel }) {
  closeMini(true);
  const el = rootEl();
  el.innerHTML = `<div class="mg-card"><div class="mg-head"><div><div class="mg-tab">Task in progress</div><h2>${esc(title)}</h2><p>${esc(desc || '')}</p></div><button class="x" id="mgx" aria-label="Close">✕</button></div><div class="mg-body" id="mgb"></div><div class="mg-foot"><span id="mgf">Get started</span><div class="mg-meter"><div class="mg-prog"><i id="mgp"></i></div><b id="mgpct">0%</b></div></div></div>`;
  el.classList.remove('hidden');
  const card = $('.mg-card', el), body = $('#mgb'), foot = $('#mgf'), pbar = $('#mgp'), pct = $('#mgpct'), rnd = mulberry(seed || 1);
  cur = { onCancel, cleanup: null, done: false };
  $('#mgx').onclick = () => { audio.sfx('back'); closeMini(); };
  const api = {
    body, foot, rnd,
    status: (t) => {
      foot.textContent = t;
      const m = /(\d+)\s*\/\s*(\d+)/.exec(String(t));
      if (m) {
        const p = Math.min(100, (+m[1] / Math.max(1, +m[2])) * 100);
        pbar.style.width = p + '%'; pct.textContent = Math.round(p) + '%';
      }
    },
    pop: (node) => { if (!node) return; node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop'); },
    good: () => audio.sfx('good'), bad: (node) => { audio.sfx('bad'); if (node) { node.classList.add('shake'); setTimeout(() => node.classList.remove('shake'), 400); } },
    finish: () => {
      if (!cur || cur.done) return; cur.done = true;
      foot.textContent = 'Task complete'; pbar.style.width = '100%'; pct.textContent = '100%'; audio.sfx('task');
      card.classList.add('done');
      const stamp = document.createElement('div'); stamp.className = 'mg-stamp'; stamp.innerHTML = '<b>TASK COMPLETE ✔</b>';
      card.appendChild(stamp);
      setTimeout(() => { if (cur) { onDone?.(); closeMini(true); } }, 1100);
    },
    onCleanup: (f) => { cur.cleanup = f; },
  };
  const g = GAMES[game] || GAMES.switches;
  g(api, id);
}

// ---------------------------------------------------------------- content tables
const pick = (arr, n, rnd) => shuffled(arr, rnd).slice(0, n);
const ORDER = {
  cafe_trays: { hint: 'Tap the trays from SMALLEST to LARGEST.', items: [['Mini', 1], ['Small', 2], ['Medium', 3], ['Large', 4], ['Extra large', 5]], render: (it) => `<span class="tray" style="width:${28 + it[1] * 16}px"></span>` },
  eng_books: { hint: 'Shelve the books from THINNEST to THICKEST.', items: [['Pocket book', 1], ['Paperback', 2], ['Reader', 3], ['Hardcover', 4], ['Atlas', 5]], pickN: 5, sort: (a, b) => a[1] - b[1], render: (it) => `<span class="book" style="width:${16 + it[1] * 7}px"></span>` },
  his_docs: { hint: 'Stack the archive crates from LIGHTEST to HEAVIEST.', items: [['Feather crate', 1], ['Paper crate', 2], ['Book crate', 3], ['Tool crate', 4], ['Anvil crate', 5]], pickN: 5, sort: (a, b) => a[1] - b[1], render: (it) => `<span class="crate" style="width:${26 + it[1] * 9}px"></span>` },
};
const BINS = {
  cafe_restock: { hint: 'Where does each item go?', bins: ['Fridge', 'Pantry shelf', 'Serving counter'], items: [['Milk', 0], ['Yogurt', 0], ['Salad', 0], ['Cereal', 1], ['Rice bags', 1], ['Pasta', 1], ['Napkins', 2], ['Forks', 2], ['Trays', 2]], n: 7 },
  sci_equip: { hint: 'Sort the equipment into the right drawer.', bins: ['Glassware', 'Tools', 'Safety gear'], items: [['Beaker', 0], ['Test tube', 0], ['Flask', 0], ['Tongs', 1], ['Tweezers', 1], ['Scale', 1], ['Goggles', 2], ['Gloves', 2], ['Lab apron', 2]], n: 7 },
  sci_chem: { hint: 'Sort the sample bottles by colour.', bins: ['Red', 'Blue', 'Green'], items: [['Crimson sample', 0], ['Ruby vial', 0], ['Coral flask', 0], ['Cobalt sample', 1], ['Azure vial', 1], ['Sapphire flask', 1], ['Mint sample', 2], ['Jade vial', 2], ['Emerald flask', 2]], n: 7 },
  spa_mats: { hint: 'Sort the classroom supplies into the right bin.', bins: ['Notebooks', 'Writing', 'Craft'], items: [['Spiral notebook', 0], ['Journal', 0], ['Sketchbook', 0], ['Pencil', 1], ['Marker', 1], ['Eraser', 1], ['Glue stick', 2], ['Scissors', 2], ['Tape roll', 2]], n: 7 },
  gym_equip: { hint: 'Put each ball in its crate.', bins: ['Basketballs', 'Soccer balls', 'Volleyballs'], items: [['🏀 Basketball', 0], ['🏀 Hoops ball', 0], ['⚽ Soccer ball', 1], ['⚽ Futbol', 1], ['🏐 Volleyball', 2], ['🏐 Beach ball', 2]], n: 6 },
};

// ---------------------------------------------------------------- engines
const GAMES = {
  order(api, id) {
    const c = ORDER[id]; let items = c.items || [];
    if (c.pool) items = pick(c.pool, c.n, api.rnd).map((t) => [t]);
    else if (c.pickN) items = pick(items, c.pickN, api.rnd);
    const sorted = c.sort ? items.slice().sort(c.sort) : items.slice();
    api.body.innerHTML = `<p class="hint">${c.hint}</p><div class="slots" id="sl"></div><div class="cards" id="cd"></div>`;
    const sl = $('#sl'), cd = $('#cd'); let next = 0;
    sorted.forEach((_, i) => { const s = document.createElement('div'); s.className = 'slot'; s.textContent = i + 1; sl.appendChild(s); });
    const markNext = () => [...sl.children].forEach((s, i) => s.classList.toggle('next', i === next));
    markNext();
    shuffled(items, api.rnd).forEach((it) => {
      const b = document.createElement('button'); b.className = 'card'; b.innerHTML = c.render(it);
      b.onclick = () => {
        if (b.disabled) return;
        if (it === sorted[next]) {
          b.disabled = true; sl.children[next].innerHTML = c.render(it); sl.children[next].classList.add('ok'); api.pop(sl.children[next]);
          b.classList.add('gone'); next++; api.good(); markNext(); api.status(`${next}/${sorted.length}`);
          if (next === sorted.length) api.finish();
        } else {
          api.bad(b); next = 0;
          [...sl.children].forEach((s, i) => { s.textContent = i + 1; s.classList.remove('ok'); });
          cd.querySelectorAll('button').forEach((x) => { x.disabled = false; x.classList.remove('gone'); });
          markNext(); api.status('Wrong order — start again!');
        }
      };
      cd.appendChild(b);
    });
  },
  bins(api, id) {
    const c = BINS[id]; const items = pick(c.items, c.n, api.rnd); let i = 0;
    api.body.innerHTML = `<p class="hint">${c.hint}</p><div class="binitem" id="bi"></div><div class="bins" id="bn"></div><div class="dots" id="dt"></div>`;
    const bi = $('#bi'), bn = $('#bn'), dt = $('#dt');
    dt.innerHTML = items.map(() => '<i></i>').join('');
    c.bins.forEach((name, bIdx) => {
      const b = document.createElement('button'); b.className = 'bin'; b.textContent = name;
      b.onclick = () => {
        if (items[i][1] === bIdx) {
          dt.children[i].classList.add('on'); i++; api.good(); api.status(`${i}/${items.length}`);
          if (i === items.length) { bi.textContent = '✔ All sorted!'; api.finish(); }
          else { bi.textContent = items[i][0]; api.pop(bi); }
        } else api.bad(bi);
      };
      bn.appendChild(b);
    });
    bi.textContent = items[0][0];
    api.status(`0/${items.length}`);
  },
  wires(api) {
    const PALETTE = [['#ff5d5d', 'Red'], ['#5b9dff', 'Blue'], ['#43d493', 'Green'], ['#ffd75e', 'Yellow'], ['#c79dff', 'Violet'], ['#5bd6e8', 'Cyan']];
    const n = 5, picked = shuffled(PALETTE, api.rnd).slice(0, n).map(([c, name], i) => ({ c, name, id: i }));
    api.body.innerHTML = `<p class="hint">Connect each wire on the left to its matching terminal on the right.</p><div class="wireboard"><div class="wirecol" id="wl"></div><div class="wirecol" id="wr"></div></div>`;
    const wl = $('#wl'), wr = $('#wr'); let sel = null, done = 0;
    const mk = (w, side) => {
      const b = document.createElement('button'); b.className = 'wire'; b.dataset.id = w.id;
      b.innerHTML = `<i class="wire-dot" style="background:${w.c}"></i><span>${w.name}</span>`;
      b.onclick = () => {
        if (b.disabled) return;
        if (side === 'l') { wl.querySelectorAll('.wire.sel').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); sel = b; audio.sfx('click'); return; }
        if (!sel) return;
        if (sel.dataset.id === b.dataset.id) {
          sel.disabled = true; b.disabled = true; sel.classList.remove('sel');
          sel.classList.add('linked'); b.classList.add('linked'); sel = null;
          done++; api.good(); api.status(`${done}/${n}`); if (done === n) api.finish();
        } else { api.bad(b); sel.classList.remove('sel'); sel = null; }
      };
      (side === 'l' ? wl : wr).appendChild(b);
    };
    shuffled(picked.slice(), api.rnd).forEach((w) => mk(w, 'l'));
    shuffled(picked.slice(), api.rnd).forEach((w) => mk(w, 'r'));
    api.status(`0/${n}`);
  },
  fuses(api) {
    const SYMS = ['⚡', '❄', '🔥', '⚙', '💡', '☢'], n = 5;
    const picked = shuffled(SYMS, api.rnd).slice(0, n);
    api.body.innerHTML = `<p class="hint">Pick a fuse, then tap the socket with the same symbol.</p><div class="fuseboard" id="fs"></div><div class="fusetray" id="ft"></div>`;
    const fs = $('#fs'), ft = $('#ft'); let sel = null, done = 0;
    shuffled(picked.slice(), api.rnd).forEach((sym) => {
      const b = document.createElement('button'); b.className = 'fuse-slot'; b.dataset.sym = sym; b.textContent = sym;
      b.onclick = () => {
        if (b.disabled || !sel) return;
        if (sel.dataset.sym === sym) {
          b.disabled = true; sel.disabled = true; b.classList.add('filled'); sel.classList.add('used'); sel = null;
          done++; api.good(); api.status(`${done}/${n}`); if (done === n) api.finish();
        } else api.bad(b);
      };
      fs.appendChild(b);
    });
    shuffled(picked.slice(), api.rnd).forEach((sym) => {
      const b = document.createElement('button'); b.className = 'fuse'; b.dataset.sym = sym; b.textContent = sym;
      b.onclick = () => { if (b.disabled) return; ft.querySelectorAll('.fuse.sel').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); sel = b; audio.sfx('click'); };
      ft.appendChild(b);
    });
    api.status(`0/${n}`);
  },
  dials(api) {
    const n = 3, targets = Array.from({ length: n }, () => Math.floor(api.rnd() * 8));
    const vals = targets.map((t) => (t + 2 + Math.floor(api.rnd() * 5)) % 8);
    const matched = () => vals.filter((v, i) => v === targets[i]).length;
    api.body.innerHTML = `<p class="hint">Turn every dial until it matches its target reading.</p><div class="dials" id="dl"></div>`;
    const dl = $('#dl');
    const paint = () => {
      dl.innerHTML = '';
      vals.forEach((v, i) => {
        const b = document.createElement('button'); b.className = 'dial' + (v === targets[i] ? ' ok' : '');
        b.innerHTML = `<em style="transform:rotate(${targets[i] * 45}deg)"></em><i style="transform:rotate(${v * 45}deg)"></i><b>${v}</b><span>target ${targets[i]}</span>`;
        b.onclick = () => {
          vals[i] = (vals[i] + 1) % 8; audio.sfx('click'); paint();
          api.status(`${matched()}/${n}`); if (matched() === n) api.finish();
        };
        dl.appendChild(b);
      });
    };
    paint(); api.status(`${matched()}/${n}`);
  },
  sequence(api) {
    const cols = ['#ef4b4b', '#3f8cff', '#43c463', '#ffc933'], names = ['Ruby', 'Azure', 'Emerald', 'Amber'];
    const len = 5, seq = Array.from({ length: len }, () => Math.floor(api.rnd() * 4)); let pos = 0, lock = true, dead = false;
    api.body.innerHTML = `<p class="hint" id="sq">Watch the reagents being added…</p><div class="flasks" id="fl"></div>`;
    const fl = $('#fl'), btn = cols.map((c, i) => { const b = document.createElement('button'); b.className = 'flask'; b.style.setProperty('--c', c); b.innerHTML = `<span>${names[i]}</span>`; b.onclick = () => press(i); fl.appendChild(b); return b; });
    const flash = (i, ms = 380) => { btn[i].classList.add('lit'); audio.sfx('hover'); setTimeout(() => btn[i].classList.remove('lit'), ms); };
    const play = async () => { lock = true; pos = 0; body.classList.remove('turn'); $('#sq').textContent = 'Watch the reagents being added…'; api.status(`0/${len}`); await new Promise((r) => setTimeout(r, 600)); for (const i of seq) { if (dead) return; flash(i); await new Promise((r) => setTimeout(r, 650)); } lock = false; api.body.classList.add('turn'); $('#sq').textContent = 'Your turn — repeat the order!'; };
    const press = (i) => { if (lock) return; flash(i, 200); if (seq[pos] === i) { pos++; api.status(`${pos}/${len}`); if (pos === len) { lock = true; api.finish(); } } else { api.bad(fl); api.status('Wrong reagent! Watch again.'); play(); } };
    api.onCleanup(() => { dead = true; }); play();
  },
  wipe(api) {
    api.body.innerHTML = `<p class="hint">Hold the mouse (or finger) and scrub every stain away!</p><canvas id="cv" width="560" height="300"></canvas>`;
    const cv = $('#cv'), c = cv.getContext('2d');
    const st = Array.from({ length: 7 }, () => ({ x: 60 + api.rnd() * 440, y: 50 + api.rnd() * 200, r: 28 + api.rnd() * 14, hp: 1, hue: api.rnd() < 0.5 ? '#6b3a1d' : '#8a2f3a' }));
    let down = false, mx = -99, my = -99; const sparks = [];
    const draw = () => {
      if (!cur) return;
      const g = c.createLinearGradient(0, 0, 0, 300);
      g.addColorStop(0, '#d9a96d'); g.addColorStop(.55, '#c8914f'); g.addColorStop(1, '#ab7538');
      c.fillStyle = g; c.fillRect(0, 0, 560, 300);
      c.strokeStyle = 'rgba(112,66,24,.2)'; c.lineWidth = 2;
      for (let i = 8; i < 300; i += 19) { c.beginPath(); c.moveTo(0, i); c.bezierCurveTo(150, i + 5, 380, i - 5, 560, i + 3); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,.16)'; c.beginPath(); c.ellipse(430, 78, 68, 46, -0.2, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3; c.beginPath(); c.ellipse(430, 78, 50, 32, -0.2, 0, 7); c.stroke();
      c.strokeStyle = 'rgba(70,80,95,.5)'; c.lineWidth = 4; c.beginPath(); c.moveTo(70, 40); c.lineTo(70, 96); c.moveTo(62, 40); c.lineTo(62, 58); c.moveTo(78, 40); c.lineTo(78, 58); c.stroke();
      for (const s of st) if (s.hp > 0) {
        const sg = c.createRadialGradient(s.x - s.r * 0.3, s.y - s.r * 0.3, 2, s.x, s.y, s.r * 1.15);
        sg.addColorStop(0, s.hue); sg.addColorStop(1, 'rgba(58,26,10,.92)');
        c.globalAlpha = Math.min(1, s.hp * 1.25); c.fillStyle = sg;
        c.beginPath(); c.ellipse(s.x, s.y, s.r, s.r * 0.75, 0.4, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(s.x - s.r * 0.32, s.y - s.r * 0.3, s.r * 0.22, s.r * 0.14, 0.4, 0, 7); c.fill();
        c.globalAlpha = 1;
      }
      if (mx > -50) {
        c.fillStyle = '#8d5a2a'; c.fillRect(mx - 24, my - 20, 48, 12);
        c.fillStyle = '#ffe14d'; c.fillRect(mx - 22, my - 9, 44, 20);
        c.fillStyle = '#4fb0ff'; c.fillRect(mx - 22, my + 5, 44, 8);
        c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(mx - 18, my - 6, 36, 3);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]; p.x += p.vx * 0.016; p.y += p.vy * 0.016; p.life -= 0.02;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        c.globalAlpha = p.life; c.fillStyle = '#fff6b0'; c.beginPath(); c.arc(p.x, p.y, 3 * p.life + 1, 0, 7); c.fill(); c.globalAlpha = 1;
      }
      requestAnimationFrame(draw);
    };
    const move = (e) => { const r = cv.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; mx = (p.clientX - r.left) * (560 / r.width); my = (p.clientY - r.top) * (300 / r.height); if (down) { for (const s of st) if (s.hp > 0 && Math.hypot(mx - s.x, my - s.y) < s.r + 12) { s.hp -= 0.02; } const left = st.filter((s) => s.hp > 0).length; api.status(`${st.length - left}/${st.length} stains cleaned`); if (!left) { down = false; for (let k = 0; k < 26; k++) sparks.push({ x: mx, y: my, vx: (Math.random() - .5) * 260, vy: (Math.random() - .5) * 260, life: 1 }); api.finish(); } } e.preventDefault(); };
    cv.addEventListener('pointerdown', (e) => { down = true; move(e); }); addEventListener('pointerup', () => { down = false; }); cv.addEventListener('pointermove', move);
    draw();
  },
  collect(api) {
    const names = ['🏀', '⚽', '🏐', '🥎', '🎽', '🪢', '🏸', '🥅'];
    api.body.innerHTML = `<p class="hint">Grab every piece of loose gear!</p><div class="field" id="fd"></div>`;
    let left = names.length; const fd = $('#fd');
    names.forEach((n) => {
      const b = document.createElement('button'); b.className = 'loot'; b.textContent = n;
      b.style.left = 6 + api.rnd() * 84 + '%'; b.style.top = 8 + api.rnd() * 74 + '%'; b.style.animationDelay = -api.rnd() * 3 + 's';
      b.onclick = () => {
        const boom = document.createElement('span'); boom.className = 'burst'; boom.style.left = b.style.left; boom.style.top = b.style.top; fd.appendChild(boom); setTimeout(() => boom.remove(), 600);
        b.remove(); api.good(); api.status(`${names.length - --left}/${names.length}`);
        if (!left) api.finish();
      };
      fd.appendChild(b);
    });
    api.status(`0/${names.length}`);
  },
  switches(api) {
    const n = 6, on = Array.from({ length: n }, () => api.rnd() < 0.5); if (on.every(Boolean)) on[0] = false;
    api.body.innerHTML = `<p class="hint">Flip every switch ON to restore power!</p><div class="switches" id="sw"></div>`;
    const sw = $('#sw'); const upd = () => { [...sw.children].forEach((b, i) => b.classList.toggle('on', on[i])); api.status(`${on.filter(Boolean).length}/${n}`); if (on.every(Boolean)) api.finish(); };
    on.forEach((_, i) => { const b = document.createElement('button'); b.className = 'switch'; b.innerHTML = '<i></i>'; b.onclick = () => { on[i] = !on[i]; audio.sfx('click'); upd(); }; sw.appendChild(b); }); upd();
  },
  keypad(api) {
    const code = Array.from({ length: 5 }, () => Math.floor(api.rnd() * 10)).join(''); let typed = '';
    api.body.innerHTML = `<p class="hint">Enter the reset code shown on the panel.</p><div class="board"><big>${code}</big></div><div class="typed" id="ty">_____</div><div class="keypad" id="kp"></div>`;
    const ty = $('#ty');
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⏎']) {
      const b = document.createElement('button'); b.className = 'key'; b.textContent = k;
      b.onclick = () => {
        audio.sfx('click');
        if (k === 'C') typed = '';
        else if (k === '⏎') { if (typed === code) api.finish(); else { api.bad(ty); typed = ''; } }
        else if (typed.length < 5) typed += k;
        ty.textContent = (typed + '_____').slice(0, 5);
        api.status(`${typed.length}/5`);
      };
      $('#kp').appendChild(b);
    }
    api.status('0/5');
  },
};
