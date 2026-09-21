// Builds a single-channel R32F texture holding one FIXED terrain height per
// column - the floor the water sim rests on and flows over. Same call shape
// as WaterHeightTextureBuilder.build(): CPU-side buffer, uploaded once,
// texture handle returned directly (no FBO - this is only ever sampled,
// never rendered into).
//
// The profile is a handful of sine waves at decreasing amplitude / increasing
// frequency (a cheap 1D fractal/"red" noise) with a random phase per octave,
// so a given seed always regenerates the same mountain range and a new seed
// gives a different one.

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
    let amplitudeSum = 0;
    let amp = 1;
    let wavelen = worldWidth * BASE_WAVELENGTH_FRACTION;
    for (let o = 0; o < OCTAVES; o++) {
        amplitude[o] = amp;
        wavelength[o] = wavelen;
        phase[o] = random() * 2 * Math.PI;
        amplitudeSum += amp;
        amp *= PERSISTENCE;
        wavelen /= LACUNARITY;
    }

    const buffer = new Float32Array(columnCount);
    for (let i = 0; i < columnCount; i++) {
        const x = (i + 0.5) / columnCount * worldWidth;
        let raw = 0;
        for (let o = 0; o < OCTAVES; o++) {
            raw += amplitude[o] * Math.sin(2 * Math.PI * x / wavelength[o] + phase[o]);
        }
        // raw sits in [-amplitudeSum, amplitudeSum] - normalize to [0, 1], then scale to heightScale
        const normalized = (raw / amplitudeSum + 1) * 0.5;
        buffer[i] = normalized * heightScale;
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, columnCount, 1, 0, gl.RED, gl.FLOAT, buffer);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
}
