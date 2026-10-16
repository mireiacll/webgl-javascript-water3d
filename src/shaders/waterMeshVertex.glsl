#version 300 es

uniform sampler2D u_terrain;
uniform sampler2D u_water;
uniform sampler2D u_flux;     // (right, left, up, down) outflow per column, m^3/s
uniform mat4 u_viewProj;
uniform float u_columnCount;
uniform float u_worldWidth;
uniform int u_colorMode;      // 0 = none, 1 = depth, 2 = velocity, 3 = flux
uniform float u_rangeMax;     // legend max, same units as the chosen quantity

out vec3 v_normal;
out float v_depth;
out float v_t;                // chosen quantity, normalized to 0..1 by u_rangeMax
const float GRAVITY = 9.8;

const ivec2 CORNERS[6] = ivec2[6](ivec2(0,0), ivec2(1,0), ivec2(1,1), ivec2(0,0), ivec2(1,1), ivec2(0,1));

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
    return h > 1e-3 ? min(q / h, sqrt(GRAVITY * h)) : 0.0;
}

const float SAME_LEVEL = 2.0; // m: cells whose water surface differs by more than this from the quad's own cell are a different "level"

// Average of the (up to) four cells touching a grid corner -> (surface z, water depth, chosen metric, cell count).
// Only cells at the same level as the quad being drawn (refSurface) are averaged. A building column has its roof
// height as "terrain", so averaging it in would drag the water surface up the wall; with this filter the water next
// to a wall stays at water level, and the quads over the building itself come out completely dry (nothing drawn).
vec4 cornerSample(ivec2 corner, float refSurface, int n, float d, bool withMetric) {
    vec3 sum = vec3(0.0);
    float count = 0.0;
    for (int dy = -1; dy <= 0; dy++) {
        for (int dx = -1; dx <= 0; dx++) {
            ivec2 c = corner + ivec2(dx, dy);
            if (c.x < 0 || c.y < 0 || c.x >= n || c.y >= n) continue;
            float w = texelFetch(u_water, c, 0).r;
            float surface = texelFetch(u_terrain, c, 0).r + w;
            if (abs(surface - refSurface) > SAME_LEVEL) continue;
            sum += vec3(surface, w, withMetric ? cellMetric(c, n, d) : 0.0);
            count += 1.0;
        }
    }
    return vec4(sum, count);
}

// Surface height at a neighboring corner, for the normal; falls back to the corner being shaded when no cell
// there is at the same level (e.g. across a building wall), so the wall doesn't tilt the normal.
float neighborSurface(ivec2 corner, float refSurface, int n, float d, float fallback) {
    vec4 c = cornerSample(corner, refSurface, n, d, false);
    return c.w > 0.0 ? c.x / c.w : fallback;
}

void main() {
    int n = int(u_columnCount + 0.5);
    int quad = gl_VertexID / 6;
    ivec2 cell = ivec2(quad % n, quad / n);
    ivec2 corner = cell + CORNERS[gl_VertexID % 6];
    float d = u_worldWidth / u_columnCount;

    float refSurface = texelFetch(u_terrain, cell, 0).r + texelFetch(u_water, cell, 0).r;
    vec4 sample0 = cornerSample(corner, refSurface, n, d, u_colorMode > 0);
    vec3 s = sample0.xyz / sample0.w; // the quad's own cell always qualifies, so the count is at least 1

    // Normal from central differences of the surface height.
    ivec2 lo = max(corner - 1, 0);
    ivec2 hi = min(corner + 1, n);
    float dzdx = (neighborSurface(ivec2(hi.x, corner.y), refSurface, n, d, s.x) - neighborSurface(ivec2(lo.x, corner.y), refSurface, n, d, s.x)) / (float(hi.x - lo.x) * d);
    float dzdy = (neighborSurface(ivec2(corner.x, hi.y), refSurface, n, d, s.x) - neighborSurface(ivec2(corner.x, lo.y), refSurface, n, d, s.x)) / (float(hi.y - lo.y) * d);

    gl_Position = u_viewProj * vec4(vec2(corner) * d, s.x, 1.0);
    v_normal = normalize(vec3(-dzdx, -dzdy, 1.0));
    v_depth = s.y;
    v_t = clamp(s.z / u_rangeMax, 0.0, 1.0);
}
