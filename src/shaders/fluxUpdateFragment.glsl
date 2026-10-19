#version 300 es
precision highp float;

in vec2 v_texCoord;
// Each output component is nonnegative flow toward one neighbor: +x, -x, +y, -y.
out vec4 outFlux;

uniform sampler2D u_height;  // water DEPTH (r) from WaterFBO
uniform sampler2D u_flux;    // last step's (right, left, up, down) outflow
uniform sampler2D u_terrain; // fixed terrain height per column
uniform sampler2D u_cellArea; // open area fraction of each simulation cell
uniform sampler2D u_edgeOpen; // open fraction of east, west, north, south cell edges
uniform float u_texel;       // 1 / columnCount, same on both axes (square grid)
uniform float u_columnCount;
uniform float u_pipeArea;    // d*d, also equals a column's footprint area
uniform float u_pipeLength;  // d
uniform float u_dt;
uniform float u_damping;
uniform float u_openBoundary; // 1 = water leaves through the borders, 0 = closed walls

const float GRAVITY = 9.8;

// flux through the one pipe that connects this column to the neighbor at v_texCoord + offset.
// outside = true: the neighbor is beyond the border, assumed same terrain height and dry.
float pipeFlux(vec2 offset, float fOld, float terrainHere, float surfHere, float aperture, bool outside) {
    if (aperture <= 0.0) return 0.0;
    vec2 uvN = v_texCoord + offset;
    float terrainN = outside ? terrainHere : texture(u_terrain, uvN).r;
    float surfN = outside ? terrainHere : terrainN + texture(u_height, uvN).r;
    float hFace = max(0.0, max(surfHere, surfN) - max(terrainHere, terrainN));
    float f = max((fOld + u_dt * (u_pipeLength * aperture * hFace) * GRAVITY * (surfHere - surfN) / u_pipeLength) * u_damping, 0.0);
    if (surfHere <= terrainN) f = 0.0; // wall: can't flow into taller terrain
    return f;
}

void main() {
    // Compute outgoing flow, then cap it by critical speed and available water.
    vec2 cell = floor(v_texCoord * u_columnCount);
    bool hasRight = cell.x < u_columnCount - 1.0;
    bool hasLeft  = cell.x > 0.5;
    bool hasUp    = cell.y < u_columnCount - 1.0;
    bool hasDown  = cell.y > 0.5;

    float terrainHere = texture(u_terrain, v_texCoord).r;
    float depthHere = texture(u_height, v_texCoord).r;
    float surfHere = terrainHere + depthHere;
    vec4 fOld = texture(u_flux, v_texCoord);
    vec4 openings = texture(u_edgeOpen, v_texCoord);
    float openArea = texture(u_cellArea, v_texCoord).r;
    if (openArea <= 1e-6) {
        outFlux = vec4(0.0);
        return;
    }

    // edge columns: closed wall (flux 0) unless u_openBoundary is set, then they drain into a ghost cell
    vec4 f = vec4(0.0);
    bool openEdges = u_openBoundary > 0.5;
    if (hasRight || openEdges) f.r = pipeFlux(vec2( u_texel, 0.0), fOld.r, terrainHere, surfHere, openings.r, !hasRight);
    if (hasLeft  || openEdges) f.g = pipeFlux(vec2(-u_texel, 0.0), fOld.g, terrainHere, surfHere, openings.g, !hasLeft);
    if (hasUp    || openEdges) f.b = pipeFlux(vec2(0.0,  u_texel), fOld.b, terrainHere, surfHere, openings.b, !hasUp);
    if (hasDown  || openEdges) f.a = pipeFlux(vec2(0.0, -u_texel), fOld.a, terrainHere, surfHere, openings.a, !hasDown);

    // a column can only push water out as fast as its own depth allows (critical flow, v <= sqrt(g*h)).
    // without this, sub-pixel thin films race ahead of the visible water and pool several columns away.
    float maxOut = u_pipeLength * sqrt(GRAVITY) * depthHere * sqrt(depthHere);
    f = min(f, openings * maxOut);

    // never send out more water than the column holds, split fairly between all four pipes
    float outVolume = (f.r + f.g + f.b + f.a) * u_dt;
    float available = depthHere * u_pipeArea * openArea;
    if (outVolume > available) {
        f *= available / outVolume;
    }

    outFlux = f;
}
