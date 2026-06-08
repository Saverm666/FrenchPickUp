chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type || !message.url) return false;
    if (message.type !== 'fetchJson' && message.type !== 'fetchText') return false;

    fetch(message.url)
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return message.type === 'fetchJson' ? response.json() : response.text();
        })
        .then((data) => {
            sendResponse({ ok: true, data });
        })
        .catch((error) => {
            sendResponse({ ok: false, error: error.message });
        });

    return true;
});
