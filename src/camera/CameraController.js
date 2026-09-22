// Cesium-style mouse controls:
//   left drag              pan - the ground point you grabbed stays under the cursor
//   right drag             zoom toward the point you started on (drag up = in)
//   middle drag / ctrl+left  orbit around the ground point you started on
//   wheel                  zoom toward the point under the cursor
//
// "ground" is a horizontal plane at groundZ, not the real terrain surface. main.js keeps it
// at mid terrain height, which is close enough that things don't visibly slide while panning.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class CameraController {
    constructor(canvas, camera) {
        this.canvas = canvas;
        this.camera = camera;

        this.groundZ = 0;
        this.rotateSpeed = 0.0025;      // radians per pixel
        this.wheelZoomSpeed = 0.001;    // per wheel pixel, exponential (a normal notch is ~10%)
        this.dragZoomSpeed = 0.005;     // per pixel of right-drag
        this.minAltitude = 1;
        this.maxAltitude = 2000;
        this.maxPickDistance = 4000;    // rays that hit the ground farther than this count as a miss (horizon)
        this.maxOrbitPitch = -0.02;     // keeps the orbiting camera from dipping under the ground plane

        this.mode = null;               // 'pan' | 'orbit' | 'zoom' | null
        this.pointerId = null;
        this.lastX = 0;
        this.lastY = 0;
        this.panAnchor = null;          // ground point grabbed at the start of a pan
        this.panStartPos = null;        // camera position at the start of the pan
        this.pivot = null;              // orbit center
        this.orbitDistance = 0;
        this.zoomTarget = null;

        this._onPointerDown = (e) => this._pointerDown(e);
        this._onPointerMove = (e) => this._pointerMove(e);
        this._onPointerUp = (e) => this._pointerUp(e);
        this._onWheel = (e) => this._wheel(e);
        this._onContextMenu = (e) => e.preventDefault(); // right-drag is zoom, not a menu

        canvas.style.touchAction = 'none';
        canvas.addEventListener('pointerdown', this._onPointerDown);
        canvas.addEventListener('pointermove', this._onPointerMove);
        canvas.addEventListener('pointerup', this._onPointerUp);
        canvas.addEventListener('pointercancel', this._onPointerUp);
        canvas.addEventListener('wheel', this._onWheel, { passive: false });
        canvas.addEventListener('contextmenu', this._onContextMenu);
    }

    dispose() {
        const c = this.canvas;
        c.removeEventListener('pointerdown', this._onPointerDown);
        c.removeEventListener('pointermove', this._onPointerMove);
        c.removeEventListener('pointerup', this._onPointerUp);
        c.removeEventListener('pointercancel', this._onPointerUp);
        c.removeEventListener('wheel', this._onWheel);
        c.removeEventListener('contextmenu', this._onContextMenu);
    }

    // where the ray through this screen point hits the ground plane, or null.
    // `origin` lets a pan re-cast rays from where the camera was when the drag began.
    _pickGround(clientX, clientY, origin = this.camera.position) {
        const rect = this.canvas.getBoundingClientRect();
        const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
        const dir = this.camera.rayDirection(ndcX, ndcY, rect.width / rect.height);

        if (Math.abs(dir[2]) < 1e-6) return null;        // parallel to the ground
        const t = (this.groundZ - origin[2]) / dir[2];
        if (t <= 0 || t > this.maxPickDistance) return null; // behind us, or out at the horizon

        return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, this.groundZ];
    }

    // used when the cursor isn't over ground (sky): a point straight ahead
    _fallbackPoint() {
        const pos = this.camera.position;
        const f = this.camera.getForward();
        const distance = Math.max(10, Math.abs(pos[2] - this.groundZ));
        return [pos[0] + f[0] * distance, pos[1] + f[1] * distance, pos[2] + f[2] * distance];
    }

    _pointerDown(e) {
        if (this.mode) return; // one drag at a time

        let mode = null;
        if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) mode = 'orbit';
        else if (e.button === 0) mode = 'pan';
        else if (e.button === 2) mode = 'zoom';
        if (!mode) return;

        e.preventDefault();
        this.canvas.setPointerCapture(e.pointerId);
        this.pointerId = e.pointerId;
        this.mode = mode;
        this.lastX = e.clientX;
        this.lastY = e.clientY;

        const pos = this.camera.position;
        if (mode === 'pan') {
            this.panAnchor = this._pickGround(e.clientX, e.clientY);
            this.panStartPos = [pos[0], pos[1], pos[2]];
        } else if (mode === 'orbit') {
            this.pivot = this._pickGround(e.clientX, e.clientY) ?? this._fallbackPoint();
            this.orbitDistance = Math.hypot(
                this.pivot[0] - pos[0], this.pivot[1] - pos[1], this.pivot[2] - pos[2]);
        } else {
            this.zoomTarget = this._pickGround(e.clientX, e.clientY) ?? this._fallbackPoint();
        }
    }

    _pointerMove(e) {
        if (!this.mode || e.pointerId !== this.pointerId) return;

        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;

        if (this.mode === 'pan') this._pan(e);
        else if (this.mode === 'orbit') this._orbit(dx, dy);
        else this._zoomToward(this.zoomTarget, Math.exp(dy * this.dragZoomSpeed));
    }

    _pointerUp(e) {
        if (e.pointerId !== this.pointerId) return;
        this.mode = null;
        this.pointerId = null;
        this.panAnchor = null;
        this.panStartPos = null;
        this.pivot = null;
        this.zoomTarget = null;
    }

    // cast the cursor ray from the camera's ORIGINAL position (orientation doesn't change during a
    // pan), see where it lands, and shift the camera by however far that is from the grabbed point.
    // altitude stays fixed
    _pan(e) {
        if (!this.panAnchor) return; // started the drag on the sky, nothing to grab
        const current = this._pickGround(e.clientX, e.clientY, this.panStartPos);
        if (!current) return;

        const cam = this.camera;
        cam.position = [
            this.panStartPos[0] + (this.panAnchor[0] - current[0]),
            this.panStartPos[1] + (this.panAnchor[1] - current[1]),
            this.panStartPos[2],
        ];
    }

    // turn yaw/pitch AND swing the position around the pivot, so the pivot stays put in the world
    _orbit(dx, dy) {
        const cam = this.camera;
        cam.yaw += dx * this.rotateSpeed;
        cam.pitch = clamp(cam.pitch - dy * this.rotateSpeed, -Math.PI / 2 + 0.01, this.maxOrbitPitch);

        const f = cam.getForward();
        cam.position = [
            this.pivot[0] - f[0] * this.orbitDistance,
            this.pivot[1] - f[1] * this.orbitDistance,
            this.pivot[2] - f[2] * this.orbitDistance,
        ];
    }

    // factor < 1 moves toward the target, > 1 moves away. it's a fraction of the remaining
    // distance, so zooming slows down as you get close and can never overshoot
    _zoomToward(target, factor) {
        const cam = this.camera;
        const pos = cam.position;
        const move = 1 - factor;
        cam.position = [
            pos[0] + (target[0] - pos[0]) * move,
            pos[1] + (target[1] - pos[1]) * move,
            clamp(pos[2] + (target[2] - pos[2]) * move, this.minAltitude, this.maxAltitude),
        ];
    }

    _wheel(e) {
        e.preventDefault();
        // browsers report wheel movement in pixels, lines or pages depending on device
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
        const delta = clamp(e.deltaY * unit, -400, 400);

        const target = this._pickGround(e.clientX, e.clientY) ?? this._fallbackPoint();
        this._zoomToward(target, Math.exp(delta * this.wheelZoomSpeed));
    }
}