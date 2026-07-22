const ZONES = [
  { n: 1, from: 0,  to: 5,        mult: 0,  color: '#3fbf6f' },
  { n: 2, from: 5,  to: 10,       mult: 2,  color: '#d3d34a' },
  { n: 3, from: 10, to: 15,       mult: 6,  color: '#e8a33d' },
  { n: 4, from: 15, to: 20,       mult: 9,  color: '#e05c3a' },
  { n: 5, from: 20, to: Infinity, mult: 15, color: '#c03050' },
];
const STRAT_CRUISER = 13; // TJ base, cost example shown in tooltip

const SEC_COLORS = ['#f00000', '#d73000', '#f04800', '#f06000', '#d77700',
  '#efef00', '#8fef2f', '#00f000', '#00ef47', '#48f0c0', '#2fefef'];

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const qInput = document.getElementById('q');
const sugBox = document.getElementById('suggestions');

let data, view = { x: 0, y: 0, scale: 6 }; // world = ly, screen y = -z
let capital = null, dists = null, hoverIdx = -1;
let regionLabels = [];

const wx = s => s[2];
const wy = s => -s[4];
const toScreen = (x, y) => [(x - view.x) * view.scale + canvas.width / 2 / dpr,
                            (y - view.y) * view.scale + canvas.height / 2 / dpr];
const toWorld = (px, py) => [(px - canvas.width / 2 / dpr) / view.scale + view.x,
                             (py - canvas.height / 2 / dpr) / view.scale + view.y];
let dpr = 1;

fetch('data.json').then(r => r.json()).then(d => {
  data = d;
  const acc = {};
  d.systems.forEach((s, i) => {
    const r = d.regions[s[1]];
    (acc[r] = acc[r] || []).push(i);
  });
  regionLabels = Object.entries(acc).map(([name, idxs]) => {
    let x = 0, y = 0;
    idxs.forEach(i => { x += wx(d.systems[i]); y += wy(d.systems[i]); });
    return { name: name.toUpperCase(), x: x / idxs.length, y: y / idxs.length };
  });
  resize();
  fitView();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash) {
    const i = d.systems.findIndex(s => s[0].toLowerCase() === hash.toLowerCase());
    if (i >= 0) setCapital(i, true);
  }
  draw();
});

function fitView() {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  data.systems.forEach(s => {
    minX = Math.min(minX, wx(s)); maxX = Math.max(maxX, wx(s));
    minY = Math.min(minY, wy(s)); maxY = Math.max(maxY, wy(s));
  });
  view.x = (minX + maxX) / 2;
  view.y = (minY + maxY) / 2;
  view.scale = 0.92 * Math.min(canvas.width / dpr / (maxX - minX), canvas.height / dpr / (maxY - minY));
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
}
addEventListener('resize', () => { resize(); draw(); });

function dist3(a, b) {
  return Math.hypot(a[2] - b[2], a[3] - b[3], a[4] - b[4]);
}

function zoneOf(d) {
  return ZONES.find(z => d < z.to) || ZONES[ZONES.length - 1];
}

function setCapital(i, silent) {
  capital = i;
  const cap = data.systems[i];
  dists = data.systems.map(s => dist3(s, cap));
  const el = document.getElementById('capital');
  el.style.display = 'block';
  el.innerHTML = `<a id="clearCap">clear</a>Capital: <b>${cap[0]}</b> <small>${data.regions[cap[1]]}</small>`;
  document.getElementById('clearCap').onclick = () => {
    capital = null; dists = null;
    el.style.display = 'none';
    history.replaceState(null, '', location.pathname);
    draw();
  };
  if (!silent) history.replaceState(null, '', '#' + encodeURIComponent(cap[0]));
  draw();
}

function centerOn(i) {
  const s = data.systems[i];
  view.x = wx(s); view.y = wy(s);
  view.scale = Math.max(view.scale, 14);
}

function secColor(sec) {
  return SEC_COLORS[Math.max(0, Math.min(10, Math.round(sec * 10)))];
}

function draw() {
  if (!data) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  const zoneColorOn = document.getElementById('tZoneColor').checked;

  if (capital !== null) {
    const cap = data.systems[capital];
    const [cx, cy] = toScreen(wx(cap), wy(cap));
    const TAU = Math.PI * 2;
    const cover = Math.hypot(Math.abs(cx) + W, Math.abs(cy) + H);
    for (const z of ZONES) {
      const rOut = z.to === Infinity ? z.from * view.scale + cover : z.to * view.scale;
      const rIn = z.from * view.scale;
      ctx.beginPath();
      ctx.arc(cx, cy, rOut, 0, TAU);
      if (rIn > 0) {
        ctx.moveTo(cx + rIn, cy);
        ctx.arc(cx, cy, rIn, 0, TAU, true);
      }
      ctx.fillStyle = z.color + (z.to === Infinity ? '0e' : '1c');
      ctx.fill();
      if (z.to !== Infinity) {
        ctx.beginPath();
        ctx.arc(cx, cy, rOut, 0, TAU);
        ctx.strokeStyle = z.color + '90';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (view.scale > 2.2) {
        ctx.fillStyle = z.color;
        ctx.font = '11px system-ui';
        ctx.textAlign = 'center';
        const ry = z.to === Infinity ? (z.from + 2.5) * view.scale : (rIn + rOut) / 2;
        ctx.fillText(`Z${z.n} ×${z.mult}`, cx, cy - ry + 4);
      }
    }
  }

  if (document.getElementById('tGates').checked) {
    ctx.strokeStyle = '#2c3c64';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const [a, b] of data.edges) {
      const [x1, y1] = toScreen(wx(data.systems[a]), wy(data.systems[a]));
      const [x2, y2] = toScreen(wx(data.systems[b]), wy(data.systems[b]));
      if ((x1 < 0 && x2 < 0) || (x1 > W && x2 > W) || (y1 < 0 && y2 < 0) || (y1 > H && y2 > H)) continue;
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  const r = Math.max(1.2, Math.min(3.5, view.scale * 0.28));
  data.systems.forEach((s, i) => {
    const [x, y] = toScreen(wx(s), wy(s));
    if (x < -5 || x > W + 5 || y < -5 || y > H + 5) return;
    ctx.fillStyle = capital !== null && zoneColorOn ? zoneOf(dists[i]).color : secColor(s[5]);
    ctx.beginPath();
    ctx.arc(x, y, i === hoverIdx ? r + 2 : r, 0, 7);
    ctx.fill();
  });

  if (view.scale > 18) {
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9fb0cc';
    data.systems.forEach(s => {
      const [x, y] = toScreen(wx(s), wy(s));
      if (x < 0 || x > W || y < 0 || y > H) return;
      ctx.fillText(s[0], x + r + 3, y + 3);
    });
  } else if (view.scale < 14) {
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#46557780';
    regionLabels.forEach(l => {
      const [x, y] = toScreen(l.x, l.y);
      if (x < 0 || x > W || y < 0 || y > H) return;
      ctx.fillText(l.name, x, y);
    });
  }

  if (capital !== null) {
    const cap = data.systems[capital];
    const [x, y] = toScreen(wx(cap), wy(cap));
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, 7);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(cap[0], x, y - r - 8);
  }
}

function zoneTable() {
  const rows = ZONES.map(z =>
    `<tr><td><span class="sw" style="background:${z.color}"></span>Zone ${z.n}</td>` +
    `<td>${z.to === Infinity ? z.from + '+ ly' : z.from + '–' + z.to + ' ly'}</td>` +
    `<td>×${z.mult}</td></tr>`).join('');
  document.getElementById('zones').innerHTML =
    '<tr><th>Zone</th><th>Range</th><th>Cap mult.</th></tr>' + rows;
}
zoneTable();

// pan / zoom
let drag = null;
canvas.addEventListener('mousedown', e => {
  drag = { x: e.clientX, y: e.clientY, moved: false };
  canvas.classList.add('dragging');
  tooltip.style.display = 'none';
});
addEventListener('mousemove', e => {
  if (drag) {
    view.x -= (e.clientX - drag.x) / view.scale;
    view.y -= (e.clientY - drag.y) / view.scale;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
    drag.x = e.clientX; drag.y = e.clientY;
    draw();
  } else if (data) {
    hover(e.clientX, e.clientY);
  }
});
addEventListener('mouseup', e => {
  if (drag && !drag.moved && e.target === canvas && hoverIdx >= 0) setCapital(hoverIdx);
  drag = null;
  canvas.classList.remove('dragging');
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  tooltip.style.display = 'none';
  const f = Math.pow(1.0015, -e.deltaY);
  const [mx, my] = toWorld(e.clientX, e.clientY);
  view.scale = Math.max(0.5, Math.min(200, view.scale * f));
  const [nx, ny] = toWorld(e.clientX, e.clientY);
  view.x += mx - nx; view.y += my - ny;
  draw();
}, { passive: false });

let touches = null;
canvas.addEventListener('touchstart', e => {
  touches = [...e.touches].map(t => ({ x: t.clientX, y: t.clientY }));
}, { passive: true });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const now = [...e.touches].map(t => ({ x: t.clientX, y: t.clientY }));
  if (touches && now.length === 1 && touches.length === 1) {
    view.x -= (now[0].x - touches[0].x) / view.scale;
    view.y -= (now[0].y - touches[0].y) / view.scale;
  } else if (touches && now.length === 2 && touches.length === 2) {
    const d0 = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
    const d1 = Math.hypot(now[0].x - now[1].x, now[0].y - now[1].y);
    view.scale = Math.max(0.5, Math.min(200, view.scale * d1 / d0));
  }
  touches = now;
  draw();
}, { passive: false });
canvas.addEventListener('touchend', () => { touches = null; });

function hover(px, py) {
  let best = -1, bestD = 8;
  data.systems.forEach((s, i) => {
    const [x, y] = toScreen(wx(s), wy(s));
    const d = Math.hypot(x - px, y - py);
    if (d < bestD) { best = i; bestD = d; }
  });
  if (best !== hoverIdx) {
    hoverIdx = best;
    draw();
  }
  if (best >= 0) {
    const s = data.systems[best];
    let html = `<b>${s[0]}</b> <span class="dim">${data.regions[s[1]]}</span><br>` +
      `<span style="color:${secColor(s[5])}">${s[5].toFixed(1)}</span>`;
    if (capital !== null && best !== capital) {
      const d = dists[best], z = zoneOf(d);
      html += ` <span class="dim">·</span> ${d.toFixed(2)} ly <span class="dim">·</span> ` +
        `<span style="color:${z.color}">Zone ${z.n} ×${z.mult}</span><br>` +
        `<span class="dim">Strat cruiser jump in: ${STRAT_CRUISER * z.mult} TJ</span>`;
    }
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(px + 14, innerWidth - 230) + 'px';
    tooltip.style.top = (py + 14) + 'px';
  } else {
    tooltip.style.display = 'none';
  }
}

// search
let sugIdx = 0;
qInput.addEventListener('input', () => {
  const q = qInput.value.trim().toLowerCase();
  if (!q || !data) { sugBox.style.display = 'none'; return; }
  const starts = [], contains = [];
  data.systems.forEach((s, i) => {
    const n = s[0].toLowerCase();
    if (n.startsWith(q)) starts.push(i);
    else if (n.includes(q)) contains.push(i);
  });
  const hits = starts.concat(contains).slice(0, 8);
  if (!hits.length) { sugBox.style.display = 'none'; return; }
  sugIdx = 0;
  sugBox.innerHTML = hits.map((i, k) =>
    `<div data-i="${i}" class="${k === 0 ? 'active' : ''}">${data.systems[i][0]} ` +
    `<small>${data.regions[data.systems[i][1]]}</small></div>`).join('');
  sugBox.style.display = 'block';
  [...sugBox.children].forEach(el => el.onmousedown = () => pick(+el.dataset.i));
});
qInput.addEventListener('keydown', e => {
  const items = [...sugBox.children];
  if (!items.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sugIdx = (sugIdx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
    items.forEach((el, k) => el.classList.toggle('active', k === sugIdx));
  } else if (e.key === 'Enter') {
    pick(+items[sugIdx].dataset.i);
  } else if (e.key === 'Escape') {
    sugBox.style.display = 'none';
  }
});
qInput.addEventListener('blur', () => setTimeout(() => sugBox.style.display = 'none', 150));

function pick(i) {
  qInput.value = '';
  sugBox.style.display = 'none';
  qInput.blur();
  setCapital(i);
  centerOn(i);
  draw();
}

document.getElementById('tGates').onchange = draw;
document.getElementById('tZoneColor').onchange = draw;
