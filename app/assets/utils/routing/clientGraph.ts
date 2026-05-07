import { getActiveMapFolder } from "../map/helpers";
import { getMapFileUrl } from "../shared/fileManager";

const { settings } = useSettings();

export async function loadGraph() {
    const folder = getActiveMapFolder(settings.value);

    const graphUrl = await getMapFileUrl(folder, "roadnetwork/graph.bin");
    const geometryUrl = await getMapFileUrl(folder, "roadnetwork/geometry.bin");

    const [graphRes, geometryRes] = await Promise.all([
        fetch(graphUrl),
        fetch(geometryUrl),
    ]);

    return {
        graphBuffer: await graphRes.arrayBuffer(),
        geometryBuffer: await geometryRes.arrayBuffer(),
    };
}
