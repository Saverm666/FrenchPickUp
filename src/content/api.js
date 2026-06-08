(function() {
    'use strict';

    const app = window.__frenchPickupExtension;

    function requestJson(url) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'fetchJson', url }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (!response || !response.ok) {
                    reject(new Error(response && response.error ? response.error : '请求失败'));
                    return;
                }

                resolve(response.data);
            });
        });
    }

    function extractFrenchPhonetic(wikitext) {
        const pron = wikitext.match(/\{\{pron\|([^|{}]+)\|fr(?:\|[^{}]*)?\}\}/i);
        if (pron && pron[1]) return pron[1];

        const reconstructed = wikitext.match(/\{\{pron-recons\|([^|{}]+)\|fr(?:\|[^{}]*)?\}\}/i);
        if (reconstructed && reconstructed[1]) return reconstructed[1];

        return '';
    }

    function normalizeFrenchTerm(text) {
        return text
            .toLowerCase()
            .replace(/[’]/g, "'")
            .replace(app.FRENCH_TRIM_PATTERN, '')
            .trim();
    }

    async function fetchPhonetic(text) {
        const word = normalizeFrenchTerm(text);
        if (!word) return '';

        const url = `https://fr.wiktionary.org/w/api.php?action=query&format=json&origin=*&titles=${encodeURIComponent(word)}&prop=revisions&rvslots=main&rvprop=content`;
        const data = await requestJson(url);
        const pages = data && data.query && data.query.pages ? data.query.pages : {};
        const page = Object.values(pages)[0];
        const revision = page && page.revisions && page.revisions[0];
        const slot = revision && revision.slots && revision.slots.main;
        const wikitext = slot && (slot['*'] || slot.content);

        return wikitext ? extractFrenchPhonetic(wikitext) : '';
    }

    async function translateText(text) {
        const isChinese = /[\u4e00-\u9fa5]/.test(text);
        const targetLang = isChinese ? app.getLearningLanguage().translateCode : 'zh-CN';
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const data = await requestJson(url);

        if (!data || !data[0]) return '';

        return data[0].reduce((result, item) => {
            return item && item[0] ? result + item[0] : result;
        }, '');
    }

    function isFrenchTerm(text) {
        return app.getSettings().learningLang === 'fr' && app.FRENCH_TEXT_PATTERN.test(text);
    }

    app.api = {
        fetchPhonetic,
        translateText,
        isFrenchTerm
    };
})();
