#version 300 es

in vec3 a_corner;  // corner of a unit box, each axis 0..1
in vec3 a_normal;  // face normal of that corner (unused / zero for the outline lines)

uniform sampler2D u_water;    // WaterFBO texture: r = water DEPTH above terrain, g = velocity (unused here)
uniform sampler2D u_terrain;  // fixed terrain height per column, r32f
uniform mat4 u_viewProj;
uniform float u_columnCount;  // columns per side
uniform float u_worldWidth;   // side of the whole tank in meters
uniform float u_gapFraction;  // fraction of each column's width left empty as a gap, e.g. 0.1
uniform int u_layer;          // 0 = terrain (z 0 -> terrain top), 1 = water (terrain top -> water top)

uniform sampler2D u_flux;     // (right, left, up, down) outflow per column, m^3/s
uniform int u_colorMode;      // 0 = none, 1 = depth, 2 = velocity, 3 = flux
uniform float u_rangeMax;     // legend max, same units as the chosen quantity

out float v_t;                // chosen quantity, normalized to 0..1 by u_rangeMax
out vec3 v_normal;
out vec2 v_texCoord; // derived from world xy below, not a separate attribute - same
                      // u = x/worldWidth, v = 1 - y/worldWidth convention MireiaTerrainMesh.js
                      // uses for the mesh, so the same imagery lines up on both renderers

// water shallower than this (meters) is still simulated but not drawn - hides the thin film that barely moves,
// and avoids zero-height boxes z-fighting with the terrain top
const float MIN_DRAW_DEPTH = 0.05;

// Net discharge per unit width (m^2/s) through a cell, from the four pipes around it.
vec2 cellDischarge(ivec2 c, int n, float d) {
    vec4 own = texelFetch(u_flux, c, 0);
    float fromLeft  = c.x > 0     ? texelFetch(u_flux, c + ivec2(-1, 0), 0).r : 0.0;
    float fromRight = c.x < n - 1 ? texelFetch(u_flux, c + ivec2( 1, 0), 0).g : 0.0;
    float fromDown  = c.y > 0     ? texelFetch(u_flux, c + ivec2(0, -1), 0).b : 0.0;
    float fromUp    = c.y < n - 1 ? texelFetch(u_flux, c + ivec2(0,  1), 0).a : 0.0;
    return 0.5 * vec2(fromLeft - own.g + own.r - fromRight,
                      fromDown - own.a + own.b - fromUp) / d;
}

float cellMetric(ivec2 c, int n, float d) {
    float h = texelFetch(u_water, c, 0).r;
    if (u_colorMode == 1) return h;
    float q = length(cellDischarge(c, n, d));
    if (u_colorMode == 3) return q;
    return h > 1e-3 ? q / h : 0.0; // velocity = discharge / depth
}

void main() {
    // Map each instance id to the matching terrain and water texel.
    int n = int(u_columnCount + 0.5);
    ivec2 cell = ivec2(gl_InstanceID % n, gl_InstanceID / n);

    float terrainH = texelFetch(u_terrain, cell, 0).r;
    float waterDepth = texelFetch(u_water, cell, 0).r;

    if (u_layer == 1 && waterDepth < MIN_DRAW_DEPTH) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume, whole box gets dropped
        v_normal = vec3(0.0);
        v_texCoord = vec2(0.0);
        v_t = 0.0;
        return;
    }

    float d = u_worldWidth / u_columnCount;
    float gap = d * u_gapFraction * 0.5;

    // x/y footprint of THIS column's box, shrunk in from the full cell so neighbors don't touch
    vec2 xyMin = vec2(cell) * d + gap;
    vec2 xyMax = vec2(cell + 1) * d - gap;

    float zBottom = (u_layer == 0) ? 0.0 : terrainH;
    float zTop = (u_layer == 0) ? terrainH : terrainH + waterDepth;

    vec3 pos = vec3(mix(xyMin, xyMax, a_corner.xy), mix(zBottom, zTop, a_corner.z));

    gl_Position = u_viewProj * vec4(pos, 1.0);
    v_normal = a_normal;
    v_texCoord = vec2(pos.x / u_worldWidth, 1.0 - pos.y / u_worldWidth);

    v_t = 0.0;
    if (u_layer == 1 && u_colorMode > 0) {
        v_t = clamp(cellMetric(cell, n, d) / u_rangeMax, 0.0, 1.0);
    }
}
