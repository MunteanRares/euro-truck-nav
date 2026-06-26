import { ref } from "vue";
import RBush from "rbush";
import { loadGraph } from "~/assets/utils/routing/clientGraph";
import { haversine } from "~/assets/utils/routing/helpers";

interface NodeIndexItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    id: number;
    coord: [number, number];
}

const adjacency = new Map<number, any>();
const nodeCoords = new Map<number, [number, number]>();
const nodeTree = new RBush<NodeIndexItem>();

const loading = ref(true);
const progress = ref(0);

export function useGraphSystem() {
    let workerNodesCoordsBuffer: ArrayBuffer | null = null;
    let workerGraphBuffer: ArrayBuffer | null = null;
    let workerGeometryBuffer: ArrayBuffer | null = null;

    const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

    function getClosestNodes(
        target: [number, number],
        limit = 5,
        radiusDeg = 0.02,
    ): number[] {
        const candidates = nodeTree.search({
            minX: target[0] - radiusDeg,
            minY: target[1] - radiusDeg,
            maxX: target[0] + radiusDeg,
            maxY: target[1] + radiusDeg,
        });
        if (candidates.length === 0) return [];
        return candidates
            .map((item) => ({
                id: item.id,
                dist: haversine(target, item.coord),
            }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, limit)
            .map((c) => c.id);
    }

    const initializeGraphData = async () => {
        loading.value = true;
        progress.value = 0;

        const ghostInterval = setInterval(() => {
            if (progress.value < 85)
                progress.value += Math.floor(Math.random() * 3) + 1;
        }, 200);

        try {
            const { graphBuffer, geometryBuffer } = await loadGraph();

            workerGraphBuffer = graphBuffer;
            workerGeometryBuffer = geometryBuffer;

            const graphF32 = new Float32Array(graphBuffer);
            const geometryF32 = new Float32Array(geometryBuffer);

            adjacency.clear();
            nodeCoords.clear();
            nodeTree.clear();

            const uniqueNodes = new Map<
                number,
                { id: number; lng: number; lat: number }
            >();

            // Stride is 12: [u, v, weight, hIn, hOut, isFerry, startIndex, pointCount]
            for (let i = 0; i < graphF32.length; i += 12) {
                const u = graphF32[i]!;
                const v = graphF32[i + 1]!;
                const weight = graphF32[i + 2];
                const hIn = graphF32[i + 3];
                const hOut = graphF32[i + 4];
                const isFerry = graphF32[i + 5];
                const requiredDlc = graphF32[i + 6];
                const vPrefabId = graphF32[i + 7];
                const startIndex = graphF32[i + 8]!;
                const pointCount = graphF32[i + 9]!;
                const maneuverType = graphF32[i + 10]!;
                const exitNumber = graphF32[i + 11]!;

                if (!adjacency.has(u)) adjacency.set(u, []);
                adjacency.get(u)!.push({
                    to: v,
                    weight: weight,
                    hIn: hIn,
                    hOut: hOut,
                    isFerry: isFerry,
                    requiredDlc: requiredDlc,
                    vPrefabId: vPrefabId,
                    maneuverType,
                    exitNumber,
                });

                if (!uniqueNodes.has(u)) {
                    const lng = geometryF32[startIndex]!;
                    const lat = geometryF32[startIndex + 1]!;
                    uniqueNodes.set(u, { id: u, lng, lat });
                }

                if (!uniqueNodes.has(v)) {
                    const lastIdx = startIndex + (pointCount - 1) * 2;
                    const lng = geometryF32[lastIdx]!;
                    const lat = geometryF32[lastIdx + 1]!;
                    uniqueNodes.set(v, { id: v, lng, lat });
                }
            }

            let maxNodeId = 0;
            for (const id of uniqueNodes.keys()) {
                if (id > maxNodeId) {
                    maxNodeId = id;
                }
            }

            const flatCoords = new Float64Array((maxNodeId + 1) * 2);
            for (const node of uniqueNodes.values()) {
                flatCoords[node.id * 2] = node.lng;
                flatCoords[node.id * 2 + 1] = node.lat;
            }
            workerNodesCoordsBuffer = flatCoords.buffer;

            const items: NodeIndexItem[] = [];
            for (const node of uniqueNodes.values()) {
                nodeCoords.set(node.id, [node.lng, node.lat]);
                items.push({
                    minX: node.lng,
                    minY: node.lat,
                    maxX: node.lng,
                    maxY: node.lat,
                    id: node.id,
                    coord: [node.lng, node.lat],
                });
            }

            nodeTree.load(items);

            progress.value = 100;
            await sleep(200);
        } catch (err) {
            console.error("Loading Graph Failed", err);
        } finally {
            clearInterval(ghostInterval);
            setTimeout(() => {
                loading.value = false;
            }, 500);
        }

        return {
            nodes: workerNodesCoordsBuffer,
            graphBuffer: workerGraphBuffer,
            geometryBuffer: workerGeometryBuffer,
        };
    };

    return {
        loading,
        progress,
        adjacency,
        nodeCoords,
        getClosestNodes,
        initializeGraphData,
    };
}
