// Creates an RG32F water state with the initial drop in the specified column range.
export function buildWaterHeightTexture(gl, columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropAmount, openArea = null) {
    const buffer = new Float32Array(columnCount * columnCount * 2);
    for (let row = dropStartRow; row < dropEndRow; row++) {
        for (let col = dropStartCol; col < dropEndCol; col++) {
            const index = row * columnCount + col;
            buffer[index * 2] = openArea && openArea[index] <= 1e-6 ? 0 : dropAmount;
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