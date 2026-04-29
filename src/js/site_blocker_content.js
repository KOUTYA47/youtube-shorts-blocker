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
            <div class="ysblocker-cat" aria-hidden="true">
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
            align-items: flex-end;
            justify-content: center;
            box-sizing: border-box;
            padding: 24px;
            color: #2d1b13;
            background: linear-gradient(180deg, #f8fafc 0%, #dbeafe 52%, #fef3c7 100%);
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        #${BLOCK_OVERLAY_ID} * {
            box-sizing: border-box;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-dialog {
            position: relative;
            width: min(720px, 100%);
            min-height: min(760px, calc(100vh - 48px));
            padding: 22px 24px 28px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-end;
            border: 4px solid #2d1b13;
            border-radius: 8px 8px 0 0;
            background: #f5a623;
            box-shadow: 0 24px 70px rgba(45, 27, 19, 0.25);
            text-align: center;
            overflow: hidden;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-label {
            position: relative;
            z-index: 2;
            margin-bottom: 10px;
            color: #7c2d12;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0;
            text-transform: uppercase;
        }

        #${BLOCK_OVERLAY_ID} h1 {
            position: relative;
            z-index: 2;
            margin: 0 0 12px;
            color: #2d1b13;
            font-size: 32px;
            line-height: 1.35;
            letter-spacing: 0;
        }

        #${BLOCK_OVERLAY_ID} p {
            position: relative;
            z-index: 2;
            margin: 0 0 22px;
            color: #4b2e1f;
            font-size: 15px;
            line-height: 1.7;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-site-limit-countdown {
            position: relative;
            z-index: 2;
            display: inline-flex;
            min-width: 132px;
            min-height: 56px;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            border: 3px solid #2d1b13;
            background: #ffffff;
            color: #2d1b13;
            font-size: 30px;
            font-variant-numeric: tabular-nums;
            font-weight: 700;
            letter-spacing: 0;
        }

        #${BLOCK_OVERLAY_ID} .ysblocker-cat {
            position: absolute;
            left: 50%;
            bottom: 172px;
            width: min(560px, 88vw);
            aspect-ratio: 1 / 0.82;
            transform: translateX(-50%);
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
