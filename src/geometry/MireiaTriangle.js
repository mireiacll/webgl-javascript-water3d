import { MireiaVec3 } from '../math/MireiaVec3.js';

export class MireiaTriangle {
  #v0;
  #v1;
  #v2;

  constructor(v0, v1, v2) {
    this.#v0 = v0;
    this.#v1 = v1;
    this.#v2 = v2;
  }

  getV0() { return this.#v0; }
  getV1() { return this.#v1; }
  getV2() { return this.#v2; }

  getVertices() {
    return [this.#v0, this.#v1, this.#v2];
  }

  // Raw cross-product normal 
  calculateNormal() {
    const p0 = this.#v0.getPosition();
    const p1 = this.#v1.getPosition();
    const p2 = this.#v2.getPosition();

    const edge1 = new MireiaVec3(p1.getX() - p0.getX(), p1.getY() - p0.getY(), p1.getZ() - p0.getZ());
    const edge2 = new MireiaVec3(p2.getX() - p1.getX(), p2.getY() - p1.getY(), p2.getZ() - p1.getZ());
    const cross = edge1.cross(edge2).normalize();

    return cross;
  }

  getIndices(){
    return [this.#v0.getId(),this.#v1.getId(),this.#v2.getId()];
  }

  calculateVerticesNormal(){
    const normal = this.calculateNormal();
    this.#v0.setNormal(new MireiaVec3(normal.getX(), normal.getY(), normal.getZ()));
    this.#v1.setNormal(new MireiaVec3(normal.getX(), normal.getY(), normal.getZ()));
    this.#v2.setNormal(new MireiaVec3(normal.getX(), normal.getY(), normal.getZ()));
  }


}