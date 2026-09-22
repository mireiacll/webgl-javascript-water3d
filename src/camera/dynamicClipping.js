// Computes near/far each frame from the camera's actual distance to the scene's
// bounding box, instead of using a fixed worst-case range. This keeps the
// near/far RATIO small (good depth precision) 

// closest and farthest distance from `point` to an axis-aligned box [min, max]
function aabbDistanceRange(point, min, max) {
    let closestSq = 0;
    let farthestSq = 0;
    for (let i = 0; i < 3; i++) {
        const clamped = Math.max(min[i], Math.min(max[i], point[i]));
        const dClosest = point[i] - clamped;
        closestSq += dClosest * dClosest;

        // farthest corner on this axis is whichever bound is further from the point
        const dMin = point[i] - min[i];
        const dMax = point[i] - max[i];
        farthestSq += Math.max(dMin * dMin, dMax * dMax);
    }
    return [Math.sqrt(closestSq), Math.sqrt(farthestSq)];
}

// worldWidth/worldHeight define the tank footprint (0,0) -> (worldWidth, worldWidth),
// maxSceneHeight should cover the tallest terrain peak plus any water sitting on it.
// nearFraction/farPadding give a little breathing room so geometry sitting exactly
// on the box surface doesn't get clipped by a near plane landing right on it.
export function updateDynamicClipping(camera, worldWidth, maxSceneHeight, {
    minNear = 0.05,
    nearFraction = 0.5,   // near = min distance to box * this (place near plane a bit in front of the box)
    farPadding = 1.2,     // far = max distance to box * this (a bit of slack beyond the far corner)
    minFar = 10,
} = {}) {
    const min = [0, 0, 0];
    const max = [worldWidth, worldWidth, maxSceneHeight];
    const [closest, farthest] = aabbDistanceRange(camera.position, min, max);

    // inside or right on the box: don't let near collapse to ~0
    camera.near = Math.max(minNear, closest * nearFraction);
    camera.far = Math.max(minFar, farthest * farPadding, camera.near + 1);
}