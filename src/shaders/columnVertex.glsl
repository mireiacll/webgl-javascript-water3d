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

out vec3 v_normal;
out vec2 v_texCoord; // derived from world xy below, not a separate attribute - same
                      // u = x/worldWidth, v = 1 - y/worldWidth convention MireiaTerrainMesh.js
                      // uses for the mesh, so the same imagery lines up on both renderers

// water shallower than this (meters) is still simulated but not drawn - hides the thin film that barely moves,
// and avoids zero-height boxes z-fighting with the terrain top
const float MIN_DRAW_DEPTH = 0.01;

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
}
