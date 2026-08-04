// client.js — PokeTown Online 客戶端
// 區塊: net / sprites / tiles / input / shop / effects / loop
"use strict";

const TILE = 16;
const cv = document.getElementById("game");
const g = cv.getContext("2d");
g.imageSmoothingEnabled = false;
const VIEW_W = cv.width, VIEW_H = cv.height;

// ---------- 全域狀態 ----------
let ws = null;
let myId = 0;
let world = null;          // init 訊息: {tile,w,h,rows,safe,shop,kinds}
let baseLayer = null;      // 靜態地圖 offscreen canvas
let waterTiles = [];       // 動畫 tile 座標 (水/祭壇/熔岩/火把/礦/門)
let lightTiles = [];       // 地下層光源 tile (火把/熔岩/礦/階梯/門)
let counterW = [];         // 武器店櫃檯 'C'
let counterG = [];         // 道具店櫃檯 'A'
let lightCv = null;        // 地下層黑暗遮罩 offscreen
const players = new Map(); // id -> ent
const monsters = new Map();
const npcEnts = new Map(); // npc id -> ent (init 建立, 不動)
const effects = [];        // {type,x,y,ttl,...}
const banners = [];        // 劇情橫幅 {txt, age}
let lastFrame = 0;
let netUp = false;
let shakeT = 0; // 畫面震動剩餘 ms
const BOSS_SCALE = { wolf_king: 1.9, slime_king: 2.2, eclipse_golem: 2.3, eclipse_core: 2.8 };
let VOID_TOP_ROW = 88;   // 月之裏側起始 row (init 下行的 vtop 會覆寫)
let DUNGEON_TOP_ROW = 64; // 地下層起始 row (init 下行的 dtop 會覆寫)

// ---------- 音效 (WebAudio 小方波) ----------
let actx = null;
function initAudio() {
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 無聲也能玩 */ }
}
// 音量設定 (0-1, 0 = 靜音); 存 localStorage
let volume = (() => {
  const v = parseFloat(localStorage.getItem("gameboy-rpg.vol"));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
})();
function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  localStorage.setItem("gameboy-rpg.vol", String(volume));
  const el = document.getElementById("volRange");
  if (el) el.value = String(Math.round(volume * 100));
  const btn = document.getElementById("volBtn");
  if (btn) btn.textContent = volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊";
}
function toggleMute() {
  setVolume(volume === 0 ? (Number(localStorage.getItem("gameboy-rpg.lastVol")) || 1) : 0);
  if (volume !== 0) localStorage.setItem("gameboy-rpg.lastVol", String(volume));
  toast(volume === 0 ? "靜音 (M 切換)" : `音量 ${Math.round(volume * 100)}%`);
}

function blip(freq, dur = 0.07, vol = 0.035, slide = 0, type = "square") {
  if (!actx || volume === 0) return;
  vol *= volume;
  const t0 = actx.currentTime;
  const o = actx.createOscillator(), gn = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gn.gain.setValueAtTime(vol, t0);
  gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(gn); gn.connect(actx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

// ---------- 像素圖 (string art sprites) ----------
const OUTLINE = "#1a1c2c";
// 玩家配色組 (帽/衣)，依 id 輪替
const HERO_PALS = [
  ["#e84545", "#3a6fd8"], ["#3a6fd8", "#e88b3a"], ["#3fa54c", "#8a4fd8"],
  ["#8a4fd8", "#2ba8a0"], ["#e88b3a", "#3fa54c"], ["#2ba8a0", "#e84545"],
  ["#e060a8", "#39456b"], ["#d8b820", "#2e7d46"],
  ["#e8e8f0", "#8a8a9a"], // 8: 村長 (白髮灰袍)
  ["#3a3a44", "#8a5a2e"], // 9: 鐵匠 (黑帽皮圍裙)
];

const HERO = {
  d0: [
    "....####....",
    "...#CCCC#...",
    "..#CCCCCC#..",
    "..#C#CC#C#..",
    "..#ssssss#..",
    "..#s#ss#s#..",
    "..#ssssss#..",
    "...#ssss#...",
    "..#BBBBBB#..",
    ".#BsBBBBsB#.",
    "..#BBBBBB#..",
    "..#nn##nn#..",
    "..#n#..#n#..",
    "...##..##...",
  ],
  d1: [
    "....####....",
    "...#CCCC#...",
    "..#CCCCCC#..",
    "..#C#CC#C#..",
    "..#ssssss#..",
    "..#s#ss#s#..",
    "..#ssssss#..",
    "...#ssss#...",
    "..#BBBBBB#..",
    ".#BsBBBBsB#.",
    "..#BBBBBB#..",
    "..#nn##nn#..",
    "...#n##n#...",
    "....##.##...",
  ],
  u0: [
    "....####....",
    "...#CCCC#...",
    "..#CCCCCC#..",
    "..#CCCCCC#..",
    "..#hhhhhh#..",
    "..#hhhhhh#..",
    "..#ssssss#..",
    "...#ssss#...",
    "..#BBBBBB#..",
    ".#BsBBBBsB#.",
    "..#BBBBBB#..",
    "..#nn##nn#..",
    "..#n#..#n#..",
    "...##..##...",
  ],
  u1: null, // 由 u0 換腳
  l0: [
    "....####....",
    "...#CCCC#...",
    "..#CCCCCC#..",
    "..#C#CCCC#..",
    "..#ssssss#..",
    "..#s#sss#...",
    "..#ssssss#..",
    "...#ssss#...",
    "..#BBBBB#...",
    "..#sBBBB#...",
    "..#BBBBB#...",
    "..#nnnn#....",
    "..#n#n#.....",
    "..##.##.....",
  ],
  l1: null,
};
HERO.u1 = HERO.u0.slice(0, 12).concat(["...#n##n#...", "....##.##..."]);
HERO.l1 = HERO.l0.slice(0, 11).concat(["..#nnnn#....", "...#n#n#....", "...##.##...."]);
// 站立 (stand) 與眨眼 (blink) 幀；'z' = 閉眼線
const STAND_LEGS = ["..#nnnnnn#..", "...#nnnn#...", "...##..##..."];
HERO.dS = HERO.d0.slice(0, 11).concat(STAND_LEGS);
HERO.dB = HERO.dS.slice(); HERO.dB[5] = "..#szsszs#..";
HERO.uS = HERO.u0.slice(0, 11).concat(STAND_LEGS);
HERO.uB = HERO.uS; // 背面無眼睛
HERO.lS = HERO.l0.slice(0, 11).concat(["..#nnnn#....", "...#n#n#....", "...##.##...."]);
HERO.lB = HERO.lS.slice(); HERO.lB[5] = "..#szsss#...";

const SLIME = [
  [
    "....####....",
    "..##gggg##..",
    ".#gGgggggg#.",
    ".#g#gg#ggg#.",
    "#gg#gg#gggg#",
    "#gggggggggg#",
    "#gGgggggggg#",
    ".#gggggggg#.",
    "..########..",
  ],
  [
    "............",
    "............",
    "....####....",
    ".###gggg###.",
    "#gGg#gg#ggg#",
    "#gggggggggg#",
    "#gGgggggggg#",
    ".##gggggg##.",
    "..########..",
  ],
];
// 甲蟲身體 + 觸鬚 (idle 抽動用第三幀)
const BEETLE_BODY = [
  [
    "....####....",
    "..##hhhh##..",
    ".#hbbbbbbh#.",
    ".#b#bbbb#b#.",
    ".#bbbbbbbb#.",
    "..#h#hh#h#..",
    "...#.##.#...",
  ],
  [
    "....####....",
    "..##hhhh##..",
    ".#hbbbbbbh#.",
    ".#b#bbbb#b#.",
    ".#bbbbbbbb#.",
    "..#h#hh#h#..",
    "..#..##..#..",
  ],
];
const BEETLE = [
  ["...#....#..."].concat(BEETLE_BODY[0]),
  ["...#....#..."].concat(BEETLE_BODY[1]),
  ["..#......#.."].concat(BEETLE_BODY[0]), // 觸鬚張開 (twitch)
];
const WOLF = [
  [
    ".##.....##..",
    "#ww#...#ww#.",
    "#www###www#.",
    "#wwwwwwwww#.",
    ".#w#wwwwww#.",
    ".#wwwwwwww#.",
    "..#ww##ww#..",
    "..#w#..#w#..",
    "..##....##..",
  ],
  [
    ".##.....##..",
    "#ww#...#ww#.",
    "#www###www#.",
    "#wwwwwwwww#.",
    ".#w#wwwwww#.",
    ".#wwwwwwww#.",
    "..#ww##ww#..",
    "..#.#ww#.#..",
    "....#..#....",
  ],
];

// 第二章怪物: 幽影 (漂浮半透明) / 石像鬼 (振翅) / 暗月魔像 (核心脈動)
const SHADE = [
  [
    "....####....",
    "..##qqqq##..",
    ".#qqqqqqqq#.",
    ".#q##qq##q#.",
    ".#qqqqqqqq#.",
    "#qqGqqqqGqq#",
    "#qqqqqqqqqq#",
    "#qqqqqqqqqq#",
    "#q#qq#qq#q#.",
    ".#..##..##..",
  ],
  [
    "....####....",
    "..##qqqq##..",
    ".#qqqqqqqq#.",
    ".#q##qq##q#.",
    ".#qqqqqqqq#.",
    "#qqGqqqqGqq#",
    "#qqqqqqqqqq#",
    "#qqqqqqqqqq#",
    ".#qq#qq#qq#.",
    "..##..##..#.",
  ],
];
const GARG = [
  [
    "##........##",
    "#w#......#w#",
    "#ww#....#ww#",
    "#www####www#",
    ".#wwwwwwww#.",
    ".#wewwwwew#.",
    ".#wwwwwwww#.",
    "..#wwwwww#..",
    "..#w#ww#w#..",
    "...##..##...",
  ],
  [
    "............",
    "##........##",
    "#ww#....#ww#",
    "#www####www#",
    ".#wwwwwwww#.",
    ".#wewwwwew#.",
    ".#wwwwwwww#.",
    "..#wwwwww#..",
    "..#w#ww#w#..",
    "...##..##...",
  ],
];
const GOLEM = [
  "..########..",
  ".#gggggggg#.",
  "#g#egggge#g#",
  "#gggggggggg#",
  ".#gggggggg#.",
  "#gg#cccc#gg#",
  "#gg#cccc#gg#",
  "#gggggggggg#",
  ".#gggggggg#.",
  ".#g##gg##g#.",
  ".#g#.##.#g#.",
  ".##..##..##.",
];
// 第三章: 月靈 (飄帶) / 星衛 (稜甲) / 月蝕根源 (環繞碎片 + 核心眼)
const WRAITH = [
  [
    "...######...",
    "..#qqqqqq#..",
    ".#qGqqqqGq#.",
    ".#qqqqqqqq#.",
    "..#qqqqqq#..",
    "..#qqqqqq#..",
    "..#q#qq#q#..",
    "...#.##.#...",
    "....#..#....",
  ],
  [
    "............",
    "...######...",
    "..#qqqqqq#..",
    ".#qGqqqqGq#.",
    ".#qqqqqqqq#.",
    "..#qqqqqq#..",
    "..#qqqqqq#..",
    "...#q##q#...",
    "....##.#....",
  ],
];
const SENTINEL = [
  [
    "....####....",
    "...#ssss#...",
    "..#sseessss#",
    ".#ssssssss#.",
    "#ss#ssss#ss#",
    "#sssseessss#",
    ".#ssssssss#.",
    "..#ss##ss#..",
    "..#s#..#s#..",
    "...#....#...",
  ],
  [
    "....####....",
    "...#ssss#...",
    "..#sseessss#",
    ".#ssssssss#.",
    "#ss#ssss#ss#",
    "#sssseessss#",
    ".#ssssssss#.",
    "..#ss##ss#..",
    "...#ssss#...",
    "....#..#....",
  ],
];
const CORE = [
  "..#......#..",
  ".#cc#..#cc#.",
  "#cccccccccc#",
  "#cc#eeee#cc#",
  "#cceEEEEecc#",
  "#cceEEEEecc#",
  "#cc#eeee#cc#",
  "#cccccccccc#",
  ".#cc#..#cc#.",
  "..#......#..",
];

function makeSprite(rows, colors) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < rows[ty].length; tx++) {
      const ch = rows[ty][tx];
      if (ch === "." || ch === " ") continue;
      x.fillStyle = colors[ch] || OUTLINE;
      x.fillRect(tx, ty, 1, 1);
    }
  }
  return c;
}

const spriteCache = new Map();
function heroSprite(palIdx, dir, frame) {
  const key = `h${palIdx}:${dir}${frame}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const [cap, shirt] = HERO_PALS[palIdx % HERO_PALS.length];
  const grid = HERO[(dir === "r" ? "l" : dir) + frame] || HERO.d0;
  const s = makeSprite(grid, {
    "#": OUTLINE, C: cap, B: shirt,
    s: "#f4c898", n: "#39456b", h: "#5b3a29", z: "#b07850",
  });
  spriteCache.set(key, s);
  return s;
}
function monsterSprite(kind, frame) {
  const key = `m${kind}${frame}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  let s;
  if (kind === "slime") s = makeSprite(SLIME[frame], { "#": OUTLINE, g: "#58c04c", G: "#9ce890" });
  else if (kind === "slime_king") s = makeSprite(SLIME[frame], { "#": OUTLINE, g: "#8a5ad8", G: "#c8a0ff" });
  else if (kind === "beetle") s = makeSprite(BEETLE[frame], { "#": OUTLINE, b: "#b5732e", h: "#5a3a1a" });
  else if (kind === "wolf_king") s = makeSprite(WOLF[frame], { "#": OUTLINE, w: "#8a7ab0" });
  else if (kind === "shade") s = makeSprite(SHADE[frame], { "#": "#2a2440", q: "#9a86c8", G: "#d8ccf8" });
  else if (kind === "gargoyle") s = makeSprite(GARG[frame], { "#": OUTLINE, w: "#9a9aaa", e: "#ff6a5a" });
  else if (kind === "eclipse_golem") {
    s = makeSprite(GOLEM, { "#": OUTLINE, g: "#8a8a98", e: "#ff7a5a", c: frame ? "#b8ffff" : "#5ae8e8" });
  } else if (kind === "wraith") {
    s = makeSprite(WRAITH[frame], { "#": "#241c3e", q: "#7ea8e8", G: "#d8ecff" });
  } else if (kind === "sentinel") {
    s = makeSprite(SENTINEL[frame], { "#": "#1a1636", s: "#8a7ec8", e: "#ffd23e" });
  } else if (kind === "eclipse_core") {
    // frame 0/1 = 常態脈動, 2/3 = 狂暴 (紅化)
    const rage = frame >= 2, ph = frame % 2;
    s = makeSprite(CORE, {
      "#": "#140f28",
      c: rage ? "#7a2a48" : "#3e3670",
      e: rage ? (ph ? "#ff9060" : "#ff5a30") : ph ? "#c89aff" : "#8a6ae8",
      E: rage ? (ph ? "#fff0d0" : "#ffd0a0") : ph ? "#ffffff" : "#d8c0ff",
    });
  } else s = makeSprite(WOLF[frame], { "#": OUTLINE, w: "#aab2c8" });
  spriteCache.set(key, s);
  return s;
}

// ---- 武器揮舞 sprite (指向右方, 揮擊時旋轉掃過) ----
const WEAPON_ART = {
  wood_sword: { rows: [".g#mmmm#..", "hggmmmmmm#", ".g#mmmm#.."], m: "#c8a060" },
  copper_dagger: { rows: [".g#mm#.", "hggmmm#", ".g#mm#."], m: "#e8955a" },
  iron_sword: { rows: [".g#mmmmm#.", "hggmmmmmm#", ".g#mmmmm#."], m: "#d8dce8" },
  long_spear: { rows: ["............#m#.", "hhhhhhhhhhhh#mm#", "............#m#."], m: "#d8dce8" },
  battle_axe: {
    rows: [".......###", "......#mm#", "hhhhhh#mm#", "......#mm#", ".......###"],
    m: "#c8ccd8",
  },
  hero_sword: { rows: [".g#ccmmm#..", "hggmcccmmm#", ".g#ccmmm#.."], m: "#ffd23e", c: "#fff8d0" },
  flame_blade: { rows: [".g#cmmmm#..", "hggmcccmmm#", ".g#cmmmm#.."], m: "#ff6030", c: "#ffd23e" },
  fang_blade: { rows: [".g#mmmmm#.", "hggmmmmmm#", ".g#mmmmm#."], m: "#e8e4d8" },
  moon_blade: { rows: [".g#ccmmmm#.", "hggmcccmmm#", ".g#ccmmmm#."], m: "#c8d8ff", c: "#ffffff" },
  star_blade: { rows: [".g#ccmmmm#.", "hggmcccmmm#", ".g#ccmmmm#."], m: "#5ae8e8", c: "#ffffff" },
  void_edge: { rows: [".g#cmmmmmm#.", "hggmccmmmmm#", ".g#cmmmmmm#."], m: "#a06ae8", c: "#f0e0ff" },
};
function weaponSprite(id) {
  const art = WEAPON_ART[id];
  if (!art) return null;
  const key = `w${id}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const s = makeSprite(art.rows, {
    "#": OUTLINE, h: "#7d5226", g: "#c8a030", m: art.m, c: art.c || art.m,
  });
  spriteCache.set(key, s);
  return s;
}

// 受擊白閃: sprite 的白色剪影 (cache by sprite canvas)
const silCache = new WeakMap();
function silhouette(spr) {
  let s = silCache.get(spr);
  if (!s) {
    s = document.createElement("canvas");
    s.width = spr.width; s.height = spr.height;
    const c = s.getContext("2d");
    c.drawImage(spr, 0, 0);
    c.globalCompositeOperation = "source-in";
    c.fillStyle = "#fff";
    c.fillRect(0, 0, s.width, s.height);
    silCache.set(spr, s);
  }
  return s;
}

// ---------- 圖塊繪製 (tile atlas) ----------
function noise(tx, ty, m) {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) % m;
}
function tileAt(tx, ty) {
  if (!world || tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return "T";
  return world.rows[ty][tx];
}
// 水系 tile (邊界繪製時視為同類)
function isWater(ch) { return ch === "W" || ch === "y" || ch === "b"; }
function drawGrassBase(x, px, py, tx, ty) {
  x.fillStyle = "#7cc255";
  x.fillRect(px, py, TILE, TILE);
  x.fillStyle = "#6fb14a";
  for (let i = 0; i < 3; i++) {
    const n = noise(tx * 3 + i, ty + i * 7, 100);
    x.fillRect(px + (n % 13) + 1, py + ((n * 7) % 13) + 1, 2, 1);
  }
}
function drawTile(x, ch, tx, ty, frame) {
  const px = tx * TILE, py = ty * TILE;
  switch (ch) {
    case ".": drawGrassBase(x, px, py, tx, ty); break;
    case ",": {
      drawGrassBase(x, px, py, tx, ty);
      const n = noise(tx, ty, 2);
      const col = n ? "#e85a5a" : "#f0d040";
      x.fillStyle = col; x.fillRect(px + 3, py + 4, 3, 3); x.fillRect(px + 10, py + 9, 3, 3);
      x.fillStyle = "#fff"; x.fillRect(px + 4, py + 5, 1, 1); x.fillRect(px + 11, py + 10, 1, 1);
      break;
    }
    case "g": {
      drawGrassBase(x, px, py, tx, ty);
      x.fillStyle = "#3f9143";
      for (let i = 0; i < 4; i++) {
        const bx = px + 1 + i * 4 + (noise(tx + i, ty, 2));
        x.fillRect(bx, py + 6, 2, 9);
        x.fillRect(bx - 1, py + 9, 1, 6);
        x.fillRect(bx + 2, py + 10, 1, 5);
      }
      x.fillStyle = "#54a84f";
      for (let i = 0; i < 4; i++) x.fillRect(px + 2 + i * 4, py + 8, 1, 5);
      break;
    }
    case "P": {
      x.fillStyle = "#e6d49c"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#d6c084";
      for (let i = 0; i < 3; i++) {
        const n = noise(tx * 5 + i, ty * 3 + i, 100);
        x.fillRect(px + (n % 12) + 2, py + ((n * 11) % 12) + 2, 2, 2);
      }
      x.fillStyle = "#c2ab6c";
      if (tileAt(tx, ty - 1) !== "P") x.fillRect(px, py, TILE, 1);
      if (tileAt(tx, ty + 1) !== "P") x.fillRect(px, py + TILE - 1, TILE, 1);
      if (tileAt(tx - 1, ty) !== "P") x.fillRect(px, py, 1, TILE);
      if (tileAt(tx + 1, ty) !== "P") x.fillRect(px + TILE - 1, py, 1, TILE);
      break;
    }
    case "W": {
      x.fillStyle = "#4098e0"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#7cc4f0";
      for (let i = 0; i < 2; i++) {
        const n = noise(tx * 7 + i * 3, ty * 5 + i, 10);
        const off = (n + frame * 3) % 10;
        x.fillRect(px + 2 + off % 8, py + 3 + i * 7 + (frame ? 1 : 0), 5, 1);
      }
      x.fillStyle = "#2e6fa8";
      if (!isWater(tileAt(tx, ty - 1))) x.fillRect(px, py, TILE, 2);
      if (!isWater(tileAt(tx, ty + 1))) x.fillRect(px, py + TILE - 1, TILE, 1);
      if (!isWater(tileAt(tx - 1, ty))) x.fillRect(px, py, 1, TILE);
      if (!isWater(tileAt(tx + 1, ty))) x.fillRect(px + TILE - 1, py, 1, TILE);
      break;
    }
    case "y": { // 水面 + 蓮葉
      drawTile(x, "W", tx, ty, frame);
      x.fillStyle = "#3fa54c";
      x.beginPath(); x.arc(px + 8, py + 8, 5, 0.5, 6.1); x.lineTo(px + 8, py + 8); x.fill();
      x.fillStyle = "#54c25c";
      x.fillRect(px + 5, py + 5, 3, 2);
      if (noise(tx, ty, 2)) {
        x.fillStyle = "#f080b8"; x.fillRect(px + 8, py + 4, 2, 2);
        x.fillStyle = "#fff"; x.fillRect(px + 8, py + 4, 1, 1);
      }
      break;
    }
    case "b": { // 木橋 (跨水步道)
      x.fillStyle = "#4098e0"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#c08a48"; x.fillRect(px, py + 2, TILE, 12);
      x.fillStyle = "#8a5e2c";
      for (let i = 0; i < 4; i++) x.fillRect(px + i * 4 + 3, py + 2, 1, 12);
      x.fillStyle = "#d8a860"; x.fillRect(px, py + 2, TILE, 1);
      x.fillStyle = "#7d5226";
      x.fillRect(px, py, TILE, 2); x.fillRect(px, py + 14, TILE, 2);
      x.fillStyle = "#5e3d1c";
      x.fillRect(px + 1, py, 2, 2); x.fillRect(px + 9, py, 2, 2);
      x.fillRect(px + 1, py + 14, 2, 2); x.fillRect(px + 9, py + 14, 2, 2);
      break;
    }
    case "p": { // 廣場石板
      x.fillStyle = "#cfc8b4"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#bab19a";
      x.fillRect(px, py + 7, TILE, 1);
      x.fillRect(px, py + 15, TILE, 1);
      x.fillRect(px + ((tx + ty) % 2 ? 4 : 10), py, 1, 7);
      x.fillRect(px + ((tx + ty) % 2 ? 11 : 5), py + 8, 1, 7);
      const pn = noise(tx * 3, ty * 5, 100);
      x.fillStyle = "#c2baa2";
      x.fillRect(px + (pn % 12) + 2, py + ((pn * 7) % 12) + 2, 2, 1);
      break;
    }
    case "O": { // 水井 (on plaza)
      drawTile(x, "p", tx, ty, frame);
      x.fillStyle = "#8a8a94";
      x.beginPath(); x.arc(px + 8, py + 9, 6.5, 0, 7); x.fill();
      x.fillStyle = "#23233a";
      x.beginPath(); x.arc(px + 8, py + 9, 3.5, 0, 7); x.fill();
      x.fillStyle = "#b0b0ba";
      x.fillRect(px + 3, py + 4, 4, 2); x.fillRect(px + 10, py + 6, 3, 2);
      x.fillStyle = "#6a6a74";
      x.fillRect(px + 4, py + 13, 8, 2);
      break;
    }
    case "L": { // 路燈
      drawGrassBase(x, px, py, tx, ty);
      x.fillStyle = "#b0a890"; x.fillRect(px + 5, py + 13, 6, 2);
      x.fillStyle = "#3a3a46"; x.fillRect(px + 7, py + 4, 2, 10);
      x.fillStyle = "#2a2a34"; x.fillRect(px + 5, py + 1, 6, 5);
      x.fillStyle = "#ffd23e"; x.fillRect(px + 6, py + 2, 4, 3);
      x.fillStyle = "#fff0a0"; x.fillRect(px + 7, py + 2, 2, 2);
      break;
    }
    case "B": { // 灌木
      drawGrassBase(x, px, py, tx, ty);
      x.fillStyle = "#2b6e33";
      x.beginPath(); x.arc(px + 8, py + 9, 6, 0, 7); x.fill();
      x.fillStyle = "#3fa54c";
      x.beginPath(); x.arc(px + 7, py + 8, 4.5, 0, 7); x.fill();
      x.fillStyle = "#54c25c";
      x.fillRect(px + 5, py + 5, 2, 2); x.fillRect(px + 9, py + 7, 2, 1);
      break;
    }
    case "x": { // 木箱
      drawGrassBase(x, px, py, tx, ty);
      x.fillStyle = "#6a4a20"; x.fillRect(px + 2, py + 3, 12, 12);
      x.fillStyle = "#b3803f"; x.fillRect(px + 3, py + 4, 10, 10);
      x.fillStyle = "#8a5e2c";
      x.fillRect(px + 3, py + 8, 10, 1);
      x.fillRect(px + 7, py + 4, 1, 10);
      x.fillStyle = "#d8a860"; x.fillRect(px + 3, py + 4, 10, 1);
      break;
    }
    case "t": { // 樹樁
      drawGrassBase(x, px, py, tx, ty);
      x.fillStyle = "#7d5226";
      x.beginPath(); x.arc(px + 8, py + 9, 5.5, 0, 7); x.fill();
      x.fillStyle = "#b3803f";
      x.beginPath(); x.arc(px + 8, py + 9, 4, 0, 7); x.fill();
      x.fillStyle = "#8a5e2c";
      x.beginPath(); x.arc(px + 8, py + 9, 2, 0, 7); x.stroke();
      break;
    }
    case "r": { // 岩石
      drawGrassBase(x, px, py, tx, ty);
      x.fillStyle = "#6a6a74";
      x.beginPath(); x.arc(px + 7, py + 10, 5, 0, 7); x.fill();
      x.beginPath(); x.arc(px + 11, py + 9, 3.5, 0, 7); x.fill();
      x.fillStyle = "#9a9aa4";
      x.beginPath(); x.arc(px + 7, py + 9, 3.8, 0, 7); x.fill();
      x.beginPath(); x.arc(px + 11, py + 8, 2.6, 0, 7); x.fill();
      x.fillStyle = "#c0c0c8"; x.fillRect(px + 5, py + 7, 2, 1); x.fillRect(px + 10, py + 6, 2, 1);
      break;
    }
    case "f": { // 農田
      x.fillStyle = "#8a5a33"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#6e4626";
      x.fillRect(px, py + 3, TILE, 2); x.fillRect(px, py + 9, TILE, 2); x.fillRect(px, py + 15, TILE, 1);
      x.fillStyle = "#a06a3c";
      const fn = noise(tx * 7, ty * 3, 100);
      x.fillRect(px + (fn % 12) + 1, py + 6, 2, 1);
      if (fn % 3 !== 0) {
        x.fillStyle = "#54c25c";
        x.fillRect(px + (fn % 10) + 2, py + 5, 1, 2);
        x.fillRect(px + ((fn * 7) % 10) + 3, py + 12, 1, 2);
      }
      break;
    }
    case "U": { // 藍屋頂 (道具店)
      x.fillStyle = "#4a80d8"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#3a62b0";
      x.fillRect(px, py + 3, TILE, 2); x.fillRect(px, py + 9, TILE, 2);
      x.fillStyle = "#6a9ae8"; x.fillRect(px, py, TILE, 1);
      break;
    }
    case "V": { // 綠屋頂 (民宅)
      x.fillStyle = "#4a9a55"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#3a7a42";
      x.fillRect(px, py + 3, TILE, 2); x.fillRect(px, py + 9, TILE, 2);
      x.fillStyle = "#66b870"; x.fillRect(px, py, TILE, 1);
      break;
    }
    case "_": { // 森林暗地
      x.fillStyle = "#67a04c"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#578b41";
      for (let i = 0; i < 3; i++) {
        const n = noise(tx * 5 + i, ty + i * 3, 100);
        x.fillRect(px + (n % 13) + 1, py + ((n * 7) % 13) + 1, 2, 1);
      }
      break;
    }
    case "k": { // 森林暗草叢
      drawTile(x, "_", tx, ty, frame);
      x.fillStyle = "#2e6e35";
      for (let i = 0; i < 4; i++) {
        const bx = px + 1 + i * 4 + noise(tx + i, ty, 2);
        x.fillRect(bx, py + 6, 2, 9);
        x.fillRect(bx - 1, py + 9, 1, 6);
        x.fillRect(bx + 2, py + 10, 1, 5);
      }
      x.fillStyle = "#3f8a44";
      for (let i = 0; i < 4; i++) x.fillRect(px + 2 + i * 4, py + 8, 1, 5);
      break;
    }
    case "Z": { // 神殿石牆
      x.fillStyle = "#565672"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#47475e";
      x.fillRect(px, py + 5, TILE, 1); x.fillRect(px, py + 11, TILE, 1);
      x.fillRect(px + ((tx + ty) % 2 ? 5 : 10), py, 1, 5);
      x.fillRect(px + ((tx + ty) % 2 ? 11 : 4), py + 6, 1, 5);
      x.fillRect(px + ((tx + ty) % 2 ? 7 : 12), py + 12, 1, 4);
      x.fillStyle = "#6a6a8a"; x.fillRect(px, py, TILE, 1);
      x.fillStyle = "#38384c"; x.fillRect(px, py + 15, TILE, 1);
      break;
    }
    case "q": { // 神殿地板 (月光石)
      x.fillStyle = "#b2b2ca"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#9d9dba";
      x.fillRect(px, py + 7, TILE, 1); x.fillRect(px, py + 15, TILE, 1);
      x.fillRect(px + ((tx + ty) % 2 ? 4 : 11), py, 1, 7);
      x.fillRect(px + ((tx + ty) % 2 ? 12 : 5), py + 8, 1, 7);
      if (noise(tx, ty, 5) === 0) { // 月紋刻印
        x.fillStyle = "#8181a8";
        x.fillRect(px + 6, py + 3, 4, 1); x.fillRect(px + 5, py + 4, 1, 3);
        x.fillRect(px + 10, py + 4, 1, 3); x.fillRect(px + 6, py + 7, 4, 1);
      }
      break;
    }
    case "M": { // 月光水晶祭壇 (frame 呼吸光暈)
      drawTile(x, "q", tx, ty, 0);
      x.fillStyle = "#c8a030"; x.fillRect(px + 3, py + 11, 10, 4);
      x.fillStyle = "#a8842a"; x.fillRect(px + 3, py + 14, 10, 1);
      const glow = frame ? 1 : 0;
      x.fillStyle = frame ? "#b0f4ff" : "#7ce8ff";
      x.beginPath();
      x.moveTo(px + 8, py + 1 - glow); x.lineTo(px + 12 + glow, py + 6);
      x.lineTo(px + 8, py + 11 + glow); x.lineTo(px + 4 - glow, py + 6);
      x.closePath(); x.fill();
      x.fillStyle = "#fff";
      x.fillRect(px + 7, py + 3, 2, 2);
      break;
    }
    case "c": { // 洞窟壁
      x.fillStyle = "#3a3a4c"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#2c2c3a";
      const cn = noise(tx * 3, ty * 7, 100);
      x.fillRect(px + (cn % 10) + 2, py + ((cn * 7) % 10) + 2, 3, 1);
      x.fillRect(px + ((cn * 13) % 12) + 1, py + ((cn * 5) % 12) + 2, 1, 3);
      if ("d<>".includes(tileAt(tx, ty + 1))) {
        x.fillStyle = "#55556c"; x.fillRect(px, py + 12, TILE, 3); // 面向地面的壁面
        x.fillStyle = "#2c2c3a"; x.fillRect(px, py + 15, TILE, 1);
      }
      break;
    }
    case "d": { // 洞窟地
      x.fillStyle = "#4a4456"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#3e3949";
      for (let i = 0; i < 3; i++) {
        const n = noise(tx * 7 + i, ty * 5 + i * 3, 100);
        x.fillRect(px + (n % 13) + 1, py + ((n * 11) % 13) + 1, 2, 1);
      }
      if (noise(tx, ty, 7) === 0) { x.fillStyle = "#565064"; x.fillRect(px + 5, py + 8, 3, 2); }
      break;
    }
    case "l": { // 熔岩 (動畫)
      x.fillStyle = "#c84515"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#e86520";
      for (let i = 0; i < 3; i++) {
        const n = noise(tx * 5 + i * 7, ty * 3 + i, 12);
        x.fillRect(px + ((n + frame * 4) % 11) + 1, py + ((n * 5 + frame * 3) % 11) + 2, 4, 3);
      }
      x.fillStyle = frame ? "#ffd060" : "#ffa030";
      const bn = noise(tx * 11, ty * 13, 10);
      x.fillRect(px + (bn % 10) + 3, py + ((bn * 3 + frame * 5) % 10) + 3, 2, 2);
      x.fillStyle = "#802808";
      if (tileAt(tx, ty - 1) !== "l") x.fillRect(px, py, TILE, 2);
      if (tileAt(tx, ty + 1) !== "l") x.fillRect(px, py + 14, TILE, 2);
      if (tileAt(tx - 1, ty) !== "l") x.fillRect(px, py, 2, TILE);
      if (tileAt(tx + 1, ty) !== "l") x.fillRect(px + 14, py, 2, TILE);
      break;
    }
    case "o": { // 火把 (火焰閃爍)
      drawTile(x, "d", tx, ty, 0);
      x.fillStyle = "#565064"; x.fillRect(px + 5, py + 13, 6, 2);
      x.fillStyle = "#6a4a20"; x.fillRect(px + 7, py + 6, 2, 8);
      x.fillStyle = "#ffa030";
      if (frame) { x.fillRect(px + 6, py + 2, 4, 5); x.fillRect(px + 7, py + 1, 2, 1); }
      else { x.fillRect(px + 6, py + 3, 4, 4); x.fillRect(px + 5, py + 2, 2, 2); }
      x.fillStyle = "#ffd860"; x.fillRect(px + 7, py + 3, 2, 3);
      break;
    }
    case "m": { // 隕鐵礦 (藍紋脈動)
      drawTile(x, "d", tx, ty, 0);
      x.fillStyle = "#3c3850";
      x.beginPath(); x.arc(px + 8, py + 9, 6, 0, 7); x.fill();
      x.fillStyle = "#55506a";
      x.beginPath(); x.arc(px + 7, py + 8, 4.5, 0, 7); x.fill();
      x.fillStyle = frame ? "#b0f4ff" : "#7ce8ff";
      x.fillRect(px + 5, py + 6, 2, 1); x.fillRect(px + 7, py + 8, 1, 3);
      x.fillRect(px + 9, py + 6, 3, 1); x.fillRect(px + 10, py + 10, 2, 2);
      break;
    }
    case "^": { // 營火 (地下層營地; 走得過)
      drawTile(x, "d", tx, ty, 0);
      x.fillStyle = "#4a4456";
      x.beginPath(); x.arc(px + 8, py + 12, 6, 0, 7); x.fill();
      x.fillStyle = "#6a4a20";
      x.fillRect(px + 3, py + 10, 10, 2); x.fillRect(px + 7, py + 8, 2, 6);
      x.fillStyle = frame ? "#ff9020" : "#ff7010";
      x.fillRect(px + 5, py + 5, 6, 6); x.fillRect(px + 6, py + 3, 4, 3);
      x.fillStyle = "#ffd860";
      x.fillRect(px + 7, py + 6, 2, 4); x.fillRect(px + 7, py + (frame ? 3 : 4), 2, 2);
      break;
    }
    case ">": case "<": { // 階梯
      drawTile(x, ch === ">" ? "q" : "d", tx, ty, 0);
      const cols = ch === ">" ? ["#8a8aa8", "#6a6a88", "#4a4a66"] : ["#6a6480", "#565070", "#443f5c"];
      x.fillStyle = "#1a1c2c"; x.fillRect(px + 2, py + 2, 12, 12);
      cols.forEach((c2, i) => { x.fillStyle = c2; x.fillRect(px + 3, py + 3 + i * 4, 10, 3); });
      break;
    }
    case "G": { // 深淵之門 (符文脈動)
      x.fillStyle = "#242434"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#3c3c52";
      x.fillRect(px, py, TILE, 3); x.fillRect(px, py, 2, TILE); x.fillRect(px + 14, py, 2, TILE);
      x.fillStyle = "#14141f"; x.fillRect(px + 4, py + 5, 8, 11);
      x.fillStyle = frame ? "#c89aff" : "#a06ae8";
      const gn = noise(tx, ty, 4);
      x.fillRect(px + 6 + gn, py + 6, 2, 2); x.fillRect(px + 5 + (gn % 3), py + 11, 2, 2);
      break;
    }
    case "v": { // 虛空 (深空 + 星點)
      x.fillStyle = "#0b0a1c"; x.fillRect(px, py, TILE, TILE);
      const vn = noise(tx * 7, ty * 11, 100);
      if (vn < 22) {
        x.fillStyle = vn < 7 ? "#ffffff" : vn < 14 ? "#a8c8ff" : "#6a7aa8";
        x.fillRect(px + (vn % 13) + 1, py + ((vn * 5) % 13) + 1, 1, 1);
      }
      if (vn > 92) { // 遠方星雲
        x.fillStyle = "rgba(120,90,200,.25)";
        x.fillRect(px + 2, py + 3, 10, 8);
      }
      break;
    }
    case "n": { // 星石地板 (浮島)
      x.fillStyle = "#3a3560"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#4a4478";
      x.fillRect(px, py + 7, TILE, 1);
      x.fillRect(px + ((tx + ty) % 2 ? 5 : 11), py, 1, 7);
      const nn = noise(tx * 5, ty * 9, 100);
      x.fillStyle = "#5c5490";
      x.fillRect(px + (nn % 12) + 1, py + ((nn * 7) % 12) + 1, 2, 1);
      if (nn < 12) { x.fillStyle = "#9a8ae8"; x.fillRect(px + (nn % 10) + 3, py + 6, 1, 1); }
      // 島緣: 靠虛空側打亮 (漂浮感)
      x.fillStyle = "#6a5ea8";
      if (tileAt(tx, ty - 1) === "v") x.fillRect(px, py, TILE, 1);
      if (tileAt(tx - 1, ty) === "v") x.fillRect(px, py, 1, TILE);
      if (tileAt(tx + 1, ty) === "v") x.fillRect(px + TILE - 1, py, 1, TILE);
      x.fillStyle = "#1c1836";
      if (tileAt(tx, ty + 1) === "v") x.fillRect(px, py + TILE - 2, TILE, 2);
      break;
    }
    case ":": { // 星光橋 (脈動光帶)
      x.fillStyle = "#0b0a1c"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = frame ? "rgba(150,190,255,.30)" : "rgba(150,190,255,.20)";
      x.fillRect(px + 1, py, TILE - 2, TILE);
      x.fillStyle = frame ? "#b8d4ff" : "#93b8f0";
      x.fillRect(px + 3, py, 10, TILE);
      x.fillStyle = "#ffffff";
      const bn = noise(tx, ty, 8);
      x.fillRect(px + 5 + (bn % 5), py + ((bn * 3 + (frame ? 6 : 0)) % 14), 2, 2);
      break;
    }
    case "*": { // 星辰水晶 (光源)
      drawTile(x, "n", tx, ty, 0);
      x.fillStyle = frame ? "#e8f0ff" : "#b8d0ff";
      x.beginPath();
      x.moveTo(px + 8, py + 1); x.lineTo(px + 11, py + 8);
      x.lineTo(px + 8, py + 15); x.lineTo(px + 5, py + 8);
      x.closePath(); x.fill();
      x.fillStyle = "rgba(200,220,255,.45)";
      x.fillRect(px + 1, py + 7, 14, 2); x.fillRect(px + 7, py + 1, 2, 14);
      x.fillStyle = "#ffffff"; x.fillRect(px + 7, py + 6, 2, 3);
      break;
    }
    case "@": { // 傳送門 (旋渦)
      drawTile(x, tileAt(tx, ty + 1) === "d" || tileAt(tx, ty - 1) === "d" ? "d" : "n", tx, ty, 0);
      x.fillStyle = "#1a0f2e";
      x.beginPath(); x.arc(px + 8, py + 8, 7, 0, 7); x.fill();
      for (let i = 0; i < 3; i++) {
        x.strokeStyle = ["#c89aff", "#8a6ae8", "#5a3ab0"][i];
        x.lineWidth = 1.5;
        x.beginPath();
        x.arc(px + 8, py + 8, 6 - i * 1.8, (frame ? 1 : 0) + i * 2, (frame ? 1 : 0) + i * 2 + 4);
        x.stroke();
      }
      x.fillStyle = "#ffffff"; x.fillRect(px + 7, py + 7, 2, 2);
      break;
    }
    case "E": { // 核心祭壇 (刻紋巨石)
      x.fillStyle = "#2a2450"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#3e3670";
      x.fillRect(px + 1, py + 1, 14, 14);
      x.fillStyle = "#1a1638";
      x.fillRect(px, py, TILE, 2); x.fillRect(px, py + 14, TILE, 2);
      x.fillStyle = frame ? "#d8b0ff" : "#a06ae8";
      x.fillRect(px + 4, py + 5, 8, 1); x.fillRect(px + 7, py + 4, 2, 8);
      x.fillRect(px + 4, py + 11, 8, 1);
      break;
    }
    case "A": { // 道具店櫃檯: 藍白遮陽棚
      x.fillStyle = "#efe3c4"; x.fillRect(px, py, TILE, TILE);
      for (let i = 0; i < 4; i++) {
        x.fillStyle = i % 2 ? "#f0f0f0" : "#4a80d8";
        x.fillRect(px + i * 4, py, 4, 4);
      }
      x.fillStyle = "#c98a4b"; x.fillRect(px, py + 6, TILE, 4);
      x.fillStyle = "#a56a35"; x.fillRect(px, py + 10, TILE, 6);
      x.fillStyle = "#8a5426"; x.fillRect(px, py + 10, TILE, 1);
      const an = noise(tx, ty, 3);
      x.fillStyle = ["#e84545", "#3fa54c", "#e88b3a"][an];
      x.fillRect(px + 4 + an * 2, py + 3, 3, 3);
      break;
    }
    case "T": {
      drawGrassBase(x, px, py, tx, ty);
      x.fillStyle = "#7a4a24"; x.fillRect(px + 6, py + 11, 4, 5);
      x.fillStyle = "#256b30";
      x.beginPath(); x.arc(px + 8, py + 7, 7, 0, 7); x.fill();
      x.fillStyle = "#2f8a3d";
      x.beginPath(); x.arc(px + 8, py + 6, 5.5, 0, 7); x.fill();
      x.fillStyle = "#3fa54c";
      const n = noise(tx, ty, 4);
      x.fillRect(px + 4 + n, py + 3, 2, 2); x.fillRect(px + 9, py + 6 + (n % 2), 2, 2);
      break;
    }
    case "F": {
      drawGrassBase(x, px, py, tx, ty);
      x.fillStyle = "#a06a32";
      x.fillRect(px, py + 5, TILE, 3); x.fillRect(px, py + 10, TILE, 3);
      x.fillStyle = "#7d5226";
      x.fillRect(px + 2, py + 3, 3, 11); x.fillRect(px + 11, py + 3, 3, 11);
      x.fillStyle = "#5e3d1c";
      x.fillRect(px + 2, py + 13, 3, 1); x.fillRect(px + 11, py + 13, 3, 1);
      break;
    }
    case "H": {
      x.fillStyle = "#efe3c4"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#d9c9a4";
      x.fillRect(px, py + 4, TILE, 1); x.fillRect(px, py + 9, TILE, 1);
      x.fillStyle = "#b09a74"; x.fillRect(px, py + 14, TILE, 2);
      break;
    }
    case "R": {
      x.fillStyle = "#d85555"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#b23e3e";
      x.fillRect(px, py + 3, TILE, 2); x.fillRect(px, py + 9, TILE, 2);
      x.fillStyle = "#e87a6a"; x.fillRect(px, py, TILE, 1);
      break;
    }
    case "D": {
      x.fillStyle = "#efe3c4"; x.fillRect(px, py, TILE, TILE);
      x.fillStyle = "#5e3a1e"; x.fillRect(px + 3, py + 2, 10, 14);
      x.fillStyle = "#7a4c28"; x.fillRect(px + 4, py + 3, 8, 12);
      x.fillStyle = "#e8c860"; x.fillRect(px + 10, py + 9, 2, 2);
      break;
    }
    case "C": {
      // 商店櫃檯: 紅白遮陽棚 + 木檯面 + 貨品
      x.fillStyle = "#efe3c4"; x.fillRect(px, py, TILE, TILE);
      for (let i = 0; i < 4; i++) {
        x.fillStyle = i % 2 ? "#f0f0f0" : "#e05050";
        x.fillRect(px + i * 4, py, 4, 4);
      }
      x.fillStyle = "#c98a4b"; x.fillRect(px, py + 6, TILE, 4);
      x.fillStyle = "#a56a35"; x.fillRect(px, py + 10, TILE, 6);
      x.fillStyle = "#8a5426"; x.fillRect(px, py + 10, TILE, 1);
      const n = noise(tx, ty, 3);
      x.fillStyle = ["#e84545", "#3a6fd8", "#3fa54c"][n];
      x.fillRect(px + 4 + n * 2, py + 3, 3, 3);
      break;
    }
    case "S": {
      drawGrassBase(x, px, py, tx, ty);
      x.fillStyle = "#7d5226"; x.fillRect(px + 7, py + 8, 3, 7);
      x.fillStyle = "#d8b878"; x.fillRect(px + 2, py + 2, 12, 7);
      x.fillStyle = "#8a6a3a";
      x.fillRect(px + 2, py + 2, 12, 1); x.fillRect(px + 2, py + 8, 12, 1);
      x.fillRect(px + 2, py + 2, 1, 7); x.fillRect(px + 13, py + 2, 1, 7);
      x.fillStyle = "#6a4a20"; x.fillRect(px + 4, py + 4, 8, 1); x.fillRect(px + 4, py + 6, 6, 1);
      break;
    }
    default: drawGrassBase(x, px, py, tx, ty);
  }
}

function buildBaseLayer() {
  baseLayer = document.createElement("canvas");
  baseLayer.width = world.w * TILE;
  baseLayer.height = world.h * TILE;
  const x = baseLayer.getContext("2d");
  x.imageSmoothingEnabled = false;
  waterTiles = []; lightTiles = []; counterW = []; counterG = [];
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      const ch = world.rows[ty][tx];
      drawTile(x, ch, tx, ty, 0);
      if ("WyMlomG^:*@E".includes(ch)) waterTiles.push([tx, ty, ch]); // 動畫 tile
      if ("olm<G^".includes(ch)) lightTiles.push([tx, ty, ch]);       // 地下層光源
      if (ch === "C") counterW.push([tx, ty]);
      if (ch === "A") counterG.push([tx, ty]);
    }
  }
}

// ---------- 網路 ----------
function connect(name) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { netUp = true; ws.send(JSON.stringify({ t: "join", name })); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "init") {
      myId = m.id; world = m;
      if (m.dtop) DUNGEON_TOP_ROW = m.dtop;
      if (m.vtop) VOID_TOP_ROW = m.vtop;
      buildBaseLayer();
      npcEnts.clear();
      for (const n of m.npcs || []) {
        npcEnts.set(n.id, {
          npcId: n.id, n: n.name, x: n.x, y: n.y, tx: n.x, ty: n.y,
          d: "d", idNum: n.pal, animT: 0, slashT: 0, flashT: 0, spawnT: 0,
        });
      }
      document.getElementById("join").classList.add("hidden");
      requestAnimationFrame(loop);
    } else if (m.t === "st") {
      applyDelta(m);
    } else if (m.t === "msg") {
      toast(m.txt);
      if (m.txt.startsWith("Bought")) blip(760, 0.1, 0.04, 300);
    } else if (m.t === "qmsg") {
      banners.push({ txt: m.txt, age: 0 });
      blip(620, 0.12, 0.04, 260); setTimeout(() => blip(930, 0.16, 0.04, 180), 130);
    } else if (m.t === "dlg") {
      showDlg(m);
    }
  };
  ws.onclose = () => {
    netUp = false;
    const err = document.getElementById("joinErr");
    err.textContent = "連線中斷 (server disconnected)";
    document.getElementById("join").classList.remove("hidden");
  };
  ws.onerror = () => {
    document.getElementById("joinErr").textContent = "無法連線到伺服器";
  };
}
function send(obj) { if (netUp && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

let firstStateDone = false;
// applyDelta 套用差分快照: 只更新收到的實體, 依 rp/rm 移除離場者
function applyDelta(m) {
  if (m.key) { // keyframe: 以本幀為準, 補上缺席者的移除
    const alive = new Set((m.p || []).map((s) => s.id));
    for (const id of [...players.keys()]) if (!alive.has(id)) players.delete(id);
    const aliveM = new Set((m.m || []).map((s) => s.id));
    for (const id of [...monsters.keys()]) if (!aliveM.has(id)) monsters.delete(id);
  } else {
    for (const id of m.rp || []) players.delete(id);
    for (const id of m.rm || []) monsters.delete(id);
  }
  applyState(m);
}

function applyState(m) {
  syncEntities(players, m.p, (ent, s) => {
    ent.n = s.n; ent.d = s.d; ent.hp = s.hp; ent.mh = s.mh; ent.g = s.g;
    ent.w = s.w || ""; ent.a = s.a || ""; ent.iv = s.iv || {};
    ent.bs = s.bs || 0; ent.ba = s.ba || 0; ent.q = s.q || 0; ent.pv = !!s.pv;
    if (s.dd && !ent.dd) ent.deadAt = performance.now(); // 倒地 tween 起點
    ent.dd = !!s.dd;
    if (s.id === myId) reconcile(ent, s); // 自身: 預測值與權威值和解
  });
  syncEntities(monsters, m.m, (ent, s) => {
    ent.k = s.k; ent.d = s.d; ent.hp = s.hp; ent.mh = s.mh; ent.rg = !!s.rg;
  });
  if (m.e) for (const e of m.e) handleEvent(e);
  firstStateDone = true;
  if (shopOpen) refreshShopState();
}
// syncEntities 差分套用: list 只含有變動的實體, 未提及者維持原狀
function syncEntities(map, list, assign) {
  for (const s of list || []) {
    let ent = map.get(s.id);
    if (!ent) {
      // 入場縮放動畫 (join 當下已存在的實體不播)
      ent = { x: s.x, y: s.y, animT: 0, slashT: 0, flashT: 0, spawnT: firstStateDone ? 260 : 0 };
      map.set(s.id, ent);
    }
    if (Math.hypot(s.x - ent.x, s.y - ent.y) > 48) { ent.x = s.x; ent.y = s.y; }
    ent.tx = s.x; ent.ty = s.y;
    assign(ent, s);
  }
}

const POOF_COLORS = {
  slime: "124,232,124", beetle: "216,152,88", wolf: "192,200,220", player: "255,144,144",
  slime_king: "178,120,255", wolf_king: "160,140,210",
  shade: "170,150,220", gargoyle: "170,170,190", eclipse_golem: "130,120,170",
  wraith: "150,200,255", sentinel: "180,160,255", eclipse_core: "255,180,120",
};
function handleEvent(e) {
  switch (e.k) {
    case "sl": {
      const ent = players.get(e.id);
      if (ent) { ent.slashT = 200; ent.slashD = e.d; }
      if (e.id === myId) blip(220, 0.06, 0.03, -80);
      break;
    }
    case "hit": {
      const tgt = players.get(e.id) || monsters.get(e.id);
      if (tgt) tgt.flashT = 130; // 受擊白閃
      effects.push({ type: "txt", x: e.x, y: e.y, txt: `-${e.v}`, color: "#ff5a5a", ttl: 650 });
      blip(130, 0.05, 0.03);
      break;
    }
    case "heal":
      effects.push({ type: "txt", x: e.x, y: e.y, txt: `+${e.v}`, color: "#5ae87a", ttl: 700 });
      if (e.id === myId) blip(520, 0.09, 0.035, 240);
      break;
    case "die":
      effects.push({ type: "poof", x: e.x, y: e.y, ttl: 400, color: POOF_COLORS[e.s] || "220,220,230" });
      blip(e.s === "player" ? 90 : 240, 0.18, 0.04, -60);
      break;
    case "rare": // 稀有掉落
      if (e.id === myId) {
        const it = world.shop.find((s) => s.id === e.s);
        effects.push({ type: "txt", x: e.x, y: e.y, txt: `★${it ? it.name : e.s}`, color: "#ffd23e", ttl: 1400 });
        blip(880, 0.09, 0.045, 420); setTimeout(() => blip(1320, 0.12, 0.045, 300), 90);
      }
      break;
    case "mat": // 素材入包
      if (e.id === myId) {
        const it = world.shop.find((s) => s.id === e.s);
        effects.push({ type: "txt", x: e.x, y: e.y, txt: `+${it ? it.name : e.s}`, color: "#7ce8ff", ttl: 850 });
        blip(660, 0.06, 0.03, 220);
      }
      break;
    case "sum": // Boss 召喚
      effects.push({ type: "poof", x: e.x, y: e.y, ttl: 400, color: "178,120,255" });
      blip(160, 0.14, 0.045, -50);
      break;
    case "fw": { // 結局煙火
      const delay = (e.v || 0) * 10;
      effects.push({ type: "fw", x: e.x, y: e.y, ttl: 900 + delay, delay, age: 0, hue: (e.x * 7 + e.y * 13) % 360 });
      break;
    }
    case "tel": // 魔像蓄力警告圈
      effects.push({ type: "ring", x: e.x, y: e.y, r: e.v || 48, ttl: 1000, max: 1000, color: "255,90,60", warn: true });
      blip(180, 0.25, 0.05, 100, "sawtooth");
      break;
    case "slam": // 震地波
      effects.push({ type: "ring", x: e.x, y: e.y, r: e.v || 48, ttl: 420, max: 420, color: "255,255,255" });
      blip(55, 0.3, 0.07, -20);
      break;
    case "tp": // 階梯/傳送門
      effects.push({ type: "poof", x: e.x, y: e.y, ttl: 380, color: "160,200,255" });
      blip(500, 0.1, 0.035, 380);
      break;
    case "rage": { // Boss 狂暴: 紅色衝擊 + 畫面震動
      effects.push({ type: "ring", x: e.x, y: e.y, r: 6 * TILE, ttl: 700, max: 700, color: "255,90,60" });
      shakeT = 520;
      blip(120, 0.4, 0.06, -40, "sawtooth");
      setTimeout(() => blip(90, 0.5, 0.05, -30, "sawtooth"), 160);
      break;
    }
    case "gold":
      if (e.id === myId) {
        effects.push({ type: "txt", x: e.x, y: e.y, txt: `+${e.v}G`, color: "#ffd23e", ttl: 800 });
        blip(880, 0.05, 0.035); setTimeout(() => blip(1320, 0.07, 0.035), 60);
      }
      break;
  }
}

// ---------- 本地預測 (client-side prediction & reconciliation) ----------
// 玩家自己的移動立即在本地模擬, 不等 server 回覆 (消除 ~80ms 輸入延遲感);
// 每次收到權威座標時比對, 差距小則平滑靠攏, 差距大 (傳送/被打斷) 直接校正。
const PRED_SNAP = 3 * TILE;   // 超過此差距視為傳送 → 硬校正
const PRED_BLEND = 0.22;      // 小誤差每幀修正比例

function reconcile(ent, s) {
  // 首次收到權威座標時 (或狀態異常) 直接以 server 為準建立預測基準
  if (!Number.isFinite(ent.px) || !Number.isFinite(ent.py)) {
    ent.px = s.x; ent.py = s.y;
    return;
  }
  const dx = s.x - ent.px, dy = s.y - ent.py;
  if (Math.hypot(dx, dy) > PRED_SNAP) { ent.px = s.x; ent.py = s.y; }
  else { ent.px += dx * PRED_BLEND; ent.py += dy * PRED_BLEND; }
}

// solidAt 本地碰撞查詢 (與 server 同一份 tile 規則)
const SOLID_CHARS = "TWyFHRUVDCASOLBxtrZMcGlomv*E";
function solidAt(px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return true;
  return SOLID_CHARS.includes(world.rows[ty][tx]);
}
function boxBlocked(cx, cy, hw) {
  return solidAt(cx - hw, cy - hw) || solidAt(cx + hw, cy - hw) ||
         solidAt(cx - hw, cy + hw) || solidAt(cx + hw, cy + hw);
}

// predictSelf 依本地按鍵推進自身座標 (與 server player.step 同規則)
const PLAYER_HALF = 0.31 * TILE;
function predictSelf(me, dt) {
  if (!Number.isFinite(me.px) || !Number.isFinite(me.py)) { me.px = me.x; me.py = me.y; }
  if (me.dd) { me.px = me.x; me.py = me.y; return; }
  let dx = 0, dy = 0;
  if (keys.up) dy--;
  if (keys.dn) dy++;
  if (keys.lf) dx--;
  if (keys.rt) dx++;
  if (!dx && !dy) return;
  if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
  const spd = 5 * TILE * (me.bs > 0 ? 1.4 : 1); // 與 server: 5 unit/s, haste +40%
  const step = spd * dt / 1000;
  if (dx && !boxBlocked(me.px + dx * step, me.py, PLAYER_HALF)) me.px += dx * step;
  if (dy && !boxBlocked(me.px, me.py + dy * step, PLAYER_HALF)) me.py += dy * step;
}

// ---------- 輸入 ----------
const keys = { up: false, dn: false, lf: false, rt: false };
let lastAtkSent = 0;
const KEYMAP = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "dn", s: "dn", S: "dn",
  ArrowLeft: "lf", a: "lf", A: "lf",
  ArrowRight: "rt", d: "rt", D: "rt",
};
function sendInput() { send({ t: "in", up: keys.up, dn: keys.dn, lf: keys.lf, rt: keys.rt }); }

window.addEventListener("keydown", (ev) => {
  if (document.getElementById("join").classList.contains("hidden") === false) return;
  if (dlgOpen && (ev.key === "Escape" || ev.key === "e" || ev.key === "E")) {
    ev.preventDefault(); closeDlg(); return;
  }
  if (shopOpen && (ev.key === "Escape" || ev.key === "e" || ev.key === "E")) {
    ev.preventDefault(); closeShop(); return;
  }
  if (shopOpen) return;
  const dir = KEYMAP[ev.key];
  if (dir) {
    ev.preventDefault();
    if (!keys[dir]) { keys[dir] = true; sendInput(); }
    return;
  }
  if (ev.key === " " || ev.key === "j" || ev.key === "J") {
    ev.preventDefault();
    const now = performance.now();
    if (now - lastAtkSent > 240) { lastAtkSent = now; send({ t: "atk" }); }
    return;
  }
  if (ev.key === "e" || ev.key === "E") {
    ev.preventDefault();
    const npc = nearNPCId();
    if (npc) { send({ t: "talk", id: npc }); return; }
    const st = nearStore();
    if (st) openShop(st);
    else toast("走近 NPC 或商店櫃檯再按 E");
    return;
  }
  if (ev.key >= "1" && ev.key <= "4") {
    ev.preventDefault();
    const it = consumables()[Number(ev.key) - 1];
    if (it) send({ t: "use", id: it.id });
    return;
  }
  if (ev.key === "q" || ev.key === "Q") { ev.preventDefault(); send({ t: "use", id: "potion" }); return; }
  if (ev.key === "p" || ev.key === "P") { ev.preventDefault(); send({ t: "pvp" }); return; }
  if (ev.key === "m" || ev.key === "M") { ev.preventDefault(); toggleMute(); }
});
window.addEventListener("keyup", (ev) => {
  const dir = KEYMAP[ev.key];
  if (dir && keys[dir]) { keys[dir] = false; sendInput(); }
});
window.addEventListener("blur", () => {
  let changed = false;
  for (const k in keys) { if (keys[k]) { keys[k] = false; changed = true; } }
  if (changed) sendInput();
});

// nearStore 貼近哪間店的櫃檯: "weapon" | "gear" | null
function nearStore() {
  const me = players.get(myId);
  if (!me) return null;
  const near = (list) => list.some(([tx, ty]) =>
    Math.hypot(me.x - (tx * TILE + 8), me.y - (ty * TILE + 8)) < 44);
  if (near(counterW)) return "weapon";
  if (near(counterG)) return "gear";
  return null;
}
// 消耗品清單 (熱鍵 1-4 依此順序)
function consumables() {
  return world ? world.shop.filter((s) => s.kind === "potion") : [];
}
// nearNPCId 貼近的 NPC id (對話用)
function nearNPCId() {
  const me = players.get(myId);
  if (!me) return null;
  for (const [id, n] of npcEnts) {
    if (Math.hypot(me.x - n.x, me.y - n.y) < 36) return id;
  }
  return null;
}
// questTargetNPC 目前任務該找的 NPC (顯示 '!' 用)
function questTargetNPC() {
  const me = players.get(myId);
  if (!me || !world.story) return null;
  const st = world.story[me.q || 0];
  if (!st) return null;
  if (st.kind === "talk") return st.npc;
  if (st.kind === "collect" && ((me.iv && me.iv[st.target]) || 0) >= st.n) return st.npc;
  return null;
}

// ---------- NPC 對話 UI ----------
let dlgOpen = false;
function showDlg(m) {
  dlgOpen = true;
  document.getElementById("dlgName").textContent = m.npc;
  document.getElementById("dlgTxt").textContent = m.txt;
  const acts = document.getElementById("dlgActs");
  acts.innerHTML = "";
  for (const a of m.acts || []) {
    const b = document.createElement("button");
    b.textContent = a.label;
    b.onclick = () => send({ t: "dlgact", id: a.id });
    acts.appendChild(b);
  }
  const close = document.createElement("button");
  close.textContent = "離開";
  close.className = "dlgClose";
  close.onclick = closeDlg;
  acts.appendChild(close);
  document.getElementById("dlg").classList.remove("hidden");
  blip(500, 0.05, 0.03, 120);
}
function closeDlg() {
  dlgOpen = false;
  document.getElementById("dlg").classList.add("hidden");
}

// ---------- 觸控搖桿 (行動裝置) ----------
function initTouch() {
  const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (!isTouch) return;
  document.getElementById("touch").classList.remove("hidden");

  const stick = document.getElementById("stick");
  const knob = document.getElementById("stickKnob");
  const R = 34; // 旋鈕最大位移
  let active = null;

  const setDir = (dx, dy) => {
    const dead = 0.32; // 死區: 避免輕觸就走
    const next = {
      up: dy < -dead, dn: dy > dead, lf: dx < -dead, rt: dx > dead,
    };
    let changed = false;
    for (const k in next) if (keys[k] !== next[k]) { keys[k] = next[k]; changed = true; }
    if (changed) sendInput();
  };
  const move = (t) => {
    const r = stick.getBoundingClientRect();
    let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    knob.style.transform = `translate(calc(-50% + ${dx * R}px), calc(-50% + ${dy * R}px))`;
    setDir(dx, dy);
  };
  const release = () => {
    active = null;
    knob.style.transform = "translate(-50%, -50%)";
    setDir(0, 0);
  };
  stick.addEventListener("pointerdown", (e) => {
    active = e.pointerId; stick.setPointerCapture(e.pointerId); move(e); e.preventDefault();
  });
  stick.addEventListener("pointermove", (e) => { if (active === e.pointerId) { move(e); e.preventDefault(); } });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) {
    stick.addEventListener(ev, (e) => { if (active === e.pointerId) release(); });
  }

  // 動作鍵: 攻擊長按連發 / E 互動 / 藥水
  const atk = document.getElementById("btnAtk");
  let atkTimer = 0;
  const startAtk = (e) => {
    e.preventDefault();
    send({ t: "atk" });
    clearInterval(atkTimer);
    atkTimer = setInterval(() => send({ t: "atk" }), 260);
  };
  const stopAtk = () => clearInterval(atkTimer);
  atk.addEventListener("pointerdown", startAtk);
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) atk.addEventListener(ev, stopAtk);

  document.getElementById("btnAct").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (dlgOpen) { closeDlg(); return; }
    if (shopOpen) { closeShop(); return; }
    const npc = nearNPCId();
    if (npc) { send({ t: "talk", id: npc }); return; }
    const st = nearStore();
    if (st) openShop(st); else toast("走近 NPC 或商店櫃檯");
  });
  document.getElementById("btnPot").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    send({ t: "use", id: "potion" });
  });
}

// ---------- 商店 UI ----------
let shopOpen = false;
let shopStore = "weapon"; // 目前開啟的店
const ICONS = { weapon: "⚔️", armor: "🛡️", potion: "🧪" };
const STORE_TITLES = { weapon: "WEAPON SHOP 武器店", gear: "ITEM SHOP 道具店" };

function itemStat(it) {
  if (it.kind === "weapon") {
    let s = `ATK +${it.atk} · CD ${((it.cd || 7) * 50 / 1000).toFixed(2)}s`;
    if ((it.reach || 0.9) > 0.9) s += ` · 距離${it.reach}人`;
    if ((it.radius || 1.1) > 1.1) s += " · 大範圍";
    return s;
  }
  if (it.kind === "armor") return `DEF +${it.def}`;
  if (it.heal > 0) return it.heal >= 999 ? "回復全部 HP" : `回復 ${it.heal} HP`;
  if (it.speedPct > 0) return `+${it.speedPct}% 移速 ${it.buffSec}s`;
  return `+${it.atkBuff} ATK ${it.buffSec}s`;
}

function buildShopList(store) {
  const ul = document.getElementById("shopList");
  ul.innerHTML = "";
  document.getElementById("shopTitle").textContent = STORE_TITLES[store];
  for (const it of world.shop) {
    if (it.store !== store) continue;
    const li = document.createElement("li");
    li.dataset.id = it.id;
    li.innerHTML = `<span class="icon">${ICONS[it.kind]}</span>
      <span class="info">${it.name}<br><span class="stat">${itemStat(it)}</span></span>
      <span class="owned-mark"></span>
      <span class="price">${it.price} G</span>`;
    const btn = document.createElement("button");
    btn.textContent = "買";
    btn.onclick = () => send({ t: "buy", id: it.id });
    li.appendChild(btn);
    ul.appendChild(li);
  }
  document.getElementById("shopClose").onclick = closeShop;
}
function refreshShopState() {
  const me = players.get(myId);
  if (!me) return;
  document.getElementById("shopGold").textContent = `${me.g} G`;
  for (const li of document.querySelectorAll("#shopList li")) {
    const it = world.shop.find((s) => s.id === li.dataset.id);
    const owned = (it.kind === "weapon" && me.w === it.id) || (it.kind === "armor" && me.a === it.id);
    const count = it.kind === "potion" ? (me.iv && me.iv[it.id]) || 0 : 0;
    li.querySelector(".owned-mark").textContent = owned ? "裝備中" : count > 0 ? `x${count}` : "";
    li.querySelector("button").disabled = me.g < it.price || owned;
  }
}
function openShop(store) {
  shopOpen = true;
  shopStore = store;
  buildShopList(store);
  refreshShopState();
  document.getElementById("shop").classList.remove("hidden");
}
function closeShop() { shopOpen = false; document.getElementById("shop").classList.add("hidden"); }

// ---------- 提示 ----------
let toastTimer = 0;
function toast(txt) {
  const el = document.getElementById("toast");
  el.textContent = txt;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 1800);
}

// ---------- 繪製 ----------
let frameDt = 16; // 本幀 ms (loop 設定, 供動畫計時)

// drawSwing 武器沿弧線揮舞 (徒手無武器圖只留 trail; reach/radius 為人物單位)
function drawSwing(ent, px, py) {
  const spr = weaponSprite(ent.w);
  if (!spr) return;
  const prog = 1 - Math.max(0, ent.slashT) / 200;
  const ang = { u: -Math.PI / 2, d: Math.PI / 2, l: Math.PI, r: 0 }[ent.slashD || "d"];
  const wIt = world.shop.find((s) => s.id === ent.w);
  const half = ((wIt && wIt.radius) || 1.1) > 1.1 ? 1.15 : 0.85;
  const a = ang - half + 2 * half * Math.min(1, prog * 1.15);
  g.save();
  g.translate(px, py - 2);
  g.rotate(a);
  g.drawImage(spr, 3, -Math.floor(spr.height / 2));
  g.restore();
  // 星隕劍: 星屑灑落
  if (ent.w === "star_blade" && Math.random() < 0.5) {
    const sr = ((wIt && wIt.reach) || 0.9) * TILE + 4;
    effects.push({
      type: "txt", x: px + Math.cos(a) * sr, y: py + Math.sin(a) * sr,
      txt: "+", color: "#aef4ff", ttl: 320,
    });
  }
}

// drawDungeonLight 地下層黑暗遮罩: 玩家與光源打洞
function drawDungeonLight(camX, camY, me, now) {
  if (!lightCv) {
    lightCv = document.createElement("canvas");
    lightCv.width = VIEW_W; lightCv.height = VIEW_H;
  }
  const lc = lightCv.getContext("2d");
  lc.globalCompositeOperation = "source-over";
  lc.clearRect(0, 0, VIEW_W, VIEW_H);
  lc.fillStyle = "rgba(5,5,18,0.85)";
  lc.fillRect(0, 0, VIEW_W, VIEW_H);
  lc.globalCompositeOperation = "destination-out";
  const punch = (x, y, r, s) => {
    const gr = lc.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${s})`);
    gr.addColorStop(0.6, `rgba(0,0,0,${s * 0.6})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    lc.fillStyle = gr;
    lc.fillRect(x - r, y - r, r * 2, r * 2);
  };
  punch(me.x - camX, me.y - camY, 7 * TILE, 0.97);
  // 營地: 安全區整片提亮 (地下層的休息點)
  for (const [x1, y1, x2, y2] of world.safe || []) {
    if (y1 < 64) continue;
    const cx = ((x1 + x2) / 2 + 0.5) * TILE - camX;
    const cy = ((y1 + y2) / 2 + 0.5) * TILE - camY;
    punch(cx, cy, Math.max(x2 - x1, y2 - y1) * TILE * 0.75, 0.92);
  }
  for (const [tx, ty, ch] of lightTiles) {
    const x = tx * TILE + 8 - camX, y = ty * TILE + 8 - camY;
    let r = ch === "^" ? 5.5 * TILE : ch === "o" ? 4.5 * TILE : ch === "l" ? 3 * TILE : 2.2 * TILE;
    if (x < -r || x > VIEW_W + r || y < -r || y > VIEW_H + r) continue;
    if (ch === "o" || ch === "^") r *= 1 + Math.sin(now / 90 + tx * 3) * 0.07; // 火光搖曳
    punch(x, y, r, ch === "o" || ch === "^" ? 0.92 : 0.55);
  }
  // 樓板: 地下層看不到地上世界 (鏡頭跨越 row 64 時補實心黑)
  const floorY = DUNGEON_TOP_ROW * TILE - camY;
  if (floorY > 0) {
    lc.globalCompositeOperation = "source-over";
    lc.fillStyle = "#05050f";
    lc.fillRect(0, 0, VIEW_W, Math.min(VIEW_H, floorY));
  }
  g.drawImage(lightCv, 0, 0);
}

// drawVoidAmbience 月之裏側氛圍: 極光帶 + 飄浮星塵 (不壓暗, 反而發光)
function drawVoidAmbience(camX, camY, now) {
  g.save();
  // 極光: 三條緩慢流動的色帶
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i++) {
    const ph = now / (5200 + i * 1700) + i * 2.1;
    const cy = VIEW_H * (0.2 + 0.28 * i) + Math.sin(ph) * 30;
    const grd = g.createLinearGradient(0, cy - 46, 0, cy + 46);
    const hue = [265, 205, 300][i];
    grd.addColorStop(0, `hsla(${hue},80%,60%,0)`);
    grd.addColorStop(0.5, `hsla(${hue},80%,62%,${0.1 + 0.04 * Math.sin(ph * 1.7)})`);
    grd.addColorStop(1, `hsla(${hue},80%,60%,0)`);
    g.fillStyle = grd;
    g.fillRect(0, cy - 46, VIEW_W, 92);
  }
  // 星塵: 依世界座標定位, 隨鏡頭視差飄動
  for (let i = 0; i < 46; i++) {
    const sx = (i * 137.5 - camX * 0.55) % (VIEW_W + 40) - 20;
    const sy = ((i * 79.3 + now / 55) % (VIEW_H + 40)) - 20;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(now / 600 + i));
    g.fillStyle = `rgba(220,230,255,${tw * 0.55})`;
    g.fillRect(sx, sy, 1 + (i % 3 === 0 ? 1 : 0), 1);
  }
  // 樓板: 看不到上一層
  g.globalCompositeOperation = "source-over";
  const floorY = VOID_TOP_ROW * TILE - camY;
  if (floorY > 0) {
    g.fillStyle = "#070614";
    g.fillRect(0, 0, VIEW_W, Math.min(VIEW_H, floorY));
  }
  g.restore();
}

function drawEntity(ent, etype, now) {
  const isPlayer = etype === "p", isNPC = etype === "n";
  // ---- 動畫時序: animT 以實際移動距離推進 (速度快=步頻快) ----
  const stepDist = Math.hypot(ent.x - (ent.pvx ?? ent.x), ent.y - (ent.pvy ?? ent.y));
  ent.pvx = ent.x; ent.pvy = ent.y;
  const moving = stepDist > 0.08;
  ent.animT += stepDist;
  if (ent.flashT > 0) ent.flashT -= frameDt;
  if (ent.spawnT > 0) ent.spawnT -= frameDt;
  if (ent.slashT > 0) ent.slashT -= frameDt;

  const px = Math.round(ent.x), py = Math.round(ent.y);
  let yOff = 0, frame = 0, spr;
  const flip = ent.d === "r";
  const bossScale = etype === "m" ? BOSS_SCALE[ent.k] || 1 : 1;

  if (isPlayer || isNPC) {
    const dir = ent.d || "d";
    let key;
    if (moving) key = ["0", "S", "1", "S"][Math.floor(ent.animT / 7) % 4]; // 4 相步態
    else key = dir !== "u" && ((now + (ent.id || 0) * 700) % 3400) < 150 ? "B" : "S"; // 待機眨眼
    spr = heroSprite(ent.idNum, dir, key);
  } else {
      const base = ent.k === "slime_king" ? "slime" : ent.k === "wolf_king" ? "wolf" : ent.k;
    if (base === "slime") {
      if (moving) { // 跳躍前進
        const ph = (ent.animT % 16) / 16;
        yOff = -Math.abs(Math.sin(ph * Math.PI)) * 3.5;
        frame = ph < 0.16 || ph > 0.84 ? 1 : 0;
      } else {
        frame = ((now + ent.id * 500) % 1600) < 500 ? 1 : 0; // 呼吸壓扁
      }
    } else if (base === "beetle") {
      if (moving) frame = Math.floor(ent.animT / 5) % 2;
      else frame = ((now + ent.id * 400) % 2600) < 180 ? 2 : 0; // 觸鬚抽動
    } else if (base === "shade") { // 幽影: 漂浮 + 尾焰擺動
      yOff = Math.sin(now / 260 + ent.id) * 1.8 - 2.5;
      frame = Math.floor((now + ent.id * 300) / 380) % 2;
    } else if (base === "gargoyle") { // 石像鬼: 振翅
      frame = moving ? Math.floor(ent.animT / 6) % 2 : Math.floor((now + ent.id * 400) / 640) % 2;
    } else if (base === "eclipse_golem") { // 魔像: 核心脈動 + 重踏
      frame = Math.floor(now / 600) % 2;
      if (moving) yOff = -(Math.floor(ent.animT / 10) % 2);
    } else if (base === "wraith") { // 月靈: 漂浮
      yOff = Math.sin(now / 300 + ent.id) * 2.2 - 3;
      frame = Math.floor((now + ent.id * 250) / 330) % 2;
    } else if (base === "sentinel") { // 星衛: 稜甲開闔
      frame = moving ? Math.floor(ent.animT / 7) % 2 : Math.floor((now + ent.id * 300) / 700) % 2;
    } else if (base === "eclipse_core") { // 根源: 懸浮 + 核心脈動 (狂暴變色)
      yOff = Math.sin(now / 420) * 3 - 4;
      frame = (Math.floor(now / 300) % 2) + (ent.rg ? 2 : 0);
    } else { // wolf
      if (moving) frame = Math.floor(ent.animT / 8) % 2;
      else yOff = -((Math.floor((now + ent.id * 300) / 600)) % 2); // 呼吸起伏
    }
    spr = monsterSprite(ent.k, frame);
  }

  // ---- 陰影 (跳起時縮小, boss 放大) ----
  const shScale = Math.max(0.6, 1 + yOff * 0.08) * bossScale;
  g.fillStyle = "rgba(0,0,0,.25)";
  g.beginPath(); g.ellipse(px, py + 6, 6 * shScale, 2.5 * shScale, 0, 0, 7); g.fill();

  // ---- 死亡倒地 tween ----
  if (isPlayer && ent.dd) {
    const rot = Math.min(1, (now - (ent.deadAt || now)) / 250) * (Math.PI / 2);
    g.save(); g.globalAlpha = 0.55;
    g.translate(px, py + 4); g.rotate(rot);
    g.drawImage(heroSprite(ent.idNum, "d", "S"), -6, -12);
    g.restore();
    return;
  }

  // ---- 攻擊突進位移 (出手瞬間往面向衝 2.5px 再收回) ----
  let lx = 0, ly = 0;
  if (isPlayer && ent.slashT > 0) {
    const p = 1 - ent.slashT / 200;
    const lunge = (p < 0.5 ? p : 1 - p) * 2 * 2.5;
    const v = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] }[ent.slashD || ent.d || "d"];
    lx = v[0] * lunge; ly = v[1] * lunge;
  }

  // 面向上時武器墊在身體後面
  const weaponBehind = isPlayer && ent.slashT > 0 && (ent.slashD || ent.d) === "u";
  if (weaponBehind) drawSwing(ent, px + lx, py + ly);

  // ---- 本體 (入場縮放 + boss 放大 + 鏡像 + 受擊白閃) ----
  const feetY = py + (etype === "m" ? 7 : 8) + yOff + ly;
  let scale = ent.spawnT > 0 ? 1 - (ent.spawnT / 260) * 0.7 : 1;
  scale *= bossScale;
  g.save();
  g.translate(px + lx, feetY);
  if (ent.spawnT > 0) g.globalAlpha = 0.5 + (scale / bossScale) * 0.5;
  if (ent.k === "shade") g.globalAlpha = 0.78; // 幽影半透明
  if (scale !== 1) g.scale(scale, scale);
  if (flip) g.scale(-1, 1);
  g.drawImage(spr, -6, -spr.height);
  if (ent.flashT > 0) {
    g.globalAlpha = Math.max(0, ent.flashT / 130) * 0.85;
    g.drawImage(silhouette(spr), -6, -spr.height);
  }
  g.restore();

  if (isPlayer && ent.slashT > 0 && !weaponBehind) drawSwing(ent, px + lx, py + ly);

  // 草叢遮腳 + 移動揚葉 ('g' 野區 / 'k' 森林)
  const tch = tileAt(Math.floor(ent.x / TILE), Math.floor(ent.y / TILE));
  if (tch === "g" || tch === "k") {
    g.fillStyle = tch === "g" ? "#3f9143" : "#2e6e35";
    g.fillRect(px - 6, py + 1, 3, 5); g.fillRect(px - 2, py + 2, 3, 5); g.fillRect(px + 3, py + 1, 3, 5);
    if (moving && Math.random() < 0.12) {
      effects.push({
        type: "leaf", x: ent.x + (Math.random() * 10 - 5), y: ent.y + 4,
        vx: Math.random() * 0.02 - 0.01, ttl: 380,
      });
    }
  }

  // 血條 (滿血玩家不顯示; NPC 無)
  if (!isNPC && (ent.hp < ent.mh || etype === "m")) {
    const w = bossScale > 1 ? 28 : 14, ratio = Math.max(0, ent.hp / ent.mh);
    const barY = py - 11 - Math.round(spr.height * bossScale * 0.75);
    g.fillStyle = "#1a1c2c"; g.fillRect(px - w / 2 - 1, barY - 1, w + 2, 4);
    g.fillStyle = ratio > 0.5 ? "#4cd54c" : ratio > 0.25 ? "#f0c040" : "#e84545";
    g.fillRect(px - w / 2, barY, Math.round(w * ratio), 2);
  }

  // 名字: 玩家白/自己綠, NPC 淺綠 + 任務 '!', Boss 紅字
  g.font = "7px monospace"; g.textAlign = "center";
  if (isPlayer && !ent.dd) {
    g.lineWidth = 2; g.strokeStyle = "rgba(0,0,0,.7)";
    const label = ent.pv ? "⚔" + ent.n : ent.n;
    g.strokeText(label, px, py - 20);
    g.fillStyle = ent.id === myId ? "#8ef08e" : ent.pv ? "#ff9a9a" : "#fff";
    g.fillText(label, px, py - 20);
  } else if (isNPC) {
    g.lineWidth = 2; g.strokeStyle = "rgba(0,0,0,.7)";
    g.strokeText(ent.n, px, py - 20);
    g.fillStyle = "#a8e8c0";
    g.fillText(ent.n, px, py - 20);
    if (ent.npcId === questTargetNPC()) {
      const by = py - 27 + Math.sin(now / 180) * 2;
      g.font = "bold 11px monospace";
      g.lineWidth = 3; g.strokeStyle = "rgba(0,0,0,.8)";
      g.strokeText("!", px, by);
      g.fillStyle = "#ffd23e";
      g.fillText("!", px, by);
      g.font = "7px monospace";
    }
  } else if (bossScale > 1) {
    const k = world.kinds && world.kinds[ent.k];
    if (k) {
      const ny = py - 15 - Math.round(spr.height * bossScale * 0.75);
      g.lineWidth = 2; g.strokeStyle = "rgba(0,0,0,.8)";
      g.strokeText(k.name, px, ny);
      g.fillStyle = "#ff8080";
      g.fillText(k.name, px, ny);
    }
  }

  // 揮擊殘影弧 (trail; 顏色/弧度依武器, 墊在武器 sprite 下)
  if (isPlayer && ent.slashT > 0) {
    const a = Math.max(0, ent.slashT / 200) * 0.7;
    const ang = { u: -Math.PI / 2, d: Math.PI / 2, l: Math.PI, r: 0 }[ent.slashD || "d"];
    const wIt = world.shop.find((s) => s.id === ent.w);
    const [outer, inner] = SLASH_COLORS[ent.w] || SLASH_COLORS._;
    const arcR = ((wIt && wIt.reach) || 0.9) * TILE - 1;
    const half = ((wIt && wIt.radius) || 1.1) > 1.1 ? 1.1 : 0.8;
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = outer; g.lineWidth = 3;
    g.beginPath(); g.arc(px + lx, py + ly, arcR, ang - half, ang + half); g.stroke();
    g.strokeStyle = inner; g.lineWidth = 1.5;
    g.beginPath(); g.arc(px + lx, py + ly, arcR - 3, ang - half + 0.1, ang + half - 0.1); g.stroke();
    g.restore();
  }
}

// 各武器揮擊配色 [外圈, 內圈]
const SLASH_COLORS = {
  _: ["#fff8d0", "#ffd23e"],
  wood_sword: ["#f0e0c0", "#c8a060"],
  copper_dagger: ["#d8f4ff", "#6ac8f0"],
  iron_sword: ["#f0f4ff", "#a8c0e8"],
  long_spear: ["#d8ffe8", "#3fc890"],
  battle_axe: ["#ffe4c8", "#f08030"],
  hero_sword: ["#fff8d0", "#ffd23e"],
  flame_blade: ["#ffd8c0", "#ff5030"],
  fang_blade: ["#f8f8f0", "#c8c8b8"],
  moon_blade: ["#e8f0ff", "#a0c0ff"],
  star_blade: ["#d8faff", "#5ae8e8"],
  void_edge: ["#f0e0ff", "#a06ae8"],
};

function drawHUD(me) {
  // 主面板
  g.fillStyle = "rgba(14,18,30,.75)";
  g.fillRect(4, 4, 168, 56);
  g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 1;
  g.strokeRect(4.5, 4.5, 167, 55);
  // HP
  g.font = "8px monospace"; g.textAlign = "left";
  g.fillStyle = "#fff";
  g.fillText(`HP ${me.hp}/${me.mh}`, 10, 15);
  g.fillStyle = "#1a1c2c"; g.fillRect(60, 8, 104, 8);
  const ratio = Math.max(0, me.hp / me.mh);
  g.fillStyle = ratio > 0.5 ? "#4cd54c" : ratio > 0.25 ? "#f0c040" : "#e84545";
  g.fillRect(61, 9, Math.round(102 * ratio), 6);
  // Gold
  g.fillStyle = "#ffd23e"; g.beginPath(); g.arc(14, 26, 4, 0, 7); g.fill();
  g.fillStyle = "#b8860b"; g.font = "7px monospace"; g.fillText("G", 12, 28.5);
  g.fillStyle = "#ffe680"; g.font = "8px monospace";
  g.fillText(String(me.g), 22, 29);
  // 攻防數值 (徒手 ATK 4 與 server 常數一致; buff 計入)
  const wIt = world.shop.find((s) => s.id === me.w);
  const aIt = world.shop.find((s) => s.id === me.a);
  const pwr = world.shop.find((s) => s.atkBuff > 0);
  const atkNow = 4 + (wIt ? wIt.atk : 0) + (me.ba > 0 && pwr ? pwr.atkBuff : 0);
  g.fillStyle = "#c8d0e8";
  g.fillText(`ATK ${atkNow}  DEF ${aIt ? aIt.def : 0}`, 66, 29);
  const wpn = wIt ? wIt.name : "Fists";
  const arm = aIt ? aIt.name : "No Armor";
  g.fillText(`${wpn} / ${arm}`, 10, 42);
  // 消耗品熱鍵列
  const labels = ["Pot", "Hi", "Hst", "Pwr"];
  let cx = 10;
  consumables().forEach((it, i) => {
    const n = (me.iv && me.iv[it.id]) || 0;
    g.fillStyle = n > 0 ? "#ffe680" : "#5a637f";
    const txt = `${i + 1}|${labels[i] || it.name} x${n}`;
    g.fillText(txt, cx, 54);
    cx += txt.length * 4.9 + 6;
  });
  // Buff 指示
  if (me.bs > 0) {
    g.fillStyle = "#7ce8ff";
    g.fillText(`HASTE ${Math.ceil(me.bs / 20)}s`, 178, 14);
  }
  if (me.ba > 0) {
    g.fillStyle = "#ffb060";
    g.fillText(`POWER ${Math.ceil(me.ba / 20)}s`, 178, 26);
  }
  if (me.pv) { // 決鬥模式
    g.fillStyle = "#ff6a6a";
    g.fillText("PVP", 178, me.bs > 0 || me.ba > 0 ? 38 : 14);
  }

  // 區域狀態
  g.font = "8px monospace"; g.textAlign = "center";
  const inSafe = insideSafe(me.x, me.y);
  const row = Math.floor(me.y / TILE);
  const inVoid = row >= VOID_TOP_ROW, inDun = row >= DUNGEON_TOP_ROW && !inVoid;
  g.fillStyle = "rgba(14,18,30,.6)";
  g.fillRect(VIEW_W / 2 - 52, 4, 104, 13);
  g.fillStyle = inSafe ? "#7ce87c" : inVoid ? "#b8c8ff" : inDun ? "#c8a0ff" : "#ff8080";
  const zone = inSafe
    ? (inVoid ? "SANCTUM 星光平台" : inDun ? "CAMP 營地 (安全)" : "SAFE ZONE 安全區")
    : inVoid ? "VOID 月之裏側" : inDun ? "ABYSS 地下層" : "WILD AREA 野區";
  g.fillText(zone, VIEW_W / 2, 14);

  // 在線人數
  g.textAlign = "right"; g.fillStyle = "rgba(255,255,255,.8)";
  g.fillText(`${players.size} online`, VIEW_W - 8, 14);

  // 底部操作列
  g.fillStyle = "rgba(14,18,30,.6)";
  g.fillRect(0, VIEW_H - 14, VIEW_W, 14);
  g.textAlign = "center"; g.fillStyle = "#9aa3c0";
  g.fillText("移動 WASD · 攻擊 J/Space · 互動 E · 道具 1-4 · 決鬥 P · 靜音 M", VIEW_W / 2, VIEW_H - 4);

  // 靠近提示 (NPC 優先)
  const npcNear = nearNPCId();
  const st = nearStore();
  if (npcNear && !dlgOpen) {
    g.fillStyle = "#ffe680";
    g.fillText(`按 E 與${npcEnts.get(npcNear).n}對話`, VIEW_W / 2, VIEW_H - 22);
  } else if (st && !shopOpen) {
    g.fillStyle = "#ffe680";
    g.fillText(`按 E 打開${st === "weapon" ? "武器店" : "道具店"}`, VIEW_W / 2, VIEW_H - 22);
  }

  // ---- 任務追蹤器 (右上) ----
  const stage = world.story && world.story[me.q || 0];
  if (stage) {
    const bx = VIEW_W - 152, by = 22;
    const lines = wrapText(stage.obj, 138);
    const h = 16 + lines.length * 9 + (stage.kind === "collect" ? 9 : 0);
    g.fillStyle = "rgba(14,18,30,.7)";
    g.fillRect(bx, by, 148, h);
    g.textAlign = "left";
    g.font = "8px monospace"; g.fillStyle = "#ffd23e";
    g.fillText(`◆ ${stage.title}`, bx + 5, by + 11);
    g.font = "7px monospace"; g.fillStyle = "#c8d0e8";
    lines.forEach((ln, i) => g.fillText(ln, bx + 5, by + 21 + i * 9));
    if (stage.kind === "collect") {
      const have = (me.iv && me.iv[stage.target]) || 0;
      g.fillStyle = have >= stage.n ? "#7ce87c" : "#ffe680";
      g.fillText(`進度 ${Math.min(have, stage.n)}/${stage.n}${have >= stage.n ? " 可交付!" : ""}`, bx + 5, by + 21 + lines.length * 9);
    }
  }

  // ---- Boss 血條 (上方置中, 靠近時顯示) ----
  let boss = null, bd = 1e9;
  for (const ent of monsters.values()) {
    const k = world.kinds && world.kinds[ent.k];
    if (k && k.boss) {
      const d = Math.hypot(ent.x - me.x, ent.y - me.y);
      if (d < 280 && d < bd) { bd = d; boss = ent; }
    }
  }
  if (boss) {
    const k = world.kinds[boss.k];
    const bw = 190, bx = VIEW_W / 2 - bw / 2, by = 24;
    g.fillStyle = "rgba(14,18,30,.8)"; g.fillRect(bx - 4, by - 12, bw + 8, 26);
    g.textAlign = "center"; g.font = "8px monospace";
    g.fillStyle = "#ff8080"; g.fillText(k.name, VIEW_W / 2, by - 3);
    g.fillStyle = "#1a1c2c"; g.fillRect(bx, by, bw, 8);
    g.fillStyle = boss.rg ? "#ff6a3a"
      : { slime_king: "#a06ae8", eclipse_golem: "#8a9aff", eclipse_core: "#c89aff" }[boss.k] || "#e84545";
    if (boss.rg) { // 狂暴標記
      g.textAlign = "left"; g.fillStyle = "#ff8a5a";
      g.fillText("RAGE", bx + bw + 8, by + 7);
      g.textAlign = "center";
    }
    g.fillRect(bx + 1, by + 1, Math.max(0, Math.round((bw - 2) * boss.hp / boss.mh)), 6);
  }

  // ---- 劇情橫幅 ----
  for (let i = banners.length - 1; i >= 0; i--) {
    const b = banners[i];
    b.age = (b.age || 0) + frameDt;
    if (b.age > 3600) { banners.splice(i, 1); continue; }
  }
  if (banners.length) {
    const b = banners[0];
    const a = b.age < 300 ? b.age / 300 : b.age > 3100 ? Math.max(0, (3600 - b.age) / 500) : 1;
    g.save();
    g.globalAlpha = a;
    g.fillStyle = "rgba(14,18,30,.85)";
    g.fillRect(0, 54, VIEW_W, 24);
    g.fillStyle = "#ffd23e";
    g.strokeStyle = "#7a5a10"; g.lineWidth = 1;
    g.textAlign = "center"; g.font = "11px monospace";
    g.fillText(b.txt, VIEW_W / 2, 70);
    g.restore();
  }
}

// wrapText 依像素寬度斷行 (CJK 友善)
function wrapText(txt, maxW) {
  g.font = "7px monospace";
  const lines = [];
  let cur = "";
  for (const ch of txt) {
    if (g.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}
function insideSafe(x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  return (world.safe || []).some(([x1, y1, x2, y2]) =>
    tx >= x1 && tx <= x2 && ty >= y1 && ty <= y2);
}

// ---------- 主迴圈 ----------
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(50, now - lastFrame || 16);
  lastFrame = now;
  frameDt = dt;

  // 插值 (他人與怪物) + 本地預測 (自己)
  const k = Math.min(1, dt * 0.014);
  for (const [id, ent] of players) {
    if (id === myId) continue;
    ent.x += (ent.tx - ent.x) * k; ent.y += (ent.ty - ent.y) * k;
  }
  for (const ent of monsters.values()) { ent.x += (ent.tx - ent.x) * k; ent.y += (ent.ty - ent.y) * k; }

  const me = players.get(myId);
  if (me) { // 自己吃預測座標, 立即反映輸入
    predictSelf(me, dt);
    me.x = me.px; me.y = me.py;
  }
  // dev 運鏡: console 設 window.camOverride={x,y} 可觀察任意區域 (純渲染, 不影響遊戲)
  const camFocus = window.camOverride || me;
  let camX = Math.round(Math.max(0, Math.min((camFocus ? camFocus.x : 0) - VIEW_W / 2, world.w * TILE - VIEW_W)));
  let camY = Math.round(Math.max(0, Math.min((camFocus ? camFocus.y : 0) - VIEW_H / 2, world.h * TILE - VIEW_H)));
  if (shakeT > 0) { // Boss 狂暴/震地的鏡頭震動
    shakeT -= dt;
    const amp = Math.max(0, shakeT / 520) * 4;
    camX += Math.round((Math.random() * 2 - 1) * amp);
    camY += Math.round((Math.random() * 2 - 1) * amp);
  }

  g.clearRect(0, 0, VIEW_W, VIEW_H);
  g.drawImage(baseLayer, camX, camY, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

  // 動態水面
  g.save(); g.translate(-camX, -camY);
  const wframe = Math.floor(now / 550) % 2;
  for (const [tx, ty, ch] of waterTiles) {
    const px = tx * TILE, py = ty * TILE;
    if (px + TILE < camX || px > camX + VIEW_W || py + TILE < camY || py > camY + VIEW_H) continue;
    drawTile(g, ch, tx, ty, wframe);
  }

  // 實體 (依 y 排序; 玩家/怪物/NPC)
  const ents = [];
  for (const [id, ent] of players) { ent.id = id; ent.idNum = Number(id) % HERO_PALS.length; ents.push({ ent, et: "p" }); }
  for (const [id, ent] of monsters) { ent.id = id; ents.push({ ent, et: "m" }); }
  for (const ent of npcEnts.values()) ents.push({ ent, et: "n" });
  ents.sort((a, b) => a.ent.y - b.ent.y);
  for (const { ent, et } of ents) drawEntity(ent, et, now);

  // 特效
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.ttl -= dt;
    if (e.ttl <= 0) { effects.splice(i, 1); continue; }
    if (e.type === "txt") {
      e.y -= dt * 0.03;
      g.font = "bold 9px monospace"; g.textAlign = "center";
      g.lineWidth = 2; g.strokeStyle = "rgba(0,0,0,.75)";
      g.strokeText(e.txt, e.x, e.y);
      g.fillStyle = e.color; g.fillText(e.txt, e.x, e.y);
    } else if (e.type === "poof") {
      const p = 1 - e.ttl / 400;
      g.fillStyle = `rgba(${e.color || "220,220,230"},${1 - p})`;
      for (let j = 0; j < 5; j++) {
        const ang = j * (Math.PI * 2 / 5) + 0.6 + p * 0.8;
        g.beginPath();
        g.arc(e.x + Math.cos(ang) * p * 13, e.y + Math.sin(ang) * p * 13 - p * 4, 3.5 * (1 - p) + 1, 0, 7);
        g.fill();
      }
    } else if (e.type === "leaf") {
      e.y -= dt * 0.014;
      e.x += (e.vx || 0) * dt;
      g.fillStyle = `rgba(63,145,67,${Math.max(0, e.ttl / 380)})`;
      g.fillRect(e.x, e.y, 2, 2);
    } else if (e.type === "ring") { // 警告圈/震地波
      const p = 1 - e.ttl / e.max;
      g.save();
      if (e.warn) { // 蓄力: 半徑固定, 閃爍變濃
        g.globalAlpha = 0.35 + 0.3 * Math.sin(now / 60);
        g.strokeStyle = `rgb(${e.color})`; g.lineWidth = 2;
        g.beginPath(); g.arc(e.x, e.y, e.r, 0, 7); g.stroke();
        g.globalAlpha = 0.1;
        g.fillStyle = `rgb(${e.color})`;
        g.beginPath(); g.arc(e.x, e.y, e.r, 0, 7); g.fill();
      } else { // 衝擊波: 擴張淡出
        g.globalAlpha = 1 - p;
        g.strokeStyle = `rgb(${e.color})`; g.lineWidth = 3.5 * (1 - p) + 1;
        g.beginPath(); g.arc(e.x, e.y, 6 + p * e.r, 0, 7); g.stroke();
      }
      g.restore();
    } else if (e.type === "fw") { // 煙火
      e.age += dt;
      if (e.age >= e.delay) {
        if (!e.boomed) { e.boomed = true; blip(700 + (e.hue % 3) * 160, 0.18, 0.05, -350); }
        const t = Math.min(1, (e.age - e.delay) / 850);
        for (let j = 0; j < 10; j++) {
          const ang = (j / 10) * Math.PI * 2 + e.hue;
          const r = t * 24;
          g.fillStyle = `hsla(${(e.hue + j * 36) % 360},90%,65%,${1 - t})`;
          g.fillRect(e.x + Math.cos(ang) * r - 1, e.y + Math.sin(ang) * r + t * 8 - 1, 2.5, 2.5);
        }
        if (t < 0.25) {
          g.fillStyle = `rgba(255,255,240,${1 - t * 4})`;
          g.beginPath(); g.arc(e.x, e.y, 3.5 * (1 - t * 3), 0, 7); g.fill();
        }
      }
    }
  }
  g.restore();

  // 分層氛圍 (運鏡時以鏡頭中心判定)
  if (camFocus) {
    const camRow = Math.floor(camFocus.y / TILE);
    if (camRow >= VOID_TOP_ROW) drawVoidAmbience(camX, camY, now);
    else if (camRow >= DUNGEON_TOP_ROW) drawDungeonLight(camX, camY, camFocus, now);
  }

  if (me && !window.camOverride) {
    drawHUD(me);
    if (me.dd) {
      g.fillStyle = "rgba(10,8,16,.55)";
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.font = "16px monospace"; g.textAlign = "center"; g.fillStyle = "#ff8080";
      g.fillText("你倒下了...", VIEW_W / 2, VIEW_H / 2 - 8);
      g.font = "9px monospace"; g.fillStyle = "#c8d0e8";
      g.fillText("重生中 (Respawning...)", VIEW_W / 2, VIEW_H / 2 + 10);
    }
    // 走遠自動關店/關對話
    if (shopOpen && nearStore() !== shopStore) closeShop();
    if (dlgOpen && !nearNPCId()) closeDlg();
  }
}

// ---------- 入場 ----------
document.getElementById("name").value = "Trainer" + (100 + Math.floor(Math.random() * 900));
setVolume(volume);
document.getElementById("volBtn").onclick = toggleMute;
document.getElementById("volRange").oninput = (e) => setVolume(Number(e.target.value) / 100);

document.getElementById("joinBtn").onclick = () => {
  initAudio();
  initTouch();
  const name = document.getElementById("name").value.trim() || "Trainer";
  document.getElementById("joinErr").textContent = "";
  connect(name);
};
document.getElementById("name").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") document.getElementById("joinBtn").click();
  ev.stopPropagation();
});

// URL ?name=Xxx 直接入場 (demo 分享連結 / 自動化測試用)
const qname = new URLSearchParams(location.search).get("name");
if (qname) {
  document.getElementById("name").value = qname.slice(0, 12);
  document.getElementById("joinBtn").click();
}
