import { FluxFBO } from './FluxFBO.js';

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
