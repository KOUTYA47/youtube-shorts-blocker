const BLOCK_OVERLAY_ID = "ysblocker-site-limit-overlay";
const QUICK_ADD_ID = "ysblocker-quick-add";
const STATUS_CHECK_INTERVAL_MS = 1000;
const DEFAULT_LIMIT_MINUTES = 30;
const DEFAULT_BREAK_MINUTES = 15;
const REMAINING_ALERT_THRESHOLD_MS = 5 * 60 * 1000;
const GATEKEEPER_VIDEO_MODE = "sequential";
const GATEKEEPER_VIDEOS = [
    "assets/12621388_1080_1920_30fps.mp4",
    "assets/15369422_1080_1920_60fps.mp4",
    "assets/cat-gatekeeper.webm"
];

let blockedUntil = 0;
let countdownTimerId = null;
let statusCheckTimerId = null;
let extensionContextActive = true;
let nextGatekeeperVideoIndex = 0;
let remainingAlertShown = false;

function formatRemainingTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");

    return `${minutes}:${seconds}`;
}

function pausePageMedia() {
    document.querySelectorAll("video, audio").forEach((media) => {
        if (!media.paused) {
            media.pause();
        }
    });
}

function normalizeCurrentHost() {
    return `${location.hostname.toLowerCase().replace(/^www\./, "")}/*`;
}

function isEditableElement(element) {
    if (!element) {
        return false;
    }

    const tagName = element.tagName?.toLowerCase();

    return element.isContentEditable
        || tagName === "input"
        || tagName === "textarea"
        || tagName === "select";
}

function deactivateExtensionContext() {
    if (!extensionContextActive) {
        return;
    }

    extensionContextActive = false;

    if (statusCheckTimerId !== null) {
        window.clearInterval(statusCheckTimerId);
        statusCheckTimerId = null;
    }

    removeOverlay();
    closeQuickAdd();
}

function isExtensionContextAvailable() {
    return extensionContextActive
        && typeof chrome !== "undefined"
        && Boolean(chrome.runtime?.id)
        && typeof chrome.runtime.sendMessage === "function";
}

function sendRuntimeMessage(message, onResponse) {
    if (!isExtensionContextAvailable()) {
        deactivateExtensionContext();
        return;
    }

    try {
        chrome.runtime.sendMessage(message, (response) => {
            if (!extensionContextActive) {
                return;
            }

            if (chrome.runtime.lastError) {
                deactivateExtensionContext();
                return;
            }

            onResponse(response);
        });
    } catch {
        deactivateExtensionContext();
    }
}

function getGatekeeperVideoUrl() {
    if (GATEKEEPER_VIDEOS.length === 0) {
        return "";
    }

    const selectedIndex = GATEKEEPER_VIDEO_MODE === "random"
        ? Math.floor(Math.random() * GATEKEEPER_VIDEOS.length)
        : nextGatekeeperVideoIndex;

    nextGatekeeperVideoIndex = (selectedIndex + 1) % GATEKEEPER_VIDEOS.length;

    return chrome.runtime.getURL(GATEKEEPER_VIDEOS[selectedIndex]);
}

function removeOverlay() {
    const overlay = document.getElementById(BLOCK_OVERLAY_ID);

    if (overlay) {
        overlay.remove();
    }

    if (countdownTimerId !== null) {
        window.clearInterval(countdownTimerId);
        countdownTimerId = null;
    }
}

function updateCountdown() {
    const remaining = blockedUntil - Date.now();
    const countdown = document.querySelector(`#${BLOCK_OVERLAY_ID} [data-countdown]`);

    if (!countdown) {
        return;
    }

    countdown.textContent = formatRemainingTime(remaining);

    if (remaining <= REMAINING_ALERT_THRESHOLD_MS && !remainingAlertShown) {
        showRemainingAlert();
    }

    if (remaining <= 0) {
        removeOverlay();
        checkBlockStatus();
    }
}

function showRemainingAlert() {
    remainingAlertShown = true;

    const dialog = document.querySelector(`#${BLOCK_OVERLAY_ID} .ysblocker-site-limit-dialog`);

    if (!dialog || dialog.querySelector(".ysblocker-remaining-alert")) {
        return;
    }

    const alert = document.createElement("div");
    alert.className = "ysblocker-remaining-alert";
    alert.setAttribute("role", "alert");
    alert.textContent = "残り5分です．もう少しで再開できます．";
    dialog.appendChild(alert);

    window.setTimeout(() => {
        alert.remove();
    }, 8000);
}

function showOverlay(host, nextBlockedUntil) {
    blockedUntil = nextBlockedUntil;
    remainingAlertShown = false;
    pausePageMedia();

    if (document.getElementById(BLOCK_OVERLAY_ID)) {
        updateCountdown();
        return;
    }

    const overlay = document.createElement("div");
    const videoUrl = getGatekeeperVideoUrl();
    overlay.id = BLOCK_OVERLAY_ID;
    overlay.innerHTML = `
        <div class="ysblocker-site-limit-dialog" role="dialog" aria-modal="true">
            <video class="ysblocker-gatekeeper-video" src="${videoUrl}" autoplay loop muted playsinline></video>
            <div class="ysblocker-cat ysblocker-fallback-cat" aria-hidden="true">
                <div class="ysblocker-cat-ear ysblocker-cat-ear-left"></div>
                <div class="ysblocker-cat-ear ysblocker-cat-ear-right"></div>
                <div class="ysblocker-cat-face">
                    <div class="ysblocker-cat-eye ysblocker-cat-eye-left"></div>
                    <div class="ysblocker-cat-eye ysblocker-cat-eye-right"></div>
                    <div class="ysblocker-cat-nose"></div>
                    <div class="ysblocker-cat-mouth"></div>
                    <div class="ysblocker-cat-whisker ysblocker-cat-whisker-left ysblocker-cat-whisker-top"></div>
                    <div class="ysblocker-cat-whisker ysblocker-cat-whisker-left ysblocker-cat-whisker-bottom"></div>
                    <div class="ysblocker-cat-whisker ysblocker-cat-whisker-right ysblocker-cat-whisker-top"></div>
                    <div class="ysblocker-cat-whisker ysblocker-cat-whisker-right ysblocker-cat-whisker-bottom"></div>
                </div>
            </div>
            <div class="ysblocker-site-limit-label">Cat Gatekeeper</div>
            <h1>休憩時間です</h1>
            <p>${host} の利用時間が上限に達しました．猫が画面を守っています．</p>
            <div class="ysblocker-site-limit-countdown" data-countdown>${formatRemainingTime(blockedUntil - Date.now())}</div>
        </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
        #${BLOCK_OVERLAY_ID} {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            padding: 24px;
            color: #ffffff;
            background: #050505;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        #${BLOCK_OVERLAY_ID} * {
            box-sizing: border-box;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-dialog {
            position: relative;
            width: min(760px, 100%);
            min-height: min(860px, calc(100vh - 48px));
            padding: 18px 18px 24px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-end;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            background: #111111;
            box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
            text-align: center;
            overflow: hidden;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-gatekeeper-video {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            background: #000000;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-dialog::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, rgba(0, 0, 0, 0.12) 0%, rgba(0, 0, 0, 0.12) 45%, rgba(0, 0, 0, 0.76) 100%);
            pointer-events: none;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-label {
            position: relative;
            z-index: 3;
            margin-bottom: 10px;
            color: #fef3c7;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0;
            text-transform: uppercase;
        }

        #${BLOCK_OVERLAY_ID} h1 {
            position: relative;
            z-index: 3;
            margin: 0 0 12px;
            color: #ffffff;
            font-size: 32px;
            line-height: 1.35;
            letter-spacing: 0;
        }

        #${BLOCK_OVERLAY_ID} p {
            position: relative;
            z-index: 3;
            margin: 0 0 22px;
            color: #f8fafc;
            font-size: 15px;
            line-height: 1.7;
            text-shadow: 0 1px 8px rgba(0, 0, 0, 0.7);
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-countdown {
            position: relative;
            z-index: 3;
            display: inline-flex;
            min-width: 132px;
            min-height: 56px;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            border: 2px solid rgba(255, 255, 255, 0.7);
            background: rgba(0, 0, 0, 0.72);
            color: #ffffff;
            font-size: 30px;
            font-variant-numeric: tabular-nums;
            font-weight: 700;
            letter-spacing: 0;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-remaining-alert {
            position: absolute;
            top: 18px;
            left: 50%;
            z-index: 4;
            width: min(420px, calc(100% - 32px));
            min-height: 46px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255, 255, 255, 0.65);
            border-radius: 8px;
            padding: 10px 14px;
            color: #111827;
            background: rgba(254, 243, 199, 0.94);
            box-shadow: 0 16px 36px rgba(0, 0, 0, 0.3);
            font-size: 15px;
            font-weight: 700;
            line-height: 1.5;
            transform: translateX(-50%);
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat {
            position: absolute;
            left: 50%;
            bottom: 172px;
            width: min(560px, 88vw);
            aspect-ratio: 1 / 0.82;
            transform: translateX(-50%);
            z-index: 1;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-face {
            position: absolute;
            inset: 12% 4% 0;
            border: 5px solid #2d1b13;
            border-radius: 48% 48% 42% 42%;
            background: #f97316;
            box-shadow: inset 0 -28px 0 rgba(194, 65, 12, 0.2);
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-ear {
            position: absolute;
            top: 3%;
            width: 30%;
            aspect-ratio: 1;
            border: 5px solid #2d1b13;
            background: #f97316;
            transform: rotate(45deg);
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-ear::after {
            content: "";
            position: absolute;
            inset: 22%;
            background: #fed7aa;
            border-radius: 4px;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-ear-left {
            left: 10%;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-ear-right {
            right: 10%;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-eye {
            position: absolute;
            top: 38%;
            width: 54px;
            height: 72px;
            border-radius: 999px;
            background: #2d1b13;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-eye::after {
            content: "";
            position: absolute;
            top: 14px;
            left: 14px;
            width: 14px;
            height: 18px;
            border-radius: 999px;
            background: #ffffff;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-eye-left {
            left: 28%;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-eye-right {
            right: 28%;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-nose {
            position: absolute;
            left: 50%;
            top: 56%;
            width: 34px;
            height: 24px;
            border-radius: 48% 48% 60% 60%;
            background: #7c2d12;
            transform: translateX(-50%);
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-mouth {
            position: absolute;
            left: 50%;
            top: 64%;
            width: 58px;
            height: 30px;
            border-bottom: 5px solid #2d1b13;
            border-radius: 0 0 999px 999px;
            transform: translateX(-50%);
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-whisker {
            position: absolute;
            top: 60%;
            width: 132px;
            height: 5px;
            border-radius: 999px;
            background: #2d1b13;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-whisker-left {
            left: 8%;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-whisker-right {
            right: 8%;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-whisker-left.ysblocker-cat-whisker-top {
            transform: rotate(10deg);
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-whisker-left.ysblocker-cat-whisker-bottom {
            top: 70%;
            transform: rotate(-8deg);
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-whisker-right.ysblocker-cat-whisker-top {
            transform: rotate(-10deg);
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat-whisker-right.ysblocker-cat-whisker-bottom {
            top: 70%;
            transform: rotate(8deg);
        }

        @media (max-height: 720px) {
            #${BLOCK_OVERLAY_ID} .ysblocker-cat {
                width: min(430px, 86vw);
                bottom: 150px;
            }

            #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-dialog {
                min-height: calc(100vh - 48px);
            }
        }

        @media (max-width: 520px) {
            #${BLOCK_OVERLAY_ID} {
                padding: 0;
            }

            #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-dialog {
                width: 100%;
                min-height: 100vh;
                border: 0;
                border-radius: 0;
            }
        }
    `;

    overlay.appendChild(style);
    document.documentElement.appendChild(overlay);

    const video = overlay.querySelector(".ysblocker-gatekeeper-video");
    const fallbackCat = overlay.querySelector(".ysblocker-fallback-cat");

    if (video && fallbackCat) {
        video.addEventListener("loadeddata", () => {
            fallbackCat.hidden = true;
        });
        video.addEventListener("error", () => {
            fallbackCat.hidden = false;
            video.hidden = true;
        });
    }

    countdownTimerId = window.setInterval(updateCountdown, 1000);
}

function closeQuickAdd() {
    const panel = document.getElementById(QUICK_ADD_ID);

    if (panel) {
        panel.remove();
    }
}

function showQuickAdd() {
    if (document.getElementById(QUICK_ADD_ID)) {
        closeQuickAdd();
        return;
    }

    const panel = document.createElement("div");
    panel.id = QUICK_ADD_ID;
    panel.innerHTML = `
        <form class="ysblocker-quick-add-panel">
            <div class="ysblocker-quick-add-title">サイトを登録</div>
            <label>
                <span>対象サイトパターン</span>
                <input name="host" type="text" value="${normalizeCurrentHost()}" required>
            </label>
            <label>
                <span>上限時間，分</span>
                <input name="limitMinutes" type="number" min="1" step="1" value="${DEFAULT_LIMIT_MINUTES}" required>
            </label>
            <label>
                <span>休憩時間，分</span>
                <input name="breakMinutes" type="number" min="1" step="1" value="${DEFAULT_BREAK_MINUTES}" required>
            </label>
            <div class="ysblocker-quick-add-actions">
                <button type="button" data-close>閉じる</button>
                <button type="submit">登録</button>
            </div>
            <div class="ysblocker-quick-add-message" data-message></div>
        </form>
    `;

    const style = document.createElement("style");
    style.textContent = `
        #${QUICK_ADD_ID} {
            position: fixed;
            inset: 0;
            z-index: 2147483646;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            box-sizing: border-box;
            padding: 64px 16px 16px;
            background: rgba(15, 23, 42, 0.18);
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        #${QUICK_ADD_ID} * {
            box-sizing: border-box;
        }

        #${QUICK_ADD_ID} .ysblocker-quick-add-panel {
            width: min(440px, 100%);
            display: grid;
            gap: 12px;
            padding: 16px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: #ffffff;
            color: #172033;
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.22);
        }

        #${QUICK_ADD_ID} .ysblocker-quick-add-title {
            font-size: 18px;
            font-weight: 700;
            line-height: 1.4;
        }

        #${QUICK_ADD_ID} label {
            display: grid;
            gap: 6px;
            color: #475569;
            font-size: 13px;
            font-weight: 700;
        }

        #${QUICK_ADD_ID} input {
            width: 100%;
            min-height: 40px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 0 10px;
            color: #172033;
            background: #ffffff;
            font: inherit;
        }

        #${QUICK_ADD_ID} .ysblocker-quick-add-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        #${QUICK_ADD_ID} button {
            min-height: 38px;
            border: 0;
            border-radius: 8px;
            padding: 0 14px;
            color: #ffffff;
            background: #2563eb;
            font: inherit;
            cursor: pointer;
        }

        #${QUICK_ADD_ID} button[data-close] {
            color: #172033;
            background: #e5e7eb;
        }

        #${QUICK_ADD_ID} .ysblocker-quick-add-message {
            min-height: 20px;
            color: #166534;
            font-size: 13px;
            font-weight: 700;
        }
    `;

    panel.appendChild(style);
    document.documentElement.appendChild(panel);

    const form = panel.querySelector("form");
    const message = panel.querySelector("[data-message]");
    const hostInput = panel.querySelector("input[name='host']");

    panel.querySelector("[data-close]").addEventListener("click", closeQuickAdd);
    panel.addEventListener("click", (event) => {
        if (event.target === panel) {
            closeQuickAdd();
        }
    });
    panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeQuickAdd();
        }
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(form);

        sendRuntimeMessage(
            {
                type: "SAVE_SITE_LIMIT_RULE",
                host: formData.get("host"),
                limitMinutes: Number(formData.get("limitMinutes")),
                breakMinutes: Number(formData.get("breakMinutes"))
            },
            (response) => {
                if (!response?.ok) {
                    message.textContent = "登録に失敗しました．";
                    return;
                }

                message.textContent = "登録しました．";
                window.setTimeout(closeQuickAdd, 600);
            }
        );
    });

    hostInput.focus();
    hostInput.select();
}

function checkBlockStatus() {
    const messageType = document.visibilityState === "visible"
        ? "TRACK_SITE_USAGE"
        : "GET_SITE_LIMIT_STATUS";

    sendRuntimeMessage(
        { type: messageType, url: location.href },
        (response) => {
            if (response?.blocked) {
                showOverlay(response.host, response.blockedUntil);
                return;
            }

            removeOverlay();
        }
    );
}

checkBlockStatus();
statusCheckTimerId = window.setInterval(checkBlockStatus, STATUS_CHECK_INTERVAL_MS);

window.addEventListener("keydown", (event) => {
    if (!event.altKey || !event.shiftKey || event.key.toLowerCase() !== "l") {
        return;
    }

    if (isEditableElement(document.activeElement)) {
        return;
    }

    event.preventDefault();
    showQuickAdd();
});
