import { MireiaSeg2D } from "./MireiaSeg2D";
import { MireiaVec2 } from "../math/MireiaVec2";

export class MireiaTessellator{
    #points;

    constructor(points){
        this.#points=points;
    }

    tesselate(){
        const convexPolygons = [];
        this.#split(this.#points,convexPolygons);
        return convexPolygons;
    }

    #split(points,convexPolygons){
        const { indices: concaveIndices, sign: overallSign } = this.#findConcavePoints(points);

        if (concaveIndices.length === 0) {
            convexPolygons.push(points);
            return;
        }

        for (const index of concaveIndices){
            const point = points[index];
            const candidates = this.#findClosestPoints(point, index, points);

            // console.log(`[depth ${depth}] concave point ${index} (${point.getX()},${point.getY()}) — candidates in order:`,
            // candidates.map(c => `${c.index}(${c.point.getX()},${c.point.getY()}) dist=${c.distance.toFixed(2)}`));
            
            for (const candidate of candidates){
                const candidateSeg = new MireiaSeg2D(point,candidate.point);
                if(this.#isIntersected(candidateSeg,index,candidate.index, points)){
                    continue;
                }
                const [partA, partB] = this.#splitAt(points, index, candidate.index);
                const { sign: signA } = this.#findConcavePoints(partA);
                const { sign: signB } = this.#findConcavePoints(partB);
                if (signA !== overallSign || signB !== overallSign) {
                    continue;
                }
                //console.log(`Concave point ${index} can connect to point ${candidate.index}`);
                this.#split(partA, convexPolygons);
                this.#split(partB, convexPolygons);
                return;
           }      
        }
    }

    #splitAt(points,idxA,idxB){
        const len = points.length;
        const minidx=Math.min(idxA,idxB);
        const maxidx=Math.max(idxA,idxB);

        const partA=[];
        for (let i=minidx; i<=maxidx;i++){
            partA.push(points[i]);
        }
        const partB=[];
        for (let i=maxidx; i !== minidx; i = (i + 1) % len){
            partB.push(points[i]);
        }
        partB.push(points[minidx]);

        return[partA,partB];
    }

    #findConcavePoints(points) {
        const n = points.length;
        const angles = [];

        for (let i = 0; i < n; i++) {
            const a = points[i];
            const b = points[(i + 1) % n];
            const c = points[(i + 2) % n];

            const edge1 = new MireiaVec2(b.getX() - a.getX(), b.getY() - a.getY());
            const edge2 = new MireiaVec2(c.getX() - b.getX(), c.getY() - b.getY());

            const angle = Math.atan2(edge1.cross(edge2), edge1.dot(edge2));

            angles.push(angle);
        }

        let totalTurning = 0;
        for (const a of angles) {
            totalTurning += a;
        }

        // sanity check
        const twoPi = 2 * Math.PI;
        if (Math.abs(Math.abs(totalTurning) - twoPi) > 1e-3) {
            //console.warn("Polygon turning angle sum isn't +-360° ");
        }

        const overallSign = Math.sign(totalTurning);

        const concaveIndices = [];
        for (let i = 0; i < n; i++) {
            const sign = Math.sign(angles[i]);
            if (sign !== 0 && sign !== overallSign) {
                concaveIndices.push((i + 1) % n);
            }
        }
        return {indices: concaveIndices, sign: overallSign};
    }

    #findClosestPoints(p,idx,points){
        const candidates=[];
        const n= points.length;
        for(let i = 0; i < n; i++){
            const prevNeighbor = (idx - 1 + n) % n;
            const nextNeighbor = (idx + 1) % n;
            if (i === idx || i === prevNeighbor || i === nextNeighbor) {
                continue;
            }
            const dist = p.squaredDistance2D(points[i])
            candidates.push({point: points[i], index: i, distance: dist});
        }
        candidates.sort((a,b)=>a.distance-b.distance);
        return candidates
    }

    #isIntersected(seg, idxConcave, idxCandidate, points){
        for (let i=0; i<points.length;i++){
            const j = (i + 1) % points.length;
            if (i === idxConcave || i === idxCandidate || j === idxConcave || j === idxCandidate) {
                continue; 
            }
            const edge = new MireiaSeg2D(points[i],points[j]);
            const type = seg.getIntersectionType(edge);
            if (type !== MireiaSeg2D.IntersectionType.NONE) {
                return true; 
            }
        }
        return false;
    }
}