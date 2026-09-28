const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class CameraController {
    constructor(canvas, camera) {
        this.canvas = canvas;
        this.camera = camera;

        this.rotateSpeed = 0.0025;
        this.wheelZoomSpeed = 0.001;
        this.dragZoomSpeed = 0.005;
        this.minAltitude = 1;
        this.heightSampler = () => 0;
        this.maxPickDistance = 4000;
        this.maxOrbitPitch = -0.02;

        this.mode = null;
        this.pointerId = null;
        this.lastX = 0;
        this.lastY = 0;
        this.panAnchor = null;
        this.panStartPos = null;
        this.pivot = null;
        this.orbitDistance = 0;
        this.zoomTarget = null;

        this._onPointerDown = (e) => this._pointerDown(e);
        this._onPointerMove = (e) => this._pointerMove(e);
        this._onPointerUp = (e) => this._pointerUp(e);
        this._onWheel = (e) => this._wheel(e);
        this._onContextMenu = (e) => e.preventDefault();

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

    setHeightSampler(fn) { this.heightSampler = fn || (() => 0); }

    setMaxPickDistance(d) { this.maxPickDistance = d; }

    // Clamp the movement fraction, not just Z, so zoom stays on its target line.
    _clampZoomMove(pos, target, move) {
        const dz = target[2] - pos[2];
        const naiveZ = pos[2] + dz * move;
        const landingX = pos[0] + (target[0] - pos[0]) * move;
        const landingY = pos[1] + (target[1] - pos[1]) * move;
        const localGround = this.heightSampler(landingX, landingY);
        const minZ = localGround + this.minAltitude;

        if (naiveZ >= minZ) return move;
        if (Math.abs(dz) < 1e-6) return move;

        const boundedMove = (minZ - pos[2]) / dz;
        return clamp(boundedMove, Math.min(0, move), Math.max(0, move));
    }

    _pickPlaneZ(point) {
        return this.heightSampler(point[0], point[1]);
    }

    // Pan rays share their initial origin so the anchor plane stays fixed during a drag.
    _pickGround(clientX, clientY, origin = this.camera.position) {
        const rect = this.canvas.getBoundingClientRect();
        const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
        const dir = this.camera.rayDirection(ndcX, ndcY, rect.width / rect.height);

        if (Math.abs(dir[2]) < 1e-6) return null;
        const planeZ = this._pickPlaneZ(origin);
        const t = (planeZ - origin[2]) / dir[2];
        if (t <= 0 || t > this.maxPickDistance) return null;

        return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, planeZ];
    }

    _fallbackPoint() {
        const pos = this.camera.position;
        const f = this.camera.getForward();
        const distance = Math.max(10, Math.abs(pos[2] - this._pickPlaneZ(pos)));
        return [pos[0] + f[0] * distance, pos[1] + f[1] * distance, pos[2] + f[2] * distance];
    }

    _pointerDown(e) {
        if (this.mode) return;

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

    _pan(e) {
        if (!this.panAnchor) return;
        const current = this._pickGround(e.clientX, e.clientY, this.panStartPos);
        if (!current) return;

        const cam = this.camera;
        cam.position = [
            this.panStartPos[0] + (this.panAnchor[0] - current[0]),
            this.panStartPos[1] + (this.panAnchor[1] - current[1]),
            this.panStartPos[2],
        ];
    }

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

    _zoomToward(target, factor) {
        const cam = this.camera;
        const pos = cam.position;
        const move = this._clampZoomMove(pos, target, 1 - factor);
        cam.position = [
            pos[0] + (target[0] - pos[0]) * move,
            pos[1] + (target[1] - pos[1]) * move,
            pos[2] + (target[2] - pos[2]) * move,
        ];
    }

    _wheel(e) {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
        const delta = clamp(e.deltaY * unit, -400, 400);

        const target = this._pickGround(e.clientX, e.clientY) ?? this._fallbackPoint();
        this._zoomToward(target, Math.exp(delta * this.wheelZoomSpeed));
    }
}