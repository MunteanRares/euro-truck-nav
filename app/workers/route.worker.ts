let adjacency: Map<number, any[]> | null = null;
let nodeCoordsF64: Float64Array | null = null;
let nodeCoordsMapInstance: TypedNodeCoordsMap | null = null;

import {
    buildRouteStatsCache,
    calculateRoute,
    type WorkerCityArea,
    simplifyPath,
    smoothPath,
} from "~/assets/utils/routing/algorithm";

let cityNodes: WorkerCityArea[] | null = null;
let geometryF32: Float32Array | null = null;

class TypedNodeCoordsMap {
    private array: Float64Array;
    public size: number;

    constructor(array: Float64Array) {
        this.array = array;
        this.size = array.length / 2;
    }

    get(id: number): [number, number] | undefined {
        const offset = id * 2;
        if (offset >= this.array.length) return undefined;

        const lng = this.array[offset];
        const lat = this.array[offset + 1];

        if (lng === undefined || lat === undefined) return undefined;
        if (lng === 0 && lat === 0) return undefined;

        return [lng, lat];
    }

    has(id: number): boolean {
        const offset = id * 2;
        if (offset >= this.array.length) return false;

        const lng = this.array[offset];
        const lat = this.array[offset + 1];

        if (lng === undefined || lat === undefined) return false;
        return lng !== 0 || lat !== 0;
    }

    keys(): IterableIterator<number> {
        const activeKeys: number[] = [];
        for (let i = 0; i < this.array.length; i += 2) {
            const v1 = this.array[i];
            const v2 = this.array[i + 1];
            if (
                v1 !== undefined &&
                v2 !== undefined &&
                (v1 !== 0 || v2 !== 0)
            ) {
                activeKeys.push(i / 2);
            }
        }
        return activeKeys[Symbol.iterator]();
    }

    values(): IterableIterator<[number, number]> {
        const activeValues: [number, number][] = [];
        for (let i = 0; i < this.array.length; i += 2) {
            const v1 = this.array[i];
            const v2 = this.array[i + 1];
            if (
                v1 !== undefined &&
                v2 !== undefined &&
                (v1 !== 0 || v2 !== 0)
            ) {
                activeValues.push([v1, v2]);
            }
        }
        return activeValues[Symbol.iterator]();
    }

    entries(): IterableIterator<[number, [number, number]]> {
        const activeEntries: [number, [number, number]][] = [];
        for (let i = 0; i < this.array.length; i += 2) {
            const v1 = this.array[i];
            const v2 = this.array[i + 1];
            if (
                v1 !== undefined &&
                v2 !== undefined &&
                (v1 !== 0 || v2 !== 0)
            ) {
                activeEntries.push([i / 2, [v1, v2]]);
            }
        }
        return activeEntries[Symbol.iterator]();
    }

    [Symbol.iterator](): IterableIterator<[number, [number, number]]> {
        return this.entries();
    }
}

self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === "INIT_GRAPH") {
        try {
            const { nodesCoordsBuffer, graphBuffer, geometryBuffer, cities } =
                payload;

            geometryF32 = new Float32Array(geometryBuffer);
            const graphF32 = new Float32Array(graphBuffer);

            nodeCoordsF64 = new Float64Array(nodesCoordsBuffer);
            nodeCoordsMapInstance = new TypedNodeCoordsMap(nodeCoordsF64);

            adjacency = new Map();
            if (cities) cityNodes = cities;

            for (let i = 0; i < graphF32.length; i += 12) {
                const u = graphF32[i]!;
                const v = graphF32[i + 1]!;
                const w = graphF32[i + 2]!;
                const hIn = graphF32[i + 3]!;
                const hOut = graphF32[i + 4]!;
                const isFerry = graphF32[i + 5] === 1;
                const requiredDlc = graphF32[i + 6];
                const vPrefabId = graphF32[i + 7];
                const startIndex = graphF32[i + 8]!;
                const pointCount = graphF32[i + 9]!;
                const maneuverType = graphF32[i + 10]!;
                const exitNumber = graphF32[i + 11]!;

                if (!adjacency.has(u)) adjacency.set(u, []);
                adjacency.get(u)!.push({
                    to: v,
                    weight: w,
                    hIn,
                    hOut,
                    isFerry,
                    requiredDlc,
                    vPrefabId,
                    startIndex,
                    pointCount,
                    maneuverType,
                    exitNumber,
                });
            }
            self.postMessage({ type: "READY" });
        } catch (err) {
            console.error("Error during INIT_GRAPH inside worker:", err);
        }
    }

    if (type === "CALC_ROUTE") {
        try {
            if (!adjacency || !nodeCoordsMapInstance || !geometryF32) {
                self.postMessage({ type: "RESULT", payload: null });
                return;
            }

            const {
                startId,
                possibleEnds,
                heading,
                startType,
                targetCoords,
                ownedDlcs,
                selectedGame,
                sdkScale,
                avgSpeed,
            } = payload;

            const result = calculateRoute(
                startId,
                new Set(possibleEnds),
                heading,
                adjacency,
                nodeCoordsMapInstance as any,
                startType,
                ownedDlcs,
                targetCoords,
            );

            if (result && result.path && result.nodeSequence) {
                let fullPath = [...result.path];
                let rawDisplayPath: [number, number][] = [];

                const nodeIndices = new Int32Array(result.nodeSequence.length);

                for (let i = 0; i < result.nodeSequence.length - 1; i++) {
                    nodeIndices[i] = rawDisplayPath.length;
                    const u = result.nodeSequence[i]!;
                    const v = result.nodeSequence[i + 1]!;

                    const edge = adjacency.get(u)?.find((e) => e.to === v);

                    if (edge && edge.startIndex !== undefined) {
                        for (let p = 0; p < edge.pointCount; p++) {
                            const lng = geometryF32[edge.startIndex + p * 2]!;
                            const lat =
                                geometryF32[edge.startIndex + p * 2 + 1]!;
                            if (
                                rawDisplayPath.length > 0 &&
                                rawDisplayPath[
                                    rawDisplayPath.length - 1
                                ]![0] === lng &&
                                rawDisplayPath[
                                    rawDisplayPath.length - 1
                                ]![1] === lat
                            )
                                continue;
                            rawDisplayPath.push([lng, lat]);
                        }
                    } else {
                        rawDisplayPath.push(fullPath[i]!);
                    }
                }
                nodeIndices[result.nodeSequence.length - 1] =
                    rawDisplayPath.length;
                rawDisplayPath.push(fullPath[fullPath.length - 1]!);

                const simplified = simplifyPath(rawDisplayPath, 0.00003);
                const finalSmoothedPath = smoothPath(simplified, 4);

                const finalStatsCache = buildRouteStatsCache(
                    finalSmoothedPath,
                    cityNodes,
                    selectedGame,
                    sdkScale,
                    avgSpeed,
                );

                const nodeKms = new Float32Array(result.nodeSequence.length);
                for (let i = 0; i < result.nodeSequence.length; i++) {
                    const originalNodePos = nodeCoordsMapInstance.get(
                        result.nodeSequence[i]!,
                    );
                    if (!originalNodePos) continue;

                    let minDistSq = Infinity;
                    let bestIdx = 0;
                    for (let j = 0; j < finalSmoothedPath.length; j++) {
                        const p = finalSmoothedPath[j]!;
                        const dSq =
                            Math.pow(p[0] - originalNodePos[0], 2) +
                            Math.pow(p[1] - originalNodePos[1], 2);
                        if (dSq < minDistSq) {
                            minDistSq = dSq;
                            bestIdx = j;
                        }
                    }
                    nodeKms[i] = finalStatsCache[bestIdx * 3]!;
                }

                const sequenceManeuvers = new Int8Array(
                    result.nodeSequence.length,
                );
                const sequenceExits = new Int8Array(result.nodeSequence.length);

                for (let i = 0; i < result.nodeSequence.length - 1; i++) {
                    const u = result.nodeSequence[i]!;
                    const v = result.nodeSequence[i + 1]!;
                    const edge = adjacency.get(u)?.find((e) => e.to === v);

                    let mType = edge ? edge.maneuverType || 0 : 0;
                    let extNum = edge ? edge.exitNumber || 0 : 0;

                    if (mType === 3) {
                        if (extNum === -3) {
                            let skippedExits = 0;

                            for (
                                let j = i + 1;
                                j < result.nodeSequence.length - 1;
                                j++
                            ) {
                                const scanU = result.nodeSequence[j]!;
                                const scanV = result.nodeSequence[j + 1]!;
                                const scanEdge = adjacency
                                    .get(scanU)
                                    ?.find((e) => e.to === scanV);

                                if (!scanEdge || scanEdge.maneuverType !== 3)
                                    break;

                                if (scanEdge.exitNumber === -2) {
                                    extNum = skippedExits + 1;
                                    break;
                                } else if (scanEdge.exitNumber === -1) {
                                    const neighbors =
                                        adjacency.get(scanU) || [];
                                    for (const n of neighbors) {
                                        if (
                                            n.maneuverType === 3 &&
                                            n.exitNumber === -2 &&
                                            n.to !== scanV
                                        ) {
                                            skippedExits++;
                                        }
                                    }
                                } else {
                                    break;
                                }
                            }

                            if (extNum === -3) extNum = 1;
                        } else if (extNum === -1 || extNum === -2) {
                            mType = 0;
                            extNum = 0;
                        }
                    }

                    sequenceManeuvers[i] = mType;
                    sequenceExits[i] = extNum;
                }

                self.postMessage(
                    {
                        type: "RESULT",
                        payload: {
                            ...result,
                            rawPath: finalSmoothedPath,
                            displayPath: finalSmoothedPath,
                            stats: finalStatsCache,
                            nodeKms: nodeKms,
                            sequenceManeuvers: sequenceManeuvers,
                            sequenceExits: sequenceExits,
                        },
                    },
                    [
                        finalStatsCache.buffer,
                        nodeKms.buffer,
                        sequenceManeuvers.buffer,
                        sequenceExits.buffer,
                    ],
                );
            } else {
                self.postMessage({ type: "RESULT", payload: null });
            }
        } catch (error) {
            console.error("Web Worker calculation crash caught:", error);
            self.postMessage({ type: "RESULT", payload: null });
        }
    }

    if (type === "CALC_MULTI_ROUTE") {
        try {
            if (!adjacency || !nodeCoordsMapInstance || !geometryF32) {
                self.postMessage({ type: "RESULT", payload: null });
                return;
            }

            const {
                startId,
                waypointsCoords,
                waypointsNodeGroups,
                heading,
                startType,
                ownedDlcs,
                selectedGame,
                sdkScale,
                avgSpeed,
            } = payload;

            let currentStartId = startId;
            let currentHeading = heading;
            let currentStartType = startType;

            const combinedNodeSequence: number[] = [];
            const combinedPathCoords: [number, number][] = [];
            const snappedNodeIds: number[] = [];

            // Loop through each segment sequentially
            for (let i = 0; i < waypointsNodeGroups.length; i++) {
                const targetCoords = waypointsCoords[i];
                const candidateEnds = new Set<number>(waypointsNodeGroups[i]);

                // Calculate current segment route
                const segmentResult = calculateRoute(
                    currentStartId,
                    candidateEnds,
                    currentHeading,
                    adjacency,
                    nodeCoordsMapInstance as any,
                    currentStartType,
                    ownedDlcs,
                    targetCoords,
                );

                if (!segmentResult) {
                    self.postMessage({ type: "RESULT", payload: null });
                    return;
                }

                // Extract display coordinates for this segments geometry
                const segmentDisplayPath: [number, number][] = [];
                for (
                    let j = 0;
                    j < segmentResult.nodeSequence.length - 1;
                    j++
                ) {
                    const u = segmentResult.nodeSequence[j]!;
                    const v = segmentResult.nodeSequence[j + 1]!;
                    const edge = adjacency.get(u)?.find((e) => e.to === v);

                    if (edge && edge.startIndex !== undefined) {
                        for (let p = 0; p < edge.pointCount; p++) {
                            const lng = geometryF32[edge.startIndex + p * 2]!;
                            const lat =
                                geometryF32[edge.startIndex + p * 2 + 1]!;

                            if (
                                segmentDisplayPath.length > 0 &&
                                segmentDisplayPath[
                                    segmentDisplayPath.length - 1
                                ]![0] === lng &&
                                segmentDisplayPath[
                                    segmentDisplayPath.length - 1
                                ]![1] === lat
                            ) {
                                continue;
                            }
                            segmentDisplayPath.push([lng, lat]);
                        }
                    } else {
                        segmentDisplayPath.push(segmentResult.path[j]!);
                    }
                }

                let arrivalHeading = 0;
                if (segmentResult.nodeSequence.length >= 2) {
                    const u =
                        segmentResult.nodeSequence[
                            segmentResult.nodeSequence.length - 2
                        ]!;
                    const v =
                        segmentResult.nodeSequence[
                            segmentResult.nodeSequence.length - 1
                        ]!;

                    const edge = adjacency.get(u)?.find((e) => e.to === v);
                    arrivalHeading = edge ? edge.hOut || 0 : 0;
                }

                if (combinedNodeSequence.length > 0) {
                    combinedNodeSequence.pop();
                }

                combinedNodeSequence.push(...segmentResult.nodeSequence);
                combinedPathCoords.push(...segmentDisplayPath);
                snappedNodeIds.push(segmentResult.endId);

                currentStartId = segmentResult.endId;
                currentHeading = arrivalHeading;
                currentStartType = "road";
            }

            const simplified = simplifyPath(combinedPathCoords, 0.00003);
            const finalSmoothedPath = smoothPath(simplified, 4);

            const finalStatsCache = buildRouteStatsCache(
                finalSmoothedPath,
                cityNodes,
                selectedGame,
                sdkScale,
                avgSpeed,
            );

            const nodeKms = new Float32Array(combinedNodeSequence.length);
            for (let i = 0; i < combinedNodeSequence.length; i++) {
                const originalNodePos = nodeCoordsMapInstance.get(
                    combinedNodeSequence[i]!,
                );
                if (!originalNodePos) continue;

                let MinDistSq = Infinity;
                let bestIdx = 0;
                for (let j = 0; j < finalSmoothedPath.length; j++) {
                    const p = finalSmoothedPath[j]!;
                    const dSq =
                        Math.pow(p[0] - originalNodePos[0], 2) +
                        Math.pow(p[1] - originalNodePos[1], 2);

                    if (dSq < MinDistSq) {
                        MinDistSq = dSq;
                        bestIdx = j;
                    }
                }
                nodeKms[i] = finalStatsCache[bestIdx * 3]!;
            }

            const sequenceManeuvers = new Int8Array(
                combinedNodeSequence.length,
            );
            const sequenceExits = new Int8Array(combinedNodeSequence.length);
            for (let i = 0; i < combinedNodeSequence.length - 1; i++) {
                const u = combinedNodeSequence[i]!;
                const v = combinedNodeSequence[i + 1]!;
                const edge = adjacency.get(u)?.find((e) => e.to === v);

                let mType = edge ? edge.maneuverType || 0 : 0;
                let extNum = edge ? edge.exitNumber || 0 : 0;

                if (mType === 3 && extNum === -3) extNum = 1;
                sequenceManeuvers[i] = mType;
                sequenceExits[i] = extNum;
            }

            self.postMessage(
                {
                    type: "RESULT",
                    payload: {
                        nodeSequence: combinedNodeSequence,
                        displayPath: finalSmoothedPath,
                        stats: finalStatsCache,
                        nodeKms,
                        sequenceManeuvers,
                        sequenceExits,
                        snappedNodeIds,
                        endId: combinedNodeSequence[
                            combinedNodeSequence.length - 1
                        ],
                    },
                },
                [
                    finalStatsCache.buffer,
                    nodeKms.buffer,
                    sequenceManeuvers.buffer,
                    sequenceExits.buffer,
                ],
            );
        } catch (error) {
            console.error("Multi-routing worker error:", error);
            self.postMessage({ type: "RESULT", payload: null });
        }
    }
};
