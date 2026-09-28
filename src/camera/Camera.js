import { MireiaMat4 } from '../math/MireiaMat4.js';
import { MireiaVec3 } from '../math/MireiaVec3.js';

// Z-up world: the tank lies in XY. Yaw zero points along +Y; negative pitch looks down.
// Matrices use WebGL's column-major layout.
export class Camera {
    constructor() {
        this.position = [0, -150, 120];
        this.yaw = 0;
        this.pitch = -0.6;
        this.fov = Math.PI / 3;
        this.near = 0.1;
        this.far = 5000;
    }

    getForward() {
        const cosPitch = Math.cos(this.pitch);
        return [
            Math.sin(this.yaw) * cosPitch,
            Math.cos(this.yaw) * cosPitch,
            Math.sin(this.pitch),
        ];
    }

    getRight() {
        return [Math.cos(this.yaw), -Math.sin(this.yaw), 0];
    }

    getUp() {
        return new MireiaVec3(...this.getRight())
            .cross(new MireiaVec3(...this.getForward()))
            .toArray();
    }

    lookAt(target, distance, yaw, pitch) {
        this.yaw = yaw;
        this.pitch = pitch;
        const f = new MireiaVec3(...this.getForward());
        const targetVec = new MireiaVec3(...target);
        this.position = targetVec.subtract(f.scale(distance)).toArray();
    }

    getViewMatrix() {
        const f = new MireiaVec3(...this.getForward());
        const r = new MireiaVec3(...this.getRight());
        const u = new MireiaVec3(...this.getUp());
        const p = new MireiaVec3(...this.position);
        const [fx, fy, fz] = f.toArray();
        const [rx, ry, rz] = r.toArray();
        const [ux, uy, uz] = u.toArray();

        return new Float32Array([
            rx, ux, -fx, 0,
            ry, uy, -fy, 0,
            rz, uz, -fz, 0,
            -r.dot(p), -u.dot(p), f.dot(p), 1,
        ]);
    }

    getProjectionMatrix(aspect) {
        const f = 1.0 / Math.tan(this.fov / 2);
        const rangeInv = 1.0 / (this.near - this.far);

        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, -(this.near + this.far) * rangeInv, -1,
            0, 0, -2 * this.near * this.far * rangeInv, 0,
        ]);
    }
    
    getViewProjMatrix(aspect) {
        return MireiaMat4.multiplyArrays(this.getProjectionMatrix(aspect), this.getViewMatrix());
    }

    rayDirection(ndcX, ndcY, aspect) {
        const tanHalfFov = Math.tan(this.fov / 2);
        const forward = new MireiaVec3(...this.getForward());
        const right = new MireiaVec3(...this.getRight());
        const up = new MireiaVec3(...this.getUp());
        return forward
            .add(right.scale(ndcX * tanHalfFov * aspect))
            .add(up.scale(ndcY * tanHalfFov))
            .normalize()
            .toArray();
    }
}