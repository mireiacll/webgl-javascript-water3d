import { MireiaVec3 } from './MireiaVec3.js';

export class MireiaMat4 {
  #position;
  #rotation; // Euler angles in radians: x = pitch, y = yaw, z = roll
  #scale;

  constructor(
    position = new MireiaVec3(0, 0, 0),
    rotation = new MireiaVec3(0, 0, 0),
    scale = new MireiaVec3(1, 1, 1)
  ) {
    this.#position = position;
    this.#rotation = rotation;
    this.#scale = scale;
  }

  getPosition() { return this.#position; }
  setPosition(position) { this.#position = position; }

  getRotation() { return this.#rotation; }
  setRotation(rotation) { this.#rotation = rotation; }

  getScale() { return this.#scale; }
  setScale(scale) { this.#scale = scale; }

  // Multiplies two column-major 4x4 matrices (a * b), same convention used elsewhere.
  #multiply(l, r) {
    return MireiaMat4.multiplyArrays(l, r);
  }

  static multiplyArrays(l, r) {
    const out = new Float32Array(16);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += l[k * 4 + row] * r[col * 4 + k];
        }
        out[col * 4 + row] = sum;
      }
    }
    return out;
  }

  #translationMatrix(p) {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      p.getX(), p.getY(), p.getZ(), 1,
    ]);
  }

  #rotationXMatrix(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([
      1, 0, 0, 0,
      0, c, s, 0,
      0, -s, c, 0,
      0, 0, 0, 1,
    ]);
  }

  #rotationYMatrix(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([
      c, 0, -s, 0,
      0, 1, 0, 0,
      s, 0, c, 0,
      0, 0, 0, 1,
    ]);
  }

  #rotationZMatrix(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Float32Array([
      c, s, 0, 0,
      -s, c, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  }

  #scaleMatrix(s) {
    return new Float32Array([
      s.getX(), 0, 0, 0,
      0, s.getY(), 0, 0,
      0, 0, s.getZ(), 0,
      0, 0, 0, 1,
    ]);
  }

  // Combines translation, rotation (Z * Y * X order), and scale into one matrix:
  // M = T * R * S — so a local vertex is scaled first, then rotated, then moved into place.
  /** index:  0    1    2    3    4    5    6    7    8    9   10   11   12  13  14  15
      value: v1.x v1.y v1.z  0   v2.x v2.y v2.z  0   v3.x v3.y v3.z  0   Tx  Ty  Tz  1
            └──── column 0 ────┘└──── column 1 ────┘└──── column 2 ────┘└─ column 3 ─┘ */
  getMatrix() {
    const t = this.#translationMatrix(this.#position);
    const rx = this.#rotationXMatrix(this.#rotation.getX());
    const ry = this.#rotationYMatrix(this.#rotation.getY());
    const rz = this.#rotationZMatrix(this.#rotation.getZ());
    const s = this.#scaleMatrix(this.#scale);

    const r = this.#multiply(this.#multiply(rz, ry), rx);
    const rs = this.#multiply(r, s);
    return this.#multiply(t, rs);
  }


  // Inverts this matrix using the standard cofactor/adjugate method
  static invertArray(m) {
    const inv = [];

    inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
    inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
    inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
    inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];

    inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
    inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
    inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
    inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];

    inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
    inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
    inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
    inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];

    inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
    inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
    inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
    inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];

    let det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
    if (det === 0) return null;

    det = 1.0 / det;
    for (let i = 0; i < 16; i++) inv[i] *= det;
    return inv;
  }

  // Instance version: inverts THIS matrix's own transform (position/rotation/scale).
  invert() {
    return MireiaMat4.invertArray(this.getMatrix());
  }
}