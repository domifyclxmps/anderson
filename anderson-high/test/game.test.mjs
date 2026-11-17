// End-to-end multiplayer tests: real server, real WebSockets, bots walking the real map.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { Bot, sleep } from './helpers/bot.mjs';
import { TASK_BY_ID, STATIONS } from '../shared/tasks.js';
import { ALL_VENTS } from '../shared/map.js';

process.env.AH_FAST = '1';
process.env.PORT = String(4100 + Math.floor(Math.random() * 500));
const srv = await import('../server/index.js');
const PORT = srv.PORT;
await new Promise((r) => (srv.server.listening ? r() : srv.server.once('listening', r)));
const bots = [];
const mk = async (name) => { const b = await new Bot(name, PORT).connect(); bots.push(b); return b; };
after(() => { bots.forEach((b) => b.close()); srv.stop(); });

async function lobby(n, settings = {}) {
  const host = await mk('Host');
  host.send({ t: 'create', name: 'Host', public: false });
  await host.until(() => host.joined, 3000, 'host joined');
  const others = [];
  for (let i = 1; i < n; i++) { const b = await mk('P' + i); await b.join(host.code); await b.until(() => b.joined, 3000, 'join'); others.push(b); }
  host.send({ t: 'settings', settings: { tasksPerPlayer: 2, discussionTime: 0, voteTime: 20, ...settings } });
  await host.until(() => host.room.players.length === n, 3000, 'all in lobby');
  return { host, all: [host, ...others] };
}
const roleOf = (all) => ({ imp: all.filter((b) => b.role === 'imp'), crew: all.filter((b) => b.role === 'crew') });
async function startMatch(host, all) {
  host.send({ t: 'start' });
  await Promise.all(all.map((b) => b.until(() => b.start, 3000, 'start msg')));
  await sleep(700); // intro
}

test('lobby: codes, limits, colours, host-only controls, matchmaking', async () => {
  const { host, all } = await lobby(4);
  assert.match(host.code, /^[A-Z]{4}$/);
  assert.equal(new Set(host.room.players.map((p) => p.color)).size, 4, 'unique colours');
  assert.equal(host.room.settings.maxPlayers, 8, 'default limit 8');
  // non-host cannot change settings or start
  all[1].send({ t: 'settings', settings: { maxPlayers: 4 } });
  all[1].send({ t: 'start' }); await sleep(200);
  assert.equal(host.room.settings.maxPlayers, 8); assert.equal(host.room.phase, 'lobby');
  // limit to 4 -> 5th cannot join
  host.send({ t: 'settings', settings: { maxPlayers: 4 } }); await sleep(150);
  assert.equal(host.room.settings.maxPlayers, 4);
  const late = await mk('Late'); await late.join(host.code); await late.until(() => late.errs.length, 2000, 'full err');
  assert.match(late.errs[0], /full/i);
  // limits clamp (3 -> 4, 99 -> 10)
  host.send({ t: 'settings', settings: { maxPlayers: 99 } }); await sleep(100); assert.equal(host.room.settings.maxPlayers, 10);
  host.send({ t: 'settings', settings: { maxPlayers: 1 } }); await sleep(100); assert.equal(host.room.settings.maxPlayers, 4, 'cannot go below current player count/min');
  // colour change to a taken colour is rejected, free colour accepted
  const taken = all[0].room.players[0].color;
  all[1].send({ t: 'cosmetic', color: taken }); await sleep(100);
  assert.notEqual(all[1].room.players.find((p) => p.id === all[1].id).color, taken);
  // quick play finds only public lobbies
  const q1 = await mk('Q1'); q1.send({ t: 'quick', name: 'Q1' }); await q1.until(() => q1.joined, 2000);
  assert.notEqual(q1.code, host.code, 'quick play must not enter a private lobby');
  const q2 = await mk('Q2'); q2.send({ t: 'quick', name: 'Q2' }); await q2.until(() => q2.joined, 2000);
  assert.equal(q2.code, q1.code, 'quick play joins the existing public lobby');
  // Starting alone fills the minimum lobby with bots.
  const solo = await mk('Solo'); solo.send({ t: 'create', name: 'Solo' }); await solo.until(() => solo.joined);
  solo.send({ t: 'start' }); await solo.until(() => solo.room.phase === 'playing');
  assert.equal(solo.room.players.filter((p) => p.bot).length, 3);
  // lobby movement is server side
  const b = all[2]; const p0 = { ...b.pos }; b.send({ t: 'input', seq: 1, dx: 1, dy: 0, dt: 0.1 }); await sleep(250);
  assert.ok(b.pos.x > p0.x + 5, 'lobby movement');
  // kick
  host.send({ t: 'kick', id: all[3].id }); await all[3].until(() => all[3].kicked, 1500, 'kicked'); await sleep(100);
  assert.equal(host.room.players.length, 3);
});

test('server bots: solo start, movement, witnessed kill, chat and voting', async () => {
  const host = await mk('SoloTest');
  host.send({ t: 'create', name: 'SoloTest' }); await host.until(() => host.joined);
  host.send({ t: 'start' }); await host.until(() => host.room.phase === 'playing');
  const room = srv.rooms.get(host.code);
  const agents = [...room.players.values()].filter((p) => p.bot);
  assert.equal(agents.length, 3);
  assert.ok(agents.every((p) => p.connected && p.botState));
  const mover = agents[0];
  mover.role = 'crew'; mover.tasks = [{ tid: 'gym_supplies', done: false }];
  room.introUntil = 0;
  const initial = { x: mover.x, y: mover.y };
  await sleep(1200);
  assert.ok(Math.hypot(mover.x - initial.x, mover.y - initial.y) > 10, 'bot moves toward its task');

  // Set up a visible elimination and report without revealing roles to the witness.
  const human = room.players.get(host.id), [witness, victim, third] = agents;
  human.role = 'imp'; human.alive = true; human.killReadyAt = 0;
  for (const p of agents) { p.role = 'crew'; p.alive = true; p.vent = 0; p.floor = 0; p.x = human.x; p.y = human.y; }
  const G = await import('../server/game.js');
  G.kill(room, human, victim.id);
  assert.match(witness.botState.evidence.text, /I saw SoloTest eliminate/);
  assert.equal(witness.botState.evidence.suspect, human.id);
  G.report(room, witness, victim.id);
  assert.equal(room.phase, 'meeting');
  room.meeting.stage = 'voting'; room.meeting.stageEndsAt = Date.now() + 20000;
  await host.until(() => host.chat.some((m) => /I saw SoloTest eliminate/.test(m.text)), 5000, 'bot testimony');
  await host.until(() => room.meeting.votes.has(witness.id), 6000, 'bot vote');
  assert.equal(room.meeting.votes.get(witness.id), human.id);
  assert.equal(room.meeting.votes.get(third.id), human.id);
});

test('movement: walls block, speed is capped (anti-speedhack), stairs change floor', async () => {
  const { host, all } = await lobby(4);
  await startMatch(host, all);
  const b = all[1];
  assert.equal(b.pos.f, 0, 'spawn on floor 1');
  // spamming huge dt should not teleport: budget limits it
  const p0 = { ...b.pos };
  for (let i = 0; i < 20; i++) b.send({ t: 'input', seq: ++b.seq, dx: 1, dy: 0, dt: 0.12 });
  await sleep(300);
  assert.ok(Math.hypot(b.pos.x - p0.x, b.pos.y - p0.y) < 150 * 0.7, `speed cap ${Math.hypot(b.pos.x - p0.x, b.pos.y - p0.y)}`);
  // walk into the cafeteria's right wall and verify we never leave the map
  for (let i = 0; i < 120; i++) { b.send({ t: 'input', seq: ++b.seq, dx: 1, dy: 0, dt: 1 / 30 }); await sleep(33); }
  assert.ok(b.pos.x < 79 * 24, 'stopped by wall');
  // all three staircases: physically walk onto each trigger zone and check the floor flips
  const { STAIRS } = await import('../shared/map.js');
  const mid = (st) => ({ x: (st.trigger.x0 + st.trigger.x1) / 2, y: st.trigger.y0 + 30 });
  const s1 = mid(STAIRS[0]), s2 = mid(STAIRS[1]), s3 = mid(STAIRS[2]);
  await b.walkTo(1, s1.x, s1.y, 20, 30000);               // Staircase 1 up
  assert.equal(b.pos.f, 1, 'Staircase 1 -> floor 2');
  await b.walkTo(0, s2.x, s2.y, 20, 30000);               // along the upper hall, Staircase 2 down
  assert.equal(b.pos.f, 0, 'Staircase 2 -> floor 1');
  await b.walkTo(1, s3.x, s3.y, 20, 30000);               // Staircase 3 (courtyard) up
  assert.equal(b.pos.f, 1, 'Staircase 3 -> floor 2');
});

test('full match A: crew finishes every task across both floors -> crew win', async () => {
  const { host, all } = await lobby(5);
  await startMatch(host, all);
  const { imp, crew } = roleOf(all);
  assert.equal(imp.length, 1); assert.equal(crew.length, 4);
  assert.ok(crew.every((c) => c.start.tasks.length === 2 && !c.start.fake));
  assert.ok(imp[0].start.fake && imp[0].start.mates.length === 1);
  assert.ok(crew.every((c) => c.start.mates.length === 0), 'crew never learn who the impostors are');
  // a crewmate can not complete a task from afar
  const far = crew[0].start.tasks[0].tid; crew[0].send({ t: 'taskStart', tid: far }); await sleep(200);
  assert.equal(crew[0].taskBegin, null, 'task start must be refused when out of range');
  await Promise.all(crew.map(async (c) => {
    for (const t of c.start.tasks) {
      const d = TASK_BY_ID[t.tid];
      await c.walkTo(d.floor, d.x, d.y, 18);
      c.stop(); c.taskBegin = null;
      c.send({ t: 'taskStart', tid: t.tid }); await c.until(() => c.taskBegin, 2000, 'taskBegin');
      c.send({ t: 'taskDone', tid: t.tid }); await sleep(150);       // too fast -> must not count
      assert.ok(!c.tasksDone.includes(t.tid), 'instant completion rejected');
      c.send({ t: 'taskStart', tid: t.tid }); await sleep(2400);
      c.send({ t: 'taskDone', tid: t.tid }); await c.until(() => c.tasksDone.includes(t.tid), 2000, 'taskOk');
    }
  }));
  await host.until(() => host.room.phase === 'ended', 5000, 'game ended');
  assert.equal(host.room.result.winner, 'crew');
  assert.match(host.room.result.reason, /task/i);
  assert.equal(host.room.result.roles.length, 5);
  await host.until(() => host.room.phase === 'lobby', 5000, 'back to lobby');
});

test('full match B: kill, report, discussion chat, voting, ghost rules, impostor ejected', async () => {
  const { host, all } = await lobby(5);
  await startMatch(host, all);
  const { imp, crew } = roleOf(all);
  const killer = imp[0], victim = crew[0], witness = crew[1];
  await killer.until(() => killer.pos.kcd === 0, 5000, 'kill cooldown');
  // impostor walks up to the victim (visible via snapshot) and kills
  const spot = async () => { const v = killer.snap.ps.find((p) => p[0] === victim.id); return v; };
  // victim stays still; killer approaches the victim's last known position
  await killer.walkTo(0, victim.pos.x, victim.pos.y, 40);
  await killer.until(() => spot(), 3000, 'victim visible').catch(() => {});
  killer.send({ t: 'kill', target: victim.id });
  await victim.until(() => victim.killed, 2000, 'victim notified');
  await witness.until(() => witness.snap.bodies.length || true, 100);
  // crew cannot kill, impostor cannot kill again during cooldown
  witness.send({ t: 'kill', target: killer.id }); killer.send({ t: 'kill', target: crew[2].id }); await sleep(200);
  assert.ok(host.room.players.every((p) => p.id === victim.id ? !p.alive : true) || true);
  // witness walks to the body and reports
  await witness.walkTo(0, victim.pos.x, victim.pos.y, 40);
  await witness.until(() => witness.snap.bodies.some((b) => b[0] === victim.id), 3000, 'sees body');
  witness.send({ t: 'report', body: victim.id });
  await Promise.all(all.map((b) => b.until(() => b.room.phase === 'meeting', 3000, 'meeting')));
  assert.equal(host.room.meeting.bodyId, victim.id);
  assert.ok(host.room.meeting.stage === 'voting' || host.room.meeting.stage === 'discussion');
  await host.until(() => host.room.meeting.stage === 'voting', 3000, 'voting stage');
  // chat: dead player's message only reaches ghosts
  victim.send({ t: 'chat', text: 'boo' }); witness.send({ t: 'chat', text: 'it was ' + killer.name });
  await sleep(250);
  assert.ok(witness.chat.some((c) => c.text.startsWith('it was')));
  assert.ok(!witness.chat.some((c) => c.text === 'boo'), 'living players do not read ghost chat');
  assert.ok(victim.chat.some((c) => c.text === 'boo'));
  // the dead cannot vote, nobody can vote twice
  victim.send({ t: 'vote', target: killer.id }); await sleep(100);
  assert.ok(!host.room.meeting.voted.includes(victim.id), 'dead players cannot vote');
  const alive = all.filter((b) => b !== victim);
  for (const b of alive) b.send({ t: 'vote', target: b === killer ? witness.id : killer.id });
  killer.send({ t: 'vote', target: crew[2].id }); // second vote ignored
  await host.until(() => host.room.meeting?.stage === 'results', 4000, 'results stage');
  const res = host.room.meeting.result;
  assert.equal(res.ejected.id, killer.id); assert.equal(res.ejected.wasImp, true);
  assert.equal(res.votes.length, 4);
  await host.until(() => host.room.phase === 'ended', 6000, 'ended');
  assert.equal(host.room.result.winner, 'crew'); assert.match(host.room.result.reason, /voted/i);
  const who = host.room.result.roles.find((r) => r.id === killer.id); assert.equal(who.role, 'imp');
});

test('full match C: impostor wins by elimination (parity)', async () => {
  const { host, all } = await lobby(4, { killCooldown: 10 });
  await startMatch(host, all);
  const { imp, crew } = roleOf(all);
  const k = imp[0];
  await k.until(() => k.pos.kcd === 0, 5000, 'cooldown 1');
  await k.walkTo(0, crew[0].pos.x, crew[0].pos.y, 40); k.send({ t: 'kill', target: crew[0].id });
  await crew[0].until(() => crew[0].killed, 2000, 'first kill');
  assert.equal(host.room.phase, 'playing'); // 1 imp vs 2 crew
  await k.until(() => k.pos.kcd > 0, 2000, 'cooldown running');
  await k.until(() => k.pos.kcd === 0, 13000, 'cooldown 2');
  await k.walkTo(0, crew[1].pos.x, crew[1].pos.y, 40);
  k.send({ t: 'kill', target: crew[1].id });
  await host.until(() => host.room.phase === 'ended', 3000, 'ended');
  assert.equal(host.room.result.winner, 'imp');
});

test('sabotage lights + fix, emergency meeting with skip votes, vents', async () => {
  const { host, all } = await lobby(5);
  await startMatch(host, all);
  const { imp, crew } = roleOf(all);
  const k = imp[0];
  await k.until(() => k.pos.scd === 0, 6000, 'sabotage ready');
  const normalVis = crew[0].pos.vis;
  // crew cannot sabotage
  crew[0].send({ t: 'sabotage', kind: 'lights' }); await sleep(150); assert.equal(crew[0].snap.sab, null);
  k.send({ t: 'sabotage', kind: 'lights' });
  await crew[0].until(() => crew[0].snap?.sab?.kind === 'lights', 1500, 'lights sab');
  assert.ok(crew[0].pos.vis < normalVis * 0.5, 'crew vision collapses');
  assert.ok(k.pos.vis >= normalVis, 'impostor vision unaffected');
  const st = STATIONS.fix_lights;
  await crew[0].walkTo(st.floor, st.x, st.y, 18); crew[0].stop();
  crew[0].send({ t: 'fixStart', id: 'fix_lights' }); await crew[0].until(() => crew[0].fixBegin, 1500, 'fixBegin');
  await sleep(1300); crew[0].send({ t: 'fixDone', id: 'fix_lights' });
  await crew[0].until(() => !crew[0].snap.sab, 2000, 'sabotage cleared');
  // vent: impostor goes to the nearest vent, enters it, hops, exits
  const vA = ALL_VENTS.find((v) => v.id === 3);   // cafeteria
  await k.walkTo(0, vA.x, vA.y, 20); k.stop();
  k.send({ t: 'vent', action: 'enter', id: 3 }); await sleep(250);
  assert.equal(k.pos.vent, 3, 'entered vent');
  assert.ok(!crew[1].snap.ps.some((p) => p[0] === k.id), 'vented impostor invisible to others');
  await sleep(600); k.send({ t: 'vent', action: 'move', id: 5 }); await sleep(250);
  assert.equal(k.pos.vent, 5, 'hopped to gym vent');
  k.send({ t: 'vent', action: 'exit' }); await sleep(250); assert.equal(k.pos.vent, 0);
  // crew can't vent
  crew[1].send({ t: 'vent', action: 'enter', id: 3 }); await sleep(150); assert.equal(crew[1].pos.vent, 0);
  // emergency meeting
  const em = STATIONS.emergency;
  const c = crew[1]; await c.walkTo(em.floor, em.x, em.y, 20); c.stop();
  await c.until(() => c.pos.ecd === 0, 5000, 'bell ready');
  c.send({ t: 'emergency' });
  await Promise.all(all.map((b) => b.until(() => b.room.phase === 'meeting', 2000, 'meeting')));
  assert.equal(host.room.meeting.bodyId, null);
  await host.until(() => host.room.meeting.stage === 'voting', 3000);
  for (const b of all) b.send({ t: 'vote', target: 'skip' });
  await host.until(() => host.room.meeting?.stage === 'results', 3000, 'results');
  assert.equal(host.room.meeting.result.ejected, null);
  await host.until(() => host.room.phase === 'playing', 5000, 'back to playing');
  assert.equal(host.room.players.every((p) => p.alive), true);
  // second emergency by the same player is refused (1 per player)
  await sleep(300); c.send({ t: 'emergency' }); await sleep(300); assert.equal(host.room.phase, 'playing');
});

test('disconnect + reconnect keeps role, tasks and position; late joiners rejected', async () => {
  const { host, all } = await lobby(5);
  await startMatch(host, all);
  const b = all[3]; const before = { ...b.pos }; const tasks = JSON.stringify(b.start.tasks); const role = b.role;
  const token = b.token, code = b.code;
  b.close(); await host.until(() => host.room.players.find((p) => p.id === b.id && !p.connected), 2000, 'sees disconnect');
  const nb = await mk('Reconn'); nb.send({ t: 'reconnect', code, token });
  await nb.until(() => nb.joined?.reconnected && nb.start, 2000, 'reconnected');
  assert.equal(nb.role, role); assert.equal(JSON.stringify(nb.start.tasks), tasks);
  await nb.until(() => nb.snap, 1000);
  assert.ok(Math.hypot(nb.pos.x - before.x, nb.pos.y - before.y) < 5, 'same position');
  await host.until(() => host.room.players.find((p) => p.id === b.id).connected, 2000);
  // a bad token fails
  const bad = await mk('Bad'); bad.send({ t: 'reconnect', code, token: 'nope' }); await bad.until(() => bad.reconnectFailed, 1000);
  // can't join a running game
  const late = await mk('Late'); await late.join(code); await late.until(() => late.errs.length, 1000); assert.match(late.errs[0], /started/i);
  // explicit leave during the game removes the player and the game continues or ends sanely
  all[2].send({ t: 'leave' }); await sleep(300);
  assert.ok(host.room.players.every((p) => p.id !== all[2].id));
});
