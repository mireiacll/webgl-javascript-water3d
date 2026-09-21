import { WaterFBO } from './WaterFBO.js';

// current() = last frame's finalized (height, velocity); next() = this frame's
export class WaterPingPongBuffer {
    constructor(gl, columnCount) {
        this.bufferA = new WaterFBO(gl, columnCount);
        this.bufferB = new WaterFBO(gl, columnCount);
        this.aIsCurrent = true;
    }

    current() { return this.aIsCurrent ? this.bufferA : this.bufferB; }
    next() { return this.aIsCurrent ? this.bufferB : this.bufferA; }
    swap() { this.aIsCurrent = !this.aIsCurrent; }

    dispose() {
        this.bufferA.dispose();
        this.bufferB.dispose();
    }
}
