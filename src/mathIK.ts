import * as THREE from 'three';

/**
 * Analytical 3D Two-Bone Inverse Kinematics Solver (Law of Cosines + Pole Vector).
 * Computes exact joint world/local positions so the pelican's thigh (bone1) and
 * shin/tarsus (bone2) reach `targetPos` (the spinning pedal) without foot sliding,
 * bending cleanly toward `polePos` (forward/outward avian knee/hock alignment).
 */
export function solveTwoBoneIK(
  rootPos: THREE.Vector3,
  targetPos: THREE.Vector3,
  polePos: THREE.Vector3,
  len1: number,
  len2: number,
  outJointPos: THREE.Vector3,
  outEndPos: THREE.Vector3
): void {
  const toTarget = new THREE.Vector3().subVectors(targetPos, rootPos);
  const rawDist = toTarget.length();
  const minDist = Math.abs(len1 - len2) + 0.005;
  const maxDist = (len1 + len2) * 0.996;
  const clampedDist = THREE.MathUtils.clamp(rawDist, minDist, maxDist);

  const forwardDir = rawDist > 1e-5 ? toTarget.clone().divideScalar(rawDist) : new THREE.Vector3(0, -1, 0);

  // Compute bend plane orthogonal basis using pole target
  const toPole = new THREE.Vector3().subVectors(polePos, rootPos);
  const bendNormal = new THREE.Vector3().crossVectors(forwardDir, toPole);
  if (bendNormal.lengthSq() < 1e-6) {
    bendNormal.set(1, 0, 0);
  } else {
    bendNormal.normalize();
  }
  const bendDir = new THREE.Vector3().crossVectors(bendNormal, forwardDir).normalize();

  // Law of cosines for interior angle at hip root
  const cosAngle1 = THREE.MathUtils.clamp(
    (len1 * len1 + clampedDist * clampedDist - len2 * len2) / (2 * len1 * clampedDist),
    -1,
    1
  );
  const sinAngle1 = Math.sqrt(Math.max(0, 1 - cosAngle1 * cosAngle1));

  outJointPos
    .copy(rootPos)
    .addScaledVector(forwardDir, len1 * cosAngle1)
    .addScaledVector(bendDir, len1 * sinAngle1);

  outEndPos.copy(rootPos).addScaledVector(forwardDir, clampedDist);
}

/**
 * Orient a bone mesh/group whose local +Y (or -Y) points from `start` to `end`.
 * Here local -Y is down along the limb segment so child meshes hang naturally.
 */
const _limbDir = new THREE.Vector3();
const _defaultDown = new THREE.Vector3(0, -1, 0);

export function orientLimbSegment(
  node: THREE.Object3D,
  start: THREE.Vector3,
  end: THREE.Vector3
): void {
  node.position.copy(start);
  _limbDir.subVectors(end, start);
  if (_limbDir.lengthSq() > 1e-7) {
    _limbDir.normalize();
    node.quaternion.setFromUnitVectors(_defaultDown, _limbDir);
  }
}

/**
 * 1D Damped Harmonic Oscillator for soft-body throat pouch inflation/bounce,
 * saddle spring compression, and pannier sway.
 */
export class Spring1D {
  public value: number;
  public velocity = 0;
  public target: number;
  private stiffness: number;
  private damping: number;

  constructor(initial = 0, stiffness = 140, damping = 11) {
    this.value = initial;
    this.target = initial;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  public impulse(dv: number): void {
    this.velocity += dv;
  }

  public update(dt: number, stiffnessOverride?: number, dampingOverride?: number): number {
    const k = stiffnessOverride ?? this.stiffness;
    const d = dampingOverride ?? this.damping;
    const clampedDt = Math.min(dt, 0.05);
    const force = (this.target - this.value) * k - this.velocity * d;
    this.velocity += force * clampedDt;
    this.value += this.velocity * clampedDt;
    return this.value;
  }
}
