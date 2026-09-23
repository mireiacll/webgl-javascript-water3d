import { MireiaTriangle } from './MireiaTriangle.js';
import { MireiaSurface } from './MireiaSurface.js';
import { MireiaRect2D } from './MireiaRect2D.js';
import { MireiaSeg2D } from './MireiaSeg2D.js'
import { MireiaVec3 } from '../math/MireiaVec3.js';
import { MireiaVec2 } from '../math/MireiaVec2.js';

import { MireiaColor4 } from '../math/MireiaColor4.js'; // adjust path if geometryUtils.js sits elsewhere
import { MireiaPoints } from './MireiaPoints.js';
import { MireiaLines } from './MireiaLines.js';
import { MireiaLineStrip } from './MireiaLineStrip.js';
import { MireiaLineLoop } from './MireiaLineLoop.js';

// Builds a flat-shaded quad face from 4 vertices (v1,v2,v3,v4 in winding order)
// and adds it as a new surface on the given primitive.
export function createFace(v1, v2, v3, v4, primitive) {
  const t1 = new MireiaTriangle(v1, v2, v3);
  const t2 = new MireiaTriangle(v1, v3, v4);
  const s = new MireiaSurface();
  s.addTriangle(t1);
  s.addTriangle(t2);
  s.getVertices().push(v1, v2, v3, v4);
  primitive.addSurface(s);
}

// shoelace formula: positive area means counter-clockwise winding, negative area means clockwise winding
export function signedArea(points){
  let sum=0;
  const n=points.length;
  for(let i=0;i<n;i++){
    const a=points[i];
    const b=points[(i+1)%n];
    sum+= a.getX()*b.getY() - b.getX()*a.getY();
  }
  return sum/2;
}

// returns points in requested winding order (true=counter-clockwise, false=clockwise)
export function ensureWinding(points, clockWise){
  const isClockwise = signedArea(points) < 0;
  if(isClockwise === clockWise){
    return points;
  }
  return [...points].reverse();
}


export function boundingBoxOf(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.getX());
    maxX = Math.max(maxX, p.getX());
    minY = Math.min(minY, p.getY());
    maxY = Math.max(maxY, p.getY());
  }
  return new MireiaRect2D(minX, maxX, minY, maxY);
}

export function pointInRing(point, ring) {
    const x = point.getX();
    const y = point.getY();
    let inside = false;

    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = ring[i].getX();
        const yi = ring[i].getY();
        const xj = ring[j].getX();
        const yj = ring[j].getY();

        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// centroid of a set of rings  — averages every point across all rings
export function centroidOfRings(rings) {
    let sumX = 0, sumY = 0, count = 0;
    for (const ring of rings) {
        for (const p of ring) {
            sumX += p.getX();
            sumY += p.getY();
            count++;
        }
    }
    return count > 0 ? { lon: sumX / count, lat: sumY / count } : null;
}

// which flat grid cell index (row-major) a point falls into within bbox, for an NxN grid
export function gridCellIndex(lon, lat, bbox, divisions) {
    const width = bbox.getMaxX() - bbox.getMinX() || 1;
    const height = bbox.getMaxY() - bbox.getMinY() || 1;
    let col = Math.floor(((lon - bbox.getMinX()) / width) * divisions);
    let row = Math.floor(((lat - bbox.getMinY()) / height) * divisions);
    col = Math.min(Math.max(col, 0), divisions - 1);
    row = Math.min(Math.max(row, 0), divisions - 1);
    return row * divisions + col;
}

export function buildShape(mode, points) {
  switch (mode) {
    case 'point':
      return new MireiaPoints(points, new MireiaColor4(1, 0, 0, 1));
    case 'line':
      return new MireiaLines(points, new MireiaColor4(1, 1, 0, 1));
    case 'lineStrip':
      return new MireiaLineStrip(points, new MireiaColor4(0, 1, 1, 1));
    case 'lineLoop':
      return new MireiaLineLoop(points, new MireiaColor4(0, 1, 0, 1));
    default:
      return null;
  }
}

export function segmentSelfIntersects(existingPoints, candidate) {
  const n = existingPoints.length;
  if (n < 2) return false;
 
  const newSeg = new MireiaSeg2D(existingPoints[n - 1], candidate);
  for (let i = 0; i < n - 2; i++) {
    const edge = new MireiaSeg2D(existingPoints[i], existingPoints[i + 1]);
    if (newSeg.getIntersectionType(edge) !== MireiaSeg2D.IntersectionType.NONE) {
      return true;
    }
  }
  return false;
}
 
export function closingEdgeSelfIntersects(points) {
  const n = points.length;
  if (n < 4) return false; // a triangle's closing edge can't cross anything else
 
  const closingSeg = new MireiaSeg2D(points[n - 1], points[0]);
  for (let i = 1; i < n - 2; i++) {
    const edge = new MireiaSeg2D(points[i], points[i + 1]);
    if (closingSeg.getIntersectionType(edge) !== MireiaSeg2D.IntersectionType.NONE) {
      return true;
    }
  }
  return false;
}

export function closingEdgeWouldIntersect(existingPoints, candidate) {
  const n = existingPoints.length;
  if (n < 3) return false; // not enough edges yet for this to be meaningful

  const closingSeg = new MireiaSeg2D(candidate, existingPoints[0]);
  // start at i=1: edge (0,1) is adjacent to the closing segment (shares point 0), skip it
  for (let i = 1; i < n - 1; i++) {
    const edge = new MireiaSeg2D(existingPoints[i], existingPoints[i + 1]);
    if (closingSeg.getIntersectionType(edge) !== MireiaSeg2D.IntersectionType.NONE) {
      return true;
    }
  }
  return false;
}

function polygonNormal(points) {
    let nx = 0, ny = 0, nz = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const p0 = points[i], p1 = points[(i + 1) % n];
        nx += (p0.getY() - p1.getY()) * (p0.getZ() + p1.getZ());
        ny += (p0.getZ() - p1.getZ()) * (p0.getX() + p1.getX());
        nz += (p0.getX() - p1.getX()) * (p0.getY() + p1.getY());
    }
    return new MireiaVec3(nx, ny, nz).normalize();
}

export function polygonToProfile(points) {
    const n = points.length;
    let cx = 0, cy = 0, cz = 0;
    for (const p of points) { cx += p.getX(); cy += p.getY(); cz += p.getZ(); }
    const centroid = new MireiaVec3(cx / n, cy / n, cz / n);

    const normal = polygonNormal(points);

    // Use a fixed world reference instead of the first edge, so every polygon's
    // local (right, up) axes stay consistent with the ground plane (XY) regardless
    // of vertex winding/start point. Fall back to world Y when normal is ~parallel to world X.
    const worldX = new MireiaVec3(1, 0, 0);
    const worldY = new MireiaVec3(0, 1, 0);
    const reference = Math.abs(normal.dot(worldX)) > 0.999 ? worldY : worldX;

    const right = reference.subtract(normal.scale(reference.dot(normal))).normalize(); // X local
    const up = normal.cross(right).normalize(); // Z local

    const profile = points.map(p => {
        const rel = p.subtract(centroid);
        return new MireiaVec2(rel.dot(right), rel.dot(up));
    });

    return { profile, centroid, normal, right, up };
}

// Shared pick-id counter for object selection: every mesh/vertex that needs to be individually clickable 
let _nextPickId = 1;
export function nextPickId() {
  return _nextPickId++;
}