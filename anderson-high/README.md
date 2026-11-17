# Anderson High — After the Bell

An online multiplayer social-deduction game (4–10 players) set inside a two-floor Anderson High School.
Top-down 2D, original characters/art/UI, **server-authoritative**, zero npm dependencies (hand-written WebSocket server).

## Run it
```bash
cd anderson-high
node server/index.js        # needs Node 20+ ; PORT=3000 by default
# open http://localhost:3000 in several browser tabs/devices (same network: http://<your-ip>:3000)
npm test                    # 16 end-to-end tests (real server, real WebSockets, bots walking the real map)
```
Quick Play joins/creates a public lobby, Create Game makes a public/private lobby, Join Game takes the 4-letter code.

## Controls
WASD / arrows move · **E / Space** use (tasks, emergency bell, fix sabotage) · **R** report · **Q** eliminate · **F** sabotage · **V** vent · **M / Tab** map. All rebindable in Settings. Touch devices get an on-screen joystick.

## The school
Floor 1: Spanish Hall (top), English Hall (left), Science Hall (long west hall, floor 1 only), Courtyard (centre), Cafeteria (upper right, spawn + emergency bell), Aux Gym (right).
Floor 2: History Hall (above Spanish), Math Hall (above English), upper halls around the open courtyard.
Exactly three staircases, walked onto physically: **1** between Cafeteria and Spanish Hall, **2** at the English/Spanish corner, **3** by the Courtyard.

## Layout
- `shared/` map, collision, tasks, constants — used by BOTH server and browser (identical physics for prediction)
- `server/` `index.js` http+matchmaking · `websocket.js` RFC6455 · `room.js` lobby/phases/snapshots · `game.js` rules
- `client/js/` `world.js` render/prediction/fog · `mapart.js` map art · `chars.js` characters · `hud.js` · `minigames.js` (10 engines, 16 tasks + fixes) · `meeting.js` · `lobby.js` · `dialogs.js` · `audio.js` (synth SFX + music) · `net.js` (auto-reconnect)

## Notes / honest limits
- Minigame *content* is generated client-side from a server seed; the server enforces proximity, assignment and a minimum solve time, but can't re-verify the puzzle itself.
- Sounds and music are synthesised with WebAudio (no asset files), so they're simple.
- Fonts load from Google Fonts when online; a system fallback is used otherwise.
