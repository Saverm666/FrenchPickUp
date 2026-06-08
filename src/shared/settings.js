(function(global) {
    'use strict';

    const SETTINGS_KEY = 'frenchPickupSettings';
    const DEFAULT_SETTINGS = Object.freeze({
        learningLang: 'fr',
        learningTtsLang: 'fr-FR',
        learningVoiceURI: '',
        chineseTtsLang: 'zh-CN',
        chineseVoiceURI: ''
    });

    const LANGUAGE_PRESETS = Object.freeze([
        { code: 'fr', label: '法语', englishLabel: 'French', translateCode: 'fr', ttsLang: 'fr-FR' },
        { code: 'en', label: '英语', englishLabel: 'English', translateCode: 'en', ttsLang: 'en-US' },
        { code: 'ja', label: '日语', englishLabel: 'Japanese', translateCode: 'ja', ttsLang: 'ja-JP' },
        { code: 'ko', label: '韩语', englishLabel: 'Korean', translateCode: 'ko', ttsLang: 'ko-KR' },
        { code: 'es', label: '西班牙语', englishLabel: 'Spanish', translateCode: 'es', ttsLang: 'es-ES' },
        { code: 'de', label: '德语', englishLabel: 'German', translateCode: 'de', ttsLang: 'de-DE' },
        { code: 'it', label: '意大利语', englishLabel: 'Italian', translateCode: 'it', ttsLang: 'it-IT' },
        { code: 'ru', label: '俄语', englishLabel: 'Russian', translateCode: 'ru', ttsLang: 'ru-RU' },
        { code: 'pt', label: '葡萄牙语', englishLabel: 'Portuguese', translateCode: 'pt', ttsLang: 'pt-PT' }
    ]);

    function getDefaultSettings() {
        return Object.assign({}, DEFAULT_SETTINGS);
    }

    function getLanguage(code) {
        return LANGUAGE_PRESETS.find((language) => language.code === code) || LANGUAGE_PRESETS[0];
    }

    function normalizeSettings(input) {
        const source = input && typeof input === 'object' ? input : {};
        const merged = Object.assign(getDefaultSettings(), source);
        const language = getLanguage(String(merged.learningLang || DEFAULT_SETTINGS.learningLang));
        const learningTtsLang = source.learningTtsLang
            ? String(source.learningTtsLang)
            : language.ttsLang;

        return {
            learningLang: language.code,
            learningTtsLang,
            learningVoiceURI: String(merged.learningVoiceURI || ''),
            chineseTtsLang: String(merged.chineseTtsLang || DEFAULT_SETTINGS.chineseTtsLang),
            chineseVoiceURI: String(merged.chineseVoiceURI || '')
        };
    }

    function getLastError() {
        return global.chrome && global.chrome.runtime ? global.chrome.runtime.lastError : null;
    }

    function hasStorage() {
        return Boolean(global.chrome && global.chrome.storage && global.chrome.storage.local);
    }

    function getSettings() {
        if (!hasStorage()) {
            return Promise.resolve(getDefaultSettings());
        }

        return new Promise((resolve, reject) => {
            global.chrome.storage.local.get(SETTINGS_KEY, (result) => {
                const error = getLastError();
                if (error) {
                    reject(new Error(error.message));
                    return;
                }

                resolve(normalizeSettings(result && result[SETTINGS_KEY]));
            });
        });
    }

    function saveSettings(settings) {
        const normalized = normalizeSettings(settings);

        if (!hasStorage()) {
            return Promise.resolve(normalized);
        }

        return new Promise((resolve, reject) => {
            global.chrome.storage.local.set({ [SETTINGS_KEY]: normalized }, () => {
                const error = getLastError();
                if (error) {
                    reject(new Error(error.message));
                    return;
                }

                resolve(normalized);
            });
        });
    }

    function watchSettings(callback) {
        if (!global.chrome || !global.chrome.storage || !global.chrome.storage.onChanged) {
            return () => {};
        }

        const handleChange = (changes, areaName) => {
            if (areaName !== 'local' || !changes[SETTINGS_KEY]) return;
            callback(normalizeSettings(changes[SETTINGS_KEY].newValue));
        };

        global.chrome.storage.onChanged.addListener(handleChange);
        return () => {
            global.chrome.storage.onChanged.removeListener(handleChange);
        };
    }

    global.FrenchPickupSettings = {
        SETTINGS_KEY,
        DEFAULT_SETTINGS,
        LANGUAGE_PRESETS,
        getDefaultSettings,
        getLanguage,
        normalizeSettings,
        getSettings,
        saveSettings,
        watchSettings
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
