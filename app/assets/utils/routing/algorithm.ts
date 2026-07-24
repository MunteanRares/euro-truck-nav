import { MinHeap } from "~/assets/utils/routing/MinHeap";
import { getBearing, getAngleDiff } from "~/assets/utils/map/maths";
import { convertGeoToAts, convertGeoToEts2 } from "../map/converters";
import type { GameType } from "~/types";

// Increased size to handle Directed Edges instead of Nodes
const MAX_EDGES = 4000000;

const cache_costs = new Float64Array(MAX_EDGES);
const cache_previous = new Int32Array(MAX_EDGES);
const cache_visited = new Uint8Array(MAX_EDGES);
const cache_is_ferry = new Uint8Array(MAX_EDGES);

const edge_target = new Int32Array(MAX_EDGES);
const edge_source = new Int32Array(MAX_EDGES);
const edge_hIn = new Float32Array(MAX_EDGES);

const openHeap = new MinHeap(50000);

let cache_flatCoords: Float64Array | null = null;
let isEdgesMapped = false;
let globalNextEdgeId = 0;

export interface WorkerCityArea {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

function ensureCoordCache(nodeCoords: Map<number, [number, number]>) {
    if (cache_flatCoords && cache_flatCoords.length > 0) return;

    cache_flatCoords = new Float64Array(900000 * 2);

    for (const [id, [lng, lat]] of nodeCoords) {
        if (id * 2 + 1 < cache_flatCoords.length) {
            cache_flatCoords[id * 2] = lng;
            cache_flatCoords[id * 2 + 1] = lat;
        }
    }
}

function ensureEdgesMapped(adjacency: Map<number, any[]>) {
    if (isEdgesMapped) return;
    globalNextEdgeId = 0;

    for (const [u, edges] of adjacency.entries()) {
        for (const edge of edges) {
            const eId = globalNextEdgeId++;
            edge.edgeId = eId;
            edge_target[eId] = edge.to;
            edge_source[eId] = u;
            edge_hIn[eId] = edge.hIn || 0;
        }
    }
    isEdgesMapped = true;
}

export function getScaleMultiplier(
    gameX: number,
    gameZ: number,
    cityAreas: WorkerCityArea[] | null,
    selectedGame: string | null,
): number {
    let highwayScale = selectedGame === "ats" ? 20 : 19;

    if (selectedGame === "ets2" && gameX < -31100 && gameZ < -5500) {
        highwayScale = 15;
    }

    if (!cityAreas || cityAreas.length === 0) return highwayScale;

    for (let i = 0; i < cityAreas.length; i++) {
        const area = cityAreas[i]!;

        if (
            gameX >= area.minX &&
            gameX <= area.maxX &&
            gameZ >= area.minZ &&
            gameZ <= area.maxZ
        ) {
            return 3;
        }
    }

    return highwayScale;
}

function fastDistKm(
    lng1: number,
    lat1: number,
    lng2: number,
    lat2: number,
): number {
    const ky = 111.0;
    const kx = 111.0 * 0.65;

    const dy = (lat1 - lat2) * ky;
    const dx = (lng1 - lng2) * kx;

    return Math.sqrt(dx * dx + dy * dy);
}

export const calculateRoute = (
    start: number,
    possibleEnds: Set<number | undefined>,
    startHeading: number | null,
    adjacency: Map<number, any[]>,
    nodeCoords: Map<number, [number, number]>,
    startType: "road" | "yard" = "road",
    ownedDlcs: number[],
    targetLocation?: [number, number],
): {
    path: [number, number][];
    nodeSequence: number[];
    endId: number;
} | null => {
    ensureCoordCache(nodeCoords);
    ensureEdgesMapped(adjacency);

    const flatCoords = cache_flatCoords!;

    const START_EDGE_ID = globalNextEdgeId;

    cache_costs.fill(Infinity, 0, START_EDGE_ID + 1);
    cache_previous.fill(-1, 0, START_EDGE_ID + 1);
    cache_visited.fill(0, 0, START_EDGE_ID + 1);
    cache_is_ferry.fill(0, 0, START_EDGE_ID + 1);

    openHeap.clear();

    let destLng = 0,
        destLat = 0;
    let foundDest = false;

    if (targetLocation) {
        destLng = targetLocation[0];
        destLat = targetLocation[1];
        foundDest = true;
    } else {
        const firstEndId = [...possibleEnds][0];
        if (firstEndId !== undefined) {
            destLng = flatCoords[firstEndId * 2]!;
            destLat = flatCoords[firstEndId * 2 + 1]!;
            foundDest = true;
        }
    }

    if (!foundDest) return null;

    const startLng = flatCoords[start * 2]!;
    const startLat = flatCoords[start * 2 + 1]!;

    const distKm = fastDistKm(startLng, startLat, destLng, destLat);
    const maxIterations = 70000 + distKm * 5000;

    const HEURISTIC_SCALE = 1.0;

    const getHeuristic = (id: number) => {
        const nLng = flatCoords[id * 2]!;
        const nLat = flatCoords[id * 2 + 1]!;
        const dx = nLng - destLng;
        const dy = nLat - destLat;
        return Math.sqrt(dx * dx + dy * dy) * 100 * HEURISTIC_SCALE;
    };

    cache_costs[START_EDGE_ID] = 0;
    openHeap.push(START_EDGE_ID, 0);

    let foundEndEdgeId: number | null = null;
    let iterations = 0;

    while (openHeap.size() > 0) {
        iterations++;
        if (iterations > maxIterations) return null;

        const currentEdgeId = openHeap.pop();
        if (currentEdgeId === undefined) break;

        if (cache_visited[currentEdgeId] === 1) continue;
        cache_visited[currentEdgeId] = 1;

        const currentId =
            currentEdgeId === START_EDGE_ID
                ? start
                : edge_target[currentEdgeId]!;

        if (possibleEnds.has(currentId)) {
            foundEndEdgeId = currentEdgeId;
            break;
        }

        const currentArrivalHeading =
            currentEdgeId === START_EDGE_ID ? 0 : edge_hIn[currentEdgeId];
        const prevId =
            currentEdgeId === START_EDGE_ID ? -1 : edge_source[currentEdgeId];
        const currentG = cache_costs[currentEdgeId]!;

        const neighbors = adjacency.get(currentId);
        if (!neighbors) continue;

        const cLng = flatCoords[currentId * 2]!;
        const cLat = flatCoords[currentId * 2 + 1]!;
        const ferryGraceCounter = cache_is_ferry[currentEdgeId];

        for (let i = 0; i < neighbors.length; i++) {
            const edge = neighbors[i]!;
            const neighborEdgeId = edge.edgeId;

            // DLC Check
            const dlcId = edge.requiredDlc || 0;
            if (dlcId !== 0 && !ownedDlcs.includes(dlcId)) continue;

            if (cache_visited[neighborEdgeId] === 1) continue;

            const neighborNodeId = edge.to;

            if (prevId !== -1 && neighborNodeId === prevId) {
                continue;
            }

            let stepCost = edge.weight || 1;

            if (!edge.isFerry && ferryGraceCounter === 0) {
                if (currentEdgeId === START_EDGE_ID && startHeading !== null) {
                    const nLng = flatCoords[neighborNodeId * 2]!;
                    const nLat = flatCoords[neighborNodeId * 2 + 1]!;
                    const dir = getBearing([cLng, cLat], [nLng, nLat]);
                    const diff = Math.abs(getAngleDiff(startHeading, dir));

                    if (startType === "yard") {
                        stepCost += 10;
                        if (diff > 75) stepCost += 10_000_000;
                        else if (diff > 45) stepCost += 1000;
                    } else {
                        if (diff > 75) stepCost += 10_000_000;
                        else if (diff > 45) stepCost += 1000;
                    }
                } else if (
                    currentEdgeId !== START_EDGE_ID &&
                    edge.hOut !== undefined
                ) {
                    let diff = Math.abs(currentArrivalHeading! - edge.hOut);
                    if (diff > Math.PI) diff = 2 * Math.PI - diff;

                    if (edge.maneuverType === 3) {
                        if (diff > 1.0) stepCost += 50;
                    } else {
                        if (diff > 2.8) stepCost += 100_000_000;
                        else if (diff > 1.5) stepCost += 10_000;
                        else if (diff > 1.0) stepCost += 1000;
                        else if (diff > 0.4) stepCost += 500;
                    }
                }
            }

            if (stepCost < 1) stepCost = 1;
            const tentativeG = currentG + stepCost;

            if (tentativeG < cache_costs[neighborEdgeId]!) {
                cache_previous[neighborEdgeId] = currentEdgeId;
                cache_costs[neighborEdgeId] = tentativeG;

                if (edge.isFerry) {
                    cache_is_ferry[neighborEdgeId] = 5;
                } else {
                    cache_is_ferry[neighborEdgeId] = Math.max(
                        0,
                        ferryGraceCounter! - 1,
                    );
                }

                openHeap.push(
                    neighborEdgeId,
                    tentativeG + getHeuristic(neighborNodeId),
                );
            }
        }
    }

    if (foundEndEdgeId === null) return null;

    const path: [number, number][] = [];
    const nodeSequence: number[] = [];
    let currEdgeId: number = foundEndEdgeId;

    while (currEdgeId !== START_EDGE_ID && currEdgeId !== -1) {
        const cId = edge_target[currEdgeId]!;
        path.unshift([flatCoords[cId * 2]!, flatCoords[cId * 2 + 1]!]);
        nodeSequence.unshift(cId);
        currEdgeId = cache_previous[currEdgeId]!;
        if (path.length > 20000) break;
    }

    path.unshift([flatCoords[start * 2]!, flatCoords[start * 2 + 1]!]);
    nodeSequence.unshift(start);

    return {
        path,
        nodeSequence,
        endId: nodeSequence[nodeSequence.length - 1]!,
    };
};

export const simplifyPath = (
    points: [number, number][],
    epsilon = 0.000002,
): [number, number][] => {
    if (points.length <= 2) return points;

    const sqEpsilon = epsilon * epsilon;

    const getSqDist = (
        p: [number, number],
        a: [number, number],
        b: [number, number],
    ) => {
        let x = a[0],
            y = a[1],
            dx = b[0] - x,
            dy = b[1] - y;
        if (dx !== 0 || dy !== 0) {
            let t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) {
                x = b[0];
                y = b[1];
            } else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }
        dx = p[0] - x;
        dy = p[1] - y;
        return dx * dx + dy * dy;
    };

    const simplifyRecursive = (
        pts: [number, number][],
        start: number,
        end: number,
        sqEpsilon: number,
        result: [number, number][],
    ) => {
        let maxSqDist = sqEpsilon;
        let index = -1;
        for (let i = start + 1; i < end; i++) {
            let d = getSqDist(pts[i]!, pts[start]!, pts[end]!);
            if (d > maxSqDist) {
                index = i;
                maxSqDist = d;
            }
        }
        if (index !== -1) {
            simplifyRecursive(pts, start, index, sqEpsilon, result);
            result.push(pts[index]!);
            simplifyRecursive(pts, index, end, sqEpsilon, result);
        }
    };

    const result = [points[0]!];
    simplifyRecursive(points, 0, points.length - 1, sqEpsilon, result);
    result.push(points[points.length - 1]!);
    return result;
};

export const smoothPath = (
    path: [number, number][],
    iterations = 5,
): [number, number][] => {
    if (path.length < 3) return path;
    let current = path;
    for (let it = 0; it < iterations; it++) {
        const smoothed: [number, number][] = [current[0]!];
        for (let i = 1; i < current.length - 1; i++) {
            const p = current[i - 1]!,
                c = current[i]!,
                n = current[i + 1]!;
            smoothed.push([
                p[0] * 0.25 + c[0] * 0.5 + n[0] * 0.25,
                p[1] * 0.25 + c[1] * 0.5 + n[1] * 0.25,
            ]);
        }
        smoothed.push(current[current.length - 1]!);
        current = smoothed;
    }
    return current;
};

export const mergeClosePoints = (
    coords: [number, number][],
    minDistanceMeters = 8,
): [number, number][] => {
    if (coords.length < 2) return coords;
    const result: [number, number][] = [];
    let i = 0;
    while (i < coords.length) {
        const current = coords[i]!;
        if (i === coords.length - 1) {
            result.push(current);
            break;
        }
        const next = coords[i + 1]!;
        const d = fastDistKm(current[0], current[1], next[0], next[1]) * 1000;

        if (d < minDistanceMeters) {
            const midPoint: [number, number] = [
                (current[0] + next[0]) / 2,
                (current[1] + next[1]) / 2,
            ];
            result.push(midPoint);
            i += 2;
        } else {
            result.push(current);
            i++;
        }
    }
    if (result.length < 2) result.push(coords[coords.length - 1]!);
    return result;
};

export function buildRouteStatsCache(
    pathCoords: [number, number][],
    cities: WorkerCityArea[] | null,
    selectedGame: GameType,
    sdkScale: number = 0,
    avgSpeed: number,
) {
    const cache = new Float32Array(pathCoords.length * 3);
    const isAts = selectedGame === "ats";

    const baseHighway = isAts ? 105 : 82;
    const highwaySpeed =
        avgSpeed > 40 ? avgSpeed * 0.7 + baseHighway * 0.3 : baseHighway;

    const baseCity = isAts ? 40 : 32;
    const citySpeed =
        avgSpeed > 40 ? avgSpeed * 0.4 + baseCity * 0.6 : baseCity;
    const speeds = { highway: highwaySpeed, city: citySpeed };

    const gamePoints = pathCoords.map((p) =>
        isAts ? convertGeoToAts(p[0], p[1]) : convertGeoToEts2(p[0], p[1]),
    );

    let totalKm = 0;
    let totalGameHours = 0;
    let totalRealHours = 0;

    cache[0] = 0; // km
    cache[1] = 0; // game hours
    cache[2] = 0; // real hours

    for (let i = 0; i < pathCoords.length - 1; i++) {
        const [x1, z1] = gamePoints[i]!;
        const [x2, z2] = gamePoints[i + 1]!;

        const dx = x2 - x1;
        const dz = z2 - z1;
        const rawLength = Math.sqrt(dx * dx + dz * dz);

        const multiplier = getScaleMultiplier(
            (x1 + x2) / 2,
            (z1 + z2) / 2,
            cities,
            selectedGame,
        );

        const segmentKm = (rawLength * multiplier) / 1000;
        const segmentSpeed = multiplier === 3 ? speeds.city : speeds.highway;
        const segmentGameHours = segmentKm / segmentSpeed;

        totalKm += segmentKm;
        totalGameHours += segmentGameHours;
        totalRealHours += segmentGameHours / multiplier;

        const idx = (i + 1) * 3;
        cache[idx] = totalKm;
        cache[idx + 1] = totalGameHours;
        cache[idx + 2] = totalRealHours;
    }

    return cache;
}
