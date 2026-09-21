#version 300 es
precision highp float;

in vec2 v_texCoord;
layout(location = 0) out vec2 outWater; // r = water depth, g = velocity - see WaterFBO

uniform sampler2D u_height; // last frame's (water depth, velocity), from WaterFBO
uniform sampler2D u_flux;   // THIS frame's flux (already updated), from FluxFBO
uniform float u_texelX;
uniform float u_columnCount;
uniform float u_columnArea; // d*d
uniform float u_dt;
uniform float u_minHeight;  // floor so a column's depth can't go negative and destabilize its neighbors

// pour/inflow: adds water directly into [u_pourStartCol, u_pourEndCol) at a
// fixed rate, for as long as the app is still delivering the poured volume.
// u_pourRate is 0 once the pour's duration has elapsed.
uniform float u_pourStartCol;
uniform float u_pourEndCol;
uniform float u_pourRate; // depth added per second, m/s

void main() {
    float col = floor(v_texCoord.x * u_columnCount);

    vec2 own = texture(u_flux, v_texCoord).rg; // what THIS column sends right / left
    // what the neighbors send INTO this column
    float fromLeft  = col < 0.5 ? 0.0 : texture(u_flux, v_texCoord - vec2(u_texelX, 0.0)).r;
    float fromRight = col > u_columnCount - 1.5 ? 0.0 : texture(u_flux, v_texCoord + vec2(u_texelX, 0.0)).g;

    float inflow  = fromLeft + fromRight;
    float outflow = own.r + own.g;

    float hOld = texture(u_height, v_texCoord).r;
    float pourAmount = (col >= u_pourStartCol && col < u_pourEndCol) ? u_pourRate * u_dt : 0.0;

    float hNew = hOld + u_dt * (inflow - outflow) / u_columnArea + pourAmount;
    hNew = max(hNew, u_minHeight);

    float velocity = (inflow - outflow) / u_columnArea; // same quantity as before

    outWater = vec2(hNew, velocity);
}
