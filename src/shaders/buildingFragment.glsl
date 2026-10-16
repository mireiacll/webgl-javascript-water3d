#version 300 es
precision highp float;

in vec3 v_normal;

uniform vec3 u_color;

out vec4 fragColor;

void main() {
    // Same fixed light and shading as terrainMeshFragment.glsl, so buildings sit naturally on the terrain.
    vec3 lightDir = normalize(vec3(0.35, -0.45, 0.82));
    float diffuse = max(dot(normalize(v_normal), lightDir), 0.0);
    fragColor = vec4(u_color * (0.4 + 0.6 * diffuse), 1.0);
}
