// One scalar pair per texel: (flux to the right neighbor, flux to the left neighbor).
// The leftmost/rightmost columns have no neighbor on one side and are always
// written 0 there - see fluxUpdateFragment.glsl.
export class FluxFBO {
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
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, this.columnCount, 1, 0, gl.RG, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error(`FluxFBO: framebuffer incomplete, status: ${status.toString(16)}`);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    bind() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.columnCount, 1);
    }

    unbind() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    dispose() {
        const gl = this.gl;
        gl.deleteFramebuffer(this.framebuffer);
        gl.deleteTexture(this.texture);
    }

    getTexture() { return this.texture; }
}
