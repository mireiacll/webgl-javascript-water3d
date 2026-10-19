#version 300 es
precision highp float;

in vec2 v_texCoord;
layout(location = 0) out vec2 outWater; // r = water depth, g = velocity - see WaterFBO

uniform sampler2D u_height; // last frame's (water depth, velocity), from WaterFBO
uniform sampler2D u_flux;   // THIS frame's flux (already updated), from FluxFBO
uniform sampler2D u_cellArea; // open area fraction of each simulation cell
uniform float u_texel;      // 1 / columnCount
uniform float u_columnCount;
uniform float u_columnArea; // d*d
uniform float u_dt;
uniform float u_minHeight;  // floor so a column's depth can't go negative and destabilize its neighbors

// pour/inflow: adds water directly into the column rectangle [u_pourStart, u_pourEnd)
// (col,row) at a fixed rate, for as long as the app is still delivering the poured volume.
// u_pourRate is 0 once the pour's duration has elapsed.
uniform vec2 u_pourStart;
uniform vec2 u_pourEnd;
uniform float u_pourRate; // depth added per second, m/s

void main() {
    // Combine neighbor inflow, local outflow, and any active pour for this cell.
    vec2 cell = floor(v_texCoord * u_columnCount);

    vec4 own = texture(u_flux, v_texCoord); // what THIS column sends right / left / up / down

    // what the 4 neighbors send INTO this column - each one reads the pipe that points at us
    float fromLeft  = cell.x < 0.5 ? 0.0 : texture(u_flux, v_texCoord - vec2(u_texel, 0.0)).r;
    float fromRight = cell.x > u_columnCount - 1.5 ? 0.0 : texture(u_flux, v_texCoord + vec2(u_texel, 0.0)).g;
    float fromDown  = cell.y < 0.5 ? 0.0 : texture(u_flux, v_texCoord - vec2(0.0, u_texel)).b;
    float fromUp    = cell.y > u_columnCount - 1.5 ? 0.0 : texture(u_flux, v_texCoord + vec2(0.0, u_texel)).a;

    float inflow  = fromLeft + fromRight + fromDown + fromUp;
    float outflow = own.r + own.g + own.b + own.a;

    float hOld = texture(u_height, v_texCoord).r;
    float openArea = texture(u_cellArea, v_texCoord).r;
    if (openArea <= 1e-6) {
        outWater = vec2(0.0);
        return;
    }
    bool inPour = all(greaterThanEqual(cell, u_pourStart)) && all(lessThan(cell, u_pourEnd));
    float pourAmount = inPour ? u_pourRate * u_dt : 0.0;

    float hNew = hOld + u_dt * (inflow - outflow) / (u_columnArea * openArea) + pourAmount;
    hNew = max(hNew, u_minHeight);

    float velocity = (inflow - outflow) / (u_columnArea * openArea);

    outWater = vec2(hNew, velocity);
}
