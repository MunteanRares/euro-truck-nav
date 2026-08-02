export interface DiscordRpcPayload {
    game: string;
    connected: boolean;
    hasActiveJob: boolean;
    sourceCity?: string;
    destinationCity?: string;
    cargoName?: string;
    truckBrand?: string;
    truckName?: string;
}

// Enter your Discord application client ID here to enable Rich Presence integration.
// For now we use TruckNav's RPC ID, If not set, RPC features will be disabled.
const DISCORD_CLIENT_ID = "1401296138186788865";
const ROTATE_INTERVAL_MS = 10_000;
const RPC_SHUTDOWN_WAIT_MS = 1_500;
const RPC_BUTTONS = [
    {
        label: "Get it on GitHub",
        url: "https://github.com/Rares-Muntean/TruckNav-Sim",
    },
];

let rpcLib: any = null;
let rpcClient: any = null;
let rpcReady = false;
let lastPayloadKey = "";
let latestPayload: DiscordRpcPayload | null = null;
let sessionStartedAt = 0;
let rpcSuspended = false;
let rpcFeatureEnabled = true;

function resetDiscordRpcState() {
    lastPayloadKey = "";
    latestPayload = null;
    sessionStartedAt = 0;
}

function getRpcLibrary() {
    if (rpcLib) return rpcLib;

    try {
        // Optional dependency. If missing, TruckNav still works normally.
        // Install in electron/ with: npm install discord-rpc
        // Add your Discord application ID to DISCORD_CLIENT_ID above.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        rpcLib = require("discord-rpc");
        return rpcLib;
    } catch {
        return null;
    }
}

export async function initDiscordRpc() {
    if (!rpcFeatureEnabled) return;
    if (!DISCORD_CLIENT_ID) {
        return;
    }

    const DiscordRPC = getRpcLibrary();
    if (!DiscordRPC || rpcClient) return;

    try {
        rpcClient = new DiscordRPC.Client({ transport: "ipc" });

        rpcClient.on("ready", async () => {
            rpcReady = true;
            await setIdlePresence();
        });

        rpcClient.on("disconnected", () => {
            rpcReady = false;
        });

        await rpcClient.login({ clientId: DISCORD_CLIENT_ID });
    } catch {
        rpcClient = null;
        rpcReady = false;
    }
}

export async function updateDiscordRpc(payload: DiscordRpcPayload) {
    if (!rpcFeatureEnabled) return;
    if (!rpcClient || !rpcReady) return;

    if (payload.connected && sessionStartedAt === 0) {
        sessionStartedAt = Date.now();
    } else if (!payload.connected) {
        sessionStartedAt = 0;
    }

    latestPayload = payload;
    if (rpcSuspended) return;
    await pushCurrentPresence();
}

export async function clearDiscordRpc() {
    if (!rpcClient || !rpcReady) return;

    try {
        resetDiscordRpcState();

        if (!rpcFeatureEnabled) {
            await rpcClient.clearActivity();
            return;
        }

        await setIdlePresence();
    } catch {}
}

export async function suspendDiscordRpc() {
    rpcSuspended = true;
    await clearDiscordRpc();
}

export async function resumeDiscordRpc() {
    if (!rpcFeatureEnabled) return;
    rpcSuspended = false;
    if (!rpcClient || !rpcReady) return;
    if (latestPayload) {
        await pushCurrentPresence();
    } else {
        await setIdlePresence();
    }
}

export async function destroyDiscordRpc(useIdleFlush = true) {
    if (!rpcClient) return;

    try {
        if (rpcReady) {
            resetDiscordRpcState();

            if (useIdleFlush) {
                // Helper: Discord may cache the previous presence state and keep its timer alive.
                // We first send a clean timer free presence, then clear it, then wait a short time.
                await setIdlePresence();
                await waitForDiscordRpcFlush(250);
            }

            await rpcClient.clearActivity();
            await waitForDiscordRpcShutdown();
        }
    } catch {}

    try {
        await rpcClient.destroy();
    } catch {}

    rpcClient = null;
    rpcReady = false;
    resetDiscordRpcState();
    rpcSuspended = false;
}

export async function setDiscordRpcEnabled(enabled: boolean) {
    rpcFeatureEnabled = enabled;

    if (!enabled) {
        rpcSuspended = true;
        resetDiscordRpcState();
        await destroyDiscordRpc(false);
        return;
    }

    rpcSuspended = false;
    await initDiscordRpc();
    if (latestPayload) {
        await pushCurrentPresence();
    }
}

async function waitForDiscordRpcShutdown() {
    // Helper: when TruckNav closes, Discord may keep showing the RPC for non reason.
    // This small delay gives Discord enough time to clear the presence properly.
    await new Promise((resolve) => {
        setTimeout(resolve, RPC_SHUTDOWN_WAIT_MS);
    });
}

async function waitForDiscordRpcFlush(delayMs: number) {
    // Helper: send one timer free state first so Discord can flush the old session timestamp.
    await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
    });
}

async function setIdlePresence() {
    if (!rpcClient || !rpcReady) return;

    const presence = {
        details: "TruckNav",
        state: "Waiting for telemetry",
        largeImageText: "TruckNav",
        buttons: RPC_BUTTONS,
        instance: false,
    };

    await rpcClient.setActivity(presence);
    lastPayloadKey = JSON.stringify(presence);
}

async function pushCurrentPresence() {
    if (!rpcClient || !rpcReady || !latestPayload) return;

    const normalized = buildPresence(latestPayload);
    const payloadKey = JSON.stringify(normalized);

    if (payloadKey === lastPayloadKey) {
        return;
    }

    try {
        await rpcClient.setActivity(normalized);
        lastPayloadKey = payloadKey;
    } catch {}
}

function buildPresence(payload: DiscordRpcPayload) {
    const isAts = payload.game?.toLowerCase() === "ats";
    const gameName = isAts
        ? "American Truck Simulator"
        : "Euro Truck Simulator 2";

    const details = `Playing: ${gameName}`;
    const truckLabel = getTruckLabel(payload);
    const useTruckState =
        payload.connected &&
        payload.hasActiveJob &&
        !!truckLabel &&
        sessionStartedAt > 0 &&
        Math.floor((Date.now() - sessionStartedAt) / ROTATE_INTERVAL_MS) % 2 ===
            1;
    let state = payload.connected ? "Cruising" : "Waiting for telemetry";

    if (payload.connected && payload.hasActiveJob) {
        const fromCity = cleanLocation(payload.sourceCity);
        const toCity = cleanLocation(payload.destinationCity);

        if (useTruckState && truckLabel) {
            state = `Truck: ${truckLabel}`;
        } else if (fromCity && toCity) {
            state = `Job: ${fromCity} to ${toCity}`;
        } else if (toCity) {
            state = `Job: Delivering to ${toCity}`;
        } else if (payload.cargoName) {
            state = `Job: ${payload.cargoName}`;
        } else {
            state = "Job in progress";
        }
    }

    return {
        details,
        state,
        largeImageText: "TruckNav",
        buttons: RPC_BUTTONS,
        startTimestamp:
            payload.connected && sessionStartedAt > 0
                ? sessionStartedAt
                : undefined,
        instance: false,
    };
}

function getTruckLabel(payload: DiscordRpcPayload) {
    const brand = cleanLocation(payload.truckBrand);
    const name = cleanLocation(payload.truckName);

    if (brand && name) return `${brand} ${name}`;
    return brand || name || "";
}

function cleanLocation(value?: string) {
    if (!value) return "";

    const trimmed = value.trim();
    if (!trimmed || trimmed === "0") return "";
    return trimmed;
}
