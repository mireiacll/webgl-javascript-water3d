// Z-up world : the tank lies in the XY plane, height is Z.
// The camera is just a position + yaw/pitch
// yaw = 0 looks along +y, positive yaw turns toward +x. pitch < 0 looks down.

// column-major 4x4 multiply, out = a * b - same layout WebGL expects
export function multiplyMat4(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
            out[c * 4 + r] = sum;
        }
    }
    return out;
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const normalize = (v) => {
    const len = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
};

export class Camera {
    constructor() {
        this.position = [0, -150, 120];
        this.yaw = 0;
        this.pitch = -0.6;
        this.fov = Math.PI / 3;   // vertical, radians
        this.near = 0.1;          // has to be positive - the java default of -0.1 breaks the projection
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

    // forward x worldUp(0,0,1), worked out by hand since pitch is clamped away from +-90 deg
    getRight() {
        return [Math.cos(this.yaw), -Math.sin(this.yaw), 0];
    }

    getUp() {
        return cross(this.getRight(), this.getForward());
    }

    // point the camera at `target` from `distance` away, using the given yaw/pitch
    lookAt(target, distance, yaw, pitch) {
        this.yaw = yaw;
        this.pitch = pitch;
        const f = this.getForward();
        this.position = [
            target[0] - f[0] * distance,
            target[1] - f[1] * distance,
            target[2] - f[2] * distance,
        ];
    }

    getViewMatrix() {
        const f = this.getForward();
        const r = this.getRight();
        const u = this.getUp();
        const p = this.position;

        return new Float32Array([
            r[0], u[0], -f[0], 0,
            r[1], u[1], -f[1], 0,
            r[2], u[2], -f[2], 0,
            -dot(r, p), -dot(u, p), dot(f, p), 1,
        ]);
    }

    getProjectionMatrix(aspect) {
        const f = 1.0 / Math.tan(this.fov / 2);
        const rangeInv = 1.0 / (this.near - this.far);

        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, -(this.near + this.far) * rangeInv, -1,   // negated
            0, 0, -2 * this.near * this.far * rangeInv, 0,   // negated
        ]);
    }
    
    getViewProjMatrix(aspect) {
        return multiplyMat4(this.getProjectionMatrix(aspect), this.getViewMatrix());
    }

    // world-space direction of the ray through a screen point (ndc -1..1, y up)
    rayDirection(ndcX, ndcY, aspect) {
        const tanHalfFov = Math.tan(this.fov / 2);
        const f = this.getForward();
        const r = this.getRight();
        const u = this.getUp();
        return normalize([
            f[0] + r[0] * ndcX * tanHalfFov * aspect + u[0] * ndcY * tanHalfFov,
            f[1] + r[1] * ndcX * tanHalfFov * aspect + u[1] * ndcY * tanHalfFov,
            f[2] + r[2] * ndcX * tanHalfFov * aspect + u[2] * ndcY * tanHalfFov,
        ]);
    }
}