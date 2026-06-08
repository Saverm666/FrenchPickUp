(function() {
    'use strict';

    const settingsApi = window.FrenchPickupSettings;
    const elements = {
        learningLang: document.getElementById('learningLang'),
        learningVoice: document.getElementById('learningVoice'),
        chineseVoice: document.getElementById('chineseVoice'),
        learningVoiceNote: document.getElementById('learningVoiceNote'),
        chineseVoiceNote: document.getElementById('chineseVoiceNote'),
        routeLabel: document.getElementById('routeLabel'),
        status: document.getElementById('status'),
        saveButton: document.getElementById('saveButton'),
        versionLabel: document.getElementById('versionLabel')
    };

    let voices = [];
    let currentSettings = settingsApi.getDefaultSettings();

    function setStatus(text, state) {
        elements.status.textContent = text;
        elements.status.className = `status${state ? ` ${state}` : ''}`;
    }

    function getVoiceId(voice) {
        return voice.voiceURI || voice.name;
    }

    function getVoiceLabel(voice) {
        const lang = voice.lang ? ` · ${voice.lang}` : '';
        const source = voice.localService ? '本机' : '在线';
        return `${voice.name}${lang} · ${source}`;
    }

    function getMatchingVoices(lang) {
        const target = String(lang || '').toLowerCase();
        const family = target.split('-')[0];

        return voices
            .filter((voice) => {
                const voiceLang = String(voice.lang || '').toLowerCase();
                return voiceLang === target || voiceLang.startsWith(`${family}-`) || voiceLang === family;
            })
            .sort((a, b) => getVoiceLabel(a).localeCompare(getVoiceLabel(b), 'zh-CN'));
    }

    function isVoiceForLang(voice, lang) {
        const voiceLang = String(voice && voice.lang || '').toLowerCase();
        const target = String(lang || '').toLowerCase();
        const family = target.split('-')[0];

        return Boolean(
            voiceLang &&
            target &&
            (voiceLang === target || voiceLang.startsWith(`${family}-`) || voiceLang === family)
        );
    }

    function findVoice(voiceURI) {
        if (!voiceURI) return null;
        return voices.find((voice) => getVoiceId(voice) === voiceURI || voice.name === voiceURI) || null;
    }

    function renderLanguages() {
        elements.learningLang.textContent = '';

        settingsApi.LANGUAGE_PRESETS.forEach((language) => {
            const option = document.createElement('option');
            option.value = language.code;
            option.textContent = `${language.label} (${language.englishLabel})`;
            elements.learningLang.appendChild(option);
        });
    }

    function renderVoiceSelect(select, note, lang, savedVoiceURI) {
        const matchingVoices = getMatchingVoices(lang);
        const savedVoice = findVoice(savedVoiceURI);
        const validSavedVoice = savedVoice && isVoiceForLang(savedVoice, lang) ? savedVoice : null;

        select.textContent = '';

        const automaticOption = document.createElement('option');
        automaticOption.value = '';
        automaticOption.textContent = `自动匹配 ${lang}`;
        select.appendChild(automaticOption);

        matchingVoices.forEach((voice) => {
            const option = document.createElement('option');
            option.value = getVoiceId(voice);
            option.textContent = getVoiceLabel(voice);
            option.dataset.lang = voice.lang || lang;
            select.appendChild(option);
        });

        select.value = validSavedVoice ? getVoiceId(validSavedVoice) : '';
        note.textContent = matchingVoices.length > 0
            ? `${matchingVoices.length} 个可用声音`
            : '未找到匹配声音，朗读时会提示安装对应语音包';
    }

    function renderVoiceSelects() {
        const language = settingsApi.getLanguage(currentSettings.learningLang);
        elements.routeLabel.textContent = `中文 ⇄ ${language.label}`;
        renderVoiceSelect(
            elements.learningVoice,
            elements.learningVoiceNote,
            currentSettings.learningTtsLang || language.ttsLang,
            currentSettings.learningVoiceURI
        );
        renderVoiceSelect(
            elements.chineseVoice,
            elements.chineseVoiceNote,
            currentSettings.chineseTtsLang || 'zh-CN',
            currentSettings.chineseVoiceURI
        );
    }

    function renderAll() {
        const normalized = settingsApi.normalizeSettings(currentSettings);
        const language = settingsApi.getLanguage(normalized.learningLang);
        currentSettings = normalized;
        elements.learningLang.value = language.code;
        renderVoiceSelects();
    }

    function markDirty() {
        setStatus('未保存', 'dirty');
        elements.saveButton.disabled = false;
    }

    function applySelectedVoice(select, voiceTarget, langTarget, fallbackLang) {
        const selectedVoice = findVoice(select.value);
        currentSettings[voiceTarget] = selectedVoice ? getVoiceId(selectedVoice) : '';
        currentSettings[langTarget] = selectedVoice && selectedVoice.lang ? selectedVoice.lang : fallbackLang;
    }

    function waitForVoices() {
        if (!('speechSynthesis' in window)) {
            return Promise.resolve([]);
        }

        const loadedVoices = window.speechSynthesis.getVoices();
        if (loadedVoices.length > 0) {
            return Promise.resolve(loadedVoices);
        }

        return new Promise((resolve) => {
            const timeout = window.setTimeout(() => {
                window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
                resolve(window.speechSynthesis.getVoices());
            }, 900);

            function handleVoicesChanged() {
                window.clearTimeout(timeout);
                window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
                resolve(window.speechSynthesis.getVoices());
            }

            window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
        });
    }

    async function saveCurrentSettings() {
        setStatus('保存中', '');
        elements.saveButton.disabled = true;

        try {
            currentSettings = await settingsApi.saveSettings(currentSettings);
            setStatus('已保存', '');
            renderAll();
        } catch (error) {
            setStatus('保存失败', 'error');
            elements.saveButton.disabled = false;
        }
    }

    function bindEvents() {
        elements.learningLang.addEventListener('change', () => {
            const language = settingsApi.getLanguage(elements.learningLang.value);
            currentSettings.learningLang = language.code;
            currentSettings.learningTtsLang = language.ttsLang;
            currentSettings.learningVoiceURI = '';
            renderVoiceSelects();
            markDirty();
        });

        elements.learningVoice.addEventListener('change', () => {
            const language = settingsApi.getLanguage(currentSettings.learningLang);
            applySelectedVoice(elements.learningVoice, 'learningVoiceURI', 'learningTtsLang', language.ttsLang);
            markDirty();
        });

        elements.chineseVoice.addEventListener('change', () => {
            applySelectedVoice(elements.chineseVoice, 'chineseVoiceURI', 'chineseTtsLang', 'zh-CN');
            markDirty();
        });

        elements.saveButton.addEventListener('click', saveCurrentSettings);
    }

    function renderVersion() {
        if (
            !elements.versionLabel ||
            typeof chrome === 'undefined' ||
            !chrome.runtime ||
            !chrome.runtime.getManifest
        ) {
            return;
        }

        elements.versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
    }

    async function init() {
        renderVersion();
        renderLanguages();
        bindEvents();

        try {
            currentSettings = await settingsApi.getSettings();
        } catch (error) {
            currentSettings = settingsApi.getDefaultSettings();
            setStatus('读取失败', 'error');
        }

        renderAll();
        voices = await waitForVoices();
        renderVoiceSelects();

        if (elements.status.textContent !== '读取失败') {
            setStatus('已保存', '');
        }

        elements.saveButton.disabled = true;
    }

    init();
})();
