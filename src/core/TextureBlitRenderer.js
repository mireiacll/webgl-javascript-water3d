import { TextureBlitShader } from './TextureBlitShader.js';
import { createFullscreenQuad } from './FullscreenQuad.js';

// Copy a seed texture into the current water framebuffer.
export class TextureBlitRenderer {
    constructor(gl) {
        this.gl = gl;
        this.shader = new TextureBlitShader(gl);
        this.vao = createFullscreenQuad(gl, this.shader.positionLoc, this.shader.texCoordLoc);
    }

    render(texture) {
        const gl = this.gl;
        gl.useProgram(this.shader.program);
        gl.bindVertexArray(this.vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(this.shader.textureLoc, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindVertexArray(null);
    }
}
