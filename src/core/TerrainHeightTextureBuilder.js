const OCTAVES = 5;
const PERSISTENCE = 0.5;   // each octave has half the amplitude of the previous one
const LACUNARITY = 2.2;    // each octave has ~2.2x the frequency of the previous one
const BASE_WAVELENGTH_FRACTION = 0.6; // first (broadest) octave's wavelength, as a fraction of world width

// mulberry32 - small seedable PRNG (java.util.Random has no JS equivalent)
function makeRandom(seed) {
    let a = seed >>> 0;
    return function next() {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function buildTerrainHeightTexture(gl, columnCount, worldWidth, heightScale, seed) {
    const random = makeRandom(Number(seed));

    const amplitude = new Array(OCTAVES);
    const wavelength = new Array(OCTAVES);
    const phase = new Array(OCTAVES);
    const dirX = new Array(OCTAVES);
    const dirY = new Array(OCTAVES);
    let amplitudeSum = 0;
    let amp = 1;
    let wavelen = worldWidth * BASE_WAVELENGTH_FRACTION;
    for (let o = 0; o < OCTAVES; o++) {
        amplitude[o] = amp;
        wavelength[o] = wavelen;
        phase[o] = random() * 2 * Math.PI;
        const angle = random() * 2 * Math.PI;
        dirX[o] = Math.cos(angle);
        dirY[o] = Math.sin(angle);
        amplitudeSum += amp;
        amp *= PERSISTENCE;
        wavelen /= LACUNARITY;
    }

    // row-major: texel (col, row) is buffer[row * columnCount + col]
    const buffer = new Float32Array(columnCount * columnCount);
    for (let row = 0; row < columnCount; row++) {
        const y = (row + 0.5) / columnCount * worldWidth;
        for (let col = 0; col < columnCount; col++) {
            const x = (col + 0.5) / columnCount * worldWidth;
            let raw = 0;
            for (let o = 0; o < OCTAVES; o++) {
                const along = x * dirX[o] + y * dirY[o];
                raw += amplitude[o] * Math.sin(2 * Math.PI * along / wavelength[o] + phase[o]);
            }
            // raw sits in [-amplitudeSum, amplitudeSum] - normalize to [0, 1], then scale to heightScale
            const normalized = (raw / amplitudeSum + 1) * 0.5;
            buffer[row * columnCount + col] = normalized * heightScale;
        }
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, columnCount, columnCount, 0, gl.RED, gl.FLOAT, buffer);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
}