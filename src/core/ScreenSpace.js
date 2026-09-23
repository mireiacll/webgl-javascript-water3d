import { MireiaVec3 } from '../math/MireiaVec3.js';
import { MireiaMat4 } from '../math/MireiaMat4.js';

// Pure screen-space <-> world-space conversion math 
// translate a 2D pixel position into 3D space or vice versa
export class ScreenSpace {
  // Converts a pixel position (origin top-left, Y grows down) into Normalized Device Coordinates (-1..1, Y grows up).
  static screenToNdc(screenX, screenY, width, height) {
    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = 1 - (screenY / height) * 2;
    return { ndcX, ndcY };
  }

  // WebGL's readPixels measures Y from the BOTTOM of the image
  static flipY(y, height) {
    return height - y - 1;
  }

  // Converts a normalized depth (0..1, from the decoded depth texture) back  into the same NDC Z space gl_FragCoord.z originally produced
  static depthToNdcZ(normalizedDepth, near, far) {
    const linearDepth = normalizedDepth * (far - near) + near;
    return (far + near - (2 * near * far) / linearDepth) / (far - near);
  }

  // Transforms an NDC point (x, y, z) back into a real 3D world position
  static unproject(ndcX, ndcY, ndcZ, inverseViewProjection) {
    const m = inverseViewProjection;
    const clipW = 1;

    const worldX = m[0]*ndcX + m[4]*ndcY + m[8]*ndcZ + m[12]*clipW;
    const worldY = m[1]*ndcX + m[5]*ndcY + m[9]*ndcZ + m[13]*clipW;
    const worldZ = m[2]*ndcX + m[6]*ndcY + m[10]*ndcZ + m[14]*clipW;
    const worldW = m[3]*ndcX + m[7]*ndcY + m[11]*ndcZ + m[15]*clipW;

    return new MireiaVec3(worldX / worldW, worldY / worldW, worldZ / worldW);
  }

  static transformHomogeneous(matrix, x, y, z, w) {
    const m = matrix;
    return {
      x: m[0]*x + m[4]*y + m[8]*z  + m[12]*w,
      y: m[1]*x + m[5]*y + m[9]*z  + m[13]*w,
      z: m[2]*x + m[6]*y + m[10]*z + m[14]*w,
      w: m[3]*x + m[7]*y + m[11]*z + m[15]*w,
    };
  }

  static unprojectSeparate(ndcX, ndcY, ndcZ, inverseProjection, inverseView) {
    // step 1: undo the projection -> view-space position
    const viewSpace = ScreenSpace.transformHomogeneous(inverseProjection, ndcX, ndcY, ndcZ, 1);
    if (viewSpace.w === 0) return null;
    const vx = viewSpace.x / viewSpace.w;
    const vy = viewSpace.y / viewSpace.w;
    const vz = viewSpace.z / viewSpace.w;
 
    // step 2: undo the view -> world-space position
    const worldSpace = ScreenSpace.transformHomogeneous(inverseView, vx, vy, vz, 1);
    if (worldSpace.w === 0) return null;
 
    return new MireiaVec3(worldSpace.x / worldSpace.w, worldSpace.y / worldSpace.w, worldSpace.z / worldSpace.w);
  }

  // Full convenience pipeline: screen pixel + normalized depth + view-projection
  // matrix -> world position. Returns null if the matrix isn't invertible.
  // static screenToWorld(screenX, screenY, normalizedDepth, canvasWidth, canvasHeight, near, far, viewProjection) {
  //   const { ndcX, ndcY } = ScreenSpace.screenToNdc(screenX, screenY, canvasWidth, canvasHeight);
  //   const ndcZ = ScreenSpace.depthToNdcZ(normalizedDepth, near, far);

  //   const inverseVP = MireiaMat4.invertArray(viewProjection);
  //   if (!inverseVP) return null;

  //   return ScreenSpace.unproject(ndcX, ndcY, ndcZ, inverseVP);
  // }
  // static screenToWorld(screenX, screenY, normalizedDepth, canvasWidth, canvasHeight, near, far, projection, view) {
  //   const { ndcX, ndcY } = ScreenSpace.screenToNdc(screenX, screenY, canvasWidth, canvasHeight);
  //   const ndcZ = ScreenSpace.depthToNdcZ(normalizedDepth, near, far);

  //   const inverseProjection = MireiaMat4.invertArray(projection);
  //   const inverseView = MireiaMat4.invertArray(view);
  //   if (!inverseProjection || !inverseView) return null;
 
  //   return ScreenSpace.unprojectSeparate(ndcX, ndcY, ndcZ, inverseProjection, inverseView);
  // }

  static screenToWorldRay(screenX, screenY, normalizedDepth, canvasWidth, canvasHeight, near, far, fov, view, camera) {
    const { ndcX, ndcY } = ScreenSpace.screenToNdc(screenX, screenY, canvasWidth, canvasHeight);
 
    const f = 1 / Math.tan(fov / 2);
    const aspect = canvasWidth / canvasHeight;
 
    const linearDepth = normalizedDepth * (far - near) + near;
 
    // reconstruct the view-space position
    const viewX = ndcX * linearDepth * aspect / f;
    const viewY = ndcY * linearDepth / f;
    const viewZ = -linearDepth; // camera looks -Z 
 
    const camTMat = camera.getCameraTransformMatrix();
    const camTMatInv = MireiaMat4.invertArray(camTMat);
    const camRot4 = camera.getCameraRotationMatrix4();

    const inverseView = MireiaMat4.invertArray(view);
    if (!inverseView) return null;
 
    const worldSpace = ScreenSpace.transformHomogeneous(inverseView, viewX, viewY, viewZ, 1);

    const worldSpace2 = ScreenSpace.transformHomogeneous(camRot4, viewX, viewY, viewZ, 1);
    const camPos = camera.getPosition();
    const worldSpace3 = [worldSpace2.x+camPos.getX(), worldSpace2.y+camPos.getY(), worldSpace2.z+camPos.getZ()];

    if (worldSpace.w === 0) return null;
 
    //return new MireiaVec3(worldSpace.x / worldSpace.w, worldSpace.y / worldSpace.w, worldSpace.z / worldSpace.w);
    return new MireiaVec3(worldSpace3[0], worldSpace3[1], worldSpace3[2]);
  }
 
  static screenToWorld(screenX, screenY, normalizedDepth, canvasWidth, canvasHeight, near, far, fov, view, camera) {
    return ScreenSpace.screenToWorldRay(screenX, screenY, normalizedDepth, canvasWidth, canvasHeight, near, far, fov, view, camera);
  }

}