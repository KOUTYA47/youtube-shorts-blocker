const STORAGE_KEYS = {
    RULES: "siteLimitRules",
    USAGE: "siteUsageByDate",
    BLOCKS: "siteBlocks"
};

const TICK_INTERVAL_MS = 1000;
const DEFAULT_LIMIT_MINUTES = 30;
const DEFAULT_BREAK_MINUTES = 15;
const SHORTS_RULE_ID = "youtube-shorts";
const DEFAULT_SHORTS_RULE = {
    id: SHORTS_RULE_ID,
    label: "YouTube Shorts",
    host: "youtube.com",
    pathPrefix: "/shorts/",
    limitMinutes: 5,
    breakMinutes: DEFAULT_BREAK_MINUTES,
    enabled: true
};

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
        return trimmed.replace(/^https?:\/\//, "").replace(/\/\*$/, "").split("/")[0].replace(/^www\./, "");
    }
}

function getUrlParts(url) {
    try {
        const parsedUrl = new URL(url);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            return null;
        }

        return {
            host: parsedUrl.hostname.replace(/^www\./, ""),
            path: parsedUrl.pathname
        };
    } catch {
        return null;
    }
}

function isRuleMatch(host, ruleHost) {
    return host === ruleHost || host.endsWith(`.${ruleHost}`);
}

function getRuleKey(rule) {
    return rule.id || normalizeHost(rule.host);
}

function createUserRule(host, limitMinutes, breakMinutes) {
    return {
        host: normalizeHost(host),
        limitMinutes: Math.max(1, Number(limitMinutes || DEFAULT_LIMIT_MINUTES)),
        breakMinutes: Math.max(1, Number(breakMinutes || DEFAULT_BREAK_MINUTES)),
        enabled: true
    };
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

    if (!Array.isArray(state[STORAGE_KEYS.RULES])) {
        await chrome.storage.local.set({
            [STORAGE_KEYS.RULES]: [DEFAULT_SHORTS_RULE]
        });
        return;
    }

    const rules = state[STORAGE_KEYS.RULES];
    const hasShortsRule = rules.some((rule) => rule.id === SHORTS_RULE_ID);

    if (hasShortsRule) {
        return;
    }

    await chrome.storage.local.set({
        [STORAGE_KEYS.RULES]: [DEFAULT_SHORTS_RULE, ...rules]
    });
}

function isPathMatch(path, pathPrefix) {
    return !pathPrefix || path.startsWith(pathPrefix);
}

function findMatchedRule(urlParts, rules) {
    return rules.find((rule) => {
        if (!rule || rule.enabled === false) {
            return false;
        }

        const ruleHost = normalizeHost(rule.host);

        return ruleHost !== ""
            && isRuleMatch(urlParts.host, ruleHost)
            && isPathMatch(urlParts.path, rule.pathPrefix);
    });
}

function pruneExpiredBlocks(blocks, now) {
    return Object.fromEntries(
        Object.entries(blocks || {}).filter(([, blockedUntil]) => Number(blockedUntil) > now)
    );
}

async function getBlockInfoForUrl(url) {
    const urlParts = getUrlParts(url);

    if (!urlParts) {
        return { blocked: false };
    }

    const state = await getState();
    const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
    const rule = findMatchedRule(urlParts, rules);

    if (!rule) {
        return { blocked: false };
    }

    const now = Date.now();
    const blocks = pruneExpiredBlocks(state[STORAGE_KEYS.BLOCKS] || {}, now);
    const ruleHost = normalizeHost(rule.host);
    const ruleKey = getRuleKey(rule);
    const blockedUntil = Number(blocks[ruleKey] || 0);

    if (blockedUntil <= now) {
        if (state[STORAGE_KEYS.BLOCKS] && state[STORAGE_KEYS.BLOCKS][ruleKey]) {
            await chrome.storage.local.set({ [STORAGE_KEYS.BLOCKS]: blocks });
        }

        return { blocked: false };
    }

    return {
        blocked: true,
        host: rule.label || ruleHost,
        blockedUntil
    };
}

async function trackUsage(url, tabId) {
    const now = Date.now();
    const lastHeartbeatAt = lastHeartbeatByTab.get(tabId) || now;
    const elapsedMs = Math.min(Math.max(0, now - lastHeartbeatAt), TICK_INTERVAL_MS * 5);
    lastHeartbeatByTab.set(tabId, now);

    const urlParts = getUrlParts(url);

    if (!urlParts) {
        return;
    }

    const state = await getState();
    const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
    const rule = findMatchedRule(urlParts, rules);

    if (!rule) {
        return;
    }

    const ruleKey = getRuleKey(rule);
    const blocks = pruneExpiredBlocks(state[STORAGE_KEYS.BLOCKS] || {}, now);

    if (Number(blocks[ruleKey] || 0) > now) {
        await chrome.storage.local.set({ [STORAGE_KEYS.BLOCKS]: blocks });
        return;
    }

    const dateKey = todayKey();
    const usageByDate = state[STORAGE_KEYS.USAGE] || {};
    const todayUsage = usageByDate[dateKey] || {};
    const currentUsageMs = Number(todayUsage[ruleKey] || 0) + elapsedMs;
    const limitMs = Math.max(1, Number(rule.limitMinutes || DEFAULT_LIMIT_MINUTES)) * 60 * 1000;
    const breakMs = Math.max(1, Number(rule.breakMinutes || DEFAULT_BREAK_MINUTES)) * 60 * 1000;

    todayUsage[ruleKey] = currentUsageMs;
    usageByDate[dateKey] = todayUsage;

    if (currentUsageMs >= limitMs) {
        blocks[ruleKey] = now + breakMs;
        todayUsage[ruleKey] = 0;
        await chrome.storage.local.set({
            [STORAGE_KEYS.USAGE]: usageByDate,
            [STORAGE_KEYS.BLOCKS]: blocks
        });
        return;
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usageByDate });
}

async function saveUserRule(host, limitMinutes, breakMinutes) {
    const nextRule = createUserRule(host, limitMinutes, breakMinutes);

    if (nextRule.host === "") {
        return { ok: false, error: "INVALID_HOST" };
    }

    const state = await chrome.storage.local.get(STORAGE_KEYS.RULES);
    const rules = Array.isArray(state[STORAGE_KEYS.RULES]) ? state[STORAGE_KEYS.RULES] : [];
    const existingRuleIndex = rules.findIndex((rule) => {
        return !rule.id && !rule.pathPrefix && normalizeHost(rule.host) === nextRule.host;
    });

    if (existingRuleIndex >= 0) {
        rules[existingRuleIndex] = nextRule;
    } else {
        rules.push(nextRule);
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.RULES]: rules });

    return { ok: true, rule: nextRule };
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

    if (message?.type === "SAVE_SITE_LIMIT_RULE") {
        saveUserRule(message.host, message.limitMinutes, message.breakMinutes)
            .then(sendResponse)
            .catch(() => sendResponse({ ok: false, error: "SAVE_FAILED" }));

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
