const STORAGE_KEYS = {
    RULES: "siteLimitRules",
    USAGE: "siteUsageByDate",
    BLOCKS: "siteBlocks"
};

const TICK_INTERVAL_MS = 1000;
const BLOCK_DURATION_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT_MINUTES = 30;

const lastHeartbeatByTab = new Map();

function todayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

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

function getHostFromUrl(url) {
    try {
        const parsedUrl = new URL(url);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            return "";
        }

        return parsedUrl.hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

function isRuleMatch(host, ruleHost) {
    return host === ruleHost || host.endsWith(`.${ruleHost}`);
}

async function getState() {
    return chrome.storage.local.get([
        STORAGE_KEYS.RULES,
        STORAGE_KEYS.USAGE,
        STORAGE_KEYS.BLOCKS
    ]);
}

async function setDefaultRulesIfNeeded() {
    const state = await chrome.storage.local.get(STORAGE_KEYS.RULES);

    if (Array.isArray(state[STORAGE_KEYS.RULES])) {
        return;
    }

    await chrome.storage.local.set({
        [STORAGE_KEYS.RULES]: []
    });
}

function findMatchedRule(host, rules) {
    return rules.find((rule) => {
        if (!rule || rule.enabled === false) {
            return false;
        }

        const ruleHost = normalizeHost(rule.host);

        return ruleHost !== "" && isRuleMatch(host, ruleHost);
    });
}

function pruneExpiredBlocks(blocks, now) {
    return Object.fromEntries(
        Object.entries(blocks || {}).filter(([, blockedUntil]) => Number(blockedUntil) > now)
    );
}

async function getBlockInfoForUrl(url) {
    const host = getHostFromUrl(url);

    if (host === "") {
        return { blocked: false };
    }

    const state = await getState();
    const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
    const rule = findMatchedRule(host, rules);

    if (!rule) {
        return { blocked: false };
    }

    const now = Date.now();
    const blocks = pruneExpiredBlocks(state[STORAGE_KEYS.BLOCKS] || {}, now);
    const ruleHost = normalizeHost(rule.host);
    const blockedUntil = Number(blocks[ruleHost] || 0);

    if (blockedUntil <= now) {
        if (state[STORAGE_KEYS.BLOCKS] && state[STORAGE_KEYS.BLOCKS][ruleHost]) {
            await chrome.storage.local.set({ [STORAGE_KEYS.BLOCKS]: blocks });
        }

        return { blocked: false };
    }

    return {
        blocked: true,
        host: ruleHost,
        blockedUntil
    };
}

async function trackUsage(url, tabId) {
    const now = Date.now();
    const lastHeartbeatAt = lastHeartbeatByTab.get(tabId) || now;
    const elapsedMs = Math.min(Math.max(0, now - lastHeartbeatAt), TICK_INTERVAL_MS * 5);
    lastHeartbeatByTab.set(tabId, now);

    const host = getHostFromUrl(url);

    if (host === "") {
        return;
    }

    const state = await getState();
    const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
    const rule = findMatchedRule(host, rules);

    if (!rule) {
        return;
    }

    const ruleHost = normalizeHost(rule.host);
    const blocks = pruneExpiredBlocks(state[STORAGE_KEYS.BLOCKS] || {}, now);

    if (Number(blocks[ruleHost] || 0) > now) {
        await chrome.storage.local.set({ [STORAGE_KEYS.BLOCKS]: blocks });
        return;
    }

    const dateKey = todayKey();
    const usageByDate = state[STORAGE_KEYS.USAGE] || {};
    const todayUsage = usageByDate[dateKey] || {};
    const currentUsageMs = Number(todayUsage[ruleHost] || 0) + elapsedMs;
    const limitMs = Math.max(1, Number(rule.limitMinutes || DEFAULT_LIMIT_MINUTES)) * 60 * 1000;

    todayUsage[ruleHost] = currentUsageMs;
    usageByDate[dateKey] = todayUsage;

    if (currentUsageMs >= limitMs) {
        blocks[ruleHost] = now + BLOCK_DURATION_MS;
        todayUsage[ruleHost] = 0;
        await chrome.storage.local.set({
            [STORAGE_KEYS.USAGE]: usageByDate,
            [STORAGE_KEYS.BLOCKS]: blocks
        });
        return;
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usageByDate });
}

chrome.runtime.onInstalled.addListener(() => {
    setDefaultRulesIfNeeded();
});

chrome.runtime.onStartup.addListener(() => {
    setDefaultRulesIfNeeded();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "GET_SITE_LIMIT_STATUS") {
        getBlockInfoForUrl(message.url)
            .then(sendResponse)
            .catch(() => sendResponse({ blocked: false }));

        return true;
    }

    if (message?.type !== "TRACK_SITE_USAGE") {
        return false;
    }

    trackUsage(message.url, sender.tab?.id ?? message.url)
        .then(() => getBlockInfoForUrl(message.url))
        .then(sendResponse)
        .catch(() => sendResponse({ blocked: false }));

    return true;
});

setDefaultRulesIfNeeded();
