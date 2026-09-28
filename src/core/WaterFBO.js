// RG32F: water depth in R, velocity in G; one texel per column.
export class WaterFBO {
    constructor(gl, columnCount) {
        this.gl = gl;
        this.columnCount = columnCount;
        this._build();
    }

    _build() {
        const gl = this.gl;
        this.framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, this.columnCount, this.columnCount, 0, gl.RG, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error(`WaterFBO: framebuffer incomplete, status: ${status.toString(16)}`);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    bind() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.columnCount, this.columnCount);
    }

    unbind() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    // Sum of water depth (R) over all columns. GPU readback stalls the pipeline: debug use only.
    readTotalDepth() {
        const gl = this.gl;
        const n = this.columnCount;
        const data = new Float32Array(n * n * 4);
        this.bind();
        gl.readPixels(0, 0, n, n, gl.RGBA, gl.FLOAT, data);
        this.unbind();

        let sum = 0;
        for (let i = 0; i < n * n; i++) sum += data[i * 4];
        return sum;
    }

    dispose() {
        const gl = this.gl;
        gl.deleteFramebuffer(this.framebuffer);
        gl.deleteTexture(this.texture);
    }

    getTexture() { return this.texture; }
}