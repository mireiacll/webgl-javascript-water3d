import { MireiaTriangle } from './MireiaTriangle.js';
import { MireiaSurface } from './MireiaSurface.js';

// Split a grid quad into two triangles and attach it to the terrain primitive.
export function createFace(v1, v2, v3, v4, primitive) {
  const surface = new MireiaSurface();
  surface.addTriangle(new MireiaTriangle(v1, v2, v3));
  surface.addTriangle(new MireiaTriangle(v1, v3, v4));
  surface.getVertices().push(v1, v2, v3, v4);
  primitive.addSurface(surface);
}