(function() {
    'use strict';

    const app = window.__frenchPickupExtension;

    let cachedVoices = [];
    let voicesReadyPromise = null;
    const VOICE_NAME_HINTS = {
        fr: ['français', 'french', 'france'],
        en: ['english', 'united states', 'united kingdom'],
        ja: ['japanese', 'japan', '日本'],
        ko: ['korean', 'korea', '한국'],
        es: ['spanish', 'español', 'spain'],
        de: ['german', 'deutsch', 'germany'],
        it: ['italian', 'italiano', 'italy'],
        ru: ['russian', 'русский', 'russia'],
        pt: ['portuguese', 'português', 'portugal', 'brazil'],
        zh: ['chinese', 'mandarin', 'china', '中文', '普通话']
    };

    function refreshVoices() {
        if (!('speechSynthesis' in window)) return [];

        cachedVoices = window.speechSynthesis.getVoices();
        return cachedVoices;
    }

    function waitForVoices() {
        if (!('speechSynthesis' in window)) {
            return Promise.resolve([]);
        }

        const voices = refreshVoices();
        if (voices.length > 0) {
            return Promise.resolve(voices);
        }

        if (!voicesReadyPromise) {
            voicesReadyPromise = new Promise((resolve) => {
                const timeout = window.setTimeout(() => {
                    window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
                    resolve(refreshVoices());
                }, 800);

                function handleVoicesChanged() {
                    window.clearTimeout(timeout);
                    window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
                    resolve(refreshVoices());
                }

                window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
            });
        }

        return voicesReadyPromise;
    }

    function scoreVoice(voice, lang) {
        const voiceLang = String(voice.lang || '').toLowerCase();
        const voiceName = String(voice.name || '').toLowerCase();
        const targetLang = lang.toLowerCase();
        const family = targetLang.split('-')[0];
        const nameHints = VOICE_NAME_HINTS[family] || [];
        let score = 0;

        if (voiceLang === targetLang) score += 100;
        if (voiceLang.startsWith(`${family}-`)) score += 80;
        if (voiceLang === family) score += 70;
        if (nameHints.some((hint) => voiceName.includes(hint))) score += 20;
        if (voice.localService) score += 2;
        if (voice.default) score += 1;

        return score;
    }

    function isVoiceForLang(voice, lang) {
        const voiceLang = String(voice && voice.lang || '').toLowerCase();
        const targetLang = String(lang || '').toLowerCase();
        const family = targetLang.split('-')[0];

        return Boolean(
            voiceLang &&
            targetLang &&
            (voiceLang === targetLang || voiceLang.startsWith(`${family}-`) || voiceLang === family)
        );
    }

    function chooseVoice(voices, lang, voiceURI) {
        if (voiceURI) {
            const savedVoice = voices.find((voice) => {
                return (voice.voiceURI === voiceURI || voice.name === voiceURI) && isVoiceForLang(voice, lang);
            });

            if (savedVoice) return savedVoice;
        }

        return voices
            .filter((voice) => isVoiceForLang(voice, lang))
            .map((voice) => ({ voice, score: scoreVoice(voice, lang) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)[0]?.voice || null;
    }

    function getSpeechProfile(text) {
        const settings = app.getSettings();
        if (/[\u4e00-\u9fa5]/.test(text)) {
            return {
                lang: settings.chineseTtsLang || 'zh-CN',
                voiceURI: settings.chineseVoiceURI,
                label: '中文'
            };
        }

        const learningLanguage = app.getLearningLanguage();
        return {
            lang: settings.learningTtsLang || learningLanguage.ttsLang,
            voiceURI: settings.learningVoiceURI,
            label: learningLanguage.label
        };
    }

    async function speak(text, rate) {
        if (!('speechSynthesis' in window)) {
            throw new Error('speechSynthesis is not supported');
        }

        const profile = getSpeechProfile(text);
        const voices = await waitForVoices();
        const voice = chooseVoice(voices, profile.lang, profile.voiceURI);

        if (!voice) {
            throw new Error(`未找到 ${profile.label} (${profile.lang}) 的可用 TTS 声音，请在扩展设置中选择匹配声音或安装对应语言语音包。`);
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = voice.lang;
        utterance.rate = rate;
        utterance.voice = voice;

        window.speechSynthesis.speak(utterance);
    }

    if ('speechSynthesis' in window) {
        refreshVoices();
        window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    }

    app.speech = {
        speak,
        refreshVoices
    };
})();
