const BLOCK_OVERLAY_ID = "ysblocker-site-limit-overlay";
const STATUS_CHECK_INTERVAL_MS = 1000;

let blockedUntil = 0;
let countdownTimerId = null;

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

    if (remaining <= 0) {
        removeOverlay();
        checkBlockStatus();
    }
}

function showOverlay(host, nextBlockedUntil) {
    blockedUntil = nextBlockedUntil;
    pausePageMedia();

    if (document.getElementById(BLOCK_OVERLAY_ID)) {
        updateCountdown();
        return;
    }

    const overlay = document.createElement("div");
    overlay.id = BLOCK_OVERLAY_ID;
    overlay.innerHTML = `
        <div class="ysblocker-site-limit-dialog" role="dialog" aria-modal="true">
            <div class="ysblocker-site-limit-label">Time Limit</div>
            <h1>このサイトは一時的にブロックされています</h1>
            <p>${host} の利用時間が上限に達しました．15分後に再度利用できます．</p>
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
            color: #f8fafc;
            background: rgba(15, 23, 42, 0.96);
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        #${BLOCK_OVERLAY_ID} * {
            box-sizing: border-box;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-dialog {
            width: min(520px, 100%);
            padding: 28px;
            border: 1px solid rgba(148, 163, 184, 0.45);
            border-radius: 8px;
            background: #111827;
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
            text-align: center;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-label {
            margin-bottom: 12px;
            color: #38bdf8;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0;
            text-transform: uppercase;
        }

        #${BLOCK_OVERLAY_ID} h1 {
            margin: 0 0 12px;
            color: #f8fafc;
            font-size: 24px;
            line-height: 1.35;
            letter-spacing: 0;
        }

        #${BLOCK_OVERLAY_ID} p {
            margin: 0 0 22px;
            color: #cbd5e1;
            font-size: 15px;
            line-height: 1.7;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-countdown {
            display: inline-flex;
            min-width: 132px;
            min-height: 56px;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            background: #0f172a;
            color: #f8fafc;
            font-size: 30px;
            font-variant-numeric: tabular-nums;
            font-weight: 700;
            letter-spacing: 0;
        }
    `;

    overlay.appendChild(style);
    document.documentElement.appendChild(overlay);
    countdownTimerId = window.setInterval(updateCountdown, 1000);
}

function checkBlockStatus() {
    const messageType = document.visibilityState === "visible"
        ? "TRACK_SITE_USAGE"
        : "GET_SITE_LIMIT_STATUS";

    chrome.runtime.sendMessage(
        { type: messageType, url: location.href },
        (response) => {
            if (chrome.runtime.lastError) {
                return;
            }

            if (response?.blocked) {
                showOverlay(response.host, response.blockedUntil);
                return;
            }

            removeOverlay();
        }
    );
}

checkBlockStatus();
window.setInterval(checkBlockStatus, STATUS_CHECK_INTERVAL_MS);
