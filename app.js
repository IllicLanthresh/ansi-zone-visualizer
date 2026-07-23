import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const ZONES = [
  { n: 1, range: '0 – 5',     r: 5,        mult: 0,  color: '#3fbf6f' },
  { n: 2, range: '5.1 – 10',  r: 10,       mult: 2,  color: '#d3d34a' },
  { n: 3, range: '10.1 – 15', r: 15,       mult: 6,  color: '#e8a33d' },
  { n: 4, range: '15.1 – 20', r: 20,       mult: 9,  color: '#e05c3a' },
  { n: 5, range: '20.1+',     r: Infinity, mult: 15, color: '#c03050' },
];

// [class, base TJ, optional explicit per-zone costs]
const SHIPS = [
  ['Capsule', 1], ['Corvette', 1], ['Shuttle', 1], ['Hauler', 1], ['Mining Barge', 1],
  ['Exhumer', 1], ['Expedition Frigate', 1], ['Freighter', 1], ['Jump Freighter', 1],
  ['Prototype Exploration Ship', 1], ['Special Edition Yachts', 1],
  ['Frigate', 4], ['Covert Ops', 5], ['Destroyer', 6],
  ['Assault Frigate', 7], ['Blockade Runner', 7], ['Deep Space Transport', 7],
  ['Interceptor', 8], ['Interdictor', 8.5],
  ['Command Destroyer', 9], ['Electronic Attack Ship', 9], ['Logistics Frigate', 9],
  ['Tactical Destroyer', 9], ['Industrial Command Ship', 10], ['Cruiser', 10],
  ['Heavy Interdiction Cruiser', 10.5], ['Stealth Bomber', 11],
  ['Force Recon Ship', 11.5], ['Heavy Assault Cruiser', 11.5], ['Combat Recon Ship', 11.5],
  ['Flag Cruiser', 12], ['Logistics', 12.5], ['Strategic Cruiser', 13],
  ['Attack Battlecruiser', 14], ['Combat Battlecruiser', 14.5], ['Expedition Command Ship', 15],
  ['Command Ship', 16.5], ['Battleship', 16.5], ['Black Ops', 18], ['Marauder', 19],
  ['Rorqual', 19, [0, 57, 104.5, 171, 285]],
];
let ship = SHIPS.findIndex(s => s[0] === 'Strategic Cruiser');

const shipCost = (si, zi) =>
  SHIPS[si][2] ? SHIPS[si][2][zi] : SHIPS[si][1] * ZONES[zi].mult;
const fmt = v => v % 1 ? v.toFixed(1) : String(v);

const SEC_COLORS = ['#f00000', '#d73000', '#f04800', '#f06000', '#d77700',
  '#efef00', '#8fef2f', '#00f000', '#00ef47', '#48f0c0', '#2fefef'];

const tooltip = document.getElementById('tooltip');
let data, capital = null, dists = null, hoverIdx = -1;

const panel = document.getElementById('panel');
document.getElementById('tab').onclick = () => panel.classList.toggle('closed');
if (matchMedia('(max-width: 640px)').matches) panel.classList.add('closed');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#050607');
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.minDistance = 2;
controls.maxDistance = 400;

let points, positions, colorAttr;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const capitalGroup = new THREE.Group();
scene.add(capitalGroup);
const hoverMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.35, 12, 8),
  new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
hoverMarker.visible = false;
scene.add(hoverMarker);
const regionGroup = new THREE.Group();
scene.add(regionGroup);

const pos = i => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);

fetch('data.json').then(r => r.json()).then(d => {
  data = d;
  const n = d.systems.length;
  positions = new Float32Array(n * 3);
  d.systems.forEach((s, i) => {
    positions[i * 3] = s[2];
    positions[i * 3 + 1] = s[3];
    positions[i * 3 + 2] = -s[4];
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  colorAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  geo.setAttribute('color', colorAttr);
  const dot = document.createElement('canvas');
  dot.width = dot.height = 64;
  const dctx = dot.getContext('2d');
  dctx.beginPath();
  dctx.arc(32, 32, 28, 0, Math.PI * 2);
  dctx.fillStyle = '#fff';
  dctx.fill();
  points = new THREE.Points(geo, new THREE.PointsMaterial({
    vertexColors: true, size: 0.5, sizeAttenuation: true,
    map: new THREE.CanvasTexture(dot), alphaTest: 0.5, transparent: true }));
  scene.add(points);
  applyColors();

  const epos = new Float32Array(d.edges.length * 6);
  d.edges.forEach(([a, b], i) => {
    epos.set(positions.subarray(a * 3, a * 3 + 3), i * 6);
    epos.set(positions.subarray(b * 3, b * 3 + 3), i * 6 + 3);
  });
  const egeo = new THREE.BufferGeometry();
  egeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
  scene.add(new THREE.LineSegments(egeo, new THREE.LineBasicMaterial({
    color: '#2b3646', transparent: true, opacity: 0.5 })));

  buildLabels();

  const acc = {};
  d.systems.forEach((s, i) => (acc[d.regions[s[1]]] = acc[d.regions[s[1]]] || []).push(i));
  for (const [name, idxs] of Object.entries(acc)) {
    const c = new THREE.Vector3();
    idxs.forEach(i => c.add(pos(i)));
    c.divideScalar(idxs.length);
    const label = makeLabel(name.toUpperCase(), '#707a85', 2.2);
    label.position.copy(c);
    regionGroup.add(label);
  }

  const box = new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position'));
  const center = box.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  camera.position.set(center.x, center.y + 130, center.z + 0.01);
  camera.lookAt(center);

  systemSearch();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash) {
    const i = d.systems.findIndex(s => s[0].toLowerCase() === hash.toLowerCase());
    if (i >= 0) { setCapital(i, true); flyTo(i); }
  }
});

// all system names in one atlas + one quad batch, faded by camera distance and zoom
let labelMat = null;
function buildLabels() {
  const names = data.systems.map(s => s[0]);
  const FONT = 18, ROW = 24, PAD = 6, AW = 4096, SCALE = 0.6;
  const cv = document.createElement('canvas');
  let c = cv.getContext('2d');
  c.font = FONT + 'px Verdana';
  const widths = names.map(nm => Math.ceil(c.measureText(nm).width) + PAD);
  let x = 0, y = 0;
  const rects = widths.map(w => {
    if (x + w > AW) { x = 0; y += ROW; }
    const r = [x, y, w];
    x += w;
    return r;
  });
  cv.width = AW;
  cv.height = y + ROW;
  c = cv.getContext('2d');
  c.font = FONT + 'px Verdana';
  c.textBaseline = 'middle';
  c.lineWidth = 4;
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(0,0,0,.85)';
  c.fillStyle = '#c3cdd9';
  names.forEach((nm, i) => {
    c.strokeText(nm, rects[i][0] + PAD / 2, rects[i][1] + ROW / 2);
    c.fillText(nm, rects[i][0] + PAD / 2, rects[i][1] + ROW / 2);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;

  const n = names.length;
  const posA = new Float32Array(n * 12), cornerA = new Float32Array(n * 8),
    uvA = new Float32Array(n * 8), wA = new Float32Array(n * 4);
  const idx = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const [rx, ry, w] = rects[i];
    for (let k = 0; k < 4; k++) {
      const kx = k & 1, ky = k >> 1;
      posA.set([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]], (i * 4 + k) * 3);
      cornerA.set([kx, ky], (i * 4 + k) * 2);
      uvA.set([(rx + kx * w) / AW, 1 - (ry + ky * ROW) / cv.height], (i * 4 + k) * 2);
      wA[i * 4 + k] = w * SCALE;
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posA, 3));
  geo.setAttribute('corner', new THREE.BufferAttribute(cornerA, 2));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  geo.setAttribute('wpx', new THREE.BufferAttribute(wA, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  labelMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      atlas: { value: tex },
      viewport: { value: new THREE.Vector2(innerWidth, innerHeight) },
      camDist: { value: 100 },
      zoomGate: { value: 0 },
      hpx: { value: ROW * SCALE },
    },
    vertexShader: `
      attribute vec2 corner;
      attribute float wpx;
      uniform vec2 viewport;
      uniform float camDist, zoomGate, hpx;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = length(mv.xyz);
        vFade = zoomGate * (1.0 - smoothstep(1.1 * camDist, 1.45 * camDist, d));
        if (vFade < 0.01) { gl_Position = vec4(0.0, 0.0, -3.0, 1.0); vUv = vec2(0.0); return; }
        vec4 clip = projectionMatrix * mv;
        clip.x += (corner.x - 0.5) * wpx / viewport.x * 2.0 * clip.w;
        clip.y -= (6.0 + corner.y * hpx) / viewport.y * 2.0 * clip.w;
        gl_Position = clip;
        vUv = uv;
      }`,
    fragmentShader: `
      uniform sampler2D atlas;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        vec4 t = texture2D(atlas, vUv);
        float a = t.a * vFade * 0.9;
        if (a < 0.02) discard;
        gl_FragColor = vec4(t.rgb, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, labelMat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  scene.add(mesh);
}

function secColor(sec) {
  return SEC_COLORS[Math.max(0, Math.min(10, Math.round(sec * 10)))];
}

function zoneIdx(d) {
  const rd = Math.round(d * 10) / 10;
  const i = ZONES.findIndex(z => rd <= z.r);
  return i < 0 ? ZONES.length - 1 : i;
}

function applyColors() {
  if (!data) return;
  const c = new THREE.Color();
  data.systems.forEach((s, i) => {
    c.set(capital !== null ? ZONES[zoneIdx(dists[i])].color : secColor(s[5]));
    colorAttr.setXYZ(i, c.r, c.g, c.b);
  });
  colorAttr.needsUpdate = true;
}

function makeLabel(text, color, height) {
  const cv = document.createElement('canvas');
  const c2 = cv.getContext('2d');
  const font = 'bold 26px Verdana, sans-serif';
  c2.font = font;
  cv.width = Math.ceil(c2.measureText(text).width) + 8;
  cv.height = 36;
  c2.font = font;
  c2.fillStyle = color;
  c2.textBaseline = 'middle';
  c2.fillText(text, 4, 18);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(height * cv.width / cv.height, height, 1);
  return sp;
}

const shellMat = color => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { c: { value: new THREE.Color(color) } },
  vertexShader: `varying vec3 vN, vV;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal);
      vV = cameraPosition - wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `uniform vec3 c; varying vec3 vN, vV;
    void main() {
      float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      gl_FragColor = vec4(c, 0.04 + 0.55 * pow(f, 3.0));
    }`,
});

function setCapital(i, silent) {
  capital = i;
  const cap = data.systems[i];
  dists = data.systems.map(s => Math.hypot(s[2] - cap[2], s[3] - cap[3], s[4] - cap[4]));

  capitalGroup.clear();
  capitalGroup.position.copy(pos(i));
  for (const z of ZONES) {
    if (z.r === Infinity) continue;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(z.r, 64, 48), shellMat(z.color));
    shell.renderOrder = 10 - z.n;
    capitalGroup.add(shell);
    const tag = makeLabel(`Z${z.n} ×${z.mult}`, z.color, 1.4);
    tag.position.set(0, 0, -z.r - 0.8);
    capitalGroup.add(tag);
  }
  capitalGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })));
  const name = makeLabel(cap[0], '#ffffff', 1.6);
  name.position.set(0, 1.6, 0);
  capitalGroup.add(name);

  const el = document.getElementById('capital');
  el.style.display = 'block';
  el.innerHTML = `<a id="clearCap">clear</a>Capital: <b>${cap[0]}</b> <small>${data.regions[cap[1]]}</small>`;
  document.getElementById('clearCap').onclick = () => {
    capital = null; dists = null;
    capitalGroup.clear();
    el.style.display = 'none';
    history.replaceState(null, '', location.pathname);
    applyColors();
  };
  if (!silent) history.replaceState(null, '', '#' + encodeURIComponent(cap[0]));
  applyColors();
}

let flyTarget = null;
function flyTo(i) {
  flyTarget = pos(i);
}

function raycastAt(x, y, k = 1) {
  if (!points) return -1;
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const dist = camera.position.distanceTo(controls.target);
  raycaster.params.Points.threshold = Math.max(0.15, dist * 0.006) * k;
  const hit = raycaster.intersectObject(points)[0];
  return hit ? hit.index : -1;
}

function showTip(idx, x, y, touch) {
  hoverMarker.visible = true;
  hoverMarker.position.copy(pos(idx));
  const s = data.systems[idx];
  let html = `<b>${s[0]}</b> <span class="dim">${data.regions[s[1]]}</span><br>` +
    `<span style="color:${secColor(s[5])}">${s[5].toFixed(1)}</span>`;
  if (capital !== null && idx !== capital) {
    const d = dists[idx], zi = zoneIdx(d), z = ZONES[zi];
    html += ` <span class="dim">·</span> <span class="num">${d.toFixed(2)}</span> ly ` +
      `<span class="dim">·</span> <span style="color:${z.color}">Zone ${z.n}</span><br>` +
      `<span class="dim">${SHIPS[ship][0]}</span> <span class="num">${fmt(shipCost(ship, zi))}</span> TJ`;
  }
  if (touch && idx !== capital) html += `<br><span class="dim">tap again to set capital</span>`;
  tooltip.innerHTML = html;
  tooltip.style.display = 'block';
  tooltip.style.left = Math.max(4, Math.min(x + 14, innerWidth - 230)) + 'px';
  tooltip.style.top = Math.max(4, touch ? y - 100 : y + 14) + 'px';
}

function hideTip() {
  tooltip.style.display = 'none';
  hoverMarker.visible = false;
}

let downAt = null, tapSel = -1;

function handleTap(x, y, touch) {
  const idx = raycastAt(x, y, touch ? 2.5 : 1);
  if (touch) {
    if (idx < 0) { hideTip(); tapSel = -1; }
    else if (idx === tapSel) { setCapital(idx); showTip(idx, x, y, true); }
    else { tapSel = idx; showTip(idx, x, y, true); }
  } else if (idx >= 0) {
    setCapital(idx);
  }
}

renderer.domElement.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') return;
  downAt = { x: e.clientX, y: e.clientY };
  hideTip();
});
renderer.domElement.addEventListener('pointerup', e => {
  if (e.pointerType === 'touch') return;
  tapHandledAt = performance.now();
  const tapped = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8;
  downAt = null;
  if (tapped) handleTap(e.clientX, e.clientY, false);
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!points || downAt || e.pointerType === 'touch') return;
  hoverIdx = raycastAt(e.clientX, e.clientY);
  if (hoverIdx >= 0) showTip(hoverIdx, e.clientX, e.clientY, false);
  else hideTip();
});

let touchStart = null, tapHandledAt = 0;
renderer.domElement.addEventListener('touchstart', e => {
  touchStart = e.touches.length === 1
    ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() }
    : null;
}, { passive: true });
renderer.domElement.addEventListener('touchend', e => {
  if (!touchStart || e.touches.length) return;
  tapHandledAt = performance.now();
  const t = e.changedTouches[0];
  const slop = Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y);
  const dur = performance.now() - touchStart.t;
  touchStart = null;
  if (slop > 18 || dur > 700) return;
  e.preventDefault();
  handleTap(t.clientX, t.clientY, true);
}, { passive: false });

// fallback for browsers where neither pointer nor touch handlers ran
renderer.domElement.addEventListener('click', e => {
  if (performance.now() - tapHandledAt < 600) return;
  handleTap(e.clientX, e.clientY, true);
});
document.addEventListener('gesturestart', e => e.preventDefault());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  if (flyTarget) {
    const delta = flyTarget.clone().sub(controls.target).multiplyScalar(0.12);
    controls.target.add(delta);
    camera.position.add(delta);
    const d = camera.position.distanceTo(controls.target);
    if (d > 45) camera.position.lerp(controls.target, 0.04);
    if (flyTarget.distanceTo(controls.target) < 0.05) flyTarget = null;
  }
  const camDist = camera.position.distanceTo(controls.target);
  regionGroup.children.forEach(sp => sp.material.opacity = Math.min(0.65, Math.max(0, (camDist - 25) / 60)));
  if (labelMat) {
    labelMat.uniforms.viewport.value.set(innerWidth, innerHeight);
    labelMat.uniforms.camDist.value = camDist;
    labelMat.uniforms.zoomGate.value = 1 - THREE.MathUtils.smoothstep(camDist, 40, 85);
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ansiblex capacitor: 1250 TJ, ~200 TJ/h average, 6.25 h from empty,
// ship-style recharge curve C(t) = Cmax(1+(sqrt(C0/Cmax)-1)e^(-t/tau))^2, tau = 22500s/5
const CAP_MAX = 1250, CAP_TAU = 4500, CAP_AVG = 200, SEGS = 24;
const capSegs = [];
{
  const svg = document.getElementById('capWheel');
  for (let i = 0; i < SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2 - Math.PI / 2;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', 38 + Math.cos(a) * 24);
    l.setAttribute('y1', 38 + Math.sin(a) * 24);
    l.setAttribute('x2', 38 + Math.cos(a) * 34);
    l.setAttribute('y2', 38 + Math.sin(a) * 34);
    l.setAttribute('stroke-width', 4);
    svg.appendChild(l);
    capSegs.push(l);
  }
  const t1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t1.setAttribute('x', 38); t1.setAttribute('y', 37); t1.setAttribute('text-anchor', 'middle');
  t1.id = 'capVal';
  const t2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t2.setAttribute('x', 38); t2.setAttribute('y', 47); t2.setAttribute('text-anchor', 'middle');
  t2.setAttribute('class', 'u');
  t2.textContent = 'TJ';
  svg.append(t1, t2);
}

function setWheel(rem) {
  const on = Math.round(SEGS * rem / CAP_MAX);
  capSegs.forEach((l, i) => l.setAttribute('stroke', i < on ? '#d8a23a' : '#2a2f35'));
  document.getElementById('capVal').textContent = Math.round(rem);
}

const rechargeH = rem => CAP_TAU * (5 + Math.log(1 - Math.sqrt(rem / CAP_MAX))) / 3600;

function capDefault() {
  setWheel(CAP_MAX);
  document.getElementById('capStats').innerHTML =
    `<b>${CAP_MAX}</b> TJ · <b>~${CAP_AVG}</b> TJ/h avg<br>empty → full <b>~6.25</b> h`;
}

function capZone(zi) {
  const cost = shipCost(ship, zi);
  if (!cost) { capDefault(); return; }
  const jumps = Math.floor(CAP_MAX / cost);
  const rem = CAP_MAX - jumps * cost;
  const rate = CAP_AVG / cost;
  setWheel(rem);
  document.getElementById('capStats').innerHTML =
    `<b>${jumps}</b> jumps from full cap<br>` +
    `<b>~${rate >= 20 ? Math.round(rate) : rate.toFixed(1)}</b> jumps/h sustained<br>` +
    `full again in <b>~${rechargeH(rem).toFixed(1)}</b> h`;
}

function renderTable() {
  document.getElementById('zones').innerHTML =
    '<tr><th>Zone</th><th>ly</th><th>Mult.</th><th>TJ</th></tr>' +
    ZONES.map((z, zi) =>
      `<tr><td><span class="sw" style="background:${z.color}"></span>Zone ${z.n}</td>` +
      `<td>${z.range}</td><td>×${z.mult}</td><td>${fmt(shipCost(ship, zi))}</td></tr>`).join('');
  [...document.getElementById('zones').rows].slice(1).forEach((tr, zi) => {
    tr.onmouseenter = () => capZone(zi);
    tr.onmouseleave = capDefault;
    tr.onclick = () => capZone(zi);
  });
}
renderTable();
capDefault();

function autocomplete(input, box, list, onPick) {
  let idx = 0;
  const render = hits => {
    box.innerHTML = hits.map((h, k) =>
      `<div data-i="${h.i}" class="${k === 0 ? 'active' : ''}">${h.label}</div>`).join('');
    box.style.display = hits.length ? 'block' : 'none';
    idx = 0;
    [...box.children].forEach(el => el.onmousedown = () => { pickIt(+el.dataset.i); });
  };
  const pickIt = i => {
    box.style.display = 'none';
    input.blur();
    onPick(i);
  };
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { box.style.display = 'none'; return; }
    const starts = [], contains = [];
    list().forEach((label, i) => {
      const n = label.toLowerCase();
      if (n.startsWith(q)) starts.push(i);
      else if (n.includes(q)) contains.push(i);
    });
    render(starts.concat(contains).slice(0, 8).map(i => ({ i, label: list()[i] })));
  });
  input.addEventListener('keydown', e => {
    const items = [...box.children];
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      idx = (idx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items.forEach((el, k) => el.classList.toggle('active', k === idx));
    } else if (e.key === 'Enter') {
      pickIt(+items[idx].dataset.i);
    } else if (e.key === 'Escape') {
      box.style.display = 'none';
    }
  });
  input.addEventListener('blur', () => setTimeout(() => box.style.display = 'none', 150));
}

function systemSearch() {
  const input = document.getElementById('q');
  autocomplete(input, document.getElementById('suggestions'),
    () => data.systems.map(s => `${s[0]} <small>${data.regions[s[1]]}</small>`),
    i => {
      input.value = '';
      setCapital(i);
      flyTo(i);
      if (matchMedia('(max-width: 640px)').matches) panel.classList.add('closed');
    });
}

const shipInput = document.getElementById('ship');
shipInput.value = SHIPS[ship][0];
autocomplete(shipInput, document.getElementById('shipSuggestions'),
  () => SHIPS.map(s => s[0]),
  i => { ship = i; shipInput.value = SHIPS[i][0]; renderTable(); capDefault(); tooltip.style.display = 'none'; });
shipInput.addEventListener('focus', () => shipInput.select());
shipInput.addEventListener('blur', () => setTimeout(() => shipInput.value = SHIPS[ship][0], 150));
