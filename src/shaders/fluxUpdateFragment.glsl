#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec2 outFlux; // r = outflow to the RIGHT neighbor, g = outflow to the LEFT neighbor (both >= 0)

uniform sampler2D u_height;  // water DEPTH (r) from WaterFBO
uniform sampler2D u_flux;    // last step's (right, left) outflow
uniform sampler2D u_terrain; // fixed terrain height per column
uniform float u_texelX;
uniform float u_columnCount;
uniform float u_pipeArea;    // d*d, also equals a column's footprint area
uniform float u_pipeLength;  // d
uniform float u_dt;
uniform float u_damping;

const float GRAVITY = 9.8;

void main() {
    float col = floor(v_texCoord.x * u_columnCount);
    bool hasLeft  = col > 0.5;
    bool hasRight = col < u_columnCount - 1.0;
    vec2 step = vec2(u_texelX, 0.0);

    float terrainHere = texture(u_terrain, v_texCoord).r;
    float surfHere = terrainHere + texture(u_height, v_texCoord).r;
    vec2 fOld = texture(u_flux, v_texCoord).rg;

    float fRight = 0.0;
    if (hasRight) {
        float terrainRight = texture(u_terrain, v_texCoord + step).r;
        float surfRight = terrainRight + texture(u_height, v_texCoord + step).r;
        float hFaceR = max(0.0, max(surfHere, surfRight) - max(terrainHere, terrainRight));
        fRight = max((fOld.r + u_dt * (u_pipeLength * hFaceR) * GRAVITY * (surfHere - surfRight) / u_pipeLength) * u_damping, 0.0);
        if (surfHere <= terrainRight) fRight = 0.0; // wall: can't flow into taller terrain
    }

    float fLeft = 0.0;
    if (hasLeft) {
        float terrainLeft = texture(u_terrain, v_texCoord - step).r;
        float surfLeft = terrainLeft + texture(u_height, v_texCoord - step).r;
        float hFaceL = max(0.0, max(surfHere, surfLeft) - max(terrainHere, terrainLeft));
        fLeft = max((fOld.g + u_dt * (u_pipeLength * hFaceL) * GRAVITY * (surfHere - surfLeft) / u_pipeLength) * u_damping, 0.0);
        if (surfHere <= terrainLeft) fLeft = 0.0;
    }

    // a column can only push water out as fast as its own depth allows (critical flow, v <= sqrt(g*h)).
    // without this, sub-pixel thin films race ahead of the visible water and pool several columns away.
    float depthHere = texture(u_height, v_texCoord).r;
    float maxOut = u_pipeLength * sqrt(GRAVITY) * depthHere * sqrt(depthHere);
    fRight = min(fRight, maxOut);
    fLeft  = min(fLeft, maxOut);

    // never send out more water than the column holds, split fairly between both pipes
    float outVolume = (fRight + fLeft) * u_dt;
    float available = texture(u_height, v_texCoord).r * u_pipeArea;
    if (outVolume > available) {
        float k = available / outVolume;
        fRight *= k;
        fLeft  *= k;
    }

    outFlux = vec2(fRight, fLeft);
}
