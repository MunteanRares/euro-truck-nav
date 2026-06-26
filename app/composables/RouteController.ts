import maplibregl from "maplibre-gl";
import { generateDestinationIcon } from "~/assets/utils/map/markers";
import {
    getBearing,
    getSqDistToSegment,
    DEVIATION_THRESHOLD_SQ,
    getSquaredDist,
} from "~/assets/utils/map/maths";
import {
    deleteMapLibreData,
    setMapLibreData,
} from "~/assets/utils/map/helpers";
import {
    generateDirectionsList,
    type DirectionStep,
} from "~/assets/utils/routing/directions";

import RouteWorker from "~/workers/route.worker?worker&inline";

export const useRouteController = (
    map: Ref<maplibregl.Map | null>,
    adjacency: Map<number, any>,
    nodeCoords: Map<number, [number, number]>,
    stopNavigationMode: () => void,
) => {
    const { getGameLocationName, getWorkerCityData } = useCityData();
    const { getClosestNodes } = useGraphSystem();
    const { settings, activeSettings, updateGlobal, updateProfile } =
        useSettings();

    const currentRoutePath = shallowRef<[number, number][] | null>(null);
    const routeStatsCache = shallowRef<Float32Array | null>(null);

    const destinationName = ref<string>("");
    const routeDistance = ref<number>(0);
    const routeEta = ref<string>("");

    const savedDestination = ref<[number, number] | null>(null);

    const isRouteActive = ref(false);
    const isYardStart = ref(false);

    const isTruckInYard = ref(false);

    const startNodeId = ref<number | null>(null);
    const endNodeId = ref<number | null>(null);
    const lastMathPos = ref<[number, number] | null>(null);

    const isCalculating = ref(false);
    const routeFound = ref<boolean | null>(null);

    const currentRouteIndex = ref(0);
    const isWorkerReady = ref(false);

    const fullRouteDirections = ref<DirectionStep[]>([]);
    const nextTurnDistance = ref<number>(0);

    watch(
        () => activeSettings.value.themeColor,
        async (newColor) => {
            if (map.value && map.value.hasImage("destination-icon")) {
                const newPinImg = await generateDestinationIcon(newColor);
                map.value.updateImage("destination-icon", newPinImg);
            }
        },
    );

    watch(
        () => activeSettings.value.routeColor,
        (newColor) => {
            if (map.value && map.value.getLayer("route-line")) {
                map.value.setPaintProperty(
                    "route-line",
                    "line-color",
                    newColor,
                );
            }
        },
    );

    watch(
        () => activeSettings.value.hasTurnNavigation,
        (hasGuidedNavigation) => {
            if (!map.value) return;

            if (hasGuidedNavigation) {
                if (isRouteActive.value && currentRoutePath.value) {
                    drawTurnArrows(
                        fullRouteDirections.value,
                        currentRoutePath.value,
                    );
                }
            } else {
                const lineSource = map.value.getSource(
                    "turn-arrows-line-source",
                ) as maplibregl.GeoJSONSource;
                const headSource = map.value.getSource(
                    "turn-arrows-head-source",
                ) as maplibregl.GeoJSONSource;

                const emptyData: any = {
                    type: "FeatureCollection",
                    features: [],
                };

                if (lineSource) lineSource.setData(emptyData);
                if (headSource) headSource.setData(emptyData);
            }
        },
    );

    let worker: Worker | null = null;
    if (import.meta.client) {
        worker = new RouteWorker();

        worker.onmessage = (e) => {
            if (e.data.type === "READY") console.log("Web Worker Ready.");
        };
    }

    function destroyWorker() {
        if (worker) {
            worker.terminate();
            worker = null;
        }
        isWorkerReady.value = false;
    }

    function initWorkerData(
        nodesCoordsBuffer: ArrayBuffer,
        graphBuffer: ArrayBuffer,
        geometryBuffer: ArrayBuffer,
    ) {
        if (!worker) return;
        const cityPayload = getWorkerCityData();

        const transferables: Transferable[] = [
            nodesCoordsBuffer,
            graphBuffer,
            geometryBuffer,
        ];

        worker.postMessage(
            {
                type: "INIT_GRAPH",
                payload: {
                    nodesCoordsBuffer: nodesCoordsBuffer,
                    graphBuffer: graphBuffer,
                    geometryBuffer: geometryBuffer,
                    cities: cityPayload,
                },
            },
            transferables,
        );

        isWorkerReady.value = true;
    }

    function projectPointToSegment(
        p: [number, number],
        v: [number, number],
        w: [number, number],
    ): [number, number] {
        const l2 = getSquaredDist(v, w);
        if (l2 === 0) return [v[0], v[1]];
        let t =
            ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) /
            l2;
        t = Math.max(0, Math.min(1, t));
        return [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])];
    }

    function drawTurnArrows(
        steps: DirectionStep[],
        displayPath: [number, number][],
    ) {
        if (!map.value) return;

        const linesFeatures = [];
        const headsFeatures = [];

        const ARROW_HEAD_OFFSET_M = 30;

        const MAX_ARROWS_TO_SHOW = 2;
        let arrowsDrawn = 0;

        for (const step of steps) {
            if (
                ["depart", "destination", "straight", "ferry"].includes(
                    step.type,
                )
            )
                continue;

            if (arrowsDrawn >= MAX_ARROWS_TO_SHOW) break;

            let startIdx = -1;
            let minStartDist = Infinity;
            for (let i = 0; i < displayPath.length; i++) {
                const distSq = getSquaredDist(displayPath[i]!, step.coords);
                if (distSq < minStartDist) {
                    minStartDist = distSq;
                    startIdx = i;
                }
            }

            let endIdx = startIdx;
            if (step.exitCoords && startIdx !== -1) {
                let minEndDist = Infinity;
                const searchLimit = Math.min(
                    displayPath.length,
                    startIdx + 1000,
                );
                for (let i = startIdx; i < searchLimit; i++) {
                    const distSq = getSquaredDist(
                        displayPath[i]!,
                        step.exitCoords,
                    );
                    if (distSq < minEndDist) {
                        minEndDist = distSq;
                        endIdx = i;
                    }
                }
            }

            if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
                const arrowCoords: [number, number][] = [];

                for (let i = startIdx; i <= endIdx; i++) {
                    arrowCoords.push(displayPath[i]!);
                }

                let hIdx = endIdx;
                let dFwd = 0;
                let finalHeadPoint: [number, number] = displayPath[hIdx]!;

                while (
                    hIdx < displayPath.length - 1 &&
                    dFwd < ARROW_HEAD_OFFSET_M
                ) {
                    const segDist =
                        Math.sqrt(
                            getSquaredDist(
                                displayPath[hIdx]!,
                                displayPath[hIdx + 1]!,
                            ),
                        ) * 111000;
                    if (dFwd + segDist > ARROW_HEAD_OFFSET_M) {
                        const ratio = (ARROW_HEAD_OFFSET_M - dFwd) / segDist;
                        const p1 = displayPath[hIdx]!;
                        const p2 = displayPath[hIdx + 1]!;
                        finalHeadPoint = [
                            p1[0] + (p2[0] - p1[0]) * ratio,
                            p1[1] + (p2[1] - p1[1]) * ratio,
                        ];
                        dFwd = ARROW_HEAD_OFFSET_M;
                    } else {
                        dFwd += segDist;
                        hIdx++;
                        finalHeadPoint = displayPath[hIdx]!;
                    }
                }

                if (dFwd > 0) {
                    arrowCoords.push(finalHeadPoint);
                }

                // 5. Generate MapLibre features
                if (arrowCoords.length >= 2) {
                    linesFeatures.push({
                        type: "Feature",
                        geometry: {
                            type: "LineString",
                            coordinates: arrowCoords,
                        },
                        properties: {},
                    });

                    const pLast = arrowCoords[arrowCoords.length - 1]!;
                    const pPrev = arrowCoords[arrowCoords.length - 2]!;
                    const bearing = getBearing(pPrev, pLast);

                    headsFeatures.push({
                        type: "Feature",
                        geometry: { type: "Point", coordinates: pLast },
                        properties: { bearing },
                    });

                    // --- NEW: Register that we successfully drew an arrow ---
                    arrowsDrawn++;
                }
            }
        }

        const lineSource = map.value.getSource(
            "turn-arrows-line-source",
        ) as maplibregl.GeoJSONSource;
        const headSource = map.value.getSource(
            "turn-arrows-head-source",
        ) as maplibregl.GeoJSONSource;

        if (lineSource)
            lineSource.setData({
                type: "FeatureCollection",
                features: linesFeatures as any,
            });
        if (headSource)
            headSource.setData({
                type: "FeatureCollection",
                features: headsFeatures as any,
            });
    }

    function calculateRouteInWorker(
        startId: number,
        possibleEnds: number[],
        heading: number,
        startType: string,
        targetCoords: [number, number],
        projectedStartCoords: [number, number],
        ownedDlcs: number[],
        sdkScale: number,
        avgSpeed: number,
    ): Promise<any> {
        return new Promise((resolve) => {
            if (!worker) {
                resolve(null);
                return;
            }

            const handler = (e: MessageEvent) => {
                if (e.data.type === "RESULT") {
                    worker!.removeEventListener("message", handler);
                    resolve(e.data.payload);
                }
            };

            worker.addEventListener("message", handler);

            worker.postMessage({
                type: "CALC_ROUTE",
                payload: {
                    startId,
                    possibleEnds,
                    heading,
                    startType,
                    targetCoords,
                    projectedStartCoords,
                    ownedDlcs,
                    selectedGame: settings.value.selectedGame,
                    sdkScale,
                    avgSpeed,
                },
            });
        });
    }

    function findBestStartConfiguration(
        truckCoords: [number, number],
        truckHeading: number,
        searchLimit: number = 50,
    ) {
        if (adjacency.size === 0 || nodeCoords.size === 0) {
            console.error("CRITICAL: Graph data is empty!");
            return null;
        }

        const nearbyNodes = getClosestNodes(truckCoords, searchLimit, 0.1);

        if (nearbyNodes.length === 0) {
            return null;
        }

        let bestEdge = null;
        let minScore = Infinity;

        for (const fromNodeId of nearbyNodes) {
            const neighbors = adjacency.get(fromNodeId);
            const fromPos = nodeCoords.get(fromNodeId);
            if (!neighbors || !fromPos) continue;

            for (const edge of neighbors) {
                const toPos = nodeCoords.get(edge.to);
                if (!toPos) continue;

                let roadBearing = getBearing(fromPos, toPos);

                let diff = Math.abs(truckHeading - roadBearing);
                if (diff > 180) diff = 360 - diff;

                const isOpposite = diff > 90;
                const trueDiff = isOpposite ? 180 - diff : diff;
                if (trueDiff > 45) continue;

                const visualRoadBearing = isOpposite
                    ? (roadBearing + 180) % 360
                    : roadBearing;

                const projected = projectPointToSegment(
                    truckCoords,
                    fromPos,
                    toPos,
                );
                const distSq = getSquaredDist(truckCoords, projected);
                const distKm = Math.sqrt(distSq) * 111;

                const headingPenalty = Math.pow(trueDiff / 90, 2) * 0.1;
                const directionPenalty = isOpposite ? 0.5 : 0;

                const score = distKm + headingPenalty + directionPenalty;

                if (score < minScore) {
                    minScore = score;
                    bestEdge = {
                        type: "road",
                        fromId: fromNodeId,
                        toId: edge.to,
                        projectedCoords: projected,
                        bearing: visualRoadBearing,
                    };
                }
            }
        }

        if (bestEdge) return bestEdge;

        const yardCandidates = getClosestNodes(truckCoords, 10, 0.3);
        let closestNodeId: number | null = null;
        let minNodeDist = Infinity;

        for (const nodeId of yardCandidates) {
            const nodePos = nodeCoords.get(nodeId);
            if (!nodePos) continue;

            const distSq = getSquaredDist(truckCoords, nodePos);
            if (distSq < minNodeDist) {
                minNodeDist = distSq;
                closestNodeId = nodeId;
            }
        }

        if (closestNodeId !== null) {
            const nodePos = nodeCoords.get(closestNodeId);
            if (!nodePos) return;

            return {
                type: "yard",
                fromId: closestNodeId,
                toId: closestNodeId,
                projectedCoords: nodePos,
            };
        }

        return null;
    }

    async function findFlexibleRoute(
        startNodeId: number,
        targetCoords: [number, number],
        truckHeading: number,
        startType: "road" | "yard",
        projectedStartCoords: [number, number],
        sdkScale: number,
        avgSpeed: number,
    ) {
        const SEARCH_RADII = [1, 2, 4, 8, 16, 32, 100, 300];
        const userDlcs = toRaw(activeSettings.value.ownedDlcs);

        for (const radius of SEARCH_RADII) {
            const candidates = getClosestNodes(targetCoords, radius, 0.1);

            if (candidates.length === 0) continue;

            const result = await calculateRouteInWorker(
                startNodeId,
                candidates,
                truckHeading,
                startType,
                targetCoords,
                projectedStartCoords,
                userDlcs,
                sdkScale,
                avgSpeed,
            );

            if (result) {
                return result;
            }
        }

        return null;
    }

    function drawRouteOnMap(coords: [number, number][]) {
        if (!map.value) return;

        const rawMap = toRaw(map.value);
        setMapLibreData(rawMap, "route-line", "LineString", toRaw(coords));
    }

    function addDestinationMarker(nodeId: number) {
        const endLocation = nodeCoords.get(nodeId);
        if (!endLocation || !map.value) return;

        setMapLibreData(map.value, "destination-source", "Point", endLocation);
    }

    async function setupRouteLayer() {
        if (!map.value) return;
        if (map.value.getSource("route-line")) return;

        if (!map.value.hasImage("destination-icon")) {
            const pinImg = await generateDestinationIcon(
                activeSettings.value.themeColor,
            );
            map.value.addImage("destination-icon", pinImg, { pixelRatio: 2.5 });
        }

        map.value.addSource("route-line", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
        });

        map.value.addLayer(
            {
                id: "route-line",
                type: "line",
                source: "route-line",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: {
                    "line-color": activeSettings.value.routeColor,
                    "line-width": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        10,
                        8,
                        10.2,
                        9,
                        10.5,
                        6,
                        11.5,
                        11,
                    ],
                },
            },
            "all-sprites",
        );

        if (!map.value.getSource("destination-source")) {
            map.value.addSource("destination-source", {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
            });

            map.value.addLayer({
                id: "destination-layer",
                type: "symbol",
                source: "destination-source",
                layout: {
                    "icon-image": "destination-icon",
                    "icon-anchor": "bottom",
                    "icon-allow-overlap": true,
                    "icon-ignore-placement": true,
                },
            });

            map.value.on("click", "destination-layer", () => {
                clearRouteState();
            });
            map.value.on("mouseenter", "destination-layer", () => {
                map.value!.getCanvas().style.cursor = "pointer";
            });
            map.value.on("mouseleave", "destination-layer", () => {
                map.value!.getCanvas().style.cursor = "";
            });
        }

        if (!map.value.hasImage("turn-arrow-icon")) {
            const arrowImg = new Image();
            arrowImg.onload = () =>
                map.value!.addImage("turn-arrow-icon", arrowImg);

            arrowImg.src =
                "data:image/svg+xml;charset=utf-8," +
                encodeURIComponent(
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 20L12 16L22 20L12 2Z" fill="white" stroke="#1c1c1c" stroke-width="2" stroke-linejoin="round"/></svg>',
                );
        }

        if (!map.value.getSource("turn-arrows-line-source")) {
            map.value.addSource("turn-arrows-line-source", {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
            });

            map.value.addLayer({
                id: "turn-arrows-line-border",
                type: "line",
                source: "turn-arrows-line-source",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: {
                    "line-color": "#1c1c1c",
                    "line-width": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        10,
                        9,
                        15,
                        15,
                    ],
                },
            });

            map.value.addLayer({
                id: "turn-arrows-line-inner",
                type: "line",
                source: "turn-arrows-line-source",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: {
                    "line-color": "#ffffff",
                    "line-width": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        10,
                        5.5,
                        15,
                        9.5,
                    ],
                },
            });
        }

        if (!map.value.getSource("turn-arrows-head-source")) {
            map.value.addSource("turn-arrows-head-source", {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
            });

            map.value.addLayer({
                id: "turn-arrows-head-layer",
                type: "symbol",
                source: "turn-arrows-head-source",
                layout: {
                    "icon-image": "turn-arrow-icon",
                    "icon-size": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        10,
                        0.83,
                        15,
                        1.33,
                    ],
                    "icon-rotation-alignment": "map",
                    "icon-rotate": ["get", "bearing"],
                    "icon-anchor": "center",
                    "icon-allow-overlap": true,
                    "icon-ignore-placement": true,
                },
            });
        }
    }

    async function handleRouteClick(
        clickCoords: [number, number],
        truckCoords: [number, number],
        truckHeading: number,
        sdkScale: number,
        createEndMarker: boolean,
        avgSpeed: number,
    ) {
        if (adjacency.size === 0 || isCalculating.value || !isWorkerReady)
            return;

        isCalculating.value = true;
        routeFound.value = null;

        savedDestination.value = clickCoords;

        try {
            const startConfig = findBestStartConfiguration(
                truckCoords,
                truckHeading,
                50,
            );

            if (!startConfig) return;
            isYardStart.value = startConfig.type === "yard";

            startNodeId.value = startConfig.toId;
            const result = await findFlexibleRoute(
                startNodeId.value!,
                toRaw(clickCoords),
                truckHeading,
                startConfig.type as "road" | "yard",
                startConfig.projectedCoords,
                sdkScale,
                avgSpeed,
            );

            if (result) {
                isRouteActive.value = true;

                endNodeId.value = result.endId;

                const frozenRawPath = Object.freeze(result.displayPath);
                currentRoutePath.value = frozenRawPath as any;

                routeStatsCache.value = result.stats;

                const cache = result.stats;
                const lastIdx = (result.rawPath.length - 1) * 2;
                const totalKm = cache[lastIdx]!;
                const totalHours = cache[lastIdx + 1]!;

                drawRouteOnMap(result.displayPath);
                if (createEndMarker) addDestinationMarker(result.endId);

                routeDistance.value = Math.round(totalKm);
                const h = Math.floor(totalHours);
                const m = Math.round((totalHours - h) * 60);
                routeEta.value = `${h}h ${m}min`;

                destinationName.value = getGameLocationName(
                    clickCoords[0],
                    clickCoords[1],
                );

                fullRouteDirections.value = generateDirectionsList(
                    result.nodeSequence,
                    result.nodeKms,
                    result.sequenceManeuvers,
                    result.sequenceExits,
                    nodeCoords,
                );

                if (fullRouteDirections.value.length > 1) {
                    const upcomingTurn = fullRouteDirections.value[1];
                    if (
                        upcomingTurn &&
                        upcomingTurn.cumulativeKm !== undefined
                    ) {
                        const distKm = +upcomingTurn.cumulativeKm.toFixed(1);
                        nextTurnDistance.value = Math.max(0, distKm);
                    }
                } else {
                    nextTurnDistance.value = 0;
                }

                if (activeSettings.value.hasTurnNavigation) {
                    drawTurnArrows(
                        fullRouteDirections.value,
                        result.displayPath,
                    );
                }

                routeFound.value = true;
                currentRouteIndex.value = 0;
                updateProfile("lastDestination", savedDestination.value);
            } else {
                routeFound.value = false;
            }
        } catch (e) {
            console.log(`Route calculation Failed: ${e}`);
            isRouteActive.value = false;
        } finally {
            isCalculating.value = false;
        }
    }

    const lastRecalcTime = ref(0);
    const updateRouteProgress = (
        truckCoords: [number, number],
        truckHeading: number,
        sdkScale: number,
        avgSpeed: number,
    ) => {
        if (!currentRoutePath.value || currentRoutePath.value.length < 2)
            return;
        const cache = routeStatsCache.value;
        if (!cache) return;

        if (lastMathPos.value) {
            const sqDist = getSquaredDist(lastMathPos.value, truckCoords);
            if (sqDist < 0.000000001) return;
        }
        lastMathPos.value = truckCoords;

        const path = currentRoutePath.value;
        let bestIndex = currentRouteIndex.value;
        let minSqDist = Infinity;

        const searchLimit = Math.min(path.length - 1, bestIndex + 500);
        const startSearch = Math.max(0, bestIndex - 5);

        for (let i = startSearch; i < searchLimit; i++) {
            const distSq = getSqDistToSegment(
                truckCoords,
                path[i]!,
                path[i + 1]!,
            );

            if (distSq < minSqDist) {
                minSqDist = distSq;
                bestIndex = i;
            }
        }

        currentRouteIndex.value = bestIndex;

        let activeThreshold = DEVIATION_THRESHOLD_SQ;

        const distToEndSq = getSquaredDist(truckCoords, path[path.length - 1]!);
        if (distToEndSq < 0.00005) {
            clearRouteState();
            return;
        }

        const lastIdx = (path.length - 1) * 2;
        const currentIdx = bestIndex * 2;

        const totalKm = cache[lastIdx]!;
        const totalHours = cache[lastIdx + 1]!;

        const currentKm = cache[currentIdx]!;
        const currentHours = cache[currentIdx + 1]!;

        const remKm = totalKm - currentKm;
        const remHours = totalHours - currentHours;
        routeDistance.value = Math.round(remKm);

        if (remHours > 0) {
            const h = Math.floor(remHours);
            const m = Math.round((remHours - h) * 60);
            routeEta.value = `${h}h ${m}min`;
        } else {
            routeEta.value = "Arriving...";
        }

        if (fullRouteDirections.value.length > 1) {
            const upcomingTurn = fullRouteDirections.value[1];

            if (upcomingTurn && upcomingTurn.cumulativeKm !== undefined) {
                // 1. Keep visual distance calculating to the START of the turn (Arrow Tail)
                const distKm = upcomingTurn.cumulativeKm - currentKm;
                const distRounded = +distKm.toFixed(1);

                nextTurnDistance.value = Math.max(0, distRounded);

                // 2. Base the removal threshold on the END of the turn (Arrow Head)
                const targetExitKm =
                    upcomingTurn.exitCumulativeKm !== undefined
                        ? upcomingTurn.exitCumulativeKm
                        : upcomingTurn.cumulativeKm;

                const distToExit = targetExitKm - currentKm;
                const threshold =
                    upcomingTurn.type === "destination" ? 0.02 : 0.05;

                // Shift the array ONLY when we pass the Head of the arrow
                if (distToExit < threshold) {
                    fullRouteDirections.value.shift();

                    if (
                        currentRoutePath.value &&
                        activeSettings.value.hasTurnNavigation
                    ) {
                        drawTurnArrows(
                            fullRouteDirections.value,
                            currentRoutePath.value,
                        );
                    }
                }
            }
        } else {
            nextTurnDistance.value = 0;
        }

        const now = Date.now();
        if (now - lastRecalcTime.value < 5000) return;

        if (isTruckInYard.value) {
            activeThreshold = 0.05;
        } else if (isYardStart.value) {
            if (bestIndex > 0) {
                isYardStart.value = false;
            } else {
                activeThreshold = 0.005;
            }
        }

        if (minSqDist > activeThreshold) {
            if (!isCalculating.value && savedDestination.value) {
                lastRecalcTime.value = now;
                console.log("Deviation detected! Recalculating...");
                handleRouteClick(
                    toRaw(savedDestination.value),
                    truckCoords,
                    truckHeading,
                    sdkScale,
                    false,
                    avgSpeed,
                );
                return;
            }
        }
    };

    function clearRouteState() {
        if (!map.value) return;

        deleteMapLibreData(map.value, "route-line");
        deleteMapLibreData(map.value, "destination-source");
        deleteMapLibreData(map.value, "turn-arrows-line-source");
        deleteMapLibreData(map.value, "turn-arrows-head-source");

        isRouteActive.value = false;
        endNodeId.value = null;
        currentRoutePath.value = null;
        savedDestination.value = null;
        isYardStart.value = false;
        fullRouteDirections.value = [];
        updateProfile("lastDestination", null);
        stopNavigationMode();

        nextTurnDistance.value = 0;
        lastMathPos.value = null;
    }

    return {
        worker,
        destinationName,
        routeDistance,
        routeEta,
        isCalculating,
        routeFound,
        currentRoutePath,
        isWorkerReady,
        isRouteActive,
        fullRouteDirections,
        nextTurnDistance,
        initWorkerData,
        destroyWorker,
        setupRouteLayer,
        handleRouteClick,
        findBestStartConfiguration,
        updateRouteProgress,
        clearRouteState,
    };
};
