const STORAGE_KEYS = {
    RULES: "siteLimitRules",
    USAGE: "siteUsageByDate",
    BLOCKS: "siteBlocks"
};

const DEFAULT_LIMIT_MINUTES = 30;

const ruleForm = document.getElementById("ruleForm");
const hostInput = document.getElementById("hostInput");
const limitInput = document.getElementById("limitInput");
const rulesList = document.getElementById("rulesList");
const resetUsageButton = document.getElementById("resetUsageButton");

function normalizeHost(value) {
    const trimmed = String(value || "").trim().toLowerCase();

    if (trimmed === "") {
        return "";
    }

    try {
        return new URL(trimmed).hostname.replace(/^www\./, "");
    } catch {
        return trimmed.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
    }
}

function todayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatUsage(milliseconds) {
    const totalSeconds = Math.floor(Number(milliseconds || 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}分${seconds}秒`;
}

async function getState() {
    return chrome.storage.local.get([
        STORAGE_KEYS.RULES,
        STORAGE_KEYS.USAGE,
        STORAGE_KEYS.BLOCKS
    ]);
}

async function saveRules(rules) {
    await chrome.storage.local.set({ [STORAGE_KEYS.RULES]: rules });
    await renderRules();
}

function createRuleRow(rule, index, todayUsage, blocks) {
    const row = document.createElement("div");
    row.className = "rule-row";

    const host = document.createElement("div");
    host.className = "rule-host";
    host.textContent = rule.host;

    const limit = document.createElement("div");
    limit.className = "rule-meta";
    limit.textContent = `上限 ${rule.limitMinutes}分`;

    const usage = document.createElement("div");
    usage.className = "rule-meta";
    usage.textContent = `今日 ${formatUsage(todayUsage[rule.host])}`;

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "secondary";
    toggleButton.textContent = rule.enabled === false ? "無効" : "有効";
    toggleButton.addEventListener("click", async () => {
        const state = await getState();
        const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
        rules[index] = { ...rules[index], enabled: rules[index].enabled === false };
        await saveRules(rules);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", async () => {
        const state = await getState();
        const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
        rules.splice(index, 1);

        const nextBlocks = { ...(state[STORAGE_KEYS.BLOCKS] || {}) };
        delete nextBlocks[rule.host];

        await chrome.storage.local.set({
            [STORAGE_KEYS.RULES]: rules,
            [STORAGE_KEYS.BLOCKS]: nextBlocks
        });
        await renderRules();
    });

    const blockedUntil = Number(blocks[rule.host] || 0);

    if (blockedUntil > Date.now()) {
        usage.textContent += "，ブロック中";
    }

    row.append(host, limit, usage, toggleButton, deleteButton);

    return row;
}

async function renderRules() {
    const state = await getState();
    const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
    const usageByDate = state[STORAGE_KEYS.USAGE] || {};
    const todayUsage = usageByDate[todayKey()] || {};
    const blocks = state[STORAGE_KEYS.BLOCKS] || {};

    rulesList.textContent = "";

    if (rules.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty-state";
        emptyState.textContent = "まだ対象サイトが登録されていません．";
        rulesList.appendChild(emptyState);
        return;
    }

    rules.forEach((rule, index) => {
        rulesList.appendChild(createRuleRow(rule, index, todayUsage, blocks));
    });
}

ruleForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const host = normalizeHost(hostInput.value);
    const limitMinutes = Math.max(1, Number.parseInt(limitInput.value, 10) || DEFAULT_LIMIT_MINUTES);

    if (host === "") {
        return;
    }

    const state = await getState();
    const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
    const existingRuleIndex = rules.findIndex((rule) => rule.host === host);
    const nextRule = { host, limitMinutes, enabled: true };

    if (existingRuleIndex >= 0) {
        rules[existingRuleIndex] = nextRule;
    } else {
        rules.push(nextRule);
    }

    await saveRules(rules);
    ruleForm.reset();
    limitInput.value = String(DEFAULT_LIMIT_MINUTES);
    hostInput.focus();
});

resetUsageButton.addEventListener("click", async () => {
    const state = await getState();
    const usageByDate = state[STORAGE_KEYS.USAGE] || {};
    delete usageByDate[todayKey()];

    await chrome.storage.local.set({
        [STORAGE_KEYS.USAGE]: usageByDate,
        [STORAGE_KEYS.BLOCKS]: {}
    });
    await renderRules();
});

renderRules();
