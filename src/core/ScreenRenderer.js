import { ScreenShader } from './ScreenShader.js';

// Draws a texture full-screen using its own dedicated shader.
export class ScreenRenderer {
    constructor(gl) {
        this.gl = gl;
        this.shader = new ScreenShader(gl);
        this._buildQuad();
    }

    _buildQuad() {
        const gl = this.gl;
        // interleaved: position(3) + texCoord(2) = 5 floats per vertex,
        // a full-screen quad made of 2 triangles (6 vertices, no index buffer needed)
        const data = new Float32Array([
            -1, -1, 0,  0, 0,
             1, -1, 0,  1, 0,
             1,  1, 0,  1, 1,

            -1, -1, 0,  0, 0,
             1,  1, 0,  1, 1,
            -1,  1, 0,  0, 1,
        ]);

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        const stride = 5 * Float32Array.BYTES_PER_ELEMENT;

        const { positionLoc, texCoordLoc } = this.shader;
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(texCoordLoc);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

        gl.bindVertexArray(null);
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
