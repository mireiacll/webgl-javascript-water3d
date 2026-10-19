const FULLSCREEN_QUAD_DATA = new Float32Array([
    -1, -1, 0,  0, 0,
     1, -1, 0,  1, 0,
     1,  1, 0,  1, 1,
    -1, -1, 0,  0, 0,
     1,  1, 0,  1, 1,
    -1,  1, 0,  0, 1,
]);

export function createFullscreenQuad(gl, positionLoc, texCoordLoc) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_QUAD_DATA, gl.STATIC_DRAW);

    const stride = 5 * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

    gl.bindVertexArray(null);
    return vao;
}