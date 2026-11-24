import * as THREE from 'three';

export interface TimePreset {
  id: 'sunset' | 'noon' | 'night' | 'dawn';
  label: string;
  skyZenith: THREE.Color;
  skyHorizon: THREE.Color;
  sunColor: THREE.Color;
  sunDirection: THREE.Vector3;
  cloudTint: THREE.Color;
  waterDeep: THREE.Color;
  waterShallow: THREE.Color;
  foamColor: THREE.Color;
  fogColor: THREE.Color;
  fogDensity: number;
  ambientIntensity: number;
  sunIntensity: number;
  bloomStrength: number;
  bioluminescence: number;
  starIntensity: number;
  lanternGlow: number;
}

export const TIME_PRESETS: Record<TimePreset['id'], TimePreset> = {
  sunset: {
    id: 'sunset',
    label: '🌅 落日黄金海岸',
    skyZenith: new THREE.Color('#1d3b72'),
    skyHorizon: new THREE.Color('#ff8f52'),
    sunColor: new THREE.Color('#ffd07b'),
    sunDirection: new THREE.Vector3(-0.72, 0.22, -0.66).normalize(),
    cloudTint: new THREE.Color('#ffb07a'),
    waterDeep: new THREE.Color('#093859'),
    waterShallow: new THREE.Color('#16a39e'),
    foamColor: new THREE.Color('#ffe8cc'),
    fogColor: new THREE.Color('#f49d6e'),
    fogDensity: 0.0028,
    ambientIntensity: 0.85,
    sunIntensity: 2.6,
    bloomStrength: 0.42,
    bioluminescence: 0.0,
    starIntensity: 0.12,
    lanternGlow: 0.85,
  },
  noon: {
    id: 'noon',
    label: '☀️ 地中海晴午',
    skyZenith: new THREE.Color('#0d63c9'),
    skyHorizon: new THREE.Color('#8be0ff'),
    sunColor: new THREE.Color('#fff9e6'),
    sunDirection: new THREE.Vector3(0.38, 0.84, -0.39).normalize(),
    cloudTint: new THREE.Color('#ffffff'),
    waterDeep: new THREE.Color('#064887'),
    waterShallow: new THREE.Color('#12d6c5'),
    foamColor: new THREE.Color('#ffffff'),
    fogColor: new THREE.Color('#a8e6ff'),
    fogDensity: 0.0018,
    ambientIntensity: 1.15,
    sunIntensity: 2.9,
    bloomStrength: 0.24,
    bioluminescence: 0.0,
    starIntensity: 0.0,
    lanternGlow: 0.0,
  },
  night: {
    id: 'night',
    label: '🌌 荧光星夜海湾',
    skyZenith: new THREE.Color('#04091a'),
    skyHorizon: new THREE.Color('#0f264a'),
    sunColor: new THREE.Color('#7eb8ff'),
    sunDirection: new THREE.Vector3(-0.45, 0.52, 0.72).normalize(),
    cloudTint: new THREE.Color('#1c3664'),
    waterDeep: new THREE.Color('#030d22'),
    waterShallow: new THREE.Color('#074f73'),
    foamColor: new THREE.Color('#3af5ff'),
    fogColor: new THREE.Color('#081730'),
    fogDensity: 0.0032,
    ambientIntensity: 0.45,
    sunIntensity: 0.85,
    bloomStrength: 0.78,
    bioluminescence: 1.0,
    starIntensity: 1.0,
    lanternGlow: 1.35,
  },
  dawn: {
    id: 'dawn',
    label: '🌸 薄雾珍珠晨曦',
    skyZenith: new THREE.Color('#354988'),
    skyHorizon: new THREE.Color('#f7b5ca'),
    sunColor: new THREE.Color('#ffe1c6'),
    sunDirection: new THREE.Vector3(0.76, 0.25, 0.60).normalize(),
    cloudTint: new THREE.Color('#ffd4e2'),
    waterDeep: new THREE.Color('#183f6b'),
    waterShallow: new THREE.Color('#47c4c2'),
    foamColor: new THREE.Color('#fff2f5'),
    fogColor: new THREE.Color('#eec4d4'),
    fogDensity: 0.0034,
    ambientIntensity: 0.95,
    sunIntensity: 2.1,
    bloomStrength: 0.36,
    bioluminescence: 0.0,
    starIntensity: 0.22,
    lanternGlow: 0.45,
  },
};

/** CPU helper matching the GPU Gerstner wave height for floating boats & splashes */
export function getOceanHeightCPU(x: number, z: number, time: number): number {
  let y = 0;
  // Wave 1
  y += Math.sin(x * 0.09 + z * 0.05 + time * 1.35) * 0.32;
  // Wave 2
  y += Math.sin(-x * 0.06 + z * 0.11 + time * 1.75) * 0.22;
  // Wave 3
  y += Math.sin(x * 0.18 - z * 0.14 + time * 2.3) * 0.11;
  return y - 1.65;
}

export function createSkyShaderMaterial(initial: TimePreset): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uZenithColor: { value: initial.skyZenith.clone() },
      uHorizonColor: { value: initial.skyHorizon.clone() },
      uSunColor: { value: initial.sunColor.clone() },
      uSunDir: { value: initial.sunDirection.clone() },
      uCloudTint: { value: initial.cloudTint.clone() },
      uStarIntensity: { value: initial.starIntensity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform vec3 uCloudTint;
      uniform float uStarIntensity;
      varying vec3 vWorldDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.03 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);

        // Smooth Rayleigh-inspired sky gradient
        float horizonBlend = pow(1.0 - h, 2.6);
        vec3 sky = mix(uZenithColor, uHorizonColor, horizonBlend);

        // Solar disc & Mie scattering halo
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        float sunDisc = smoothstep(0.9985, 0.9996, sunDot);
        float sunHalo = pow(sunDot, 10.0) * 0.48 + pow(sunDot, 64.0) * 0.75;
        sky += uSunColor * (sunHalo + sunDisc * 2.8);

        // Soft drifting clouds projected onto upper hemisphere
        if (dir.y > 0.02) {
          vec2 cloudUV = dir.xz / (dir.y + 0.18) * 1.45 + vec2(uTime * 0.012, uTime * 0.005);
          float c = fbm(cloudUV);
          float cloudMask = smoothstep(0.50, 0.82, c) * smoothstep(0.02, 0.22, dir.y);
          vec3 cloudLit = mix(uCloudTint * 0.82, uSunColor * 1.15, pow(sunDot, 3.0) * 0.65 + 0.25);
          sky = mix(sky, cloudLit, cloudMask * 0.62);
        }

        // Twinkling starfield + subtle aurora ribbon at night/dawn
        if (uStarIntensity > 0.01 && dir.y > 0.05) {
          vec2 starGrid = floor(dir.xz / (dir.y + 0.35) * 260.0);
          float s = hash(starGrid);
          if (s > 0.993) {
            float twinkle = 0.55 + 0.45 * sin(uTime * 3.5 + s * 120.0);
            float starVis = smoothstep(0.05, 0.35, dir.y) * uStarIntensity * twinkle;
            sky += vec3(0.88, 0.94, 1.0) * starVis * 1.4;
          }
          // Subtle cyan-emerald aurora curtain in night mode
          float auroraWave = fbm(vec2(dir.x * 4.0 + uTime * 0.04, dir.z * 3.0));
          float auroraBand = smoothstep(0.58, 0.78, auroraWave) * smoothstep(0.15, 0.55, dir.y) * (1.0 - smoothstep(0.55, 0.9, dir.y));
          sky += vec3(0.05, 0.85, 0.72) * auroraBand * uStarIntensity * 0.26;
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
}

export function createOceanShaderMaterial(initial: TimePreset): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: initial.sunDirection.clone() },
      uSunColor: { value: initial.sunColor.clone() },
      uDeepColor: { value: initial.waterDeep.clone() },
      uShallowColor: { value: initial.waterShallow.clone() },
      uFoamColor: { value: initial.foamColor.clone() },
      uSkyHorizon: { value: initial.skyHorizon.clone() },
      uFogColor: { value: initial.fogColor.clone() },
      uFogDensity: { value: initial.fogDensity },
      uBioluminescence: { value: initial.bioluminescence },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vCrest;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        float x = worldPos.x;
        float z = worldPos.z;

        // Multi-directional Gerstner-inspired wave displacement
        float p1 = x * 0.09 + z * 0.05 + uTime * 1.35;
        float p2 = -x * 0.06 + z * 0.11 + uTime * 1.75;
        float p3 = x * 0.18 - z * 0.14 + uTime * 2.30;
        float p4 = x * 0.33 + z * 0.29 - uTime * 2.90;

        float h = sin(p1) * 0.32 + sin(p2) * 0.22 + sin(p3) * 0.11 + sin(p4) * 0.05;
        worldPos.x -= cos(p1) * 0.14 - cos(p2) * 0.08;
        worldPos.z -= cos(p1) * 0.08 + cos(p2) * 0.12;
        worldPos.y += h;

        // Analytical surface gradient for crisp specular sun glitter
        float dhdx = cos(p1) * 0.09 * 0.32 - cos(p2) * 0.06 * 0.22 + cos(p3) * 0.18 * 0.11 + cos(p4) * 0.33 * 0.05;
        float dhdz = cos(p1) * 0.05 * 0.32 + cos(p2) * 0.11 * 0.22 - cos(p3) * 0.14 * 0.11 + cos(p4) * 0.29 * 0.05;

        vNormal = normalize(vec3(-dhdx, 1.0, -dhdz));
        vWorldPos = worldPos.xyz;
        vCrest = h;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform vec3 uSkyHorizon;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uBioluminescence;

      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vCrest;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        // Micro-ripple normal perturbation
        float r1 = noise(vWorldPos.xz * 1.4 + vec2(uTime * 0.6, -uTime * 0.4));
        float r2 = noise(vWorldPos.xz * 2.9 - vec2(uTime * 0.8, uTime * 0.5));
        vec3 n = normalize(vNormal + vec3((r1 - 0.5) * 0.14, 0.0, (r2 - 0.5) * 0.14));

        // Distance from island center approximates bathymetry / shallow reef
        // Island center shifted around (-6, 0, -4), lagoon under boardwalk around (+24, 0, +8)
        float distMainIsland = length((vWorldPos.xz - vec2(-8.0, -4.0)) * vec2(0.85, 1.05));
        float shallowFactor = 1.0 - smoothstep(18.0, 56.0, distMainIsland);
        vec3 baseWater = mix(uDeepColor, uShallowColor, shallowFactor * 0.85 + smoothstep(0.1, 0.55, vCrest) * 0.25);

        // Fresnel sky reflection
        float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 4.0);
        vec3 color = mix(baseWater, uSkyHorizon * 0.9, fresnel * 0.58);

        // Sun specular glitter path
        vec3 halfVec = normalize(normalize(uSunDir) + viewDir);
        float spec = pow(max(dot(n, halfVec), 0.0), 180.0);
        float broadSpec = pow(max(dot(n, halfVec), 0.0), 24.0);
        color += uSunColor * (spec * 2.6 + broadSpec * 0.22);

        // Shoreline breaking surf & whitecaps on wave crests
        float shoreRing = smoothstep(29.0, 21.5, distMainIsland);
        float shoreWave = sin(distMainIsland * 1.6 - uTime * 3.2 + r1 * 2.5);
        float shoreFoam = shoreRing * smoothstep(0.25, 0.78, shoreWave + shoreRing * 0.45);
        float crestFoam = smoothstep(0.36, 0.58, vCrest + (r2 - 0.5) * 0.22);
        float totalFoam = clamp(shoreFoam + crestFoam * 0.75, 0.0, 1.0);

        vec3 activeFoam = mix(uFoamColor, vec3(0.12, 0.95, 1.0) * 1.6, uBioluminescence * 0.75);
        color = mix(color, activeFoam, totalFoam * 0.82);

        // Extra bioluminescent plankton shimmer along crests at night
        if (uBioluminescence > 0.01) {
          float plankton = smoothstep(0.18, 0.52, vCrest + r1 * 0.25) * uBioluminescence;
          color += vec3(0.04, 0.78, 0.98) * plankton * 0.55;
        }

        // Exponential distance fog matching scene fog
        float dist = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
        color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));

        gl_FragColor = vec4(color, 0.95);
      }
    `,
  });
}
