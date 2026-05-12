<script lang="ts" setup>
import { isBridgeRunning } from "~/assets/utils/telemetry/helpers";

const { fetchIp, fetchPort, localIP, localPort } = useNetwork();
const { updateGlobal } = useSettings();
const { settings, updateDesktopSetting } = useDesktopSettings();
const { t } = useTranslations();

const isServerRunning = ref(false);
const polling = ref<any>(null);
const isRemoteGpsWindowOpened = ref(false);
const etsActive = ref(false);
const atsActive = ref(false);

const startWithWindows = computed(() => settings.value.startWithWindows);
const startMinimized = computed(() => settings.value.startMinimized);

const checkStatus = async () => {
    isServerRunning.value = await isBridgeRunning("127.0.0.1");

    const statuses = await (window as any).electronAPI.checkPluginStatuses();
    etsActive.value = statuses.ets2;
    atsActive.value = statuses.ats;
};

const emit = defineEmits(["connected"]);

const handleLocalLaunch = async () => {
    updateGlobal("savedIP", "127.0.0.1");
    emit("connected");
};

onMounted(async () => {
    await fetchIp();
    await fetchPort();

    const settings = await (window as any).electronAPI.getSettings();
    if (!settings.startMinimized) {
        (window as any).electronAPI.setWindowSize(950, 700, false, false);
    }

    checkStatus();
    const bootTimer = setInterval(async () => {
        if (isServerRunning.value) {
            clearInterval(bootTimer);
            startRegularPolling();
            return;
        }

        await checkStatus();
    }, 1500);
});

const handleExplorerLaunch = async (gameName: string) => {
    const result = await (window as any).electronAPI.selectGameFolder(gameName);

    if (result.success) {
        console.log("Plugin installed at:", result.path);
        checkStatus();
    } else {
        if (result.message !== "Cancelled") {
            alert("Error: " + result.message);
        }
    }
};

onUnmounted(() => {
    if (polling.value) clearInterval(polling.value);
});

const startRegularPolling = () => {
    polling.value = setInterval(async () => {
        await checkStatus();
    }, 7000);
};

const openLink = async (url: string) => {
    (window as any).electronAPI.openExternal(url);
};

const toggleRemoteGpsWindow = () => {
    isRemoteGpsWindowOpened.value = !isRemoteGpsWindowOpened.value;
};
</script>

<template>
    <section class="section-device-info">
        <div class="top-tagline">
            <Icon name="lucide:satellite-dish" class="icon" size="20" />
            <span>{{ t("desktop.truckingCompanion") }}</span>
        </div>

        <div class="content">
            <div class="title-wrapper">
                <h2 class="title">{{ t("desktop.title") }}</h2>
                <Icon
                    class="github-icon"
                    name="lucide:github"
                    size="30"
                    @click.prevent="
                        openLink(
                            'https://github.com/Rares-Muntean/ets2-navigation-gps',
                        )
                    "
                />
            </div>

            <span class="subtitle">{{ t("desktop.subtitle") }}</span>
            <div class="steps">
                <ol>
                    <li>{{ t("desktop.stepRunning") }}</li>

                    <li>
                        {{ t("desktop.stepExecutable") }} <br />
                        <code>C:\...\Euro Truck Simulator 2\bin\win_x64</code>
                    </li>

                    <li>{{ t("desktop.stepNetwork") }}</li>

                    <li>{{ t("desktop.stepOpenApp") }}</li>
                </ol>

                <div class="ip-type-wrapper">
                    <div class="ip-type">
                        <Icon name="lucide:app-window" class="icon" size="22" />
                        {{ t("desktop.app") }}
                        <strong class="localIp">{{ localIP }}</strong>
                    </div>

                    <div class="ip-type">
                        <Icon name="lucide:globe" class="icon" size="22" />
                        {{ t("desktop.browser") }}
                        <strong class="localIp"
                            >{{ localIP }}:{{ localPort }}</strong
                        >
                    </div>
                </div>

                <div class="settings">
                    <div class="toggle-button">
                        <span class="toggle-title">{{
                            t("desktop.launchStartup")
                        }}</span>
                        <SegmentedControl
                            left-option="On"
                            right-option="Off"
                            @connect="
                                updateDesktopSetting(
                                    'startWithWindows',
                                    !startWithWindows,
                                )
                            "
                            size="small"
                            :active="startWithWindows"
                        />
                    </div>

                    <div class="toggle-button">
                        <span class="toggle-title">{{
                            t("desktop.startMinimized")
                        }}</span>
                        <SegmentedControl
                            left-option="On"
                            right-option="Off"
                            @connect="
                                updateDesktopSetting(
                                    'startMinimized',
                                    !startMinimized,
                                )
                            "
                            size="small"
                            :active="startMinimized"
                        />
                    </div>
                </div>
            </div>

            <div class="bottom-info">
                <div class="status-div">
                    <div class="status">
                        <p>TruckNavTelemetry.exe: &nbsp;</p>
                        <span
                            :class="
                                isServerRunning ? 'connected' : 'disconnected'
                            "
                            >{{
                                isServerRunning
                                    ? t("common.connected")
                                    : t("common.offlineTryAgain")
                            }}</span
                        >
                    </div>

                    <div
                        v-if="isServerRunning"
                        class="status-indicator is-safe"
                    >
                        <Icon
                            name="lucide:circle-check-big"
                            size="20"
                            class="icon"
                        />
                        <span
                            >{{ t("desktop.telemetryRunning") }}
                            <strong>{{ t("desktop.minimize") }}</strong>
                            {{ t("desktop.telemetryRunningSuffix") }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <div class="bottom">
            <div class="setup-games-sdk">
                <div class="game-status">
                    <span class="game-name">{{ t("desktop.ets2") }}</span>
                    <div class="icon-status-wrapper">
                        <div
                            class="label"
                            :class="etsActive ? 'active' : 'missing'"
                        >
                            <span
                                >{{ t("desktop.plugin") }}
                                {{
                                    etsActive
                                        ? t("common.active")
                                        : t("common.missing")
                                }}</span
                            >
                            <button
                                @click.prevent="handleExplorerLaunch('ETS2')"
                                class="folder-btn"
                            >
                                <Icon name="lucide:folder-cog" size="20" />
                            </button>
                        </div>
                    </div>
                </div>

                <div class="game-status">
                    <span class="game-name">{{ t("desktop.ats") }}</span>
                    <div class="icon-status-wrapper">
                        <span
                            class="label"
                            :class="atsActive ? 'active' : 'missing'"
                        >
                            <span
                                >{{ t("desktop.plugin") }}
                                {{
                                    atsActive
                                        ? t("common.active")
                                        : t("common.missing")
                                }}</span
                            >
                            <button
                                @click.prevent="handleExplorerLaunch('ATS')"
                                class="folder-btn"
                            >
                                <Icon name="lucide:folder-cog" size="20" />
                            </button>
                        </span>
                    </div>
                </div>
            </div>

            <div class="connection-type">
                <button @click.prevent="toggleRemoteGpsWindow" class="btn">
                    <span>{{ t("desktop.remoteGps") }}</span>
                    <Icon name="lucide:link-2" size="20" />
                </button>

                <button @click.prevent="handleLocalLaunch" class="btn">
                    <span>{{ t("desktop.localGps") }}</span>
                    <Icon name="lucide:monitor" size="20" />
                </button>
            </div>

            <Transition name="panel-pop">
                <div
                    @click.self="toggleRemoteGpsWindow"
                    v-show="isRemoteGpsWindowOpened"
                    class="connect-modal-overlay"
                >
                    <div class="connect-window">
                        <InputComputerIP @connected="emit('connected')" />
                    </div>
                </div>
            </Transition>
        </div>

        <div class="troubleshoot">
            <InfoBox type="note">
                <template #content
                    >If you're using a cracked version or a repack, the plugin
                    may show as 'Missing' even after setup
                </template>
            </InfoBox>
        </div>
    </section>
</template>

<style
    scoped
    lang="scss"
    src="~/assets/scss/scoped/layouts/desktopIndex.scss"
></style>
