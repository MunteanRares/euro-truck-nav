import { Filesystem, Directory } from "@capacitor/filesystem";
import { FileTransfer } from "@capacitor/file-transfer";
import { CapacitorZip } from "@capgo/capacitor-zip";
import { Capacitor } from "@capacitor/core";

const { isElectron, isWeb } = usePlatform();

/**
 * Downloads and extracts data into Directory.Data/maps
 * @param mapName: Name of the map directory (e.g ets2, ats)
 * @param zipUrl: URL of the zip archive to download
 * @param onProgress: Optional callback that recieves download progress as a percentage
 */
export async function downloadMapData(
    mapName: string,
    zipUrl: string,
    onProgress?: (percent: number) => void,
) {
    if (isWeb.value) return true;

    if (isElectron.value) {
        if (onProgress) {
            (window as any).electronAPI.onMapProgress((pct: number) => {
                onProgress(pct);
            });
        }

        return await (window as any).electronAPI.downloadMap(mapName, zipUrl);
    }

    const zipPath = `maps/${mapName}.zip`;
    const extractPath = `maps/${mapName}`;

    try {
        const zipUri = await Filesystem.getUri({
            path: zipPath,
            directory: Directory.Data,
        });

        const extractUri = await Filesystem.getUri({
            path: extractPath,
            directory: Directory.Data,
        });

        // Downloading
        FileTransfer.addListener("progress", (progress) => {
            const percent = Math.round(
                (progress.bytes / progress.contentLength) * 100,
            );

            if (onProgress) onProgress(percent);
        });

        await FileTransfer.downloadFile({
            url: zipUrl,
            path: zipUri.uri,
            progress: true,
        });

        // Extracting
        const nativeZipPath = zipUri.uri.replace("file://", "");
        const nativeExtractPath = extractUri.uri.replace("file://", "");

        if (Capacitor.getPlatform() === "electron") {
            // Electron logic
        } else {
            await CapacitorZip.unzip({
                source: nativeZipPath,
                destination: nativeExtractPath,
            });
        }

        await Filesystem.deleteFile({
            path: zipPath,
            directory: Directory.Data,
        });

        return true;
    } catch (e) {
        console.log("Failed to download map data: ", e);
        return false;
    }
}

/**
 * Checks if map is downloaded in Directory.Data/maps folder
 * @param mapName: Name of the map directory (e.g ets2, ats)
 */
export async function isMapDownloaded(mapName: string): Promise<boolean> {
    if (isWeb.value) return true;

    if (isElectron.value) {
        return await (window as any).electronAPI.checkMap(mapName);
    }

    const extractPath = `maps/${mapName}`;
    try {
        const stat = await Filesystem.stat({
            path: extractPath,
            directory: Directory.Data,
        });
        return stat.type === "directory";
    } catch (e) {
        return false;
    }
}

/**
 * Gets a list of all downloaded maps
 */
export async function getDownloadedMaps(): Promise<string[]> {
    if (isWeb.value) return [];

    if (isElectron.value) {
        return await (window as any).electronAPI.getDownloadedMaps();
    }

    try {
        const result = await Filesystem.readdir({
            path: "maps",
            directory: Directory.Data,
        });

        return result.files
            .filter((file) => file.type === "directory")
            .map((file) => file.name);
    } catch (e) {
        return [];
    }
}

/**
 * Uninstalls a map data folder in case the user doesn't want to have it anymore
 * @param mapName: Name of the map directory (e.g ets2, ats)
 */
export async function uninstallMapData(mapName: string): Promise<boolean> {
    if (isWeb.value) return false;

    if (isElectron.value) {
        return await (window as any).electronAPI.uninstallMap(mapName);
    }

    const extractPath = `maps/${mapName}`;

    try {
        await Filesystem.rmdir({
            path: extractPath,
            directory: Directory.Data,
            recursive: true,
        });

        return true;
    } catch (e) {
        console.log(`Failed to uninstall map data for ${mapName}: `, e);
        return false;
    }
}

/**
 * Safely get the URL for a downloaded map file.
 * Returns the local device file if downloaded, otherwise falls back to /public/ folder.
 * @param mapName: Name of the map directory (e.g. ets2, ats)
 * @param fileName: Filename to load (e.g. roadnetwork/graph.bin)
 */
export async function getMapFileUrl(
    mapName: string,
    fileName: string,
): Promise<string> {
    if (isElectron.value) {
        const port = await (window as any).electronAPI.getLocalPort();
        return `http://127.0.0.1:${port}/maps/${mapName}/${fileName}`;
    }

    const localPath = `maps/${mapName}/${fileName}`;

    try {
        await Filesystem.stat({
            path: localPath,
            directory: Directory.Data,
        });

        const uri = await Filesystem.getUri({
            path: localPath,
            directory: Directory.Data,
        });

        return Capacitor.convertFileSrc(uri.uri);
    } catch (e) {
        console.log("Failed to get downloaded map file: ", e);
        return `/data/${mapName}/${fileName}`;
    }
}
