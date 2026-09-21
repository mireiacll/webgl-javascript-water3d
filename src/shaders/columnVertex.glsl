#version 300 es

in float a_index;   // which column this vertex belongs to, 0..columnCount-1
in vec2 a_corner;   // which corner of that column's quad: x = 0(left)/1(right), y = 0(bottom)/1(top)

uniform sampler2D u_water;   // WaterFBO texture: r = water DEPTH above terrain, g = velocity (unused here)
uniform sampler2D u_terrain; // fixed terrain height per column, r32f
uniform float u_columnCount;
uniform float u_maxHeight;   // world height that maps to the very top of the screen
uniform float u_gapFraction; // fraction of each column's width left empty as a gap, e.g. 0.15
uniform int u_drawTerrain;   // 1 = draw the terrain layer (0 -> terrain top), 0 = draw the water layer (terrain top -> terrain+water top)

void main() {
    float colWidth = 1.0 / u_columnCount;
    float gap = colWidth * u_gapFraction * 0.5;

    // left/right edges of THIS column's bar, shrunk in from the full cell width
    // so neighboring bars don't touch
    float xLeft = a_index * colWidth + gap;
    float xRight = (a_index + 1.0) * colWidth - gap;
    float x = mix(xLeft, xRight, a_corner.x);

    float u = (a_index + 0.5) / u_columnCount;
    float terrainH = texture(u_terrain, vec2(u, 0.5)).r;
    float waterDepth = texture(u_water, vec2(u, 0.5)).r;

    float terrainFrac = clamp(terrainH / u_maxHeight, 0.0, 1.0);
    float waterTopFrac = clamp((terrainH + waterDepth) / u_maxHeight, 0.0, 1.0);

    // terrain layer: floor(0) -> top of terrain. water layer: top of terrain -> top of water
    float yBottom = (u_drawTerrain == 1) ? 0.0 : terrainFrac;
    float yTop = (u_drawTerrain == 1) ? terrainFrac : waterTopFrac;
    float y = mix(yBottom, yTop, a_corner.y);

    float ndcX = x * 2.0 - 1.0;
    float ndcY = y * 2.0 - 1.0;

    gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
}
