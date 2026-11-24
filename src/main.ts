import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { CoastalWorld } from './world';
import { RivieraBicycle } from './bicycle';
import { PelicanRider } from './pelican';
import { CoastalAudioSynth } from './audio';
import { TimePreset } from './shaders';

type CameraMode = 'orbit' | 'chase' | 'pov' | 'cinema';

interface BurstParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

// 1. Initialize Renderer, Scene, Camera & Post-Processing
const container = document.getElementById('canvas-container') as HTMLDivElement;
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true, // Enables crisp 1-click PNG screenshot capture!
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.12, 650);
camera.position.set(5.2, 2.7, -18.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 1.6;
controls.maxDistance = 58;

// Post-processing pipeline with UnrealBloomPass + ACES OutputPass
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.42,
  0.55,
  0.82
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// 2. Load AI-generated Pelican Velo Club Crest Texture
const texLoader = new THREE.TextureLoader();
const crestTexture = texLoader.load('./crest_badge.jpg');
crestTexture.colorSpace = THREE.SRGBColorSpace;

// 3. Instantiate World, Bicycle, Pelican IK Rider & Audio Synth
const world = new CoastalWorld(scene, crestTexture);
const bicycle = new RivieraBicycle(crestTexture);
scene.add(bicycle.root);
const pelican = new PelicanRider(bicycle);
const audio = new CoastalAudioSynth();

// Celebration & Turbo Sparkle Particle Pool
const particles: BurstParticle[] = [];
const sparkGeo = new THREE.OctahedronGeometry(0.065, 0);
const goldSparkMat = new THREE.MeshBasicMaterial({ color: 0xffdf6b });
const cyanSparkMat = new THREE.MeshBasicMaterial({ color: 0x36f9f6 });

function spawnParticles(origin: THREE.Vector3, count: number, isCyan = false): void {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(sparkGeo, isCyan ? cyanSparkMat : goldSparkMat);
    m.position.copy(origin);
    scene.add(m);
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.2 + Math.random() * 3.6;
    particles.push({
      mesh: m,
      vel: new THREE.Vector3(
        Math.cos(ang) * spd,
        1.5 + Math.random() * 3.4,
        Math.sin(ang) * spd
      ),
      life: 0,
      maxLife: 0.55 + Math.random() * 0.45,
    });
  }
}

// 4. Simulation & Gameplay State
let cameraMode: CameraMode = 'orbit';
let manualMode = false;
let currentTimeId: TimePreset['id'] = 'sunset';
let speedMultiplier = 1.0;
let bloomMultiplier = 1.0;

let trackU = 0.015; // Normalized spline coordinate [0, 1)
const manualPos = world.trackCurve.getPointAt(trackU).clone();
let manualHeading = Math.atan2(
  world.trackCurve.getTangentAt(trackU).x,
  world.trackCurve.getTangentAt(trackU).z
);
let currentSpeed = 6.8; // m/s (~24.5 km/h)
let jumpHeight = 0;
let jumpVel = 0;
let wheelieTimer = 0;
let wheelieAngle = 0;
let turboActive = false;
let turboTimer = 0;
let fishCaughtCount = 0;
let currentLeanRad = 0;

// Keyboard Input State
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => {
  const code = e.code;
  keys[code] = true;

  if (code === 'Space') {
    e.preventDefault();
    triggerJump();
  } else if (code === 'KeyB') {
    triggerBell();
  } else if (code === 'KeyQ') {
    triggerSquawk();
  } else if (code === 'KeyE') {
    triggerWheelie();
  } else if (code === 'KeyG') {
    toggleGoggles();
  } else if (code === 'KeyF') {
    triggerFishFrenzy();
  } else if (code === 'KeyM') {
    toggleDriveMode();
  } else if (code === 'KeyC') {
    cycleCameraMode();
  } else if (code === 'KeyP') {
    captureScreenshot();
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// Toast helper
const toastEl = document.getElementById('toast-banner') as HTMLDivElement;
let toastTimeout = 0;
function showToast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// Action Triggers
function triggerJump(): void {
  if (jumpHeight <= 0.02) {
    jumpVel = 5.6;
    audio.playJump();
    spawnParticles(bicycle.root.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 10, true);
  }
}

function triggerWheelie(): void {
  wheelieTimer = 1.65;
  showToast('🚲 鹈鹕单轮翘头特技！');
}

function triggerBell(): void {
  bicycle.ringBell();
  audio.playBell();
  showToast('🔔 叮铃铃～ 让一让，鹈鹕车手过弯啦！');
}

function triggerSquawk(): void {
  pelican.triggerSquawk();
  audio.playSquawk();
}

function toggleGoggles(): void {
  pelican.gogglesDown = !pelican.gogglesDown;
  document.getElementById('btn-goggles')?.classList.toggle('active', pelican.gogglesDown);
  showToast(pelican.gogglesDown ? '🥽 复古飞行员风镜已戴好！破风姿态！' : '🥽 风镜推至额头');
}

function triggerFishFrenzy(): void {
  const aheadPos = bicycle.root.position
    .clone()
    .add(new THREE.Vector3(Math.sin(manualHeading) * 5.5, 0.4, Math.cos(manualHeading) * 5.5));
  world.triggerFishFrenzy(aheadPos);
  showToast('🐟 一群银沙丁鱼跃出水面！快骑过去张嘴接住！');
}

function toggleDriveMode(): void {
  manualMode = !manualMode;
  const btn = document.getElementById('btn-mode') as HTMLButtonElement;
  if (manualMode) {
    // Sync manual start state from current spline pose
    manualPos.copy(bicycle.root.position);
    btn.innerHTML = '🕹️ 手动驾驶 WASD <kbd>M</kbd>';
    btn.classList.add('active');
    if (cameraMode === 'orbit') {
      setCameraMode('chase');
    }
    showToast('🕹️ 已切换手动自由骑行：W/S 加减速，A/D 转向，Space 兔跳！');
  } else {
    // Snap back cleanly to nearest point on trackCurve
    let bestU = trackU;
    let bestDist = Infinity;
    for (let i = 0; i < 200; i++) {
      const u = i / 200;
      const d = world.trackCurve.getPointAt(u).distanceToSquared(bicycle.root.position);
      if (d < bestDist) {
        bestDist = d;
        bestU = u;
      }
    }
    trackU = bestU;
    btn.innerHTML = '🧭 自动巡航 <kbd>M</kbd>';
    btn.classList.remove('active');
    showToast('🧭 已恢复环岛海岸线自动巡航');
  }
}

function setCameraMode(mode: CameraMode): void {
  cameraMode = mode;
  document.querySelectorAll('#cam-grid .seg-btn').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.cam === mode);
  });
  controls.enabled = mode === 'orbit';
  const names: Record<CameraMode, string> = {
    orbit: '🎥 自由 360° 环绕视角（可鼠标拖拽缩放）',
    chase: '🎥 动感破风尾随跟拍视角',
    pov: '🎥 鹈鹕第一人称长喙视角 (Beak-Cam POV)',
    cinema: '🎥 电影级直升机航拍导演镜头',
  };
  showToast(names[mode]);
}

function cycleCameraMode(): void {
  const order: CameraMode[] = ['orbit', 'chase', 'pov', 'cinema'];
  const next = order[(order.indexOf(cameraMode) + 1) % order.length];
  setCameraMode(next);
}

function captureScreenshot(): void {
  composer.render();
  const url = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `pelican-grand-tour-3d-${Date.now()}.png`;
  a.click();
  showToast('📸 高清 3D 截图已保存！');
}

// 5. Bind UI Controls
document.getElementById('btn-mode')?.addEventListener('click', toggleDriveMode);
document.getElementById('btn-jump')?.addEventListener('click', triggerJump);
document.getElementById('btn-wheelie')?.addEventListener('click', triggerWheelie);
document.getElementById('btn-bell')?.addEventListener('click', triggerBell);
document.getElementById('btn-squawk')?.addEventListener('click', triggerSquawk);
document.getElementById('btn-goggles')?.addEventListener('click', toggleGoggles);
document.getElementById('btn-frenzy')?.addEventListener('click', triggerFishFrenzy);
document.getElementById('btn-photo')?.addEventListener('click', captureScreenshot);

document.getElementById('btn-turbo')?.addEventListener('click', () => {
  turboTimer = 2.6;
  showToast('⚡ 涡轮破风冲刺开启！');
});

document.getElementById('btn-audio')?.addEventListener('click', (e) => {
  const on = audio.toggle();
  const btn = e.currentTarget as HTMLButtonElement;
  btn.textContent = on ? '🔊 音效已开启' : '🔇 开启音效';
  btn.classList.toggle('active', on);
  if (on) {
    audio.playBell();
    showToast('🔊 多声道程序化海浪 + 棘轮 + 黄铜车铃合成器已激活！');
  }
});

document.querySelectorAll('#cam-grid .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = (btn as HTMLElement).dataset.cam as CameraMode;
    setCameraMode(mode);
  });
});

document.querySelectorAll('#time-grid .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const t = (btn as HTMLElement).dataset.time as TimePreset['id'];
    currentTimeId = t;
    world.setTimePreset(t);
    document.querySelectorAll('#time-grid .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });
});

const rngSpeed = document.getElementById('rng-speed') as HTMLInputElement;
const lblSpeedMult = document.getElementById('lbl-speed-mult') as HTMLSpanElement;
rngSpeed.addEventListener('input', () => {
  speedMultiplier = parseFloat(rngSpeed.value);
  lblSpeedMult.textContent = `${speedMultiplier.toFixed(1)}x`;
});

const rngPouch = document.getElementById('rng-pouch') as HTMLInputElement;
const lblPouch = document.getElementById('lbl-pouch') as HTMLSpanElement;
rngPouch.addEventListener('input', () => {
  pelican.pouchElasticity = parseFloat(rngPouch.value);
  lblPouch.textContent = `${pelican.pouchElasticity.toFixed(1)}x`;
});

const rngBloom = document.getElementById('rng-bloom') as HTMLInputElement;
const lblBloom = document.getElementById('lbl-bloom') as HTMLSpanElement;
rngBloom.addEventListener('input', () => {
  bloomMultiplier = parseFloat(rngBloom.value);
  lblBloom.textContent = `${Math.round(bloomMultiplier * 100)}%`;
});

// Collapsible Studio Panel
document.getElementById('panel-toggle')?.addEventListener('click', () => {
  const body = document.getElementById('panel-body')!;
  const chev = document.getElementById('panel-chevron')!;
  const collapsed = body.classList.toggle('collapsed');
  chev.textContent = collapsed ? '▸' : '▾';
});

// Club Poster Modal
const posterModal = document.getElementById('poster-modal')!;
document.getElementById('btn-open-poster')?.addEventListener('click', () => posterModal.classList.add('open'));
document.getElementById('btn-close-poster')?.addEventListener('click', () => posterModal.classList.remove('open'));
posterModal.addEventListener('click', (e) => {
  if (e.target === posterModal) posterModal.classList.remove('open');
});

// 6. Pre-sample Track Points for the 2D Radar Minimap
const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
const miniCtx = minimapCanvas.getContext('2d')!;
const miniTrackPts: { x: number; z: number }[] = [];
for (let i = 0; i <= 100; i++) {
  const p = world.trackCurve.getPointAt(i / 100);
  miniTrackPts.push({ x: p.x, z: p.z });
}

function drawMinimap(): void {
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  miniCtx.clearRect(0, 0, w, h);

  const mapX = (wx: number) => w * 0.5 + wx * 1.95;
  const mapY = (wz: number) => h * 0.5 + wz * 1.95;

  // Subtle radar rings
  miniCtx.strokeStyle = 'rgba(56, 239, 223, 0.14)';
  miniCtx.lineWidth = 1;
  for (const r of [26, 52, 74]) {
    miniCtx.beginPath();
    miniCtx.arc(w * 0.5, h * 0.5, r, 0, Math.PI * 2);
    miniCtx.stroke();
  }

  // Island landmass silhouette
  miniCtx.fillStyle = 'rgba(79, 138, 76, 0.35)';
  miniCtx.beginPath();
  miniCtx.arc(mapX(-8), mapY(-2), 34, 0, Math.PI * 2);
  miniCtx.fill();

  // Track loop
  miniCtx.strokeStyle = 'rgba(255, 224, 150, 0.85)';
  miniCtx.lineWidth = 3;
  miniCtx.beginPath();
  miniTrackPts.forEach((pt, idx) => {
    const px = mapX(pt.x);
    const py = mapY(pt.z);
    if (idx === 0) miniCtx.moveTo(px, py);
    else miniCtx.lineTo(px, py);
  });
  miniCtx.closePath();
  miniCtx.stroke();

  // Lighthouse beacon icon
  miniCtx.fillStyle = '#ff6b6b';
  miniCtx.beginPath();
  miniCtx.arc(mapX(world.lighthousePos.x), mapY(world.lighthousePos.z), 4.2, 0, Math.PI * 2);
  miniCtx.fill();

  // Active jumping silver fishes
  miniCtx.fillStyle = '#38efdf';
  for (const f of world.fishes) {
    if (f.active) {
      miniCtx.beginPath();
      miniCtx.arc(mapX(f.worldPos.x), mapY(f.worldPos.z), 2.6, 0, Math.PI * 2);
      miniCtx.fill();
    }
  }

  // Pelican Rider directional chevron
  const rx = mapX(bicycle.root.position.x);
  const ry = mapY(bicycle.root.position.z);
  miniCtx.save();
  miniCtx.translate(rx, ry);
  miniCtx.rotate(-manualHeading + Math.PI);
  miniCtx.fillStyle = '#ffca58';
  miniCtx.beginPath();
  miniCtx.moveTo(0, -7);
  miniCtx.lineTo(5.2, 5.5);
  miniCtx.lineTo(0, 3);
  miniCtx.lineTo(-5.2, 5.5);
  miniCtx.closePath();
  miniCtx.fill();
  miniCtx.restore();
}

// 7. Telemetry DOM Elements
const elSpeed = document.getElementById('val-speed')!;
const elCadence = document.getElementById('val-cadence')!;
const elLean = document.getElementById('val-lean')!;
const elFish = document.getElementById('val-fish')!;
const elFps = document.getElementById('val-fps')!;

// Initialize Orbit Target cleanly onto Pelican Rider
const initPt = world.trackCurve.getPointAt(trackU);
bicycle.root.position.copy(initPt);
controls.target.copy(initPt).add(new THREE.Vector3(0, 1.15, 0));
controls.update();

// Resize Handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// 8. Main High-Precision Animation Loop
const clock = new THREE.Clock();
let prevRiderPos = initPt.clone();
let fpsFrames = 0;
let fpsAccum = 0;
let uiTimer = 0;

function animate(): void {
  requestAnimationFrame(animate);

  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  const elapsed = clock.elapsedTime;

  // Update world shaders, ocean waves, lighthouse, gulls, boats & jumping fishes
  const presetBloom = world.update(dt, elapsed, scene);
  bloomPass.strength = presetBloom * bloomMultiplier;

  // Check Turbo Sprint state (Shift key or UI Turbo timer)
  if (turboTimer > 0) turboTimer -= dt;
  turboActive = Boolean(keys['ShiftLeft'] || keys['ShiftRight'] || turboTimer > 0);
  document.getElementById('btn-turbo')?.classList.toggle('active', turboActive);

  const turboBoost = turboActive ? 1.65 : 1.0;
  let steerInput = 0;
  let targetLean = 0;

  if (!manualMode) {
    // Smooth Intelligent Coastal Spline Autopilot
    const baseCruiseMps = 6.8 * speedMultiplier * turboBoost;
    currentSpeed = THREE.MathUtils.lerp(currentSpeed, baseCruiseMps, Math.min(1, dt * 5));

    trackU = (trackU + (currentSpeed * dt) / world.trackLength) % 1.0;
    const pos = world.trackCurve.getPointAt(trackU);
    const tan = world.trackCurve.getTangentAt(trackU).normalize();
    const aheadTan = world.trackCurve.getTangentAt((trackU + 0.018) % 1.0).normalize();

    // Signed path curvature for realistic steering & centripetal banking lean!
    const crossY = tan.x * aheadTan.z - tan.z * aheadTan.x;
    // Note: cross(tan, aheadTan).y = tan.z * aheadTan.x - tan.x * aheadTan.z (left turn positive around +Y)
    const turnRate = (tan.z * aheadTan.x - tan.x * aheadTan.z) * 16.0;
    steerInput = THREE.MathUtils.clamp(turnRate * 0.55, -0.52, 0.52);
    targetLean = THREE.MathUtils.clamp(-turnRate * (currentSpeed / 8.5) * 0.42, -0.42, 0.42);

    manualPos.copy(pos);
    manualHeading = Math.atan2(tan.x, tan.z);
  } else {
    // Manual WASD / Arrow Free-Ride Physics
    const accel = keys['KeyW'] || keys['ArrowUp'] ? 12.0 : keys['KeyS'] || keys['ArrowDown'] ? -14.0 : -3.2;
    const maxSpd = 12.5 * speedMultiplier * turboBoost;
    currentSpeed = THREE.MathUtils.clamp(currentSpeed + accel * dt, 0, maxSpd);

    const turnKey = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
    steerInput = turnKey * 0.48;
    manualHeading += steerInput * (0.6 + currentSpeed * 0.16) * dt;
    targetLean = -steerInput * Math.min(1, currentSpeed / 7.0) * 0.48;

    manualPos.x += Math.sin(manualHeading) * currentSpeed * dt;
    manualPos.z += Math.cos(manualHeading) * currentSpeed * dt;

    // Sample nearest spline elevation if near road, otherwise clamp above beach/water deck
    let nearestY = 0.35;
    let minD2 = Infinity;
    for (let i = 0; i < 80; i++) {
      const p = world.trackCurve.getPointAt(i / 80);
      const d2 = (p.x - manualPos.x) ** 2 + (p.z - manualPos.z) ** 2;
      if (d2 < minD2) {
        minD2 = d2;
        nearestY = p.y;
      }
    }
    const targetGroundY = minD2 < 18 ? nearestY : Math.max(-0.4, nearestY * 0.3);
    manualPos.y = THREE.MathUtils.lerp(manualPos.y, targetGroundY, Math.min(1, dt * 8));
  }

  // Bunny-hop vertical physics
  if (jumpHeight > 0 || jumpVel > 0) {
    jumpHeight += jumpVel * dt;
    jumpVel -= 15.5 * dt;
    if (jumpHeight <= 0) {
      jumpHeight = 0;
      jumpVel = 0;
    }
  }

  // Wheelie pitch physics
  if (wheelieTimer > 0) {
    wheelieTimer -= dt;
    wheelieAngle = THREE.MathUtils.lerp(wheelieAngle, 0.44, Math.min(1, dt * 8));
  } else {
    wheelieAngle = THREE.MathUtils.lerp(wheelieAngle, 0, Math.min(1, dt * 7));
  }
  document.getElementById('btn-wheelie')?.classList.toggle('active', wheelieTimer > 0);

  // Apply Pose + Centripetal Lean to Bicycle Root
  currentLeanRad = THREE.MathUtils.lerp(currentLeanRad, targetLean, Math.min(1, dt * 7));
  bicycle.root.position.set(manualPos.x, manualPos.y + jumpHeight, manualPos.z);
  bicycle.root.rotation.order = 'YXZ';
  bicycle.root.rotation.y = manualHeading;
  bicycle.root.rotation.z = currentLeanRad;

  // Slope pitch along track in autopilot
  if (!manualMode) {
    const tan = world.trackCurve.getTangentAt(trackU);
    bicycle.root.rotation.x = THREE.MathUtils.lerp(bicycle.root.rotation.x, -tan.y * 0.65, Math.min(1, dt * 8));
  } else {
    bicycle.root.rotation.x = 0;
  }

  const nightFactor = currentTimeId === 'night' ? 1.0 : currentTimeId === 'sunset' ? 0.35 : 0.0;
  const isCoasting = jumpHeight > 0.08 || currentSpeed < 0.4;
  bicycle.update(dt, currentSpeed, steerInput, wheelieAngle, jumpHeight > 0.1 ? 0.35 : 1.0, nightFactor);

  // Find nearest airborne silver sardine & check mid-air beak catch!
  const beakWorld = new THREE.Vector3();
  pelican.beakCatchPoint.getWorldPosition(beakWorld);
  let nearestFishPos: THREE.Vector3 | null = null;
  let nearestFishDist = Infinity;

  for (const f of world.fishes) {
    if (!f.active) continue;
    const dist = f.worldPos.distanceTo(beakWorld);
    if (dist < nearestFishDist) {
      nearestFishDist = dist;
      nearestFishPos = f.worldPos;
    }
    // Generous fun catch radius around the pelican's sweeping open pouch!
    if (dist < 1.95) {
      f.caughtCooldown = 4.5;
      f.active = false;
      f.group.visible = false;
      fishCaughtCount++;
      pelican.onCatchFish();
      audio.playCatchFish();
      spawnParticles(f.worldPos, 18, false);
      showToast(`🐟 好身手！空中精准捕鱼 #${fishCaughtCount}！`);
    }
  }

  // Turbo cyan speed-sparkles from rear tire
  if (turboActive && Math.random() < 0.55) {
    spawnParticles(
      bicycle.root.position.clone().add(new THREE.Vector3(0, 0.25, 0)),
      2,
      true
    );
  }

  // Update Articulated Pelican Rider (2-Bone Leg IK, Wing IK, Pouch Soft-Body, Goggles)
  pelican.update(
    dt,
    elapsed,
    bicycle,
    currentSpeed,
    jumpHeight > 0.08,
    turboActive,
    wheelieAngle > 0.12,
    nearestFishPos
  );

  // Update Particle Bursts
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
      continue;
    }
    p.vel.y -= 7.5 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.scale.setScalar(1 - p.life / p.maxLife);
  }

  // Update Procedural Web Audio Synth
  audio.update(dt, elapsed, currentSpeed, isCoasting);

  // Update Multi-Mode Camera Director
  const riderDelta = bicycle.root.position.clone().sub(prevRiderPos);
  prevRiderPos.copy(bicycle.root.position);

  const forwardVec = new THREE.Vector3(Math.sin(manualHeading), 0, Math.cos(manualHeading));
  const rightVec = new THREE.Vector3(Math.cos(manualHeading), 0, -Math.sin(manualHeading));

  if (cameraMode === 'orbit') {
    // Translate camera + orbit target together with the moving bicycle so OrbitControls feels silky smooth!
    camera.position.add(riderDelta);
    controls.target.lerp(
      bicycle.root.position.clone().add(new THREE.Vector3(0, 1.15, 0)),
      Math.min(1, dt * 10)
    );
    controls.update();
    camera.fov = THREE.MathUtils.lerp(camera.fov, turboActive ? 58 : 50, Math.min(1, dt * 5));
    camera.updateProjectionMatrix();
  } else if (cameraMode === 'chase') {
    const desiredCamPos = bicycle.root.position
      .clone()
      .addScaledVector(forwardVec, -3.7)
      .addScaledVector(rightVec, -0.55)
      .add(new THREE.Vector3(0, 2.05, 0));
    camera.position.lerp(desiredCamPos, Math.min(1, dt * 7));
    const lookTarget = bicycle.root.position
      .clone()
      .addScaledVector(forwardVec, 2.8)
      .add(new THREE.Vector3(0, 1.15, 0));
    camera.lookAt(lookTarget);
    camera.fov = THREE.MathUtils.lerp(camera.fov, turboActive ? 66 : 54, Math.min(1, dt * 5));
    camera.updateProjectionMatrix();
  } else if (cameraMode === 'pov') {
    // First-person Pelican Beak-Cam POV looking right over the long orange bill & handlebars!
    const eyeWorld = new THREE.Vector3();
    pelican.beakCamAnchor.getWorldPosition(eyeWorld);
    camera.position.copy(eyeWorld);
    const povLook = eyeWorld
      .clone()
      .addScaledVector(forwardVec, 5.0)
      .add(new THREE.Vector3(0, -0.65, 0));
    camera.lookAt(povLook);
    camera.fov = THREE.MathUtils.lerp(camera.fov, turboActive ? 76 : 68, Math.min(1, dt * 6));
    camera.updateProjectionMatrix();
  } else if (cameraMode === 'cinema') {
    // Sweeping Helicopter / Low-Angle Tracking Shots cycling every 7 seconds
    const shotIndex = Math.floor(elapsed / 7) % 3;
    let camDesired: THREE.Vector3;
    if (shotIndex === 0) {
      // Heroic side-front coastal tracking shot (just like og_banner.jpg!)
      camDesired = bicycle.root.position
        .clone()
        .addScaledVector(forwardVec, 2.9)
        .addScaledVector(rightVec, 2.4)
        .add(new THREE.Vector3(0, 1.25, 0));
    } else if (shotIndex === 1) {
      // Low dramatic pedal & spoked-wheel close tracking shot
      camDesired = bicycle.root.position
        .clone()
        .addScaledVector(forwardVec, 0.8)
        .addScaledVector(rightVec, -2.1)
        .add(new THREE.Vector3(0, 0.62, 0));
    } else {
      // High sweeping Riviera drone orbit
      const orbitAng = elapsed * 0.45;
      camDesired = bicycle.root.position
        .clone()
        .add(new THREE.Vector3(Math.cos(orbitAng) * 8.5, 4.8, Math.sin(orbitAng) * 8.5));
    }
    camera.position.lerp(camDesired, Math.min(1, dt * 4.5));
    camera.lookAt(bicycle.root.position.clone().add(new THREE.Vector3(0, 1.15, 0)));
    camera.fov = THREE.MathUtils.lerp(camera.fov, 46, Math.min(1, dt * 4));
    camera.updateProjectionMatrix();
  }

  // Update HUD Telemetry & Radar Minimap at ~15 Hz
  fpsFrames++;
  fpsAccum += rawDt;
  uiTimer += rawDt;
  if (uiTimer >= 0.07) {
    uiTimer = 0;
    const kmh = currentSpeed * 3.6;
    const rpm = Math.round(((currentSpeed / bicycle.wheelRadius) / 2.35) * (60 / (Math.PI * 2)));
    const leanDeg = Math.round(Math.abs(THREE.MathUtils.radToDeg(currentLeanRad)));
    elSpeed.textContent = kmh.toFixed(1);
    elCadence.textContent = String(rpm);
    elLean.textContent = `${leanDeg}°`;
    elFish.textContent = String(fishCaughtCount);
    drawMinimap();
  }
  if (fpsAccum >= 0.5) {
    elFps.textContent = String(Math.round(fpsFrames / fpsAccum));
    fpsFrames = 0;
    fpsAccum = 0;
  }

  composer.render();
}

animate();
