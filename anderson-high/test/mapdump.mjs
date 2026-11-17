import { FLOORS, STAIRS } from '../shared/map.js';
import { TASKS, STATIONS } from '../shared/tasks.js';
import { COLS, ROWS, CELL } from '../shared/constants.js';
const fi = +(process.argv[2] ?? 0);
const f = FLOORS[fi];
const marks = new Map();
const mk = (x,y,ch)=>marks.set(Math.floor(y/CELL)*COLS+Math.floor(x/CELL),ch);
for (const t of TASKS) if (t.floor===fi) mk(t.x,t.y,'T');
for (const s of Object.values(STATIONS)) if (s.floor===fi) mk(s.x,s.y,'S');
for (const v of f.vents) mk(v.x,v.y,'V');
for (const s of STAIRS) { for (let y=s.trigger.y0;y<s.trigger.y1;y+=CELL) for(let x=s.trigger.x0;x<s.trigger.x1;x+=CELL) if(!marks.has(Math.floor(y/CELL)*COLS+Math.floor(x/CELL))) mk(x+1,y+1,'^'); }
let out='';
for (let r=0;r<ROWS;r++){ let line=''; for(let c=0;c<COLS;c++){ const i=r*COLS+c; line+= marks.get(i) ?? (f.grid[i]===1?'.':f.grid[i]===2?'#':' '); } out+=line.replace(/\s+$/,'')+'\n'; }
console.log(out);
