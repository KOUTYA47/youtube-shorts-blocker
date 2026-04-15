const WARNING_INTERVAL_MS = 5 * 60 * 1000;
const URL_CHECK_INTERVAL_MS = 1000;
const WARNING_MESSAGE = "YouTube Shortsを開いてます．\nこのまま視聴を続けることで、予定していた作業や目的に影響が出ていないか、確認してください．\n※この警告は５分おきに出ます";

let currentUrl = location.href;
let wasOnShorts = false;
let warningTimerId = null;

function isShortsPage() {
    return location.pathname.startsWith("/shorts/");
}

function pauseVideos() {
    const videos = document.querySelectorAll("video");

    videos.forEach((video) => {
        if (!video.paused) {
            video.pause();
        }
    });
}

function showWarning() {
    pauseVideos();
    window.alert(WARNING_MESSAGE);
}

function startWarningTimer() {
    if (warningTimerId !== null) {
        return;
    }

    warningTimerId = window.setInterval(() => {
        if (isShortsPage()) {
            showWarning();
        }
    }, WARNING_INTERVAL_MS);
}

function stopWarningTimer() {
    if (warningTimerId === null) {
        return;
    }

    window.clearInterval(warningTimerId);
    warningTimerId = null;
}

function handlePageState() {
    const isOnShorts = isShortsPage();

    if (isOnShorts && !wasOnShorts) {
        showWarning();
        startWarningTimer();
    }

    if (!isOnShorts && wasOnShorts) {
        stopWarningTimer();
    }

    wasOnShorts = isOnShorts;
}

handlePageState();

window.setInterval(() => {
    if (location.href === currentUrl) {
        return;
    }

    currentUrl = location.href;
    handlePageState();
}, URL_CHECK_INTERVAL_MS);
