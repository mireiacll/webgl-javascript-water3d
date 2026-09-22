#version 300 es
precision highp float;

in vec2 v_texCoord;
// r = outflow to the RIGHT (+x) neighbor, g = LEFT (-x), b = UP (+y), a = DOWN (-y), all >= 0.
out vec4 outFlux;

uniform sampler2D u_height;  // water DEPTH (r) from WaterFBO
uniform sampler2D u_flux;    // last step's (right, left, up, down) outflow
uniform sampler2D u_terrain; // fixed terrain height per column
uniform float u_texel;       // 1 / columnCount, same on both axes (square grid)
uniform float u_columnCount;
uniform float u_pipeArea;    // d*d, also equals a column's footprint area
uniform float u_pipeLength;  // d
uniform float u_dt;
uniform float u_damping;

const float GRAVITY = 9.8;

// flux through the one pipe that connects this column to the neighbor at v_texCoord + offset.
float pipeFlux(vec2 offset, float fOld, float terrainHere, float surfHere) {
    vec2 uvN = v_texCoord + offset;
    float terrainN = texture(u_terrain, uvN).r;
    float surfN = terrainN + texture(u_height, uvN).r;
    float hFace = max(0.0, max(surfHere, surfN) - max(terrainHere, terrainN));
    float f = max((fOld + u_dt * (u_pipeLength * hFace) * GRAVITY * (surfHere - surfN) / u_pipeLength) * u_damping, 0.0);
    if (surfHere <= terrainN) f = 0.0; // wall: can't flow into taller terrain
    return f;
}

void main() {
    vec2 cell = floor(v_texCoord * u_columnCount);
    bool hasRight = cell.x < u_columnCount - 1.0;
    bool hasLeft  = cell.x > 0.5;
    bool hasUp    = cell.y < u_columnCount - 1.0;
    bool hasDown  = cell.y > 0.5;

    float terrainHere = texture(u_terrain, v_texCoord).r;
    float depthHere = texture(u_height, v_texCoord).r;
    float surfHere = terrainHere + depthHere;
    vec4 fOld = texture(u_flux, v_texCoord);

    // edge columns have no neighbor on that side, their flux there stays 0 (closed wall)
    vec4 f = vec4(0.0);
    if (hasRight) f.r = pipeFlux(vec2( u_texel, 0.0), fOld.r, terrainHere, surfHere);
    if (hasLeft)  f.g = pipeFlux(vec2(-u_texel, 0.0), fOld.g, terrainHere, surfHere);
    if (hasUp)    f.b = pipeFlux(vec2(0.0,  u_texel), fOld.b, terrainHere, surfHere);
    if (hasDown)  f.a = pipeFlux(vec2(0.0, -u_texel), fOld.a, terrainHere, surfHere);

    // a column can only push water out as fast as its own depth allows (critical flow, v <= sqrt(g*h)).
    // without this, sub-pixel thin films race ahead of the visible water and pool several columns away.
    float maxOut = u_pipeLength * sqrt(GRAVITY) * depthHere * sqrt(depthHere);
    f = min(f, vec4(maxOut));

    // never send out more water than the column holds, split fairly between all four pipes
    float outVolume = (f.r + f.g + f.b + f.a) * u_dt;
    float available = depthHere * u_pipeArea;
    if (outVolume > available) {
        f *= available / outVolume;
    }

    outFlux = f;
}
