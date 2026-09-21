// Builds the RG32F seed texture WaterFBO expects:
// R = initial water DEPTH (height above the terrain)
// G = 0 velocity.
export function buildWaterHeightTexture(gl, columnCount, dropStartCol, dropEndCol, dropAmount) {
    const buffer = new Float32Array(columnCount * 2);
    for (let i = 0; i < columnCount; i++) {
        const inDrop = i >= dropStartCol && i < dropEndCol;
        buffer[i * 2] = inDrop ? dropAmount : 0;  // R: water depth
        buffer[i * 2 + 1] = 0;                     // G: velocity, starts at rest
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, columnCount, 1, 0, gl.RG, gl.FLOAT, buffer);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
}
