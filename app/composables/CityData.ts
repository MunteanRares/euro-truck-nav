import {
    convertAtsToGeo,
    convertEts2ToGeo,
} from "~/assets/utils/map/converters";
import { type WorkerCityArea } from "~/assets/utils/routing/algorithm";
import { getMapFileUrl } from "~/assets/utils/shared/fileManager";
import type { GameType } from "~/types";

// --- Types ---
export interface ScsCityArea {
    uid: string;
    type: number;
    x: number;
    y: number;
    width: number;
    height: number;
    hidden: boolean;
}

export interface ScsCity {
    token: string;
    name: string;
    countryToken: string;
    population: number;
    x: number;
    y: number;
    areas: ScsCityArea[];
}

interface GeoJsonProperties {
    name: string;
    poiName: string;
    poiType: string;
    countryToken?: string;
    scaleRank?: number;
    state?: string;
    [key: string]: any;
}

interface GeoJsonFeature {
    type: "Feature";
    geometry: {
        type: "Point";
        coordinates: [number, number];
    };
    properties: GeoJsonProperties;
}

interface GeoJsonCollection {
    type: "FeatureCollection";
    features: GeoJsonFeature[];
}

interface RealCompanyModFallback {
    [companyId: string]: {
        name: string;
        sort_name: string;
        trailer_look: string;
    };
}

const scsCitiesData = shallowRef<ScsCity[] | null>(null);
const villageData = shallowRef<GeoJsonCollection | null>(null);
const companiesData = shallowRef<GeoJsonCollection | null>(null);
const realCompanyModData = shallowRef<RealCompanyModFallback | null>(null);

const isLoaded = ref(false);
const optimizedCityNodes = shallowRef<WorkerCityArea[]>([]);
const loadedGame = ref<GameType | null>(null);

export function useCityData() {
    const { settings } = useSettings();

    async function loadLocationData() {
        if (loadedGame.value === settings.value.selectedGame) return;

        scsCitiesData.value = null;
        villageData.value = null;
        companiesData.value = null;
        realCompanyModData.value = null;
        optimizedCityNodes.value = [];

        try {
            const game = settings.value.selectedGame!;

            const citiesUrl = await getMapFileUrl(game, "map-data/cities.json");
            const companiesUrl = await getMapFileUrl(
                game,
                "map-data/companies.geojson",
            );
            const realCompanyModUrl = await getMapFileUrl(
                game,
                "map-data/RealCompaniesModVanillaMapping.json",
            );

            if (settings.value.selectedGame === "ets2") {
                const villagesUrl = await getMapFileUrl(
                    game,
                    "map-data/villages.geojson",
                );

                const [
                    citiesRes,
                    villagesRes,
                    companiesRes,
                    realCompanyModRes,
                ] = await Promise.all([
                    fetch(citiesUrl),
                    fetch(villagesUrl),
                    fetch(companiesUrl),
                    fetch(realCompanyModUrl),
                ]);

                if (citiesRes.ok) scsCitiesData.value = await citiesRes.json();
                if (villagesRes.ok)
                    villageData.value = await villagesRes.json();
                if (companiesRes.ok)
                    companiesData.value = await companiesRes.json();
                if (realCompanyModRes.ok)
                    realCompanyModData.value = await realCompanyModRes.json();
            } else if (settings.value.selectedGame == "ats") {
                const [citiesRes, companiesRes, realCompanyModRes] =
                    await Promise.all([
                        fetch(citiesUrl),
                        fetch(companiesUrl),
                        fetch(realCompanyModUrl),
                    ]);

                if (citiesRes.ok) scsCitiesData.value = await citiesRes.json();
                if (companiesRes.ok)
                    companiesData.value = await companiesRes.json();
                if (realCompanyModRes.ok)
                    realCompanyModData.value = await realCompanyModRes.json();
            }

            optimizedCityNodes.value = getWorkerCityData() || [];

            isLoaded.value = true;
            loadedGame.value = settings.value.selectedGame;
        } catch (e) {
            console.error("Failed to load map data:", e);
            loadedGame.value = null;
        }
    }

    function findDestinationCoords(
        targetCityId: string,
        targetCompanyId: string,
    ): [number, number] | null {
        if (!isLoaded.value || !companiesData.value) return null;

        let cityCoords = getCityGeoCoordinates(targetCityId);

        if (!cityCoords) {
            console.warn(`City Token not found in data: ${targetCityId}`);
            return null;
        }

        const safeCompanyName = targetCompanyId.toLowerCase().trim();
        let vanillaId: string | undefined = undefined;

        if (realCompanyModData.value) {
            vanillaId = Object.keys(realCompanyModData.value).find((key) => {
                const entry = realCompanyModData.value![key];
                return (
                    entry?.sort_name &&
                    safeCompanyName.includes(
                        entry.sort_name.toLowerCase().trim(),
                    )
                );
            });
        }

        const companyCandidates = companiesData.value.features.filter((f) => {
            const p = f.properties;

            return (
                p.poiType === "company" &&
                p.sprite &&
                (p.sprite.toLowerCase().trim() === safeCompanyName ||
                    (vanillaId && p["sprite"].includes(vanillaId)))
            );
        });

        if (companyCandidates.length === 0) {
            console.warn(`Company not found in data ${targetCompanyId}`);

            return [cityCoords[0], cityCoords[1]];
        }

        let bestCandidate: GeoJsonFeature | null = null;
        let minDistance = Infinity;

        const [cityLng, cityLat] = cityCoords;

        for (const candidate of companyCandidates) {
            const [companyLng, companyLat] = candidate.geometry.coordinates;

            const differenceX = companyLng - cityLng;
            const differenceY = companyLat - cityLat;
            const distance =
                differenceX * differenceX + differenceY * differenceY;

            if (distance < minDistance) {
                minDistance = distance;
                bestCandidate = candidate;
            }
        }

        if (bestCandidate) {
            const [finalLng, finalLat] = bestCandidate.geometry.coordinates;

            return [finalLng, finalLat];
        }

        return null;
    }

    function getCityGeoCoordinates(tokenId: string): [number, number] | null {
        if (!scsCitiesData.value) return null;
        const searchToken = tokenId.toLowerCase().trim();

        const city = scsCitiesData.value.find(
            (c) => c.token.toLowerCase() === searchToken,
        );

        if (city) {
            if (settings.value.selectedGame === "ets2") {
                return convertEts2ToGeo(city.x, city.y);
            } else {
                return convertAtsToGeo(city.x, city.y);
            }
        }

        return null;
    }

    function getWorkerCityData(): WorkerCityArea[] {
        const areasOut: WorkerCityArea[] = [];
        if (!scsCitiesData.value) return areasOut;

        for (const city of scsCitiesData.value) {
            if (city.areas && city.areas.length > 0) {
                for (const area of city.areas) {
                    areasOut.push({
                        minX: area.x - area.width / 2,
                        maxX: area.x + area.width / 2,
                        minZ: area.y - area.height / 2,
                        maxZ: area.y + area.height / 2,
                    });
                }
            }
        }
        return areasOut;
    }

    function getGameLocationName(targetLng: number, targetLat: number): string {
        if (!isLoaded.value) return "Loading data...";

        let bestName = "";
        let bestCountry = "";
        let minDistance = Infinity;

        if (scsCitiesData.value) {
            for (const city of scsCitiesData.value) {
                const [lng, lat] =
                    settings.value.selectedGame === "ets2"
                        ? convertEts2ToGeo(city.x, city.y)
                        : convertAtsToGeo(city.x, city.y);

                const dx = lng - targetLng;
                const dy = lat - targetLat;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDistance) {
                    minDistance = dist;
                    bestName = city.name;
                    bestCountry = formatCountryToken(city.countryToken);
                }
            }
        }

        if (villageData.value && villageData.value.features) {
            for (const feature of villageData.value.features) {
                const [lng, lat] = feature.geometry.coordinates;

                const dx = lng - targetLng;
                const dy = lat - targetLat;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDistance) {
                    minDistance = dist;
                    bestName = feature.properties.name;
                    bestCountry = feature.properties.state || "";
                }
            }
        }

        if (bestName) {
            const threshold = 0.3;

            const fullName = bestCountry
                ? `${bestName}, ${bestCountry}`
                : bestName;

            if (minDistance < threshold) {
                return fullName;
            } else {
                return `Near ${fullName}`;
            }
        }

        return "Open Road";
    }

    function formatCountryToken(token?: string): string {
        if (!token) return "";
        return token
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    return {
        scsCitiesData,
        loadLocationData,
        getGameLocationName,
        getWorkerCityData,
        findDestinationCoords,
    };
}
