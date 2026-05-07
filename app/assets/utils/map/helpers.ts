export function setMapLibreData(
    map: maplibregl.Map,
    sourceName: string,
    geometryType: GeoJSON.Geometry["type"],
    coordinates: any,
    properties: Record<string, any> = {},
) {
    const source = map.getSource(sourceName) as maplibregl.GeoJSONSource;
    if (source) {
        source.setData({
            type: "Feature",
            geometry: {
                type: geometryType,
                coordinates: coordinates,
            } as any,
            properties: properties,
        });
    }
}

export function deleteMapLibreData(map: maplibregl.Map, sourceName: string) {
    const source = map.getSource(sourceName) as maplibregl.GeoJSONSource;
    if (source) {
        source.setData({
            type: "FeatureCollection",
            features: [],
        });
    }
}

export function getActiveMapFolder(settings: AppSettingsState): string {
    const game = settings.selectedGame || "ets2";
    const activeMod = settings.profiles[game].activeMod;

    return activeMod === "none" ? game : activeMod;
}
