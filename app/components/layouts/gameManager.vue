<script lang="ts" setup>
import { ref, computed, watch, onMounted } from "vue";

import {
    downloadMapData,
    isMapDownloaded,
    uninstallMapData,
} from "~/assets/utils/shared/fileManager";

const { selectedGame } = useGameSelection();
const { updateProfile, activeSettings } = useSettings();
const { isMobile, isElectron } = usePlatform();
const { t } = useTranslations();

const emit = defineEmits(["connected", "goBack"]);

// Core States
const isDownloading = ref(false);
const downloadProgress = ref(0);
const downloadingId = ref<string | null>(null);
const isBaseDownloaded = ref(false);
const isModPanelOpen = ref(false);

// Local cache for downloaded mods
const downloadedMods = ref<Record<string, boolean>>({});

const availableMods = computed(() => {
    if (!selectedGame.value) return [];

    const mods: Record<string, { id: string; name: string; url: string }[]> = {
        ets2: [
            {
                id: "promods-europe",
                name: "ProMods Europe",
                url: "https://trucknavapp.com/promods-europe.zip",
            },
        ],
        ats: [
            {
                id: "promods-canada",
                name: "ProMods Canada",
                url: "https://trucknavapp.com/promods-canada.zip",
            },
        ],
    };
    return mods[selectedGame.value] || [];
});

onMounted(async () => {
    // const script = document.createElement("script");
    // script.src = "https://cdn.jsdelivr.net/npm/eruda";
    // document.body.appendChild(script);
    // script.onload = () => {
    //     (window as any).eruda.init();
    //     console.log("Eruda mobile console loaded and styled successfully!");
    // };

    if (selectedGame.value) {
        isBaseDownloaded.value = await isMapDownloaded(selectedGame.value);
        await checkModStatuses();
    }
});

watch(selectedGame, async (newGame) => {
    if (newGame) {
        isBaseDownloaded.value = await isMapDownloaded(newGame);
        await checkModStatuses();
    }
});

watch(isModPanelOpen, async (isOpen) => {
    if (isOpen) {
        await checkModStatuses();
    }
});

async function checkModStatuses() {
    for (const mod of availableMods.value) {
        downloadedMods.value[mod.id] = await isMapDownloaded(mod.id);
    }
}

async function startDownload(mapId: string, zipUrl: string) {
    isDownloading.value = true;
    downloadingId.value = mapId;
    downloadProgress.value = 0;

    const success = await downloadMapData(mapId, zipUrl, (percent) => {
        downloadProgress.value = percent;
    });

    isDownloading.value = false;
    downloadingId.value = null;

    if (success) {
        if (mapId === selectedGame.value) {
            isBaseDownloaded.value = true;
        } else {
            // Instantly update mod status if it's a mod
            downloadedMods.value[mapId] = true;
        }
    }
}

async function uninstallMap(mapId?: string) {
    // Fall back to selectedGame if no mapId is explicitly passed
    const idToUninstall = mapId || selectedGame.value;
    if (!idToUninstall) return;

    await uninstallMapData(idToUninstall);

    // If we uninstalled the currently active mod, revert active settings to 'none'
    if (activeSettings.value.activeMod === idToUninstall) {
        updateProfile("activeMod", "none");
    }

    setTimeout(async () => {
        const stillExists = await isMapDownloaded(idToUninstall);
        if (idToUninstall === selectedGame.value) {
            isBaseDownloaded.value = stillExists;
        } else {
            downloadedMods.value[idToUninstall] = stillExists;
        }
    }, 300);
}

function selectMod(modId: string | "none") {
    updateProfile("activeMod", modId);
    toggleModPanel();
}

function toggleModPanel() {
    isModPanelOpen.value = !isModPanelOpen.value;
}
</script>

<template>
    <section class="section-mobile-menu">
        <div class="title">
            <div class="back-btn" @click="emit('goBack')">
                <Icon name="lucide:arrow-left" size="24" />
            </div>
            <Icon class="icon" name="lucide:cast" size="20" />
            <span>{{ t("mobile.pairWithComputer") }}</span>
        </div>

        <div class="content">
            <div class="top-content">
                <GameSelection v-model="selectedGame" :width="150" />
                <div
                    v-if="isBaseDownloaded && selectedGame"
                    class="top-buttons"
                >
                    <button @click="toggleModPanel" class="btn nav-btn mod-btn">
                        <Icon name="lucide:settings" size="20" />
                        <span>
                            Map Mods ({{
                                activeSettings.activeMod === "none" ||
                                !activeSettings.activeMod
                                    ? "None"
                                    : activeSettings.activeMod
                            }})
                        </span>
                    </button>

                    <button
                        @click="uninstallMap()"
                        class="btn nav-btn mod-btn default-color"
                    >
                        <Icon name="lucide:trash-2" size="20" />
                        <span>Uninstall Base Map</span>
                    </button>
                </div>
            </div>

            <template v-if="isBaseDownloaded && selectedGame">
                <InputComputerIP
                    v-if="isMobile"
                    @connected="emit('connected')"
                    :style="{ width: '100%', marginTop: '10px' }"
                    :require-game="true"
                />

                <button
                    v-else
                    @click.prevent="emit('connected')"
                    class="btn nav-btn success-btn"
                >
                    <span>Start Navigation</span>
                    <Icon name="lucide:map-pinned" size="20" />
                </button>
            </template>

            <template v-else-if="!isBaseDownloaded && selectedGame">
                <div class="bottom-download-button">
                    <InfoBox type="note">
                        <template #content>
                            <p>
                                Please make sure that TruckNav PC Companion is
                                running before downloading
                            </p>
                        </template></InfoBox
                    >

                    <button
                        @click.prevent="
                            startDownload(
                                selectedGame,
                                `https://trucknavapp.com/${selectedGame}.zip`,
                            )
                        "
                        class="btn nav-btn"
                        :disabled="isDownloading"
                    >
                        <span>Download Base Map</span>
                        <Icon name="lucide:download" size="20" />
                    </button>

                    <ProgressBar
                        class="progress-bar"
                        v-if="isDownloading && downloadingId === selectedGame"
                        :progress="
                            downloadProgress === -1 ? 99 : downloadProgress
                        "
                    />
                </div>
            </template>

            <Transition name="panel-pop">
                <PopupPanel
                    v-if="isModPanelOpen"
                    title="Select Map Mod"
                    @close="toggleModPanel"
                >
                    <div class="mod-list-container">
                        <div class="mod-item">
                            <div class="mod-info">
                                <strong>Default Map</strong>
                                <p>Standard game map (No Mods)</p>
                            </div>
                            <div class="mod-actions">
                                <button
                                    class="nav-btn select-btn"
                                    @click="selectMod('none')"
                                    :disabled="
                                        activeSettings.activeMod === 'none' ||
                                        !activeSettings.activeMod
                                    "
                                >
                                    {{
                                        activeSettings.activeMod === "none" ||
                                        !activeSettings.activeMod
                                            ? "Selected"
                                            : "Select"
                                    }}
                                </button>
                            </div>
                        </div>

                        <div
                            v-for="mod in availableMods"
                            :key="mod.id"
                            class="mod-item"
                        >
                            <div class="mod-info">
                                <strong>{{ mod.name }}</strong>
                                <ProgressBar
                                    v-if="downloadingId === mod.id"
                                    :progress="
                                        downloadProgress === -1
                                            ? 99
                                            : downloadProgress
                                    "
                                    style="margin-top: 8px"
                                />
                            </div>

                            <div class="mod-actions">
                                <button
                                    v-if="
                                        !downloadedMods[mod.id] &&
                                        downloadingId !== mod.id
                                    "
                                    class="nav-btn download-btn"
                                    @click="startDownload(mod.id, mod.url)"
                                >
                                    <Icon name="lucide:download" size="20" />
                                    Download
                                </button>

                                <span
                                    class="downloading-text"
                                    v-else-if="downloadingId === mod.id"
                                >
                                    {{
                                        downloadProgress === -1
                                            ? "In Progress"
                                            : (downloadProgress || 0) + "%"
                                    }}
                                </span>

                                <template v-else>
                                    <button
                                        class="nav-btn select-btn"
                                        @click="selectMod(mod.id)"
                                        :disabled="
                                            activeSettings.activeMod === mod.id
                                        "
                                    >
                                        {{
                                            activeSettings.activeMod === mod.id
                                                ? "Selected"
                                                : "Select"
                                        }}
                                    </button>

                                    <button
                                        class="nav-btn uninstall-btn"
                                        @click="uninstallMap(mod.id)"
                                    >
                                        <Icon name="lucide:trash-2" size="16" />
                                    </button>
                                </template>
                            </div>
                        </div>

                        <div v-if="availableMods.length === 0" class="no-mods">
                            No mods are currently available for this game.
                        </div>
                    </div>
                </PopupPanel>
            </Transition>
        </div>
    </section>
</template>

<style
    scoped
    lang="scss"
    src="~/assets/scss/scoped/layouts/gameManager.scss"
></style>

<style scoped lang="scss">
/* Adding some basic styles for the mod list popup layout */
.mod-list-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 0;

    .mod-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 12px;
        border-radius: 8px;

        .mod-info {
            display: flex;
            flex-direction: column;
            flex: 1;
            margin-right: 12px;

            p {
                margin: 0;
                font-size: 1.2rem;
                opacity: 0.6;
            }
        }

        .mod-actions {
            display: flex;
            align-items: center;
            gap: 8px;

            .select-btn {
                background: #3b82f6;
                color: white;
            }

            .download-btn {
                background: #10b981;
                color: white;
            }

            .uninstall-btn {
                background: #ef4444;
                color: white;
            }

            .downloading-text {
                opacity: 0.8;
                font-weight: bold;
                padding: 0 10px;
            }
        }
    }

    .no-mods {
        text-align: center;
        padding: 20px;
        opacity: 0.6;
        font-size: 0.9rem;
    }
}
</style>
