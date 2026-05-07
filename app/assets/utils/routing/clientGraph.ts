import { getMapFileUrl } from "../shared/fileManager";

const { settings } = useSettings();

export async function loadGraph() {
    const game = settings.value.selectedGame!;

    const graphUrl = await getMapFileUrl(game, "roadnetwork/graph.bin");
    const geometryUrl = await getMapFileUrl(game, "roadnetwork/graph.bin");

    const [graphRes, geometryRes] = await Promise.all([
        fetch(graphUrl),
        fetch(geometryUrl),
    ]);

    return {
        graphBuffer: await graphRes.arrayBuffer(),
        geometryBuffer: await geometryRes.arrayBuffer(),
    };
}
