<script lang="ts" setup>
import { isBridgeRunning } from "~/assets/utils/telemetry/helpers";
const props = defineProps<{ requireGame?: boolean }>();

const { selectedGame, commitSelection } = useGameSelection();
const { settings, updateGlobal } = useSettings();
const { t } = useTranslations();

const connectionError = ref(t("common.disconnected"));
const ipInput = ref(settings.value.savedIP || "");
const isConnecting = ref(false);
const isConnected = ref(false);

const emit = defineEmits(["connected"]);

watch(isConnected, (connected) => {
    if (connected) {
        emit("connected");
    }
});

watch(
    () => settings.value.savedIP,
    (newIP) => {
        if (newIP && !ipInput.value) {
            ipInput.value = newIP;
        }
    },
);

const canConnect = computed(() => {
    if (isConnecting.value) return false;
    if (props.requireGame) return !!selectedGame.value;
    return true;
});

const handleConnect = async () => {
    connectionError.value = t("common.disconnected");

    if (!ipInput.value) {
        connectionError.value = t("input.missingValue");
        return;
    }

    isConnecting.value = true;

    try {
        if (!(await isBridgeRunning(ipInput.value)))
            throw new Error(t("input.bridgeNotReachable"));

        updateGlobal("savedIP", ipInput.value);
        isConnected.value = true;
        commitSelection();

        emit("connected");

        setTimeout(() => {
            isConnecting.value = false;
        }, 500);
    } catch (error) {
        isConnected.value = false;
        connectionError.value = t("input.couldNotConnect");
        isConnecting.value = false;
    }
};
</script>

<template>
    <div class="connect-pc-module">
        <div class="input-ip">
            <div class="form-details">
                <form @submit.prevent="handleConnect" action="">
                    <label for="ip">{{ t("input.ipAddress") }}</label>
                    <input
                        id="ip"
                        v-model="ipInput"
                        type="text"
                        name="ip"
                        :placeholder="t('input.placeholder')"
                        :disabled="isConnecting"
                    />
                </form>
                <p class="status">
                    <span v-if="!connectionError"
                        >{{ t("common.currentStatus") }} &nbsp;</span
                    >
                    <span :class="isConnected ? 'connected' : 'disconnected'">{{
                        isConnected ? t("common.connected") : connectionError
                    }}</span>
                </p>
            </div>

            <InfoBox type="note">
                <template #content>
                    <p>{{ t("input.description") }}</p>
                </template>
            </InfoBox>
        </div>

        <button
            class="btn nav-btn"
            @click="handleConnect"
            :disabled="!canConnect"
        >
            <span>{{
                isConnecting ? t("common.connecting") : t("common.connect")
            }}</span>
            <Icon name="lucide:link" size="20" />
        </button>
    </div>
</template>

<style
    lang="scss"
    scoped
    src="~/assets/scss/scoped/common/inputComputerIP.scss"
></style>
