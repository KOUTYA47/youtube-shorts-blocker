const DEFAULT_LIMIT_MINUTES = 30;
const DEFAULT_BREAK_MINUTES = 15;

const ruleForm = document.getElementById("ruleForm");
const hostInput = document.getElementById("hostInput");
const limitInput = document.getElementById("limitInput");
const breakInput = document.getElementById("breakInput");
const message = document.getElementById("message");
const openOptionsButton = document.getElementById("openOptionsButton");

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

function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
}

async function fillCurrentSiteDraft() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const draftPattern = getDraftPatternFromUrl(tab?.url || "");

        if (draftPattern !== "") {
            hostInput.value = draftPattern;
        }
    } catch {
        showMessage("現在のタブを取得できません．", true);
    }
}

ruleForm.addEventListener("submit", (event) => {
    event.preventDefault();

    chrome.runtime.sendMessage(
        {
            type: "SAVE_SITE_LIMIT_RULE",
            host: hostInput.value,
            limitMinutes: Number(limitInput.value || DEFAULT_LIMIT_MINUTES),
            breakMinutes: Number(breakInput.value || DEFAULT_BREAK_MINUTES)
        },
        (response) => {
            if (chrome.runtime.lastError || !response?.ok) {
                showMessage("登録に失敗しました．", true);
                return;
            }

            showMessage("登録しました．");
            window.setTimeout(() => {
                window.close();
            }, 450);
        }
    );
});

openOptionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});

fillCurrentSiteDraft();
