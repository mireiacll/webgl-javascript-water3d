#version 300 es

// real triangulated terrain, unlike columnVertex.glsl - positions and normals
// come straight from MireiaTerrainMesh's CPU-built vertex buffer, nothing is
// looked up from a texture or derived from gl_InstanceID here.
in vec3 a_position;
in vec3 a_normal;

uniform mat4 u_viewProj;

out vec3 v_normal;

void main() {
    gl_Position = u_viewProj * vec4(a_position, 1.0);
    v_normal = a_normal;
}
