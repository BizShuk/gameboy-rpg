// client.js — PokeTown Online 客戶端
// 區塊: net / sprites / tiles / input / shop / effects / loop
"use strict";

const TILE = 16;
const cv = document.getElementById("game");
const g = cv.getContext("2d");
g.imageSmoothingEnabled = false;
const VIEW_W = cv.width, VIEW_H = cv.height;
const GB = Object.freeze({ ink: "#0F380F", dark: "#306230", light: "#8BAC0F", paper: "#9BBC0F" });
const ART_MANIFEST_PATH = "assets/rgb/manifest.json";
let artLoadError = null;
const artReady = RGBArt.load(ART_MANIFEST_PATH).then(
  () => true,
  (error) => { artLoadError = error; return false; },
);

// ---------- 全域狀態 ----------
let ws = null;
let myId = 0;
let world = null;          // init 訊息: {tile,w,h,rows,safe,shop,kinds}
let baseLayer = null;      // 靜態地圖 offscreen canvas
let ambientTiles = [];     // manifest 綁定的動態環境 tile overlay
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
  if (btn) btn.textContent = volume === 0 ? "MUTE" : "VOL";
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

// ---------- 圖像資產與地圖 ----------
function tileAt(tx, ty) {
  if (!world || tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return "T";
  return world.rows[ty][tx];
}

function heroSprite(direction, phase) {
  const actor = RGBArt.spec("actors", "player");
  const sequence = actor.directions[direction] || actor.directions.d;
  return RGBArt.frame("actors", "player", sequence[phase % sequence.length]);
}

function npcSprite(id, phase) {
  return RGBArt.frame("actors", id, phase);
}

function monsterSprite(kind, phase) {
  return RGBArt.frame("monsters", kind, phase);
}

function weaponSprite(id) {
  if (!id || id === "fist") return null;
  return RGBArt.frame("weapons", id, 0);
}

function silhouette(sprite) {
  return RGBArt.silhouette(sprite);
}

function drawTile(context, symbol, tileX, tileY) {
  RGBArt.drawTile(context, symbol, tileX, tileY, TILE);
}

function buildBaseLayer() {
  baseLayer = document.createElement("canvas");
  baseLayer.width = world.w * TILE;
  baseLayer.height = world.h * TILE;
  const context = baseLayer.getContext("2d");
  context.imageSmoothingEnabled = false;
  ambientTiles = []; lightTiles = []; counterW = []; counterG = [];
  for (let tileY = 0; tileY < world.h; tileY++) {
    for (let tileX = 0; tileX < world.w; tileX++) {
      const symbol = world.rows[tileY][tileX];
      drawTile(context, symbol, tileX, tileY);
      const effect = RGBArt.tileEffect(symbol);
      if (effect) ambientTiles.push([tileX, tileY, effect]);
      if ("olm<G^".includes(symbol)) lightTiles.push([tileX, tileY, symbol]);
      if (symbol === "C") counterW.push([tileX, tileY]);
      if (symbol === "A") counterG.push([tileX, tileY]);
    }
  }
}

function drawAmbientTiles(camX, camY, now) {
  const minTileX = Math.max(0, Math.floor(camX / TILE) - 1);
  const maxTileX = Math.min(world.w - 1, Math.ceil((camX + VIEW_W) / TILE) + 1);
  const minTileY = Math.max(0, Math.floor(camY / TILE) - 1);
  const maxTileY = Math.min(world.h - 1, Math.ceil((camY + VIEW_H) / TILE) + 1);
  for (const [tileX, tileY, effect] of ambientTiles) {
    if (tileX < minTileX || tileX > maxTileX || tileY < minTileY || tileY > maxTileY) continue;
    const spec = RGBArt.spec("effects", effect);
    const phase = Math.floor(now / 180 + tileX * 3 + tileY * 5) % spec.frames;
    g.drawImage(RGBArt.frame("effects", effect, phase), tileX * TILE, tileY * TILE, TILE, TILE);
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
          d: "d", animT: 0, slashT: 0, flashT: 0, spawnT: 0,
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
    document.getElementById("joinBtn").disabled = false;
  };
  ws.onerror = () => {
    document.getElementById("joinErr").textContent = "無法連線到伺服器";
    document.getElementById("joinBtn").disabled = false;
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
      effects.push({ type: "txt", x: e.x, y: e.y, txt: `-${e.v}`, color: GB.dark, ttl: 650 });
      blip(130, 0.05, 0.03);
      break;
    }
    case "heal":
      effects.push({ type: "txt", x: e.x, y: e.y, txt: `+${e.v}`, color: GB.paper, ttl: 700 });
      if (e.id === myId) blip(520, 0.09, 0.035, 240);
      break;
    case "die":
      effects.push({ type: "sprite", id: "poof", x: e.x, y: e.y, ttl: 400, duration: 400, size: 32 });
      blip(e.s === "player" ? 90 : 240, 0.18, 0.04, -60);
      break;
    case "rare": // 稀有掉落
      if (e.id === myId) {
        const it = world.shop.find((s) => s.id === e.s);
        effects.push({ type: "txt", x: e.x, y: e.y, txt: `★${it ? it.name : e.s}`, color: GB.paper, ttl: 1400 });
        blip(880, 0.09, 0.045, 420); setTimeout(() => blip(1320, 0.12, 0.045, 300), 90);
      }
      break;
    case "mat": // 素材入包
      if (e.id === myId) {
        const it = world.shop.find((s) => s.id === e.s);
        effects.push({ type: "txt", x: e.x, y: e.y, txt: `+${it ? it.name : e.s}`, color: GB.light, ttl: 850 });
        blip(660, 0.06, 0.03, 220);
      }
      break;
    case "sum": // Boss 召喚
      effects.push({ type: "sprite", id: "poof", x: e.x, y: e.y, ttl: 400, duration: 400, size: 32 });
      blip(160, 0.14, 0.045, -50);
      break;
    case "fw": { // 結局煙火
      const delay = (e.v || 0) * 10;
      effects.push({
        type: "sprite", id: "firework", x: e.x, y: e.y,
        ttl: 850 + delay, duration: 850, delay, age: 0, size: 48, sound: "firework",
      });
      break;
    }
    case "tel": // 魔像蓄力警告圈
      effects.push({ type: "ring", x: e.x, y: e.y, r: e.v || 48, ttl: 1000, max: 1000, color: GB.dark, warn: true });
      blip(180, 0.25, 0.05, 100, "sawtooth");
      break;
    case "slam": // 震地波
      effects.push({ type: "ring", x: e.x, y: e.y, r: e.v || 48, ttl: 420, max: 420, color: GB.paper });
      blip(55, 0.3, 0.07, -20);
      break;
    case "tp": // 階梯/傳送門
      effects.push({ type: "sprite", id: "arcane-pulse", x: e.x, y: e.y, ttl: 380, duration: 380, size: 32 });
      blip(500, 0.1, 0.035, 380);
      break;
    case "rage": { // Boss 狂暴: 紅色衝擊 + 畫面震動
      effects.push({ type: "ring", x: e.x, y: e.y, r: 6 * TILE, ttl: 700, max: 700, color: GB.dark });
      shakeT = 520;
      blip(120, 0.4, 0.06, -40, "sawtooth");
      setTimeout(() => blip(90, 0.5, 0.05, -30, "sawtooth"), 160);
      break;
    }
    case "gold":
      if (e.id === myId) {
        effects.push({ type: "txt", x: e.x, y: e.y, txt: `+${e.v}G`, color: GB.paper, ttl: 800 });
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
    li.innerHTML = `<span class="icon"><img src="${RGBArt.url("items", it.id)}" alt=""></span>
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
  g.drawImage(spr, 2, -11, 22, 22);
  g.restore();
  // 星隕劍: 星屑灑落
  if (ent.w === "star_blade" && Math.random() < 0.5) {
    const sr = ((wIt && wIt.reach) || 0.9) * TILE + 4;
    effects.push({
      type: "txt", x: px + Math.cos(a) * sr, y: py + Math.sin(a) * sr,
      txt: "+", color: GB.paper, ttl: 320,
    });
  }
}

// Game Boy cave spotlight: opaque four-shade mask with stepped pixel openings.
function clearPixelCircle(context, centerX, centerY, radius) {
  const step = 4;
  for (let offsetY = -radius; offsetY <= radius; offsetY += step) {
    const span = Math.floor(Math.sqrt(Math.max(0, radius * radius - offsetY * offsetY)) / step) * step;
    context.clearRect(Math.round(centerX - span), Math.round(centerY + offsetY), span * 2, step);
  }
}

function drawDungeonLight(camX, camY, me) {
  if (!lightCv) {
    lightCv = document.createElement("canvas");
    lightCv.width = VIEW_W; lightCv.height = VIEW_H;
  }
  const context = lightCv.getContext("2d");
  context.clearRect(0, 0, VIEW_W, VIEW_H);
  context.fillStyle = GB.ink;
  context.fillRect(0, 0, VIEW_W, VIEW_H);
  clearPixelCircle(context, me.x - camX, me.y - camY, 7 * TILE);

  for (const [x1, y1, x2, y2] of world.safe || []) {
    if (y1 < DUNGEON_TOP_ROW) continue;
    const centerX = ((x1 + x2) / 2 + 0.5) * TILE - camX;
    const centerY = ((y1 + y2) / 2 + 0.5) * TILE - camY;
    clearPixelCircle(context, centerX, centerY, Math.max(x2 - x1, y2 - y1) * TILE);
  }
  for (const [tileX, tileY, symbol] of lightTiles) {
    const centerX = tileX * TILE + 8 - camX;
    const centerY = tileY * TILE + 8 - camY;
    const radius = symbol === "^" ? 5 * TILE : symbol === "o" ? 4 * TILE : symbol === "l" ? 3 * TILE : 2 * TILE;
    if (centerX < -radius || centerX > VIEW_W + radius || centerY < -radius || centerY > VIEW_H + radius) continue;
    clearPixelCircle(context, centerX, centerY, radius);
  }
  const floorY = DUNGEON_TOP_ROW * TILE - camY;
  if (floorY > 0) {
    context.fillStyle = GB.ink;
    context.fillRect(0, 0, VIEW_W, Math.min(VIEW_H, floorY));
  }
  g.drawImage(lightCv, 0, 0);
}

// Void ambience uses sparse pixel bands and stars from the same four-shade palette.
function drawVoidAmbience(camX, camY, now) {
  g.save();
  for (let band = 0; band < 3; band++) {
    g.fillStyle = band === 1 ? GB.light : GB.dark;
    for (let x = 0; x < VIEW_W; x += 4) {
      const y = Math.round(VIEW_H * (0.2 + 0.28 * band) + Math.sin(now / 900 + x / 36 + band) * 9);
      if ((x / 4 + band) % 3 === 0) g.fillRect(x, y, 2, 1);
    }
  }
  for (let index = 0; index < 46; index++) {
    const x = Math.round((index * 137.5 - camX * 0.55) % (VIEW_W + 40) - 20);
    const y = Math.round((index * 79.3 + now / 80) % (VIEW_H + 40) - 20);
    g.fillStyle = index % 3 === 0 ? GB.paper : GB.light;
    g.fillRect(x, y, index % 5 === 0 ? 2 : 1, 1);
  }
  const floorY = VOID_TOP_ROW * TILE - camY;
  if (floorY > 0) {
    g.fillStyle = GB.ink;
    g.fillRect(0, 0, VIEW_W, Math.min(VIEW_H, floorY));
  }
  g.restore();
}

function drawEntity(ent, etype, now) {
  const isPlayer = etype === "p";
  const isNPC = etype === "n";
  const stepDistance = Math.hypot(ent.x - (ent.pvx ?? ent.x), ent.y - (ent.pvy ?? ent.y));
  ent.pvx = ent.x; ent.pvy = ent.y;
  const moving = stepDistance > 0.08;
  ent.animT += stepDistance;
  if (ent.flashT > 0) ent.flashT -= frameDt;
  if (ent.spawnT > 0) ent.spawnT -= frameDt;
  if (ent.slashT > 0) ent.slashT -= frameDt;

  const px = Math.round(ent.x), py = Math.round(ent.y);
  const seed = Number(ent.id) || 0;
  let sprite;
  let yOffset = 0;
  let flip = false;

  if (isPlayer) {
    const direction = ent.d || "d";
    const phase = moving ? Math.floor(ent.animT / 5) % 4 : 0;
    sprite = heroSprite(direction, phase);
  } else if (isNPC) {
    const frames = RGBArt.spec("actors", ent.npcId).frames;
    sprite = npcSprite(ent.npcId, Math.floor((now + seed * 173) / 460) % frames);
  } else {
    const frames = RGBArt.spec("monsters", ent.k).frames;
    const phase = moving ? Math.floor(ent.animT / 6) : Math.floor((now + seed * 173) / 360);
    sprite = monsterSprite(ent.k, phase % frames);
    flip = ent.d === "r";
    if (["shade", "wraith", "eclipse_core"].includes(ent.k)) {
      yOffset = Math.sin(now / 280 + seed) * 2 - 3;
    } else if (["slime", "slime_king"].includes(ent.k) && moving) {
      yOffset = -Math.abs(Math.sin((ent.animT % 16) / 16 * Math.PI)) * 3;
    }
  }

  const bossScale = etype === "m" ? BOSS_SCALE[ent.k] || 1 : 1;
  const shadowScale = Math.max(0.65, 1 + yOffset * 0.08) * bossScale;
  const shadowWidth = Math.round(12 * shadowScale);
  g.fillStyle = GB.dark;
  g.fillRect(Math.round(px - shadowWidth / 2), py + 6, shadowWidth, Math.max(2, Math.round(2 * shadowScale)));

  if (isPlayer && ent.dd) {
    const rotation = Math.min(1, (now - (ent.deadAt || now)) / 250) * (Math.PI / 2);
    const fallen = heroSprite("d", 0);
    g.save();
    g.translate(px, py + 5);
    g.rotate(rotation);
    g.drawImage(fallen, -fallen.width / 2, -fallen.height);
    g.restore();
    return;
  }

  let lungeX = 0, lungeY = 0;
  if (isPlayer && ent.slashT > 0) {
    const progress = 1 - ent.slashT / 200;
    const distance = (progress < 0.5 ? progress : 1 - progress) * 5;
    const vector = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] }[ent.slashD || ent.d || "d"];
    lungeX = vector[0] * distance; lungeY = vector[1] * distance;
  }

  const weaponBehind = isPlayer && ent.slashT > 0 && (ent.slashD || ent.d) === "u";
  if (weaponBehind) drawSwing(ent, px + lungeX, py + lungeY);

  const feetY = py + 8 + yOffset + lungeY;
  let scale = ent.spawnT > 0 ? 1 - (ent.spawnT / 260) * 0.7 : 1;
  scale *= bossScale;
  g.save();
  g.translate(px + lungeX, feetY);
  if (scale !== 1) g.scale(scale, scale);
  if (flip) g.scale(-1, 1);
  g.drawImage(sprite, -sprite.width / 2, -sprite.height);
  if (ent.flashT > 0) {
    g.drawImage(silhouette(sprite), -sprite.width / 2, -sprite.height);
  }
  g.restore();

  if (isPlayer && ent.slashT > 0 && !weaponBehind) drawSwing(ent, px + lungeX, py + lungeY);

  const tileX = Math.floor(ent.x / TILE), tileY = Math.floor(ent.y / TILE);
  const tile = tileAt(tileX, tileY);
  if (tile === "g" || tile === "k") {
    const cover = RGBArt.frame("tiles", tile, 0);
    g.drawImage(cover, 0, 10, 16, 6, tileX * TILE, tileY * TILE + 10, 16, 6);
  }

  const topY = feetY - sprite.height * scale;
  if (!isNPC && (ent.hp < ent.mh || etype === "m")) {
    const width = bossScale > 1 ? 28 : 14;
    const ratio = Math.max(0, ent.hp / ent.mh);
    const barY = topY - 5;
    g.fillStyle = GB.ink; g.fillRect(px - width / 2 - 1, barY - 1, width + 2, 4);
    g.fillStyle = ratio > 0.5 ? GB.paper : ratio > 0.25 ? GB.light : GB.dark;
    g.fillRect(px - width / 2, barY, Math.round(width * ratio), 2);
  }

  g.font = "7px monospace"; g.textAlign = "center";
  if (isPlayer) {
    const label = ent.pv ? `PVP ${ent.n}` : ent.n;
    g.lineWidth = 2; g.strokeStyle = GB.ink; g.strokeText(label, px, topY - 3);
    g.fillStyle = ent.id === myId ? GB.paper : GB.light; g.fillText(label, px, topY - 3);
  } else if (isNPC) {
    g.lineWidth = 2; g.strokeStyle = GB.ink; g.strokeText(ent.n, px, topY - 3);
    g.fillStyle = GB.paper; g.fillText(ent.n, px, topY - 3);
    if (ent.npcId === questTargetNPC()) {
      const markerY = topY - 10 + Math.round(Math.sin(now / 180));
      g.font = "bold 11px monospace";
      g.lineWidth = 3; g.strokeStyle = GB.ink; g.strokeText("!", px, markerY);
      g.fillStyle = GB.paper; g.fillText("!", px, markerY);
    }
  } else if (bossScale > 1) {
    const kind = world.kinds && world.kinds[ent.k];
    if (kind) {
      g.lineWidth = 2; g.strokeStyle = GB.ink; g.strokeText(kind.name, px, topY - 3);
      g.fillStyle = GB.paper; g.fillText(kind.name, px, topY - 3);
    }
  }

  if (isPlayer && ent.slashT > 0) {
    const angle = { u: -Math.PI / 2, d: Math.PI / 2, l: Math.PI, r: 0 }[ent.slashD || "d"];
    const weapon = world.shop.find((entry) => entry.id === ent.w);
    const radius = ((weapon && weapon.reach) || 0.9) * TILE - 1;
    const half = ((weapon && weapon.radius) || 1.1) > 1.1 ? 1.1 : 0.8;
    g.save();
    g.strokeStyle = GB.paper; g.lineWidth = 3;
    g.beginPath(); g.arc(px + lungeX, py + lungeY, radius, angle - half, angle + half); g.stroke();
    g.strokeStyle = GB.light; g.lineWidth = 1;
    g.beginPath(); g.arc(px + lungeX, py + lungeY, radius - 3, angle - half + 0.1, angle + half - 0.1); g.stroke();
    g.restore();
  }
}

function drawPanel(x, y, width, height) {
  g.fillStyle = GB.ink; g.fillRect(x, y, width, height);
  g.fillStyle = GB.paper; g.fillRect(x + 2, y + 2, width - 4, height - 4);
  g.fillStyle = GB.dark;
  g.fillRect(x + 3, y + 3, width - 6, 1);
  g.fillRect(x + 3, y + height - 4, width - 6, 1);
}

function drawHUD(me) {
  g.font = "8px monospace";
  g.textAlign = "left";

  drawPanel(4, 4, 172, 62);
  g.fillStyle = GB.ink;
  g.fillText(`HP ${me.hp}/${me.mh}`, 10, 15);
  g.fillRect(60, 8, 108, 9);
  const hpRatio = Math.max(0, me.hp / me.mh);
  g.fillStyle = GB.light; g.fillRect(62, 10, 104, 5);
  g.fillStyle = hpRatio > 0.5 ? GB.paper : hpRatio > 0.25 ? GB.light : GB.dark;
  g.fillRect(62, 10, Math.round(104 * hpRatio), 5);

  const weapon = world.shop.find((entry) => entry.id === me.w);
  const armor = world.shop.find((entry) => entry.id === me.a);
  const power = world.shop.find((entry) => entry.atkBuff > 0);
  const attack = 4 + (weapon ? weapon.atk : 0) + (me.ba > 0 && power ? power.atkBuff : 0);
  g.fillStyle = GB.dark;
  g.fillText(`G ${me.g}  ATK ${attack}  DEF ${armor ? armor.def : 0}`, 10, 28);
  g.fillText(`${weapon ? weapon.name : "Fists"} / ${armor ? armor.name : "No Armor"}`, 10, 39);

  consumables().forEach((item, index) => {
    const count = (me.iv && me.iv[item.id]) || 0;
    const icon = RGBArt.frame("items", item.id, 0);
    const x = 10 + index * 40;
    g.drawImage(icon, x, 44, 12, 12);
    g.fillStyle = count > 0 ? GB.ink : GB.dark;
    g.fillText(`${index + 1}x${count}`, x + 14, 54);
  });

  const status = [];
  if (me.bs > 0) status.push(`HASTE ${Math.ceil(me.bs / 20)}s`);
  if (me.ba > 0) status.push(`POWER ${Math.ceil(me.ba / 20)}s`);
  if (me.pv) status.push("PVP");
  if (status.length) {
    drawPanel(180, 4, 104, 12 + status.length * 10);
    g.fillStyle = GB.ink;
    status.forEach((label, index) => g.fillText(label, 186, 15 + index * 10));
  }

  const inSafe = insideSafe(me.x, me.y);
  const row = Math.floor(me.y / TILE);
  const inVoid = row >= VOID_TOP_ROW, inDungeon = row >= DUNGEON_TOP_ROW && !inVoid;
  const zone = inSafe
    ? (inVoid ? "SANCTUM 星光平台" : inDungeon ? "CAMP 營地" : "SAFE ZONE 安全區")
    : inVoid ? "VOID 月之裏側" : inDungeon ? "ABYSS 地下層" : "WILD AREA 野區";
  drawPanel(VIEW_W / 2 - 58, 4, 116, 16);
  g.textAlign = "center"; g.fillStyle = GB.ink;
  g.fillText(zone, VIEW_W / 2, 15);

  drawPanel(VIEW_W - 74, 4, 70, 16);
  g.fillText(`${players.size} ONLINE`, VIEW_W - 39, 15);

  drawPanel(0, VIEW_H - 16, VIEW_W, 16);
  g.fillText("移動 WASD · 攻擊 J/Space · 互動 E · 道具 1-4 · 決鬥 P · 靜音 M", VIEW_W / 2, VIEW_H - 5);
  const nearbyNPC = nearNPCId();
  const nearbyStore = nearStore();
  if (nearbyNPC && !dlgOpen) {
    drawPanel(VIEW_W / 2 - 92, VIEW_H - 36, 184, 16);
    g.fillText(`按 E 與${npcEnts.get(nearbyNPC).n}對話`, VIEW_W / 2, VIEW_H - 25);
  } else if (nearbyStore && !shopOpen) {
    drawPanel(VIEW_W / 2 - 92, VIEW_H - 36, 184, 16);
    g.fillText(`按 E 打開${nearbyStore === "weapon" ? "武器店" : "道具店"}`, VIEW_W / 2, VIEW_H - 25);
  }

  const stage = world.story && world.story[me.q || 0];
  if (stage) {
    const x = VIEW_W - 156, y = 24;
    const lines = wrapText(stage.obj, 138);
    const height = 18 + lines.length * 9 + (stage.kind === "collect" ? 10 : 0);
    drawPanel(x, y, 152, height);
    g.textAlign = "left"; g.fillStyle = GB.ink;
    g.fillText(`◆ ${stage.title}`, x + 6, y + 12);
    g.fillStyle = GB.dark;
    lines.forEach((line, index) => g.fillText(line, x + 6, y + 22 + index * 9));
    if (stage.kind === "collect") {
      const have = (me.iv && me.iv[stage.target]) || 0;
      g.fillStyle = have >= stage.n ? GB.ink : GB.dark;
      g.fillText(`進度 ${Math.min(have, stage.n)}/${stage.n}${have >= stage.n ? " 可交付!" : ""}`, x + 6, y + 22 + lines.length * 9);
    }
  }

  let boss = null, bossDistance = Infinity;
  for (const entity of monsters.values()) {
    const kind = world.kinds && world.kinds[entity.k];
    if (!kind || !kind.boss) continue;
    const distance = Math.hypot(entity.x - me.x, entity.y - me.y);
    if (distance < 280 && distance < bossDistance) { boss = entity; bossDistance = distance; }
  }
  if (boss) {
    const kind = world.kinds[boss.k];
    const width = 190, x = VIEW_W / 2 - width / 2, y = 24;
    drawPanel(x - 4, y - 14, width + 8, 28);
    g.textAlign = "center"; g.fillStyle = GB.ink;
    g.fillText(`${boss.rg ? "RAGE " : ""}${kind.name}`, VIEW_W / 2, y - 3);
    g.fillStyle = GB.dark; g.fillRect(x, y, width, 8);
    g.fillStyle = boss.rg ? GB.paper : GB.light;
    g.fillRect(x + 1, y + 1, Math.max(0, Math.round((width - 2) * boss.hp / boss.mh)), 6);
  }

  for (let index = banners.length - 1; index >= 0; index--) {
    const banner = banners[index];
    banner.age = (banner.age || 0) + frameDt;
    if (banner.age > 3600) banners.splice(index, 1);
  }
  if (banners.length) {
    drawPanel(0, 70, VIEW_W, 24);
    g.textAlign = "center"; g.font = "11px monospace"; g.fillStyle = GB.ink;
    g.fillText(banners[0].txt, VIEW_W / 2, 86);
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

  g.save(); g.translate(-camX, -camY);
  drawAmbientTiles(camX, camY, now);

  // 實體 (依 y 排序; 玩家/怪物/NPC)
  const ents = [];
  for (const [id, ent] of players) { ent.id = id; ents.push({ ent, et: "p" }); }
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
      g.lineWidth = 2; g.strokeStyle = GB.ink;
      g.strokeText(e.txt, e.x, e.y);
      g.fillStyle = e.color; g.fillText(e.txt, e.x, e.y);
    } else if (e.type === "sprite") {
      e.age = (e.age || 0) + dt;
      const delay = e.delay || 0;
      if (e.age < delay) continue;
      if (e.sound === "firework" && !e.sounded) {
        e.sounded = true;
        blip(700 + (Math.abs(Math.round(e.x + e.y)) % 3) * 160, 0.18, 0.05, -350);
      }
      const spec = RGBArt.spec("effects", e.id);
      const progress = Math.min(0.999, (e.age - delay) / e.duration);
      const phase = Math.floor(progress * spec.frames);
      const sprite = RGBArt.frame("effects", e.id, phase);
      const size = e.size || spec.frameWidth;
      g.drawImage(sprite, Math.round(e.x - size / 2), Math.round(e.y - size / 2), size, size);
    } else if (e.type === "ring") { // 警告圈/震地波
      const p = 1 - e.ttl / e.max;
      g.save();
      if (e.warn) { // 蓄力: 半徑固定, 閃爍變濃
        g.strokeStyle = Math.floor(now / 100) % 2 ? e.color : GB.paper; g.lineWidth = 2;
        g.beginPath(); g.arc(e.x, e.y, e.r, 0, 7); g.stroke();
      } else { // 衝擊波: 擴張淡出
        g.strokeStyle = e.color; g.lineWidth = Math.max(1, Math.round(4 * (1 - p)));
        g.beginPath(); g.arc(e.x, e.y, 6 + p * e.r, 0, 7); g.stroke();
      }
      g.restore();
    }
  }
  g.restore();

  // 分層氛圍 (運鏡時以鏡頭中心判定)
  if (camFocus) {
    const camRow = Math.floor(camFocus.y / TILE);
    if (camRow >= VOID_TOP_ROW) drawVoidAmbience(camX, camY, now);
    else if (camRow >= DUNGEON_TOP_ROW) drawDungeonLight(camX, camY, camFocus);
  }

  if (me && !window.camOverride) {
    drawHUD(me);
    if (me.dd) {
      g.fillStyle = GB.ink;
      for (let y = 0; y < VIEW_H; y += 4) {
        for (let x = (y / 4) % 2 ? 2 : 0; x < VIEW_W; x += 4) g.fillRect(x, y, 2, 2);
      }
      g.font = "16px monospace"; g.textAlign = "center"; g.fillStyle = GB.paper;
      g.fillText("你倒下了...", VIEW_W / 2, VIEW_H / 2 - 8);
      g.font = "9px monospace"; g.fillStyle = GB.light;
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

const joinButton = document.getElementById("joinBtn");
joinButton.disabled = true;
joinButton.textContent = "載入圖像...";

async function enterGame() {
  joinButton.disabled = true;
  const loaded = await artReady;
  if (!loaded) {
    joinButton.textContent = "圖像載入失敗";
    document.getElementById("joinErr").textContent = artLoadError ? artLoadError.message : "RGB assets unavailable";
    return;
  }
  initAudio();
  initTouch();
  const name = document.getElementById("name").value.trim() || "Trainer";
  document.getElementById("joinErr").textContent = "";
  connect(name);
}

joinButton.onclick = enterGame;
document.getElementById("name").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !joinButton.disabled) enterGame();
  ev.stopPropagation();
});

// URL ?name=Xxx 直接入場 (demo 分享連結 / 自動化測試用)
const qname = new URLSearchParams(location.search).get("name");
if (qname) document.getElementById("name").value = qname.slice(0, 12);
artReady.then((loaded) => {
  if (!loaded) {
    joinButton.textContent = "圖像載入失敗";
    document.getElementById("joinErr").textContent = artLoadError ? artLoadError.message : "RGB assets unavailable";
    return;
  }
  joinButton.disabled = false;
  joinButton.textContent = "進入城鎮";
  if (qname) enterGame();
});
