import { MireiaTriangle } from './MireiaTriangle.js';
import { MireiaVec3 } from '../math//MireiaVec3.js';

export class MireiaSurface {
  #triangles;
  #vertices;

  constructor(triangles = []) {
    this.#triangles = triangles;
    this.#vertices = [];
  }

  getTriangles() { return this.#triangles; }
  setTriangles(triangles) { this.#triangles = triangles; }

  addTriangle(triangle) {
    if(this.#triangles === undefined){
        this.#triangles = [];
    }
    this.#triangles.push(triangle);
  }

  getVertices() {
    return this.#vertices;
  }

  getIndices(){
    var resultIndices = [];
    for(var i=0; i<this.#triangles.length; i++){
        var currIndices = this.#triangles[i].getIndices();
        resultIndices = resultIndices.concat(currIndices);
    }
    return resultIndices;
  }

  calculateVerticesNormal(){
    for (const triangle of this.#triangles) {
        triangle.calculateVerticesNormal();
    }
  }

  calculateSmoothNormals(){
    const normalSums = new Map();
    for (const triangle of this.#triangles) {
        const faceNormal = triangle.calculateNormal();
        const vertices = [triangle.getV0(), triangle.getV1(), triangle.getV2()];

        for (const vertex of vertices) {
            if (!normalSums.has(vertex)) {
                normalSums.set(vertex, new MireiaVec3(0, 0, 0));
            }
            const sum = normalSums.get(vertex);
            sum.setX(sum.getX() + faceNormal.getX());
            sum.setY(sum.getY() + faceNormal.getY());
            sum.setZ(sum.getZ() + faceNormal.getZ());
        }
    }
    for (const [vertex, sum] of normalSums) {
      vertex.setNormal(sum.normalize());
    }
  }
}