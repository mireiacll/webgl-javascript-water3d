// Blue (lowest) -> red (highest) stops shared by the shaders (u_ramp) and the legend gradient in ui.js.
// The shaders expect exactly 5 stops (uniform vec3 u_ramp[5]).
export const COLOR_RAMP = [
    [0.0, 0.0, 1.0],  // blue
    [0.0, 1.0, 1.0],  // cyan
    [0.0, 1.0, 0.0],  // green
    [1.0, 1.0, 0.0],  // yellow
    [1.0, 0.0, 0.0],  // red
];
export const COLOR_RAMP_FLAT = new Float32Array(COLOR_RAMP.flat());