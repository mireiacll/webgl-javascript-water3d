import { FluxFBO } from './FluxFBO.js';

// Keep last-step flux separate from the target written by the current pass.
export class FluxPingPongBuffer {
    constructor(gl, columnCount) {
        this.bufferA = new FluxFBO(gl, columnCount);
        this.bufferB = new FluxFBO(gl, columnCount);
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
