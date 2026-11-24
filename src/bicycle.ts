import * as THREE from 'three';

interface ChainLinkNode {
  mesh: THREE.Mesh;
  u: number;
}

export class RivieraBicycle {
  public readonly root = new THREE.Group();
  /** Pivoted at rear tire contact patch (0, 0, -0.56) for authentic wheelies */
  public readonly wheelieGroup = new THREE.Group();

  public readonly leftPedalTarget = new THREE.Object3D();
  public readonly rightPedalTarget = new THREE.Object3D();
  public readonly leftGripTarget = new THREE.Object3D();
  public readonly rightGripTarget = new THREE.Object3D();
  public readonly headlampLight: THREE.SpotLight;

  public crankAngle = 0;
  public wheelAngle = 0;
  public steerAngle = 0;

  private frontWheelSpin = new THREE.Group();
  private rearWheelSpin = new THREE.Group();
  private steerPivot = new THREE.Group();
  private crankGroup = new THREE.Group();
  private leftPedalBody = new THREE.Group();
  private rightPedalBody = new THREE.Group();
  private bellDome!: THREE.Mesh;
  private bellStrikeTimer = 0;
  private headlampBeam!: THREE.Mesh;
  private chainLinks: ChainLinkNode[] = [];
  private chainCurve!: THREE.CatmullRomCurve3;
  private leftPannier!: THREE.Group;
  private rightPannier!: THREE.Group;

  public readonly wheelRadius = 0.36;

  constructor(badgeTexture: THREE.Texture) {
    // Wheelie pivot at rear tire ground patch
    this.wheelieGroup.position.set(0, 0, -0.56);
    this.root.add(this.wheelieGroup);

    // Everything inside contentOffset is authored in standard bike coords where origin (0,0,0) is ground center
    const bikeContent = new THREE.Group();
    bikeContent.position.set(0, 0, 0.56);
    this.wheelieGroup.add(bikeContent);

    // Shared luxury materials
    const framePaint = new THREE.MeshPhysicalMaterial({
      color: 0x10a3a2,
      metalness: 0.58,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });
    const lugGold = new THREE.MeshStandardMaterial({
      color: 0xe6be68,
      metalness: 0.88,
      roughness: 0.2,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.94,
      roughness: 0.12,
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x8b4c24,
      roughness: 0.62,
      metalness: 0.08,
    });
    const darkChainMat = new THREE.MeshStandardMaterial({
      color: 0x2c323a,
      metalness: 0.82,
      roughness: 0.32,
    });

    // Helper to create cylindrical frame tubes between 3D points
    const addTube = (
      parent: THREE.Object3D,
      p1: THREE.Vector3,
      p2: THREE.Vector3,
      r: number,
      mat: THREE.Material
    ) => {
      const diff = new THREE.Vector3().subVectors(p2, p1);
      const len = diff.length();
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
      mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Key frame joint coordinates (+Z forward, +Y up, +X rider-left)
    const rearAxle = new THREE.Vector3(0, 0.36, -0.56);
    const bbPos = new THREE.Vector3(0, 0.31, -0.08);
    const seatCluster = new THREE.Vector3(0, 0.77, -0.23);
    const headBot = new THREE.Vector3(0, 0.67, 0.43);
    const headTop = new THREE.Vector3(0, 0.84, 0.38);

    // Classic Diamond Lugged Steel Frame
    addTube(bikeContent, bbPos, seatCluster, 0.022, framePaint); // Seat tube
    addTube(bikeContent, bbPos, headBot, 0.024, framePaint);     // Down tube
    addTube(bikeContent, seatCluster, headTop, 0.021, framePaint); // Top tube
    addTube(bikeContent, headBot, headTop, 0.027, framePaint);   // Head tube

    // Brass decorative lugs
    for (const p of [seatCluster, headBot, headTop, bbPos]) {
      const lug = new THREE.Mesh(new THREE.SphereGeometry(0.031, 14, 12), lugGold);
      lug.position.copy(p);
      bikeContent.add(lug);
    }

    // AI-Generated PELICAN VELO Club Crest Badge on the front of the head tube!
    const headMid = headBot.clone().add(headTop).multiplyScalar(0.5);
    const crestPlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.012, 24),
      [
        lugGold,
        new THREE.MeshStandardMaterial({ map: badgeTexture, roughness: 0.25, metalness: 0.3 }),
        lugGold,
      ]
    );
    crestPlate.rotation.x = Math.PI / 2 - 0.25;
    crestPlate.position.set(0, headMid.y, headMid.z + 0.028);
    bikeContent.add(crestPlate);

    // Dual chainstays & seatstays around rear wheel
    for (const sx of [-0.068, 0.068]) {
      const dropOut = new THREE.Vector3(sx, rearAxle.y, rearAxle.z);
      addTube(bikeContent, new THREE.Vector3(sx * 0.5, bbPos.y, bbPos.z), dropOut, 0.014, framePaint);
      addTube(
        bikeContent,
        new THREE.Vector3(sx * 0.35, seatCluster.y - 0.02, seatCluster.z),
        dropOut,
        0.013,
        framePaint
      );
    }

    // Chrome Seatpost + Sprung Brooks Honey-Leather Saddle
    addTube(
      bikeContent,
      seatCluster,
      new THREE.Vector3(0, 0.86, -0.26),
      0.016,
      chromeMat
    );
    const saddleGroup = new THREE.Group();
    saddleGroup.position.set(0, 0.87, -0.26);
    const saddleSeat = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), leatherMat);
    saddleSeat.scale.set(0.85, 0.32, 1.45);
    saddleSeat.castShadow = true;
    saddleGroup.add(saddleSeat);
    for (const sx of [-0.055, 0.055]) {
      const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.045, 10), chromeMat);
      spring.position.set(sx, -0.035, -0.06);
      saddleGroup.add(spring);
    }
    bikeContent.add(saddleGroup);

    // Rear Fender, Chrome Rear Rack, Ruby Tail-Light & Dual Stitched Leather Pannier Bags!
    const rearFender = new THREE.Mesh(
      new THREE.TorusGeometry(this.wheelRadius + 0.028, 0.026, 10, 28, Math.PI * 0.92),
      framePaint
    );
    rearFender.rotation.y = Math.PI / 2;
    rearFender.rotation.z = Math.PI * 0.05;
    rearFender.position.copy(rearAxle);
    bikeContent.add(rearFender);

    const tailLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0xff1744,
        emissive: 0xff1744,
        emissiveIntensity: 1.8,
      })
    );
    tailLight.position.set(0, 0.56, -0.94);
    bikeContent.add(tailLight);

    // Chrome Rear Rack + Leather Vintage Panniers (matching og_banner.jpg!)
    const rackTop = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.016, 0.38), chromeMat);
    rackTop.position.set(0, 0.76, -0.57);
    bikeContent.add(rackTop);
    for (const sx of [-0.075, 0.075]) {
      addTube(
        bikeContent,
        new THREE.Vector3(sx, rearAxle.y + 0.02, rearAxle.z),
        new THREE.Vector3(sx, 0.76, -0.58),
        0.008,
        chromeMat
      );
    }

    const createPannier = (sideSign: number) => {
      const pGroup = new THREE.Group();
      pGroup.position.set(sideSign * 0.115, 0.74, -0.57);
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.24, 0.27), leatherMat);
      bag.position.y = -0.11;
      bag.castShadow = true;
      pGroup.add(bag);

      const flap = new THREE.Mesh(
        new THREE.BoxGeometry(0.102, 0.08, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x733b18, roughness: 0.55 })
      );
      flap.position.y = -0.02;
      pGroup.add(flap);

      for (const bz of [-0.07, 0.07]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.15, 0.024), lugGold);
        strap.position.set(0, -0.08, bz);
        pGroup.add(strap);
      }
      bikeContent.add(pGroup);
      return pGroup;
    };
    this.leftPannier = createPannier(1);
    this.rightPannier = createPannier(-1);

    // Rear Wheel (24 stainless spokes + gumwall tire)
    this.rearWheelSpin.position.copy(rearAxle);
    this.rearWheelSpin.add(this.createSpokedWheel(chromeMat, lugGold));
    bikeContent.add(this.rearWheelSpin);

    // Front Steerable Assembly (Fork + Front Fender + Dynamo Headlamp + Spoked Wheel + Swept Handlebars + Brass Bell)
    const steerAxisDir = new THREE.Vector3().subVectors(headTop, headBot).normalize();
    this.steerPivot.position.copy(headTop);
    this.steerPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), steerAxisDir);
    bikeContent.add(this.steerPivot);

    // Local helper to map bikeContent point into steerPivot's initial local frame
    const invSteerQuat = this.steerPivot.quaternion.clone().invert();
    const toSteerLocal = (worldPt: THREE.Vector3) =>
      worldPt.clone().sub(headTop).applyQuaternion(invSteerQuat);

    const frontAxleWorld = new THREE.Vector3(0, 0.36, 0.58);
    const forkCrownLocal = toSteerLocal(headBot.clone().add(new THREE.Vector3(0, -0.03, 0.01)));
    const frontAxleLocal = toSteerLocal(frontAxleWorld);

    for (const sx of [-0.065, 0.065]) {
      const crownSide = forkCrownLocal.clone().add(new THREE.Vector3(sx * 0.65, 0, 0));
      const dropSide = frontAxleLocal.clone().add(new THREE.Vector3(sx, 0, 0));
      addTube(this.steerPivot, crownSide, dropSide, 0.015, framePaint);
    }

    // Front Fender
    const frontFender = new THREE.Mesh(
      new THREE.TorusGeometry(this.wheelRadius + 0.028, 0.025, 10, 26, Math.PI * 0.85),
      framePaint
    );
    frontFender.position.copy(frontAxleLocal);
    frontFender.rotation.y = Math.PI / 2;
    frontFender.rotation.z = Math.PI * 0.12;
    this.steerPivot.add(frontFender);

    // Front Spoked Wheel
    this.frontWheelSpin.position.copy(frontAxleLocal);
    this.frontWheelSpin.add(this.createSpokedWheel(chromeMat, lugGold));
    this.steerPivot.add(this.frontWheelSpin);

    // Vintage Chrome Dynamo Headlamp + Volumetric Beam + SpotLight
    const lampPosLocal = forkCrownLocal.clone().add(new THREE.Vector3(0, 0.055, 0.085));
    const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.03, 0.085, 16), chromeMat);
    lampHousing.rotation.x = Math.PI / 2;
    lampHousing.position.copy(lampPosLocal);
    this.steerPivot.add(lampHousing);

    const lampLens = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfff8dc,
        emissive: 0xffdd77,
        emissiveIntensity: 2.2,
      })
    );
    lampLens.position.copy(lampPosLocal).add(new THREE.Vector3(0, 0, 0.044));
    this.steerPivot.add(lampLens);

    const coneGeo = new THREE.ConeGeometry(1.15, 7.5, 20, 1, true);
    coneGeo.translate(0, -3.75, 0);
    coneGeo.rotateX(-Math.PI / 2);
    this.headlampBeam = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffe999,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.headlampBeam.position.copy(lampPosLocal).add(new THREE.Vector3(0, -0.02, 0.05));
    this.headlampBeam.rotation.x = 0.14;
    this.steerPivot.add(this.headlampBeam);

    this.headlampLight = new THREE.SpotLight(0xffe699, 1.5, 22, Math.PI / 5, 0.55, 1.3);
    this.headlampLight.position.copy(lampPosLocal);
    const lampTarget = new THREE.Object3D();
    lampTarget.position.copy(lampPosLocal).add(new THREE.Vector3(0, -1.2, 6.5));
    this.steerPivot.add(this.headlampLight, lampTarget);
    this.headlampLight.target = lampTarget;

    // Chrome Quill Stem + Swept Cruiser Handlebars + Leather Grips + Brass Bell
    const stemTop = new THREE.Vector3(0, 0.15, 0.04);
    addTube(this.steerPivot, new THREE.Vector3(0, 0, 0), stemTop, 0.015, chromeMat);

    const barCurvePts = [
      new THREE.Vector3(0.28, 0.16, -0.10),
      new THREE.Vector3(0.21, 0.18, 0.02),
      new THREE.Vector3(0, 0.15, 0.04),
      new THREE.Vector3(-0.21, 0.18, 0.02),
      new THREE.Vector3(-0.28, 0.16, -0.10),
    ];
    const barCurve = new THREE.CatmullRomCurve3(barCurvePts);
    const barMesh = new THREE.Mesh(new THREE.TubeGeometry(barCurve, 28, 0.013, 10, false), chromeMat);
    barMesh.castShadow = true;
    this.steerPivot.add(barMesh);

    // Honey-leather handlebar grips & IK Wing-Hand Targets
    for (const side of [1, -1]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.11, 12), leatherMat);
      grip.rotation.x = Math.PI / 2;
      grip.rotation.z = side * -0.35;
      grip.position.set(side * 0.265, 0.164, -0.075);
      this.steerPivot.add(grip);
    }
    this.leftGripTarget.position.set(0.27, 0.17, -0.08);
    this.rightGripTarget.position.set(-0.27, 0.17, -0.08);
    this.steerPivot.add(this.leftGripTarget, this.rightGripTarget);

    // Classic Brass Bicycle Bell on Right Handlebar
    this.bellDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
      lugGold
    );
    this.bellDome.position.set(-0.16, 0.205, 0.025);
    this.steerPivot.add(this.bellDome);

    // Drivetrain: 48T Chainring + Cranks + Counter-Rotating Pedals + 42 Animated Roller Chain Links
    this.crankGroup.position.copy(bbPos);
    bikeContent.add(this.crankGroup);

    const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.008, 28), chromeMat);
    chainring.rotation.z = Math.PI / 2;
    chainring.position.x = -0.048; // Drive side is rider-right (-X)
    this.crankGroup.add(chainring);

    const rearCog = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.012, 18), darkChainMat);
    rearCog.rotation.z = Math.PI / 2;
    rearCog.position.set(-0.052, rearAxle.y, rearAxle.z);
    bikeContent.add(rearCog);

    // Crank arms (length 0.155m, 180° opposed)
    const crankRadius = 0.155;
    addTube(
      this.crankGroup,
      new THREE.Vector3(0.055, 0, 0),
      new THREE.Vector3(0.085, crankRadius, 0),
      0.012,
      chromeMat
    );
    addTube(
      this.crankGroup,
      new THREE.Vector3(-0.055, 0, 0),
      new THREE.Vector3(-0.085, -crankRadius, 0),
      0.012,
      chromeMat
    );

    // Left & Right Pedals
    const buildPedal = (sideSign: number, yPos: number) => {
      const pGroup = new THREE.Group();
      pGroup.position.set(sideSign * 0.125, yPos, 0);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.02, 0.105), darkChainMat);
      body.castShadow = true;
      pGroup.add(body);
      // Amber safety reflectors front & back
      const refMat = new THREE.MeshStandardMaterial({
        color: 0xffa000,
        emissive: 0xff8f00,
        emissiveIntensity: 0.6,
      });
      for (const rz of [-0.054, 0.054]) {
        const ref = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.005), refMat);
        ref.position.z = rz;
        pGroup.add(ref);
      }
      this.crankGroup.add(pGroup);
      return pGroup;
    };

    this.leftPedalBody = buildPedal(1, crankRadius);
    this.rightPedalBody = buildPedal(-1, -crankRadius);

    this.leftPedalTarget.position.set(0, 0.016, 0);
    this.rightPedalTarget.position.set(0, 0.016, 0);
    this.leftPedalBody.add(this.leftPedalTarget);
    this.rightPedalBody.add(this.rightPedalTarget);

    // Closed-loop animated roller chain between BB (-0.05, 0.31, -0.08) and Rear Axle (-0.05, 0.36, -0.56)
    const chainPts = [
      new THREE.Vector3(-0.05, 0.412, -0.08),
      new THREE.Vector3(-0.05, 0.408, -0.32),
      new THREE.Vector3(-0.05, 0.408, -0.56),
      new THREE.Vector3(-0.05, 0.36, -0.61),
      new THREE.Vector3(-0.05, 0.312, -0.56),
      new THREE.Vector3(-0.05, 0.258, -0.32),
      new THREE.Vector3(-0.05, 0.208, -0.08),
      new THREE.Vector3(-0.05, 0.31, 0.022),
    ];
    this.chainCurve = new THREE.CatmullRomCurve3(chainPts, true);
    const linkGeo = new THREE.BoxGeometry(0.014, 0.012, 0.024);
    const linkCount = 40;
    for (let i = 0; i < linkCount; i++) {
      const lm = new THREE.Mesh(linkGeo, darkChainMat);
      bikeContent.add(lm);
      this.chainLinks.push({ mesh: lm, u: i / linkCount });
    }
  }

  private createSpokedWheel(chromeMat: THREE.Material, brassMat: THREE.Material): THREE.Group {
    const wg = new THREE.Group();
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.82 });
    const gumwallMat = new THREE.MeshStandardMaterial({ color: 0xd9a76a, roughness: 0.7 });

    // Outer black tread
    const tire = new THREE.Mesh(new THREE.TorusGeometry(this.wheelRadius, 0.028, 14, 42), tireMat);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    wg.add(tire);

    // Classic tan gumwall sidewall + polished alloy rim
    const gumwall = new THREE.Mesh(new THREE.TorusGeometry(this.wheelRadius - 0.018, 0.016, 10, 42), gumwallMat);
    gumwall.rotation.y = Math.PI / 2;
    wg.add(gumwall);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(this.wheelRadius - 0.032, 0.012, 10, 42), chromeMat);
    rim.rotation.y = Math.PI / 2;
    wg.add(rim);

    // Hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.095, 14), brassMat);
    hub.rotation.z = Math.PI / 2;
    wg.add(hub);

    // 24 Cross-laced Stainless Spokes
    const spokeCount = 24;
    const spokeLen = this.wheelRadius - 0.036;
    const spokeGeo = new THREE.CylinderGeometry(0.0024, 0.0024, spokeLen, 6);
    for (let i = 0; i < spokeCount; i++) {
      const ang = (i / spokeCount) * Math.PI * 2;
      const side = i % 2 === 0 ? 0.032 : -0.032;
      const spoke = new THREE.Mesh(spokeGeo, chromeMat);
      spoke.position.set(
        side * 0.5,
        Math.cos(ang) * spokeLen * 0.5,
        Math.sin(ang) * spokeLen * 0.5
      );
      spoke.rotation.x = ang;
      spoke.rotation.z = side * 0.09;
      wg.add(spoke);
    }

    return wg;
  }

  public ringBell(): void {
    this.bellStrikeTimer = 0.45;
  }

  public update(
    dt: number,
    linearSpeed: number,
    steerAngleRad: number,
    wheeliePitchRad: number,
    pedalingFactor: number,
    nightFactor: number
  ): void {
    // 1. Wheel spin: +X rotation rolls wheel forward toward +Z!
    // Check right-hand rule: X=(1,0,0), top of wheel is (0,+R,0). Rotating by +dTheta around +X moves (0,+R,0) toward (0,0,+R) = +Z forward!
    const dWheel = (linearSpeed * dt) / this.wheelRadius;
    this.wheelAngle += dWheel;
    this.frontWheelSpin.rotation.x = this.wheelAngle;
    this.rearWheelSpin.rotation.x = this.wheelAngle;

    // 2. Crank & counter-rotating pedals (gear ratio ~ 1 : 2.35 so cadence looks super athletic & readable)
    const dCrank = (dWheel / 2.35) * pedalingFactor;
    this.crankAngle += dCrank;
    this.crankGroup.rotation.x = this.crankAngle;
    // Keep pedal platforms level with ground!
    this.leftPedalBody.rotation.x = -this.crankAngle;
    this.rightPedalBody.rotation.x = -this.crankAngle;

    // 3. Animated roller chain links marching along chainCurve
    const chainAdvance = dCrank * 0.16;
    const tmpPt = new THREE.Vector3();
    const tmpTan = new THREE.Vector3();
    for (const node of this.chainLinks) {
      node.u = (node.u + chainAdvance + 10) % 1;
      this.chainCurve.getPointAt(node.u, tmpPt);
      this.chainCurve.getTangentAt(node.u, tmpTan);
      node.mesh.position.copy(tmpPt);
      node.mesh.lookAt(tmpPt.clone().add(tmpTan));
    }

    // 4. Steering fork + handlebars
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, steerAngleRad, Math.min(1, dt * 10));
    this.steerPivot.rotation.y = this.steerAngle;

    // 5. Wheelie pitch around rear tire contact patch (-X pitches front wheel UP!)
    this.wheelieGroup.rotation.x = -wheeliePitchRad;

    // 6. Leather pannier subtle sway
    const sway = Math.sin(this.crankAngle * 2) * 0.045 * Math.min(1, linearSpeed * 0.12);
    this.leftPannier.rotation.z = Math.max(0, sway);
    this.rightPannier.rotation.z = Math.min(0, sway);

    // 7. Brass bell vibration when rung
    if (this.bellStrikeTimer > 0) {
      this.bellStrikeTimer -= dt;
      this.bellDome.rotation.z = Math.sin(this.bellStrikeTimer * 95) * 0.22;
    } else {
      this.bellDome.rotation.z = 0;
    }

    // 8. Dynamo headlamp intensity scales up at dusk/night
    this.headlampLight.intensity = 0.8 + nightFactor * 5.5;
    (this.headlampBeam.material as THREE.MeshBasicMaterial).opacity = 0.03 + nightFactor * 0.18;
  }
}
