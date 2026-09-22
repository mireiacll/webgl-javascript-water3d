// Builds the RG32F seed texture WaterFBO expects:
// R = initial water DEPTH (height above the terrain)
// G = 0 velocity.
// The dropped block is a rectangle of columns [dropStartCol, dropEndCol) x [dropStartRow, dropEndRow).
export function buildWaterHeightTexture(gl, columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropAmount) {
    const buffer = new Float32Array(columnCount * columnCount * 2); // zeros = dry and at rest
    for (let row = dropStartRow; row < dropEndRow; row++) {
        for (let col = dropStartCol; col < dropEndCol; col++) {
            buffer[(row * columnCount + col) * 2] = dropAmount; // R: water depth
        }
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, columnCount, columnCount, 0, gl.RG, gl.FLOAT, buffer);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
}