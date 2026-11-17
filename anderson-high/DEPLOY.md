# Playing Anderson High with other people

The game is one small Node.js program. It serves the web page AND runs the multiplayer server.
Everyone who opens its address is in the same pool of lobbies.

## A. Same room / school network (free, 5 minutes)
1. Install Node.js 20+ (nodejs.org) on ONE computer — that computer is the "host".
2. In a terminal: `cd anderson-high` then `node server/index.js`
3. It prints addresses like `http://192.168.1.23:3000`. Everyone on the same Wi-Fi/network opens THAT address (not "localhost").
4. One player: CREATE GAME → share the 4-letter code. Others: JOIN GAME.
Keep the host computer awake and the terminal open. If friends can't connect, the host's firewall is the usual cause:
allow Node.js through it (Windows pops up a prompt — click Allow on Private networks).
School networks sometimes isolate devices ("client isolation") — then use option B.

## B. Put it on the internet (works from anywhere, incl. school/home)
Use any host that runs a Node web service AND supports WebSockets (Render, Railway, Fly.io, a VPS…).
Example with Render (free tier may sleep when idle and the first load can take ~1 min — check current plans):
1. Create a GitHub account → new repository → upload the `anderson-high` folder (without node_modules).
2. render.com → New → Web Service → connect the repo. Runtime: Node. Build command: (blank). Start command: `node server/index.js`.
3. Deploy. You get `https://something.onrender.com`. Share it. The game automatically uses secure WebSockets (wss) on https.
Docker hosts: the included Dockerfile works as-is (port from the PORT variable).
Keep it ONE instance (rooms live in memory; two instances would split players into separate worlds).

## C. A website you already have (e.g. school site / GitHub Pages)
Static hosts (GitHub Pages, Google Sites, Netlify static) CANNOT run the multiplayer server.
Run the server on a host from option B, then either link to it or embed it:
`<iframe src="https://your-game.onrender.com" width="100%" height="700" allow="fullscreen"></iframe>`
(If you want your own domain: add a custom domain in the host's settings.)

## School checklist
- Ask the IT teacher/admin first; many schools block game sites. A site on your own domain may be allowed when random ones aren't.
- Needs: any modern browser (Chromebooks fine). WebSockets must not be blocked.
- Players are 4–10 per lobby; many lobbies run at once. Use PRIVATE lobbies + codes for class sessions.
- No accounts, no data stored: names are just what players type; nothing is saved on the server.

## D. Page on S3 (or any static host) + server elsewhere
S3 only stores files; it can't run the game server. Split it in two:
1. Deploy the server with option B and note its address, e.g. `https://my-game.onrender.com`.
2. Edit `client/config.js`:  `window.AH_SERVER = 'wss://my-game.onrender.com';`
3. Make a bucket, turn on Static website hosting (index document `index.html`), allow public read.
4. Upload the CONTENTS of `client/` AND the whole `shared/` folder to the bucket ROOT, so you have `index.html`, `config.js`, `css/`, `js/`, `shared/` side by side
   (the page loads `/js/...` and `/shared/...` from the site root).
5. S3 website endpoints are http only: that's fine with a `wss://` server. For https (and your own domain) put CloudFront in front of the bucket.
