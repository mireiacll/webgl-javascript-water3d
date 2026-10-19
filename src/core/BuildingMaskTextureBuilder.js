// Uploads per-cell open area and per-edge flow apertures for the cut-cell solver.
export function buildBuildingMaskTextures(gl, columnCount, coverage) {
    const cellArea = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, cellArea);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, columnCount, columnCount, 0, gl.RED, gl.FLOAT, coverage.cellArea);
    setNearestClamp(gl);

    const edgeOpen = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, edgeOpen);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, columnCount, columnCount, 0, gl.RGBA, gl.FLOAT, coverage.edgeOpen);
    setNearestClamp(gl);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { cellArea, edgeOpen };
}

function setNearestClamp(gl) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

export function deleteBuildingMaskTextures(gl, masks) {
    gl.deleteTexture(masks.cellArea);
    gl.deleteTexture(masks.edgeOpen);
}
