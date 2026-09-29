#version 300 es

uniform sampler2D u_terrain;
uniform sampler2D u_water;
uniform mat4 u_viewProj;
uniform float u_columnCount;
uniform float u_worldWidth;

out vec3 v_normal;
out float v_depth;

const ivec2 CORNERS[6] = ivec2[6](ivec2(0,0), ivec2(1,0), ivec2(1,1), ivec2(0,0), ivec2(1,1), ivec2(0,1));

// Average the (up to) four cells touching a grid corner -> (surface z, water depth).
vec2 cornerSample(ivec2 corner, int n) {
    float surface = 0.0, depth = 0.0, count = 0.0;
    for (int dy = -1; dy <= 0; dy++) {
        for (int dx = -1; dx <= 0; dx++) {
            ivec2 c = corner + ivec2(dx, dy);
            if (c.x < 0 || c.y < 0 || c.x >= n || c.y >= n) continue;
            float w = texelFetch(u_water, c, 0).r;
            surface += texelFetch(u_terrain, c, 0).r + w;
            depth += w;
            count += 1.0;
        }
    }
    return vec2(surface, depth) / count;
}

void main() {
    int n = int(u_columnCount + 0.5);
    int quad = gl_VertexID / 6;
    ivec2 corner = ivec2(quad % n, quad / n) + CORNERS[gl_VertexID % 6];
    float d = u_worldWidth / u_columnCount;

    vec2 s = cornerSample(corner, n);

    // Normal from central differences of the surface height.
    ivec2 lo = max(corner - 1, 0);
    ivec2 hi = min(corner + 1, n);
    float dzdx = (cornerSample(ivec2(hi.x, corner.y), n).x - cornerSample(ivec2(lo.x, corner.y), n).x) / (float(hi.x - lo.x) * d);
    float dzdy = (cornerSample(ivec2(corner.x, hi.y), n).x - cornerSample(ivec2(corner.x, lo.y), n).x) / (float(hi.y - lo.y) * d);

    gl_Position = u_viewProj * vec4(vec2(corner) * d, s.x, 1.0);
    v_normal = normalize(vec3(-dzdx, -dzdy, 1.0));
    v_depth = s.y;
}
