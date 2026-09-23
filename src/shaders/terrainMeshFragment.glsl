#version 300 es
precision highp float;

in vec3 v_normal;

out vec4 fragColor;
uniform vec3 u_color;
uniform float u_lit; // 1 = shade with the fixed light, 0 = flat color (outline lines)

void main() {
    // fixed world-space light so the boxes read as 3D without a full lighting setup.
    // v_normal is the flat face normal, so no need to renormalize (and it's zero on the lines)
    vec3 lightDir = normalize(vec3(0.35, -0.45, 0.82));
    float diffuse = max(dot(v_normal, lightDir), 0.0);
    float shade = mix(1.0, 0.4 + 0.6 * diffuse, u_lit);
    fragColor = vec4(u_color * shade, 1.0);
}
