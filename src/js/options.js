const STORAGE_KEYS = {
    RULES: "siteLimitRules",
    USAGE: "siteUsageByDate",
    BLOCKS: "siteBlocks"
};

const DEFAULT_LIMIT_MINUTES = 30;
const DEFAULT_BREAK_MINUTES = 15;

const ruleForm = document.getElementById("ruleForm");
const hostInput = document.getElementById("hostInput");
const limitInput = document.getElementById("limitInput");
const breakInput = document.getElementById("breakInput");
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
        return trimmed.replace(/^https?:\/\//, "").replace(/\/\*$/, "").split("/")[0].replace(/^www\./, "");
    }
}

function getDraftPatternFromUrl(url) {
    try {
        const parsedUrl = new URL(url);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            return "";
        }

        const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");

        return `${host}/*`;
    } catch {
        return "";
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

function getRuleKey(rule) {
    return rule.id || normalizeHost(rule.host);
}

function formatRuleTarget(rule) {
    if (rule.label) {
        return `${rule.label}，${rule.host}${rule.pathPrefix || ""}`;
    }

    return rule.pathPrefix ? `${rule.host}${rule.pathPrefix}` : rule.host;
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
    host.textContent = formatRuleTarget(rule);

    const limit = document.createElement("input");
    limit.type = "number";
    limit.min = "1";
    limit.step = "1";
    limit.value = String(rule.limitMinutes || DEFAULT_LIMIT_MINUTES);
    limit.title = "上限時間，分";

    const breakTime = document.createElement("input");
    breakTime.type = "number";
    breakTime.min = "1";
    breakTime.step = "1";
    breakTime.value = String(rule.breakMinutes || DEFAULT_BREAK_MINUTES);
    breakTime.title = "休憩時間，分";

    const usage = document.createElement("div");
    usage.className = "rule-meta";
    usage.textContent = `今日 ${formatUsage(todayUsage[getRuleKey(rule)])}`;

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

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "保存";
    saveButton.addEventListener("click", async () => {
        const state = await getState();
        const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
        rules[index] = {
            ...rules[index],
            limitMinutes: Math.max(1, Number.parseInt(limit.value, 10) || DEFAULT_LIMIT_MINUTES),
            breakMinutes: Math.max(1, Number.parseInt(breakTime.value, 10) || DEFAULT_BREAK_MINUTES)
        };
        await saveRules(rules);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "削除";
    deleteButton.disabled = Boolean(rule.id);
    deleteButton.addEventListener("click", async () => {
        if (rule.id) {
            return;
        }

        const state = await getState();
        const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
        rules.splice(index, 1);

        const nextBlocks = { ...(state[STORAGE_KEYS.BLOCKS] || {}) };
        delete nextBlocks[getRuleKey(rule)];

        await chrome.storage.local.set({
            [STORAGE_KEYS.RULES]: rules,
            [STORAGE_KEYS.BLOCKS]: nextBlocks
        });
        await renderRules();
    });

    const blockedUntil = Number(blocks[getRuleKey(rule)] || 0);

    if (blockedUntil > Date.now()) {
        usage.textContent += "，ブロック中";
    }

    row.append(host, limit, breakTime, usage, saveButton, toggleButton, deleteButton);

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

async function fillCurrentSiteDraft() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const draftPattern = getDraftPatternFromUrl(tab?.url || "");

        if (draftPattern === "" || hostInput.value.trim() !== "") {
            return;
        }

        hostInput.value = draftPattern;
    } catch {
        // Current tab access can fail on browser-internal pages.
    }
}

ruleForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const host = normalizeHost(hostInput.value);
    const limitMinutes = Math.max(1, Number.parseInt(limitInput.value, 10) || DEFAULT_LIMIT_MINUTES);
    const breakMinutes = Math.max(1, Number.parseInt(breakInput.value, 10) || DEFAULT_BREAK_MINUTES);

    if (host === "") {
        return;
    }

    const state = await getState();
    const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
    const existingRuleIndex = rules.findIndex((rule) => {
        return !rule.id && !rule.pathPrefix && rule.host === host;
    });
    const nextRule = { host, limitMinutes, breakMinutes, enabled: true };

    if (existingRuleIndex >= 0) {
        rules[existingRuleIndex] = nextRule;
    } else {
        rules.push(nextRule);
    }

    await saveRules(rules);
    ruleForm.reset();
    limitInput.value = String(DEFAULT_LIMIT_MINUTES);
    breakInput.value = String(DEFAULT_BREAK_MINUTES);
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
fillCurrentSiteDraft();
