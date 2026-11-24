import * as THREE from 'three';
import {
  createOceanShaderMaterial,
  createSkyShaderMaterial,
  getOceanHeightCPU,
  TIME_PRESETS,
  TimePreset,
} from './shaders';

export interface JumpingFish {
  group: THREE.Group;
  body: THREE.Mesh;
  tail: THREE.Mesh;
  basePos: THREE.Vector3;
  arcDir: THREE.Vector3;
  phase: number;
  speed: number;
  jumpHeight: number;
  active: boolean;
  caughtCooldown: number;
  worldPos: THREE.Vector3;
  splashRing: THREE.Mesh;
}

interface PalmTreeAnim {
  crown: THREE.Group;
  phase: number;
}

interface GullAnim {
  group: THREE.Group;
  leftWing: THREE.Group;
  rightWing: THREE.Group;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  center: THREE.Vector2;
}

interface SailboatAnim {
  group: THREE.Group;
  baseX: number;
  baseZ: number;
  heading: number;
  driftPhase: number;
}

export class CoastalWorld {
  public readonly group = new THREE.Group();
  public readonly trackCurve: THREE.CatmullRomCurve3;
  public readonly trackLength: number;
  public readonly skyMaterial: THREE.ShaderMaterial;
  public readonly oceanMaterial: THREE.ShaderMaterial;
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly fishes: JumpingFish[] = [];
  public readonly lighthousePos = new THREE.Vector3(-25.5, 5.2, 8.5);

  private lighthouseBeaconGroup = new THREE.Group();
  private lighthouseSpot!: THREE.SpotLight;
  private lanternBulbs: THREE.MeshStandardMaterial[] = [];
  private lanternPointLights: THREE.PointLight[] = [];
  private palms: PalmTreeAnim[] = [];
  private gulls: GullAnim[] = [];
  private boats: SailboatAnim[] = [];
  private currentPreset: TimePreset = TIME_PRESETS.sunset;
  private targetPreset: TimePreset = TIME_PRESETS.sunset;

  constructor(scene: THREE.Scene, badgeTexture: THREE.Texture) {
    // 1. Closed-loop scenic Riviera + Overwater Lagoon Boardwalk spline
    const waypoints = [
      new THREE.Vector3(0, 1.35, -24),     // Start/Finish Village Promenade
      new THREE.Vector3(16, 1.05, -20),    // Descending stone terrace
      new THREE.Vector3(27, 0.35, -8),     // Entering Overwater Lagoon Boardwalk
      new THREE.Vector3(30, 0.32, 8),      // Mid Lagoon Pier (Fish Jumping Zone!)
      new THREE.Vector3(22, 0.45, 22),     // South Pier Curve
      new THREE.Vector3(6, 1.15, 26),      // Palm Cove Causeway
      new THREE.Vector3(-12, 1.85, 22),    // Cliffside Ascent
      new THREE.Vector3(-24, 2.45, 8),     // Lighthouse Overlook
      new THREE.Vector3(-26, 2.15, -9),    // Pine Ridge Sweep
      new THREE.Vector3(-15, 1.65, -21),   // Coastal Villa Terrace
    ];
    this.trackCurve = new THREE.CatmullRomCurve3(waypoints, true, 'catmullrom', 0.5);
    this.trackLength = this.trackCurve.getLength();

    // 2. Sky Dome & Ocean Shader Surfaces
    this.skyMaterial = createSkyShaderMaterial(this.currentPreset);
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(380, 48, 32), this.skyMaterial);
    this.group.add(skyDome);

    this.oceanMaterial = createOceanShaderMaterial(this.currentPreset);
    const oceanGeo = new THREE.PlaneGeometry(520, 520, 180, 180);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMesh = new THREE.Mesh(oceanGeo, this.oceanMaterial);
    oceanMesh.position.y = -1.65;
    this.group.add(oceanMesh);

    // 3. Scene Fog & Lighting
    scene.fog = new THREE.FogExp2(this.currentPreset.fogColor.getHex(), this.currentPreset.fogDensity);

    this.hemiLight = new THREE.HemisphereLight(0xffe6cc, 0x1e4d6b, this.currentPreset.ambientIntensity);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(
      this.currentPreset.sunColor.getHex(),
      this.currentPreset.sunIntensity
    );
    this.sunLight.position.copy(this.currentPreset.sunDirection).multiplyScalar(85);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 210;
    const d = 48;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    scene.add(this.sunLight);

    // 4. Build Sculpted Island Terrain, Cliffs & Sandy Cove
    this.buildIslandTerrain();

    // 5. Build Roadway, Overwater Timber Boardwalk, Wrought-Iron Railings & Lanterns
    this.buildTrackAndBoardwalk(badgeTexture);

    // 6. Build Headland Lighthouse & Mediterranean Villas
    this.buildLighthouseAndVillage();

    // 7. Build Swaying Coconut Palms, Umbrella Pines & Coastal Rocks
    this.buildFloraAndRocks();

    // 8. Build Dynamic Wildlife (Jumping Silver Sardines, Soaring Gulls, Sailboats)
    this.buildJumpingFishes();
    this.buildSeagulls();
    this.buildSailboats();

    scene.add(this.group);
  }

  public setTimePreset(id: TimePreset['id']): void {
    this.targetPreset = TIME_PRESETS[id];
  }

  /** Trigger an immediate celebratory school of fish leaping around a track parameter `u` */
  public triggerFishFrenzy(centerPos: THREE.Vector3): void {
    for (let i = 0; i < this.fishes.length; i++) {
      const f = this.fishes[i];
      if (i < 5) {
        const angle = (i / 5) * Math.PI * 2;
        f.basePos.set(
          centerPos.x + Math.cos(angle) * 2.2,
          centerPos.y + 0.15,
          centerPos.z + Math.sin(angle) * 2.2
        );
        f.caughtCooldown = 0;
        f.active = true;
        f.phase = (i * 0.18) % 1.0;
      }
    }
  }

  private buildIslandTerrain(): void {
    // Layered sandy beach + lush emerald hillside shifted toward (-8, 0, -2) so (+27, z) is open turquoise lagoon!
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xeed2a4,
      roughness: 0.88,
      metalness: 0.02,
    });
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x4f8a4c,
      roughness: 0.82,
    });
    const cliffMat = new THREE.MeshStandardMaterial({
      color: 0x9b8673,
      roughness: 0.9,
      flatShading: true,
    });

    // Main sandy shoal
    const shoalGeo = new THREE.CylinderGeometry(24, 34, 2.8, 48, 3);
    const posAttr = shoalGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      const ang = Math.atan2(vz, vx);
      const deform = 1 + 0.16 * Math.sin(ang * 3 + 0.7) + 0.09 * Math.cos(ang * 5);
      posAttr.setX(i, vx * deform * 1.05);
      posAttr.setZ(i, vz * deform * 1.12);
      if (vy > 0) {
        posAttr.setY(i, vy + Math.sin(vx * 0.15) * 0.25);
      }
    }
    shoalGeo.computeVertexNormals();
    const shoal = new THREE.Mesh(shoalGeo, sandMat);
    shoal.position.set(-8, -1.55, -1);
    shoal.receiveShadow = true;
    this.group.add(shoal);

    // Grassy interior plateau
    const hillGeo = new THREE.CylinderGeometry(16, 23.5, 3.2, 40, 2);
    const hPos = hillGeo.attributes.position;
    for (let i = 0; i < hPos.count; i++) {
      const vx = hPos.getX(i);
      const vy = hPos.getY(i);
      const vz = hPos.getZ(i);
      const ang = Math.atan2(vz, vx);
      const deform = 1 + 0.14 * Math.cos(ang * 4 - 0.5);
      hPos.setX(i, vx * deform);
      hPos.setZ(i, vz * deform * 1.1);
      if (vy > 0) {
        const dist = Math.hypot(vx, vz);
        hPos.setY(i, vy + Math.max(0, 16 - dist) * 0.18);
      }
    }
    hillGeo.computeVertexNormals();
    const hill = new THREE.Mesh(hillGeo, grassMat);
    hill.position.set(-9.5, -0.35, -1.5);
    hill.receiveShadow = true;
    hill.castShadow = true;
    this.group.add(hill);

    // Rocky headland mounds under the lighthouse & northern ridge
    const cliffSpots = [
      { x: -24.5, y: 1.4, z: 8.5, rx: 6.5, ry: 4.2, rz: 6.5 },
      { x: -19.0, y: 1.8, z: -9.5, rx: 6.2, ry: 3.8, rz: 5.8 },
      { x: -8.0, y: 2.2, z: 3.0, rx: 7.5, ry: 4.6, rz: 7.0 },
      { x: -11.0, y: 1.5, z: -13.0, rx: 5.5, ry: 3.1, rz: 5.0 },
    ];
    for (const c of cliffSpots) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), cliffMat);
      rock.position.set(c.x, c.y, c.z);
      rock.scale.set(c.rx, c.ry, c.rz);
      rock.rotation.set(0.2, c.x * 0.3, 0.1);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.group.add(rock);
    }
  }

  private buildTrackAndBoardwalk(badgeTexture: THREE.Texture): void {
    const samples = 260;
    const roadHalfWidth = 1.95;

    // Build custom ribbon geometry along trackCurve
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const up = new THREE.Vector3(0, 1, 0);
    const stoneCol = new THREE.Color(0xdcc39f);
    const plankColA = new THREE.Color(0x9f6b3e);
    const plankColB = new THREE.Color(0x88572f);

    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const pt = this.trackCurve.getPointAt(u % 1);
      const tan = this.trackCurve.getTangentAt(u % 1).normalize();
      const side = new THREE.Vector3().crossVectors(up, tan).normalize();

      const left = pt.clone().addScaledVector(side, roadHalfWidth);
      const right = pt.clone().addScaledVector(side, -roadHalfWidth);

      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, u * 60, 1, u * 60);

      // Overwater lagoon boardwalk section is roughly u in [0.16, 0.48]
      const isBoardwalk = pt.x > 13.5;
      const c = isBoardwalk ? (i % 2 === 0 ? plankColA : plankColB) : stoneCol;
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);

      if (i < samples) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    roadGeo.setIndex(indices);

    const roadMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.78,
      metalness: 0.05,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.castShadow = true;
    this.group.add(roadMesh);

    // Road deck thickness / stone curb skirt & overwater wooden pilings + wrought-iron railings
    const pilingMat = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.9 });
    const stonePostMat = new THREE.MeshStandardMaterial({ color: 0xc9b08f, roughness: 0.85 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.7, roughness: 0.35 });
    const pilingGeo = new THREE.CylinderGeometry(0.16, 0.19, 3.6, 8);
    const postGeo = new THREE.BoxGeometry(0.28, 0.92, 0.28);

    const postStep = 4;
    for (let i = 0; i < samples; i += postStep) {
      const u = i / samples;
      const pt = this.trackCurve.getPointAt(u);
      const tan = this.trackCurve.getTangentAt(u).normalize();
      const side = new THREE.Vector3().crossVectors(up, tan).normalize();
      const isBoardwalk = pt.x > 13.5;

      // Support pilings beneath road where elevated over water or shore
      if (isBoardwalk || pt.y < 1.3) {
        for (const s of [-1.45, 1.45]) {
          const pile = new THREE.Mesh(pilingGeo, pilingMat);
          pile.position.copy(pt).addScaledVector(side, s);
          pile.position.y = pt.y - 1.82;
          pile.castShadow = true;
          this.group.add(pile);
        }
      } else {
        // Under-road stone foundation block on cliffside
        const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.2, 3.2), stonePostMat);
        baseBlock.position.copy(pt);
        baseBlock.position.y -= 1.12;
        baseBlock.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
        baseBlock.receiveShadow = true;
        this.group.add(baseBlock);
      }

      // Outer scenic railing posts + top rail (matching og_banner coastal balustrade!)
      const outerSign = -1; // Outer seaward edge
      const railPos = pt.clone().addScaledVector(side, outerSign * (roadHalfWidth + 0.12));
      const post = new THREE.Mesh(postGeo, isBoardwalk ? pilingMat : stonePostMat);
      post.position.copy(railPos);
      post.position.y += 0.42;
      post.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      post.castShadow = true;
      this.group.add(post);

      // Connect wrought-iron rail bar to next post
      const nextU = ((i + postStep) % samples) / samples;
      const nextPt = this.trackCurve.getPointAt(nextU);
      const nextTan = this.trackCurve.getTangentAt(nextU).normalize();
      const nextSide = new THREE.Vector3().crossVectors(up, nextTan).normalize();
      const nextRailPos = nextPt.clone().addScaledVector(nextSide, outerSign * (roadHalfWidth + 0.12));
      const span = nextRailPos.clone().sub(railPos);
      const spanLen = span.length();
      if (spanLen < 6.0) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, spanLen), ironMat);
        bar.position.copy(railPos).add(nextRailPos).multiplyScalar(0.5);
        bar.position.y += 0.78;
        bar.lookAt(nextRailPos.x, nextRailPos.y + 0.78, nextRailPos.z);
        this.group.add(bar);
      }

      // Vintage coastal brass street lanterns every 24 samples
      if (i % 24 === 0) {
        const lampRoot = new THREE.Group();
        lampRoot.position.copy(pt).addScaledVector(side, roadHalfWidth + 0.18);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 2.7, 8), ironMat);
        pole.position.y = 1.35;
        pole.castShadow = true;
        lampRoot.add(pole);

        const bulbMat = new THREE.MeshStandardMaterial({
          color: 0xffe4a0,
          emissive: 0xffaa33,
          emissiveIntensity: this.currentPreset.lanternGlow,
          roughness: 0.2,
        });
        this.lanternBulbs.push(bulbMat);

        const lanternHead = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 1), bulbMat);
        lanternHead.position.y = 2.82;
        lampRoot.add(lanternHead);

        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.2, 8), ironMat);
        cap.position.y = 3.02;
        lampRoot.add(cap);

        if (this.lanternPointLights.length < 5) {
          const pLight = new THREE.PointLight(0xffa94d, this.currentPreset.lanternGlow * 2.2, 14, 1.8);
          pLight.position.y = 2.8;
          lampRoot.add(pLight);
          this.lanternPointLights.push(pLight);
        }
        this.group.add(lampRoot);
      }
    }

    // Start / Finish Grand Tour Archway with AI-generated PELICAN VELO Club Crest Medallions!
    const startPt = this.trackCurve.getPointAt(0);
    const startTan = this.trackCurve.getTangentAt(0).normalize();
    const archGroup = new THREE.Group();
    archGroup.position.copy(startPt);
    archGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), startTan);

    const timberMat = new THREE.MeshStandardMaterial({ color: 0x6d4527, roughness: 0.75 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xe0b354, metalness: 0.85, roughness: 0.22 });

    for (const sx of [-2.25, 2.25]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 4.4, 12), timberMat);
      pillar.position.set(sx, 2.2, 0);
      pillar.castShadow = true;
      archGroup.add(pillar);
    }
    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.55, 0.28), timberMat);
    crossBeam.position.set(0, 4.25, 0);
    crossBeam.castShadow = true;
    archGroup.add(crossBeam);

    // Circular Brass Crest Medallion front & back using crest_badge.jpg
    const badgeGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.14, 32);
    badgeGeo.rotateX(Math.PI / 2);
    const crestFaceMat = new THREE.MeshStandardMaterial({
      map: badgeTexture,
      roughness: 0.28,
      metalness: 0.35,
    });
    const badgeMesh = new THREE.Mesh(badgeGeo, [brassMat, crestFaceMat, crestFaceMat]);
    badgeMesh.position.set(0, 4.55, 0);
    badgeMesh.castShadow = true;
    archGroup.add(badgeMesh);

    this.group.add(archGroup);
  }

  private buildLighthouseAndVillage(): void {
    // 1. Classic Red-and-White Riviera Headland Lighthouse
    const lhGroup = new THREE.Group();
    lhGroup.position.set(-25.5, 2.6, 8.5);

    const whiteWall = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.72 });
    const redStripe = new THREE.MeshStandardMaterial({ color: 0xd9483b, roughness: 0.65 });
    const terraRoof = new THREE.MeshStandardMaterial({ color: 0xd4653b, roughness: 0.78 });
    const darkBrass = new THREE.MeshStandardMaterial({ color: 0x2c353d, metalness: 0.75, roughness: 0.3 });

    // Keeper's cottage at base
    const cottage = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 3.4), whiteWall);
    cottage.position.set(2.2, 1.1, -0.6);
    cottage.castShadow = true;
    cottage.receiveShadow = true;
    lhGroup.add(cottage);

    const cottageRoof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.35, 4), terraRoof);
    cottageRoof.rotation.y = Math.PI / 4;
    cottageRoof.position.set(2.2, 2.95, -0.6);
    cottageRoof.castShadow = true;
    lhGroup.add(cottageRoof);

    // Striped cylindrical tower tiers
    const tiers = [
      { rBot: 1.65, rTop: 1.48, h: 2.2, y: 1.1, mat: whiteWall },
      { rBot: 1.48, rTop: 1.32, h: 2.1, y: 3.25, mat: redStripe },
      { rBot: 1.32, rTop: 1.16, h: 2.1, y: 5.35, mat: whiteWall },
      { rBot: 1.16, rTop: 1.05, h: 1.8, y: 7.3, mat: redStripe },
    ];
    for (const t of tiers) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(t.rTop, t.rBot, t.h, 20), t.mat);
      seg.position.y = t.y;
      seg.castShadow = true;
      seg.receiveShadow = true;
      lhGroup.add(seg);
    }

    // Balcony gallery + glass lantern room
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.22, 0.35, 20), darkBrass);
    gallery.position.y = 8.35;
    lhGroup.add(gallery);

    const lanternGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.92, 0.92, 1.45, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfff3b0,
        emissive: 0xffcc44,
        emissiveIntensity: 1.6,
        transparent: true,
        opacity: 0.9,
      })
    );
    lanternGlass.position.y = 9.2;
    lhGroup.add(lanternGlass);

    const dome = new THREE.Mesh(new THREE.ConeGeometry(1.12, 1.2, 16), redStripe);
    dome.position.y = 10.45;
    lhGroup.add(dome);

    // Rotating Dual Volumetric Beacon Cones
    this.lighthouseBeaconGroup.position.y = 9.2;
    const beamGeo = new THREE.ConeGeometry(3.4, 28, 20, 1, true);
    beamGeo.translate(0, -14, 0);
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe588,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beam1 = new THREE.Mesh(beamGeo, beamMat);
    const beam2 = new THREE.Mesh(beamGeo, beamMat);
    beam2.rotation.y = Math.PI;
    this.lighthouseBeaconGroup.add(beam1, beam2);

    this.lighthouseSpot = new THREE.SpotLight(0xffe082, 3.5, 65, Math.PI / 7, 0.6, 1.2);
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, -3, 20);
    this.lighthouseBeaconGroup.add(this.lighthouseSpot, spotTarget);
    this.lighthouseSpot.target = spotTarget;

    lhGroup.add(this.lighthouseBeaconGroup);
    this.group.add(lhGroup);

    // 2. Charming Mediterranean Whitewashed Villas on the Hillside (echoing og_banner.jpg!)
    const villas = [
      { x: -11.5, y: 3.1, z: -12.5, rot: 0.4, s: 1.0 },
      { x: -6.2, y: 3.8, z: -8.0, rot: -0.3, s: 1.15 },
      { x: -5.5, y: 3.6, z: 5.5, rot: 0.8, s: 0.95 },
    ];
    const shutterMat = new THREE.MeshStandardMaterial({ color: 0x1e8896, roughness: 0.5 });
    for (const v of villas) {
      const vg = new THREE.Group();
      vg.position.set(v.x, v.y, v.z);
      vg.rotation.y = v.rot;
      vg.scale.setScalar(v.s);

      const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.3, 2.6), whiteWall);
      body.position.y = 1.15;
      body.castShadow = true;
      body.receiveShadow = true;
      vg.add(body);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.55, 1.15, 4), terraRoof);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 2.85;
      roof.castShadow = true;
      vg.add(roof);

      // Turquoise shutters
      for (const wx of [-0.75, 0.75]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.65, 0.08), shutterMat);
        win.position.set(wx, 1.35, 1.31);
        vg.add(win);
      }
      this.group.add(vg);
    }
  }

  private buildFloraAndRocks(): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7b5536, roughness: 0.88 });
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0x3b8c42,
      roughness: 0.65,
      side: THREE.DoubleSide,
    });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x2d6a36, roughness: 0.78 });

    const palmCoords = [
      { x: 5.5, y: 0.4, z: -16.5, h: 5.4 },
      { x: 12.5, y: 0.1, z: -13.0, h: 4.9 },
      { x: 11.0, y: 0.2, z: 16.5, h: 5.6 },
      { x: 1.5, y: 0.8, z: 18.5, h: 5.1 },
      { x: -16.0, y: 1.4, z: 16.0, h: 4.8 },
      { x: -3.5, y: 1.6, z: -17.5, h: 5.2 },
    ];

    for (let idx = 0; idx < palmCoords.length; idx++) {
      const p = palmCoords[idx];
      const palmRoot = new THREE.Group();
      palmRoot.position.set(p.x, p.y, p.z);

      // Curved segmented coconut palm trunk
      const segs = 6;
      let curY = 0;
      let curX = 0;
      for (let s = 0; s < segs; s++) {
        const segH = p.h / segs;
        const r = THREE.MathUtils.lerp(0.24, 0.13, s / segs);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, segH * 1.08, 8), trunkMat);
        seg.position.set(curX, curY + segH * 0.5, 0);
        seg.rotation.z = -s * 0.045;
        seg.castShadow = true;
        palmRoot.add(seg);
        curY += segH * 0.96;
        curX += Math.sin(s * 0.045) * segH;
      }

      const crown = new THREE.Group();
      crown.position.set(curX, curY, 0);
      for (let f = 0; f < 7; f++) {
        const frondPivot = new THREE.Group();
        frondPivot.rotation.y = (f / 7) * Math.PI * 2;
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 5), frondMat);
        blade.scale.set(1, 1, 0.18);
        blade.rotation.z = -Math.PI * 0.36;
        blade.position.set(1.15, -0.15, 0);
        blade.castShadow = true;
        frondPivot.add(blade);
        crown.add(frondPivot);
      }
      palmRoot.add(crown);
      palmRoot.rotation.y = idx * 1.1;
      this.group.add(palmRoot);
      this.palms.push({ crown, phase: idx * 0.9 });
    }

    // Mediterranean Umbrella Pines along the highland ridge
    const pineCoords = [
      { x: -19.5, y: 2.3, z: -3.5, h: 5.8 },
      { x: -16.5, y: 2.5, z: -13.5, h: 5.2 },
      { x: -9.5, y: 3.9, z: -2.0, h: 6.0 },
      { x: -13.0, y: 3.1, z: 10.5, h: 5.4 },
    ];
    for (const pc of pineCoords) {
      const pg = new THREE.Group();
      pg.position.set(pc.x, pc.y, pc.z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, pc.h, 8), trunkMat);
      trunk.position.y = pc.h * 0.5;
      trunk.castShadow = true;
      pg.add(trunk);

      const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.3, 12, 10), pineMat);
      canopy.scale.set(1.25, 0.48, 1.25);
      canopy.position.y = pc.h;
      canopy.castShadow = true;
      pg.add(canopy);
      this.group.add(pg);
    }
  }

  private buildJumpingFishes(): void {
    const fishMat = new THREE.MeshStandardMaterial({
      color: 0xdbe9f6,
      metalness: 0.88,
      roughness: 0.16,
    });
    const splashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });

    // Place 8 jumping silver sardines along the overwater lagoon & coastal curve
    const uPositions = [0.22, 0.27, 0.32, 0.36, 0.41, 0.46, 0.56, 0.88];
    for (let i = 0; i < uPositions.length; i++) {
      const u = uPositions[i];
      const pt = this.trackCurve.getPointAt(u);
      const tan = this.trackCurve.getTangentAt(u).normalize();
      const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tan).normalize();

      const fishGroup = new THREE.Group();
      const bodyGeo = new THREE.SphereGeometry(0.14, 12, 8);
      bodyGeo.scale(0.65, 0.85, 2.3);
      const body = new THREE.Mesh(bodyGeo, fishMat);
      body.castShadow = true;
      fishGroup.add(body);

      const tailGeo = new THREE.ConeGeometry(0.16, 0.28, 4);
      tailGeo.rotateX(Math.PI / 2);
      tailGeo.scale(0.35, 1.0, 1.0);
      const tail = new THREE.Mesh(tailGeo, fishMat);
      tail.position.z = -0.34;
      fishGroup.add(tail);

      const splashRing = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.38, 20), splashMat.clone());
      splashRing.rotation.x = -Math.PI / 2;
      splashRing.visible = false;
      this.group.add(splashRing);

      this.group.add(fishGroup);

      this.fishes.push({
        group: fishGroup,
        body,
        tail,
        basePos: pt.clone().addScaledVector(side, (i % 2 === 0 ? 1 : -1) * 0.45),
        arcDir: side.clone().multiplyScalar(i % 2 === 0 ? -1.8 : 1.8),
        phase: (i * 0.17) % 1.0,
        speed: 0.42 + (i % 3) * 0.08,
        jumpHeight: 1.55 + (i % 2) * 0.35,
        active: true,
        caughtCooldown: 0,
        worldPos: new THREE.Vector3(),
        splashRing,
      });
    }
  }

  private buildSeagulls(): void {
    const gullMat = new THREE.MeshStandardMaterial({ color: 0xfbfdff, roughness: 0.5 });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.6 });

    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 8), gullMat);
      body.rotation.x = Math.PI / 2;
      g.add(body);

      const lw = new THREE.Group();
      const lwMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.2), gullMat);
      lwMesh.position.x = -0.31;
      const lwTip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.032, 0.16), tipMat);
      lwTip.position.x = -0.68;
      lw.add(lwMesh, lwTip);

      const rw = new THREE.Group();
      const rwMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.2), gullMat);
      rwMesh.position.x = 0.31;
      const rwTip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.032, 0.16), tipMat);
      rwTip.position.x = 0.68;
      rw.add(rwMesh, rwTip);

      g.add(lw, rw);
      this.group.add(g);

      this.gulls.push({
        group: g,
        leftWing: lw,
        rightWing: rw,
        radius: 16 + i * 4.2,
        height: 9.5 + (i % 3) * 2.8,
        speed: 0.26 + (i % 4) * 0.05,
        phase: i * 0.95,
        center: new THREE.Vector2(4, 0),
      });
    }
  }

  private buildSailboats(): void {
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xf5efe6, roughness: 0.45 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b6d80, roughness: 0.4 });
    const sailMat = new THREE.MeshStandardMaterial({
      color: 0xfff6e5,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });

    const boatSpecs = [
      { x: 46, z: -12, heading: 0.45 },
      { x: 38, z: 34, heading: -0.85 },
    ];

    for (let i = 0; i < boatSpecs.length; i++) {
      const b = boatSpecs[i];
      const bg = new THREE.Group();

      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.55, 0.9, 12), hullMat);
      hull.scale.set(1.0, 1.0, 2.9);
      hull.position.y = 0.25;
      hull.castShadow = true;
      bg.add(hull);

      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.85, 0.22, 12), trimMat);
      stripe.scale.set(1.0, 1.0, 2.92);
      stripe.position.y = 0.45;
      bg.add(stripe);

      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 6.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
      );
      mast.position.y = 3.3;
      bg.add(mast);

      // Triangular mainsail
      const sailShape = new THREE.Shape();
      sailShape.moveTo(0, 0);
      sailShape.lineTo(0, 5.1);
      sailShape.lineTo(-2.35, 0.35);
      sailShape.closePath();
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), sailMat);
      sail.rotation.y = Math.PI / 2;
      sail.position.set(0, 1.0, -0.1);
      sail.castShadow = true;
      bg.add(sail);

      bg.rotation.y = b.heading;
      this.group.add(bg);
      this.boats.push({
        group: bg,
        baseX: b.x,
        baseZ: b.z,
        heading: b.heading,
        driftPhase: i * 2.1,
      });
    }
  }

  public update(dt: number, elapsed: number, scene: THREE.Scene): number {
    // Smoothly blend time-of-day uniforms & lights
    const blend = Math.min(1, dt * 2.4);
    const skyU = this.skyMaterial.uniforms;
    const seaU = this.oceanMaterial.uniforms;

    skyU.uTime.value = elapsed;
    seaU.uTime.value = elapsed;

    skyU.uZenithColor.value.lerp(this.targetPreset.skyZenith, blend);
    skyU.uHorizonColor.value.lerp(this.targetPreset.skyHorizon, blend);
    skyU.uSunColor.value.lerp(this.targetPreset.sunColor, blend);
    skyU.uSunDir.value.lerp(this.targetPreset.sunDirection, blend).normalize();
    skyU.uCloudTint.value.lerp(this.targetPreset.cloudTint, blend);
    skyU.uStarIntensity.value = THREE.MathUtils.lerp(
      skyU.uStarIntensity.value,
      this.targetPreset.starIntensity,
      blend
    );

    seaU.uSunDir.value.copy(skyU.uSunDir.value);
    seaU.uSunColor.value.copy(skyU.uSunColor.value);
    seaU.uDeepColor.value.lerp(this.targetPreset.waterDeep, blend);
    seaU.uShallowColor.value.lerp(this.targetPreset.waterShallow, blend);
    seaU.uFoamColor.value.lerp(this.targetPreset.foamColor, blend);
    seaU.uSkyHorizon.value.copy(skyU.uHorizonColor.value);
    seaU.uFogColor.value.lerp(this.targetPreset.fogColor, blend);
    seaU.uFogDensity.value = THREE.MathUtils.lerp(
      seaU.uFogDensity.value,
      this.targetPreset.fogDensity,
      blend
    );
    seaU.uBioluminescence.value = THREE.MathUtils.lerp(
      seaU.uBioluminescence.value,
      this.targetPreset.bioluminescence,
      blend
    );

    this.sunLight.color.copy(skyU.uSunColor.value);
    this.sunLight.intensity = THREE.MathUtils.lerp(
      this.sunLight.intensity,
      this.targetPreset.sunIntensity,
      blend
    );
    this.sunLight.position.copy(skyU.uSunDir.value).multiplyScalar(85);
    this.hemiLight.intensity = THREE.MathUtils.lerp(
      this.hemiLight.intensity,
      this.targetPreset.ambientIntensity,
      blend
    );

    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(seaU.uFogColor.value);
      scene.fog.density = seaU.uFogDensity.value;
    }

    // Lantern & Lighthouse brightness
    const lanternTarget = this.targetPreset.lanternGlow;
    for (const mat of this.lanternBulbs) {
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, lanternTarget, blend);
    }
    for (const pl of this.lanternPointLights) {
      pl.intensity = THREE.MathUtils.lerp(pl.intensity, lanternTarget * 2.2, blend);
    }
    this.lighthouseBeaconGroup.rotation.y = elapsed * 0.85;
    this.lighthouseSpot.intensity = 1.5 + lanternTarget * 3.2;

    // Swaying coconut palms
    for (const p of this.palms) {
      p.crown.rotation.z = Math.sin(elapsed * 1.4 + p.phase) * 0.055;
      p.crown.rotation.x = Math.cos(elapsed * 1.1 + p.phase) * 0.04;
    }

    // Jumping silver sardines along parabolic trajectories
    for (const f of this.fishes) {
      if (f.caughtCooldown > 0) {
        f.caughtCooldown -= dt;
        f.group.visible = false;
        f.splashRing.visible = false;
        f.active = false;
        if (f.caughtCooldown <= 0) {
          f.active = true;
          f.phase = 0;
        }
        continue;
      }

      f.phase = (f.phase + dt * f.speed) % 1.0;
      // Active airborne window: phase in [0.15, 0.75]
      if (f.phase >= 0.15 && f.phase <= 0.75) {
        const s = (f.phase - 0.15) / 0.6; // 0..1 across jump
        const arcY = 4 * s * (1 - s) * f.jumpHeight;
        f.group.visible = true;
        f.active = true;

        f.worldPos
          .copy(f.basePos)
          .addScaledVector(f.arcDir, s - 0.5)
          .setY(f.basePos.y - 0.85 + arcY + 0.85);
        f.group.position.copy(f.worldPos);

        // Orient fish tangent to parabolic flight + lively tail wag
        const vy = 4 * (1 - 2 * s) * f.jumpHeight;
        const lookPt = f.worldPos.clone().add(f.arcDir).setY(f.worldPos.y + vy * 0.45);
        f.group.lookAt(lookPt);
        f.tail.rotation.y = Math.sin(elapsed * 28 + f.phase * 10) * 0.45;

        // Water splash ring at entry/exit
        if (s < 0.16 || s > 0.84) {
          const rs = s < 0.16 ? s / 0.16 : (1 - s) / 0.16;
          f.splashRing.visible = true;
          f.splashRing.position.set(f.worldPos.x, getOceanHeightCPU(f.worldPos.x, f.worldPos.z, elapsed) + 0.06, f.worldPos.z);
          f.splashRing.scale.setScalar(0.6 + (1 - rs) * 1.8);
          (f.splashRing.material as THREE.MeshBasicMaterial).opacity = rs * 0.65;
        } else {
          f.splashRing.visible = false;
        }
      } else {
        f.group.visible = false;
        f.splashRing.visible = false;
        f.active = false;
      }
    }

    // Soaring coastal gulls
    for (const g of this.gulls) {
      const ang = elapsed * g.speed + g.phase;
      const gx = g.center.x + Math.cos(ang) * g.radius;
      const gz = g.center.y + Math.sin(ang) * g.radius * 0.82;
      const gy = g.height + Math.sin(elapsed * 1.2 + g.phase) * 0.85;
      g.group.position.set(gx, gy, gz);
      g.group.rotation.y = -ang + Math.PI;
      g.group.rotation.z = 0.22; // Gentle bank into turn
      const flap = Math.sin(elapsed * 6.5 + g.phase * 2) * 0.42;
      g.leftWing.rotation.z = flap;
      g.rightWing.rotation.z = -flap;
    }

    // Sailboats bobbing & pitching on exact Gerstner wave height
    for (const b of this.boats) {
      const bx = b.baseX + Math.sin(elapsed * 0.25 + b.driftPhase) * 2.2;
      const bz = b.baseZ + Math.cos(elapsed * 0.2 + b.driftPhase) * 2.2;
      const waveY = getOceanHeightCPU(bx, bz, elapsed);
      const waveAhead = getOceanHeightCPU(bx + 0.8, bz + 0.8, elapsed);
      b.group.position.set(bx, waveY + 0.08, bz);
      b.group.rotation.x = (waveAhead - waveY) * 0.35;
      b.group.rotation.z = Math.sin(elapsed * 1.4 + b.driftPhase) * 0.08;
    }

    return this.targetPreset.bloomStrength;
  }
}
