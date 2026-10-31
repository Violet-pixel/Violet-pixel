import { writeFileSync, readFileSync, mkdirSync } from "node:fs";

const USERNAME = process.env.USERNAME || "Violet-pixel";
const OUT_DIR = process.env.OUT_DIR || "assets";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const PALETTE = ["#242424", "#383838", "#5a5a5a", "#9c9c9c", "#ececec"];
const SHADOW = "#0a0a0a";
const LIGHT = PALETTE[4];
const ACCENT = "#f0f6fc";
const GLOW = "#ee908f";
const TEXT = "#f0f6fc";
const MUTED = "#f0f6fc";
const FONT = "'JetBrains Mono','SFMono-Regular',Consolas,'Liberation Mono',monospace";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function fetchWeeks() {
  if (process.env.DATA_FILE) return JSON.parse(readFileSync(process.env.DATA_FILE, "utf8"));
  if (!TOKEN) throw new Error("Defina GITHUB_TOKEN (ou DATA_FILE para teste local).");
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
    weeks{contributionDays{date contributionCount weekday}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "contrib-city" },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });
  const json = await res.json();
  if (json.errors || !json.data?.user) throw new Error(JSON.stringify(json.errors || json));
  return json.data.user.contributionsCollection.contributionCalendar.weeks.map((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, weekday: d.weekday })));
}

const f1 = (n) => Math.round(n * 10) / 10;
const pts = (arr) => arr.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function stats(weeks) {
  const days = weeks.flat().sort((a, b) => a.date.localeCompare(b.date));
  const total = days.reduce((s, d) => s + d.count, 0);
  const active = days.filter((d) => d.count > 0).length;
  const best = days.reduce((a, b) => (b.count > a.count ? b : a), days[0]);
  let longest = 0, run = 0;
  for (const d of days) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let current = 0, i = days.length - 1;
  if (days[i] && days[i].count === 0) i--;
  for (; i >= 0 && days[i].count > 0; i--) current++;
  const byMonth = {};
  for (const d of days) { const k = d.date.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + d.count; }
  const bm = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0][0];
  const max = Math.max(1, best.count);
  const step = Math.ceil(max / 4);
  const level = (c) => (c === 0 ? 0 : Math.min(4, Math.ceil(c / step)));
  return { days, total, active, best, longest, current, busiestMonth: MONTHS_LONG[+bm.slice(5) - 1], max, level };
}

function card(W, H, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">
<style>
.lbl{fill:${ACCENT};font-size:11px;font-weight:700;letter-spacing:2.5px}
.txt{fill:${TEXT};font-weight:700}.mut{fill:${MUTED};font-size:13px}.sm{fill:${MUTED};font-size:10.5px}
.live{animation:pulse 1.6s ease-in-out infinite}@keyframes pulse{50%{opacity:.25}}
</style>
${inner}
</svg>`;
}

const live = (x, y) => `<circle class="live" cx="${x}" cy="${y - 4}" r="3.5" fill="${GLOW}"/><text x="${x + 10}" y="${y}" class="lbl">LIVE</text>`;

function face(poly, col, a) {
  return `<polygon points="${pts(poly)}" fill="${col}"/>` +
    `<polygon points="${pts(poly)}" fill="${col === SHADOW ? "#000" : SHADOW}" opacity="${col === SHADOW ? a * 0.5 : a}"/>`;
}

function renderCity(weeks, S) {
  const W = 880, H = 420;
  const AW = 8.0, BW = 3.9, AD = 6.6, BD = 3.6, MAXH = 112, INSET = 0.1, OX = 384, OY = 142;
  const P = (w, d) => [OX + w * AW - d * AD, OY + w * BW + d * BD];
  const NW = weeks.length;
  const cells = [];
  weeks.forEach((week, w) => week.forEach((day) => cells.push({ ...day, w, d: day.weekday ?? new Date(day.date + "T00:00:00Z").getUTCDay() })));
  cells.sort((a, b) => a.w + a.d - (b.w + b.d) || a.w - b.w);

  const T = 9, c0 = P(0, 0), c1 = P(NW, 0), c2 = P(NW, 7), c3 = P(0, 7), dn = ([x, y]) => [x, y + T];
  let out = face([c3, c2, dn(c2), dn(c3)], SHADOW, 0.35) + face([c2, c1, dn(c1), dn(c2)], SHADOW, 0.6) +
    `<polygon points="${pts([c0, c1, c2, c3])}" fill="${SHADOW}" opacity=".55"/>`;

  let tag = "";
  for (const c of cells) {
    const lv = S.level(c.count);
    const h = c.count === 0 ? 1.5 : 4 + MAXH * Math.pow(c.count / S.max, 0.8);
    const i = INSET, o = 1 - INSET;
    const t = P(c.w + i, c.d + i), r = P(c.w + o, c.d + i), b = P(c.w + o, c.d + o), l = P(c.w + i, c.d + o);
    const up = ([x, y]) => [x, y - h];
    const col = PALETTE[lv];
    let win = "";
    if (lv >= 3 && h > 26) for (let y = 7; y < h - 5; y += 8) for (const [p, q] of [[l, b], [b, r]]) {
      const x = (p[0] + q[0]) / 2, yy = (p[1] + q[1]) / 2 - y;
      win += `<rect x="${f1(x - 0.9)}" y="${f1(yy - 1.5)}" width="1.8" height="3" fill="${GLOW}" opacity=".75"/>`;
    }
    out += `<g class="b" style="animation-delay:${c.w * 24 + c.d * 6}ms"><title>${c.date}: ${c.count}</title>` +
      (c.count ? face([up(l), up(b), b, l], col, 0.35) + face([up(b), up(r), r, b], col, 0.6) : "") +
      `<polygon points="${pts([up(t), up(r), up(b), up(l)])}" fill="${col}"/>${win}</g>`;
    if (c.date === S.best.date && c.count > 0) {
      const x = (t[0] + b[0]) / 2, y = Math.max(40, up(t)[1]);
      const bd = new Date(c.date + "T00:00:00Z");
      const label = `${MONTHS[bd.getUTCMonth()]} ${bd.getUTCDate()}: ${c.count}`;
      tag = `<g class="tag"><line x1="${f1(x)}" y1="${f1(y - 3)}" x2="${f1(x)}" y2="${f1(y - 18)}" stroke="${GLOW}"/>` +
        `<text x="${f1(x)}" y="${f1(y - 23)}" fill="${TEXT}" font-size="11" font-weight="700" text-anchor="middle">${label}</text></g>`;
    }
  }

  const bd = new Date(S.best.date + "T00:00:00Z");
  const lines = [
    `${S.active} active days`,
    `Busiest day: ${S.best.count} (${MONTHS[bd.getUTCMonth()]} ${bd.getUTCDate()})`,
    `Current streak: ${S.current} days`,
    `Longest streak: ${S.longest} days`,
    `Busiest month: ${S.busiestMonth}`,
  ].map((s, i) => `<text x="40" y="${222 + i * 23}" class="mut">${esc(s)}</text>`).join("");

  return card(W, H, `<style>
.b{transform-box:fill-box;transform-origin:50% 100%;animation:g .9s cubic-bezier(.2,.9,.25,1) both}
@keyframes g{from{transform:scaleY(0);opacity:0}to{transform:scaleY(1);opacity:1}}
.tag{animation:fi .6s ease-out 2.4s both}@keyframes fi{from{opacity:0}to{opacity:1}}
</style>
${live(40, 52)}
<text x="40" y="94" class="lbl">CONTRIBUTION CITY</text>
<text x="38" y="152" fill="${ACCENT}" font-size="50" font-weight="800">${S.total.toLocaleString("en-US")}</text>
<text x="40" y="180" class="txt" font-size="14">contributions in the last year</text>
${lines}
<text x="40" y="370" class="txt" font-size="12">@${esc(USERNAME)}</text>
<text x="40" y="388" class="sm">one building for every active day</text>
${out}
${tag}`);
}

function renderSnake(weeks, S) {
  const W = 880, H = 270, NW = weeks.length;
  const PX = 14.6, R = 5, X0 = (W - (NW - 1) * PX) / 2, Y0 = 118;
  const pos = (w, d) => [X0 + w * PX, Y0 + d * PX];
  const map = new Map();
  weeks.forEach((wk, w) => wk.forEach((day) => map.set(`${w},${day.weekday ?? new Date(day.date + "T00:00:00Z").getUTCDay()}`, day)));

  const path = [];
  for (let w = 0; w < NW; w++) for (let k = 0; k < 7; k++) path.push([w, w % 2 ? 6 - k : k]);
  const N = path.length, RUN = 0.86, DUR = 26;
  const d = "M" + path.map(([w, k]) => pts([pos(w, k)])).join(" L");

  let dots = "";
  path.forEach(([w, k], i) => {
    const day = map.get(`${w},${k}`);
    if (!day) return;
    const [x, y] = pos(w, k);
    const col = PALETTE[S.level(day.count)];
    let anim = "";
    if (day.count > 0) {
      const t = (RUN * i) / (N - 1);
      anim = `<animate attributeName="r" values="${R};${R};${R + 2};${R};${R}" keyTimes="0;${t.toFixed(4)};${Math.min(0.998, t + 0.002).toFixed(4)};${Math.min(0.999, t + 0.006).toFixed(4)};1" dur="${DUR}s" repeatCount="indefinite"/>`;
    }
    dots += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${R}" fill="${col}"><title>${day.date}: ${day.count}</title>${anim}</circle>`;
  });

  const seg = (delay, r, col, extra = "") => `<g opacity="0">
  <set attributeName="opacity" to="1" begin="${delay}s"/>
  <animateMotion path="${d}" dur="${DUR}s" begin="${delay}s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes="0;${RUN};1"/>
  <circle r="${r}" fill="${col}"/>${extra}</g>`;
  const cell = (DUR * RUN) / (N - 1);
  let snake = "";
  const body = [PALETTE[3], PALETTE[3], PALETTE[2], PALETTE[2], PALETTE[1]];
  for (let s = body.length; s >= 1; s--) snake += seg(f1(s * cell * 1.05 * 100) / 100, R + 1 - s * 0.45, body[s - 1]);
  snake += seg(0, R + 1.6, LIGHT, `<circle cx="-1.9" cy="-1" r="1.1" fill="${SHADOW}"/><circle cx="1.9" cy="-1" r="1.1" fill="${SHADOW}"/>`);

  return card(W, H, `
<text x="40" y="44" class="lbl">SNAKE TRAIL</text>
${live(W - 82, 44)}
<text x="40" y="78" class="txt" font-size="21">${S.total.toLocaleString("en-US")} contributions, one continuous run</text>
${dots}
${snake}
<text x="40" y="${H - 28}" class="sm" font-size="11.5">${S.active} active days · current streak ${S.current} days · longest ${S.longest} days</text>
<text x="${W - 40}" y="${H - 28}" class="sm" font-size="11.5" text-anchor="end">@${esc(USERNAME)}</text>`);
}

const weeks = await fetchWeeks();
const S = stats(weeks);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/contrib-city.svg`, renderCity(weeks, S));
writeFileSync(`${OUT_DIR}/contrib-snake.svg`, renderSnake(weeks, S));
console.log(`OK -> ${OUT_DIR}/contrib-city.svg, ${OUT_DIR}/contrib-snake.svg`, { total: S.total, active: S.active, longest: S.longest, current: S.current });
