import * as THREE from 'three';
import { orientLimbSegment, solveTwoBoneIK, Spring1D } from './mathIK';
import { RivieraBicycle } from './bicycle';

export class PelicanRider {
  public readonly root = new THREE.Group();
  /** Anchor behind the pelican's eyes for First-Person Beak-Cam POV! */
  public readonly beakCamAnchor = new THREE.Object3D();
  /** World tip of beak for catching jumping silver sardines */
  public readonly beakCatchPoint = new THREE.Object3D();

  public gogglesDown = false;
  public pouchElasticity = 1.0;

  private pelvisGroup = new THREE.Group();
  private torsoGroup = new THREE.Group();
  private tailGroup = new THREE.Group();
  private neck1 = new THREE.Group();
  private neck2 = new THREE.Group();
  private headGroup = new THREE.Group();
  private upperBeakGroup = new THREE.Group();
  private lowerJawGroup = new THREE.Group();
  private pouchMesh!: THREE.Mesh;
  private caughtFishTail!: THREE.Group;
  private gogglesGroup = new THREE.Group();

  private leftEyelid!: THREE.Mesh;
  private rightEyelid!: THREE.Mesh;

  // Analytical 2-Bone IK Leg segments (in wheelieGroup local space for zero-lag pedal locking)
  private leftThigh = new THREE.Group();
  private leftShin = new THREE.Group();
  private leftFoot = new THREE.Group();
  private rightThigh = new THREE.Group();
  private rightShin = new THREE.Group();
  private rightFoot = new THREE.Group();

  // Articulated 2-Bone Wings (grip handlebars when cruising, flap during stunts/jumps/turbo!)
  private leftUpperWing = new THREE.Group();
  private leftForeWing = new THREE.Group();
  private rightUpperWing = new THREE.Group();
  private rightForeWing = new THREE.Group();

  private pouchBounce = new Spring1D(0, 120, 7.5);
  private pouchInflation = new Spring1D(0, 95, 8.5);
  private jawOpenSpring = new Spring1D(0.05, 160, 12);
  private gogglesLerp = 0;
  private fishGulpTimer = 0;
  private blinkTimer = 2.4;

  // Bone lengths tuned to exact pedal stroke kinematics (hip y~0.91 -> BDC pedal y~0.16 => max dist ~0.77m < 0.84m)
  private readonly thighLen = 0.42;
  private readonly shinLen = 0.42;
  private readonly upperWingLen = 0.35;
  private readonly foreWingLen = 0.36;

  constructor(bicycle: RivieraBicycle) {
    // Attach pelican to bicycle.wheelieGroup so wheelies tilt bike + rider cohesively!
    // Note: bicycle.wheelieGroup is at (0, 0, -0.56) in bicycle.root, and bikeContent adds +0.56 in Z.
    // Let's offset pelican.root by +0.56 in Z so pelican coordinates match bikeContent coordinates!
    this.root.position.set(0, 0, 0.56);
    bicycle.wheelieGroup.add(this.root);

    // Materials
    const featherWhite = new THREE.MeshStandardMaterial({
      color: 0xfafcff,
      roughness: 0.52,
      metalness: 0.04,
    });
    const featherCream = new THREE.MeshStandardMaterial({
      color: 0xf4efe4,
      roughness: 0.58,
    });
    const wingTipDark = new THREE.MeshStandardMaterial({
      color: 0x2b333e,
      roughness: 0.6,
    });
    const beakOrange = new THREE.MeshStandardMaterial({
      color: 0xff7b29,
      roughness: 0.34,
      metalness: 0.08,
    });
    const beakCoralTip = new THREE.MeshStandardMaterial({
      color: 0xf0482b,
      roughness: 0.3,
    });
    const pouchMat = new THREE.MeshPhysicalMaterial({
      color: 0xff9b3d,
      roughness: 0.38,
      transmission: 0.22,
      thickness: 0.4,
      clearcoat: 0.35,
    });
    const legOrange = new THREE.MeshStandardMaterial({
      color: 0xf57c20,
      roughness: 0.46,
    });

    // 1. Pelvis & Plump Sculpted Pelican Torso perched over the Brooks saddle (0, 0.88, -0.26)
    this.pelvisGroup.position.set(0, 0.96, -0.24);
    this.root.add(this.pelvisGroup);

    this.pelvisGroup.add(this.torsoGroup);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.24, 22, 18), featherWhite);
    belly.scale.set(0.92, 1.05, 1.42);
    belly.position.set(0, 0.11, 0.06);
    belly.rotation.x = 0.26;
    belly.castShadow = true;
    this.torsoGroup.add(belly);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.20, 20, 16), featherCream);
    chest.scale.set(0.9, 1.08, 1.12);
    chest.position.set(0, 0.24, 0.20);
    chest.castShadow = true;
    this.torsoGroup.add(chest);

    // Fanned Tail Feathers
    this.tailGroup.position.set(0, 0.08, -0.26);
    for (let i = -2; i <= 2; i++) {
      const tf = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.26, 6), i % 2 === 0 ? featherWhite : featherCream);
      tf.scale.set(1.0, 1.0, 0.28);
      tf.rotation.x = -Math.PI * 0.44;
      tf.rotation.y = i * 0.14;
      tf.position.set(i * 0.032, 0.02, -0.1);
      tf.castShadow = true;
      this.tailGroup.add(tf);
    }
    this.torsoGroup.add(this.tailGroup);

    // 2. Graceful S-Curved Pelican Neck (2 articulated joints + Head)
    this.neck1.position.set(0, 0.34, 0.24);
    this.torsoGroup.add(this.neck1);

    const neckSeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.115, 0.24, 14), featherWhite);
    neckSeg1.position.set(0, 0.10, -0.02);
    neckSeg1.rotation.x = -0.24;
    neckSeg1.castShadow = true;
    this.neck1.add(neckSeg1);

    this.neck2.position.set(0, 0.20, -0.05);
    this.neck1.add(this.neck2);

    const neckSeg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.084, 0.24, 14), featherWhite);
    neckSeg2.position.set(0, 0.11, 0.02);
    neckSeg2.rotation.x = 0.18;
    neckSeg2.castShadow = true;
    this.neck2.add(neckSeg2);

    // 3. Expressive Pelican Head + Crest Feathers + Blinking Eyes + Aviator Goggles + Giant Beak & Gular Pouch!
    this.headGroup.position.set(0, 0.23, 0.05);
    this.neck2.add(this.headGroup);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 16), featherWhite);
    cranium.scale.set(0.92, 0.98, 1.15);
    cranium.castShadow = true;
    this.headGroup.add(cranium);

    // Tufted crest feathers at back of head
    for (let c = 0; c < 3; c++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.13, 6), featherCream);
      tuft.rotation.x = -Math.PI * 0.58 - c * 0.12;
      tuft.position.set(0, 0.07 - c * 0.022, -0.12);
      this.headGroup.add(tuft);
    }

    // Big expressive eyes with golden iris, glossy dark pupil & corneal highlight
    const scleraMat = new THREE.MeshStandardMaterial({ color: 0xfff8dc, roughness: 0.2 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.08 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const buildEye = (sideSign: number) => {
      const eg = new THREE.Group();
      eg.position.set(sideSign * 0.086, 0.032, 0.062);

      const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 12), scleraMat);
      eg.add(eyeball);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), pupilMat);
      pupil.position.set(sideSign * 0.016, 0.002, 0.022);
      eg.add(pupil);

      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 8), glintMat);
      glint.position.set(sideSign * 0.022, 0.01, 0.034);
      eg.add(glint);

      const eyelid = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        featherWhite
      );
      eyelid.scale.y = 0.1;
      eg.add(eyelid);

      this.headGroup.add(eg);
      return eyelid;
    };
    this.leftEyelid = buildEye(1);
    this.rightEyelid = buildEye(-1);

    // Vintage Brass & Leather Aviator Goggles (matching crest_badge.jpg & og_banner.jpg!)
    this.buildAviatorGoggles();
    this.headGroup.add(this.gogglesGroup);

    // First-person POV camera anchor right above head looking down the iconic long beak & handlebars!
    this.beakCamAnchor.position.set(0, 0.15, -0.02);
    this.headGroup.add(this.beakCamAnchor);

    // Hinged Upper Mandible (0.50m long sculpted orange bill + crimson hooked tip!)
    this.upperBeakGroup.position.set(0, 0.01, 0.10);
    this.headGroup.add(this.upperBeakGroup);

    const upperBillGeo = new THREE.ConeGeometry(0.062, 0.50, 14);
    upperBillGeo.rotateX(Math.PI / 2);
    upperBillGeo.scale(0.95, 0.42, 1.0);
    const upperBill = new THREE.Mesh(upperBillGeo, beakOrange);
    upperBill.position.set(0, 0.008, 0.25);
    upperBill.castShadow = true;
    this.upperBeakGroup.add(upperBill);

    // Hooked pelican nail at the very tip of upper bill
    const hookTip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.055, 8), beakCoralTip);
    hookTip.rotation.x = Math.PI * 0.88;
    hookTip.position.set(0, -0.014, 0.495);
    this.upperBeakGroup.add(hookTip);

    this.beakCatchPoint.position.set(0, -0.03, 0.42);
    this.upperBeakGroup.add(this.beakCatchPoint);

    // Hinged Lower Mandible + Deformable Soft-Body Gular Throat Pouch!
    this.lowerJawGroup.position.set(0, -0.015, 0.08);
    this.headGroup.add(this.lowerJawGroup);

    // Left & right flexible mandibular rami
    for (const sx of [-0.042, 0.042]) {
      const ramus = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.46, 8), beakCoralTip);
      ramus.rotation.x = Math.PI / 2;
      ramus.rotation.z = sx * 0.18;
      ramus.position.set(sx * 0.65, 0, 0.23);
      this.lowerJawGroup.add(ramus);
    }

    // Iconic Soft-Body Pelican Gular Throat Pouch
    const pouchGeo = new THREE.SphereGeometry(0.13, 20, 16, 0, Math.PI * 2, Math.PI * 0.38, Math.PI * 0.62);
    pouchGeo.scale(0.58, 1.15, 1.75);
    this.pouchMesh = new THREE.Mesh(pouchGeo, pouchMat);
    this.pouchMesh.position.set(0, 0.02, 0.22);
    this.pouchMesh.castShadow = true;
    this.lowerJawGroup.add(this.pouchMesh);

    // Wriggling silver fish tail visible inside the open beak right after catching a fish!
    this.caughtFishTail = new THREE.Group();
    this.caughtFishTail.position.set(0, -0.02, 0.30);
    this.caughtFishTail.visible = false;
    const silverMat = new THREE.MeshStandardMaterial({
      color: 0xdceeff,
      metalness: 0.9,
      roughness: 0.15,
    });
    const tailBody = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 10), silverMat);
    tailBody.rotation.x = -Math.PI / 2;
    const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.09, 4), silverMat);
    tailFin.scale.set(0.3, 1, 1);
    tailFin.rotation.x = Math.PI / 2;
    tailFin.position.z = 0.11;
    this.caughtFishTail.add(tailBody, tailFin);
    this.lowerJawGroup.add(this.caughtFishTail);

    // 4. Two-Bone Analytical IK Legs + Webbed Orange Feet (in this.root local space)
    this.buildLeg(this.leftThigh, this.leftShin, this.leftFoot, featherWhite, legOrange);
    this.buildLeg(this.rightThigh, this.rightShin, this.rightFoot, featherWhite, legOrange);
    this.root.add(
      this.leftThigh,
      this.leftShin,
      this.leftFoot,
      this.rightThigh,
      this.rightShin,
      this.rightFoot
    );

    // 5. Two-Bone Articulated Feathered Wings (grip handlebars when cruising, flap on stunts!)
    this.buildWing(this.leftUpperWing, this.leftForeWing, 1, featherWhite, featherCream, wingTipDark);
    this.buildWing(this.rightUpperWing, this.rightForeWing, -1, featherWhite, featherCream, wingTipDark);
    this.root.add(this.leftUpperWing, this.leftForeWing, this.rightUpperWing, this.rightForeWing);
  }

  private buildAviatorGoggles(): void {
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.7 });
    const brassRim = new THREE.MeshStandardMaterial({
      color: 0xe3b857,
      metalness: 0.88,
      roughness: 0.2,
    });
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: 0x29d4ff,
      metalness: 0.25,
      roughness: 0.08,
      transmission: 0.45,
      clearcoat: 1.0,
    });

    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.014, 8, 24), strapMat);
    strap.rotation.x = Math.PI / 2;
    strap.scale.set(0.93, 1.14, 1.0);
    this.gogglesGroup.add(strap);

    for (const sx of [-0.056, 0.056]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.028, 16), brassRim);
      cup.rotation.x = Math.PI / 2;
      cup.rotation.y = sx * 0.32;
      cup.position.set(sx, 0, 0.116);
      this.gogglesGroup.add(cup);

      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.033, 16), lensMat);
      lens.rotation.y = sx * 0.32;
      lens.position.set(sx * 1.04, 0, 0.131);
      this.gogglesGroup.add(lens);
    }

    // Default perched heroically on forehead
    this.gogglesGroup.position.set(0, 0.072, 0.0);
    this.gogglesGroup.rotation.x = -0.35;
  }

  private buildLeg(
    thighGroup: THREE.Group,
    shinGroup: THREE.Group,
    footGroup: THREE.Group,
    featherMat: THREE.Material,
    orangeMat: THREE.Material
  ): void {
    // Upper feathered drumstick (local -Y from hip to knee, length = this.thighLen)
    const fluff = new THREE.Mesh(
      new THREE.ConeGeometry(0.088, this.thighLen * 0.72, 12),
      featherMat
    );
    fluff.rotation.x = Math.PI;
    fluff.position.y = -this.thighLen * 0.32;
    fluff.castShadow = true;
    thighGroup.add(fluff);

    const lowerFemur = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.018, this.thighLen * 0.42, 10),
      orangeMat
    );
    lowerFemur.position.y = -this.thighLen * 0.79;
    lowerFemur.castShadow = true;
    thighGroup.add(lowerFemur);

    const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 10), orangeMat);
    kneeJoint.position.y = -this.thighLen;
    thighGroup.add(kneeJoint);

    // Lower scaly orange shank (local -Y from knee to ankle, length = this.shinLen)
    const tarsus = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.015, this.shinLen, 10),
      orangeMat
    );
    tarsus.position.y = -this.shinLen * 0.5;
    tarsus.castShadow = true;
    shinGroup.add(tarsus);

    // Broad Webbed Orange Pelican Foot resting flat on pedal!
    const webShape = new THREE.Shape();
    webShape.moveTo(0, -0.03);
    webShape.lineTo(-0.068, 0.115);
    webShape.quadraticCurveTo(-0.02, 0.095, 0, 0.125);
    webShape.quadraticCurveTo(0.02, 0.095, 0.068, 0.115);
    webShape.closePath();

    const webGeo = new THREE.ExtrudeGeometry(webShape, {
      depth: 0.012,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
    });
    webGeo.rotateX(Math.PI / 2);
    const webFoot = new THREE.Mesh(webGeo, orangeMat);
    webFoot.position.set(0, 0.012, -0.02);
    webFoot.castShadow = true;
    footGroup.add(webFoot);
  }

  private buildWing(
    upperGroup: THREE.Group,
    foreGroup: THREE.Group,
    sideSign: number,
    featherWhite: THREE.Material,
    featherCream: THREE.Material,
    darkTip: THREE.Material
  ): void {
    // Upper wing (shoulder -> elbow along local -Y)
    const humerus = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.042, this.upperWingLen, 12),
      featherWhite
    );
    humerus.scale.set(0.65, 1.0, 1.55);
    humerus.position.y = -this.upperWingLen * 0.5;
    humerus.castShadow = true;
    upperGroup.add(humerus);

    // Layered secondary covert feathers along trailing edge
    for (let f = 0; f < 4; f++) {
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.16, 6), featherCream);
      plume.scale.set(0.45, 1.0, 1.0);
      plume.rotation.x = -Math.PI * 0.35;
      plume.position.set(sideSign * 0.02, -0.08 - f * 0.065, -0.06);
      upperGroup.add(plume);
    }

    // Forewing + Primary Flight Feathers (elbow -> handlebar grip along local -Y)
    const radiusBone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.028, this.foreWingLen, 12),
      featherWhite
    );
    radiusBone.scale.set(0.55, 1.0, 1.45);
    radiusBone.position.y = -this.foreWingLen * 0.5;
    radiusBone.castShadow = true;
    foreGroup.add(radiusBone);

    // Charcoal-tipped primary flight feathers curling neatly around handlebar grip
    for (let p = 0; p < 4; p++) {
      const prim = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.15, 6), darkTip);
      prim.scale.set(0.4, 1.0, 1.0);
      prim.position.set(sideSign * 0.015, -this.foreWingLen + 0.03 - p * 0.012, -0.02 + p * 0.018);
      prim.rotation.x = 0.25 * p;
      foreGroup.add(prim);
    }
  }

  /** Triggered when pelican catches an airborne silver sardine! */
  public onCatchFish(): void {
    this.jawOpenSpring.target = 0.06;
    this.jawOpenSpring.value = 0.58; // Snap wide open then clamp shut!
    this.pouchInflation.value = 1.35;
    this.pouchBounce.impulse(6.5);
    this.fishGulpTimer = 1.15;
    this.caughtFishTail.visible = true;
  }

  /** Triggered when player presses Q (Pelican Honk) */
  public triggerSquawk(): void {
    this.jawOpenSpring.value = 0.52;
    this.pouchBounce.impulse(4.8);
  }

  public update(
    dt: number,
    elapsed: number,
    bicycle: RivieraBicycle,
    linearSpeed: number,
    isAirborne: boolean,
    isTurbo: boolean,
    isWheelie: boolean,
    nearestFishWorld: THREE.Vector3 | null
  ): void {
    // Ensure matrices are fresh so we can map pedal & handlebar targets cleanly into this.root space
    bicycle.root.updateMatrixWorld(true);
    const invRootMat = this.root.matrixWorld.clone().invert();

    const toPelicanLocal = (obj: THREE.Object3D, out: THREE.Vector3) => {
      obj.getWorldPosition(out);
      out.applyMatrix4(invRootMat);
      return out;
    };

    // 1. Athletic hip cadence rock & forward aero tuck during Turbo Sprint
    const crank = bicycle.crankAngle;
    const cadenceBob = Math.sin(crank * 2) * 0.024 * Math.min(1, linearSpeed * 0.15);
    const hipRock = Math.sin(crank) * 0.065;

    this.pelvisGroup.position.set(0, 0.94 + cadenceBob, -0.23);
    this.pelvisGroup.rotation.z = hipRock;
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(
      this.torsoGroup.rotation.x,
      isTurbo ? 0.36 : isWheelie ? -0.14 : 0.08,
      Math.min(1, dt * 7)
    );
    this.tailGroup.rotation.y = Math.sin(elapsed * 9 + crank * 2) * 0.14;
    this.tailGroup.rotation.x = Math.sin(crank * 2) * 0.08;

    // 2. Neck & Head Tracking (looks eagerly toward nearest airborne fish or leans into steer!)
    let targetHeadYaw = bicycle.steerAngle * 0.65;
    let targetNeckPitch = isTurbo ? 0.25 : Math.sin(crank * 2) * 0.05;

    if (nearestFishWorld) {
      const fishLocal = nearestFishWorld.clone().applyMatrix4(invRootMat);
      const dx = fishLocal.x;
      const dy = fishLocal.y - 1.48;
      const dz = fishLocal.z - 0.05;
      if (dz > -0.4 && Math.hypot(dx, dy, dz) < 4.5) {
        targetHeadYaw = THREE.MathUtils.clamp(Math.atan2(dx, Math.max(0.4, dz)), -0.75, 0.75);
        targetNeckPitch = THREE.MathUtils.clamp(-dy * 0.28, -0.35, 0.35);
        // Anticipatory mouth opening as fish gets close!
        this.jawOpenSpring.target = 0.44;
      } else {
        this.jawOpenSpring.target = isTurbo ? 0.14 : 0.04;
      }
    } else {
      this.jawOpenSpring.target = isTurbo ? 0.14 : 0.04;
    }

    this.neck1.rotation.x = THREE.MathUtils.lerp(this.neck1.rotation.x, targetNeckPitch, Math.min(1, dt * 8));
    this.neck2.rotation.x = THREE.MathUtils.lerp(
      this.neck2.rotation.x,
      -targetNeckPitch * 0.5 + Math.cos(crank * 2) * 0.04,
      Math.min(1, dt * 8)
    );
    this.headGroup.rotation.y = THREE.MathUtils.lerp(this.headGroup.rotation.y, targetHeadYaw, Math.min(1, dt * 9));
    this.headGroup.rotation.z = THREE.MathUtils.lerp(
      this.headGroup.rotation.z,
      -bicycle.steerAngle * 0.35,
      Math.min(1, dt * 7)
    );

    // 3. Aviator Goggles Transition (pulled down over eyes in Turbo mode or when toggled via G!)
    const wantGogglesDown = this.gogglesDown || isTurbo;
    this.gogglesLerp = THREE.MathUtils.lerp(this.gogglesLerp, wantGogglesDown ? 1 : 0, Math.min(1, dt * 10));
    this.gogglesGroup.position.set(
      0,
      THREE.MathUtils.lerp(0.072, 0.030, this.gogglesLerp),
      THREE.MathUtils.lerp(0.0, 0.008, this.gogglesLerp)
    );
    this.gogglesGroup.rotation.x = THREE.MathUtils.lerp(-0.35, 0.04, this.gogglesLerp);

    // Periodic natural eye blink
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = 2.6 + Math.random() * 2.5;
    }
    const blinkScale = this.blinkTimer < 0.13 ? Math.sin((this.blinkTimer / 0.13) * Math.PI) : 0.08;
    this.leftEyelid.scale.y = Math.max(0.08, blinkScale);
    this.rightEyelid.scale.y = Math.max(0.08, blinkScale);

    // 4. Soft-Body Gular Throat Pouch Physics + Fish Gulp Wriggle!
    const roadRipple = Math.cos(crank * 2) * 0.32 * (linearSpeed * 0.08);
    this.pouchBounce.target = roadRipple + (isAirborne ? -0.35 : 0);
    const bounceVal = this.pouchBounce.update(dt, 115 * this.pouchElasticity, 6.5);
    this.pouchInflation.target = this.fishGulpTimer > 0 ? 0.85 : 0.12 + Math.abs(Math.sin(elapsed * 2.2)) * 0.06;
    const inflateVal = this.pouchInflation.update(dt);
    const jawAngle = Math.max(0.02, this.jawOpenSpring.update(dt));

    this.upperBeakGroup.rotation.x = -jawAngle * 0.28;
    this.lowerJawGroup.rotation.x = jawAngle * 0.72;

    const pouchStretchY = THREE.MathUtils.clamp(
      1.0 + inflateVal * 0.65 + bounceVal * 0.28 * this.pouchElasticity,
      0.72,
      2.15
    );
    const pouchStretchX = THREE.MathUtils.clamp(1.0 + inflateVal * 0.55, 0.85, 1.85);
    this.pouchMesh.scale.set(pouchStretchX, pouchStretchY, 1.0);

    if (this.fishGulpTimer > 0) {
      this.fishGulpTimer -= dt;
      this.caughtFishTail.visible = true;
      this.caughtFishTail.rotation.y = Math.sin(elapsed * 42) * 0.52;
      this.caughtFishTail.position.z = THREE.MathUtils.lerp(0.12, 0.32, this.fishGulpTimer / 1.15);
      if (this.fishGulpTimer <= 0) {
        this.caughtFishTail.visible = false;
      }
    }

    // 5. Analytical 2-Bone Inverse Kinematics for Left & Right Legs -> Spinning Pedals!
    const leftHip = new THREE.Vector3(0.105, 0.90 + cadenceBob + hipRock * 0.1, -0.22);
    const rightHip = new THREE.Vector3(-0.105, 0.90 + cadenceBob - hipRock * 0.1, -0.22);

    const leftPedal = toPelicanLocal(bicycle.leftPedalTarget, new THREE.Vector3());
    const rightPedal = toPelicanLocal(bicycle.rightPedalTarget, new THREE.Vector3());

    // Pole targets forward & slightly outward for natural cycling knee alignment
    const leftPole = new THREE.Vector3(0.24, 0.68, 0.65);
    const rightPole = new THREE.Vector3(-0.24, 0.68, 0.65);

    const leftKnee = new THREE.Vector3();
    const leftAnkle = new THREE.Vector3();
    solveTwoBoneIK(leftHip, leftPedal, leftPole, this.thighLen, this.shinLen, leftKnee, leftAnkle);
    orientLimbSegment(this.leftThigh, leftHip, leftKnee);
    orientLimbSegment(this.leftShin, leftKnee, leftAnkle);
    this.leftFoot.position.copy(leftAnkle);
    this.leftFoot.rotation.set(Math.sin(crank) * 0.16, 0.05, 0);

    const rightKnee = new THREE.Vector3();
    const rightAnkle = new THREE.Vector3();
    solveTwoBoneIK(rightHip, rightPedal, rightPole, this.thighLen, this.shinLen, rightKnee, rightAnkle);
    orientLimbSegment(this.rightThigh, rightHip, rightKnee);
    orientLimbSegment(this.rightShin, rightKnee, rightAnkle);
    this.rightFoot.position.copy(rightAnkle);
    this.rightFoot.rotation.set(-Math.sin(crank) * 0.16, -0.05, 0);

    // 6. Articulated Wings: Handlebar IK when cruising, Dramatic Wing Flaps when Jumping / Wheelie!
    const leftShoulder = new THREE.Vector3(0.19, 1.18 + cadenceBob, -0.05);
    const rightShoulder = new THREE.Vector3(-0.19, 1.18 + cadenceBob, -0.05);

    if (isAirborne || isWheelie) {
      // Spread glorious coastal pelican wings & flap!
      const flap = Math.sin(elapsed * 15) * 0.48 + 0.25;
      const leftTip = new THREE.Vector3(0.76, 1.32 + flap * 0.35, -0.10);
      const rightTip = new THREE.Vector3(-0.76, 1.32 + flap * 0.35, -0.10);
      const leftElbow = new THREE.Vector3();
      const leftEnd = new THREE.Vector3();
      solveTwoBoneIK(
        leftShoulder,
        leftTip,
        new THREE.Vector3(0.5, 1.55, -0.35),
        this.upperWingLen,
        this.foreWingLen,
        leftElbow,
        leftEnd
      );
      orientLimbSegment(this.leftUpperWing, leftShoulder, leftElbow);
      orientLimbSegment(this.leftForeWing, leftElbow, leftEnd);

      const rightElbow = new THREE.Vector3();
      const rightEnd = new THREE.Vector3();
      solveTwoBoneIK(
        rightShoulder,
        rightTip,
        new THREE.Vector3(-0.5, 1.55, -0.35),
        this.upperWingLen,
        this.foreWingLen,
        rightElbow,
        rightEnd
      );
      orientLimbSegment(this.rightUpperWing, rightShoulder, rightElbow);
      orientLimbSegment(this.rightForeWing, rightElbow, rightEnd);
    } else {
      // Wing-hands grip the steering leather handlebar grips via 2-Bone IK!
      const leftGrip = toPelicanLocal(bicycle.leftGripTarget, new THREE.Vector3());
      const rightGrip = toPelicanLocal(bicycle.rightGripTarget, new THREE.Vector3());

      const elbowOut = isTurbo ? 0.58 : 0.44;
      const leftElbow = new THREE.Vector3();
      const leftHand = new THREE.Vector3();
      solveTwoBoneIK(
        leftShoulder,
        leftGrip,
        new THREE.Vector3(elbowOut, 1.12, -0.18),
        this.upperWingLen,
        this.foreWingLen,
        leftElbow,
        leftHand
      );
      orientLimbSegment(this.leftUpperWing, leftShoulder, leftElbow);
      orientLimbSegment(this.leftForeWing, leftElbow, leftHand);

      const rightElbow = new THREE.Vector3();
      const rightHand = new THREE.Vector3();
      solveTwoBoneIK(
        rightShoulder,
        rightGrip,
        new THREE.Vector3(-elbowOut, 1.12, -0.18),
        this.upperWingLen,
        this.foreWingLen,
        rightElbow,
        rightHand
      );
      orientLimbSegment(this.rightUpperWing, rightShoulder, rightElbow);
      orientLimbSegment(this.rightForeWing, rightElbow, rightHand);
    }
  }
}
