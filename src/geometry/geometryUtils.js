import { MireiaTriangle } from './MireiaTriangle.js';
import { MireiaSurface } from './MireiaSurface.js';
import { MireiaRect2D } from './MireiaRect2D.js';

// Split a grid quad into two triangles and attach it to the terrain primitive.
export function createFace(v1, v2, v3, v4, primitive) {
  const surface = new MireiaSurface();
  surface.addTriangle(new MireiaTriangle(v1, v2, v3));
  surface.addTriangle(new MireiaTriangle(v1, v3, v4));
  surface.getVertices().push(v1, v2, v3, v4);
  primitive.addSurface(surface);
}

// Shoelace formula: > 0 counter-clockwise, < 0 clockwise.
function ringArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.getX() * b.getY() - b.getX() * a.getY();
  }
  return sum / 2;
}

// Returns the ring going in the requested direction (a reversed copy if it goes the other way).
// MireiaPolygon asks for the outer ring with clockwise = false and for holes with clockwise = true.
export function ensureWinding(points, clockwise) {
  const isClockwise = ringArea(points) < 0;
  return isClockwise === clockwise ? points : [...points].reverse();
}

// Bounding box of a ring, as a MireiaRect2D (minX, maxX, minY, maxY).
export function boundingBoxOf(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.getX()); maxX = Math.max(maxX, p.getX());
    minY = Math.min(minY, p.getY()); maxY = Math.max(maxY, p.getY());
  }
  return new MireiaRect2D(minX, maxX, minY, maxY);
}