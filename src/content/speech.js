(function() {
    'use strict';

    const app = window.__frenchPickupExtension;

    let cachedVoices = [];
    let voicesReadyPromise = null;
    let lastSpeechDebug = null;
    const DEBUG_ATTRIBUTE = 'data-french-pickup-tts-debug';
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

    function normalizeLang(lang) {
        return String(lang || '').trim().replace(/_/g, '-').toLowerCase();
    }

    function getLangFamily(lang) {
        return normalizeLang(lang).split('-')[0];
    }

    function getVoiceId(voice) {
        return String(voice && (voice.voiceURI || voice.name) || '');
    }

    function getVoiceDebugInfo(voice) {
        if (!voice) return null;

        return {
            name: voice.name || '',
            voiceURI: voice.voiceURI || '',
            lang: voice.lang || '',
            localService: Boolean(voice.localService),
            default: Boolean(voice.default)
        };
    }

    function publishSpeechDebug(debug) {
        lastSpeechDebug = Object.freeze(Object.assign({ createdAt: new Date().toISOString() }, debug));
        window.__frenchPickupTtsDebug = lastSpeechDebug;

        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.setAttribute(DEBUG_ATTRIBUTE, JSON.stringify(lastSpeechDebug));
        }

        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('[FrenchPickup:TTS]', lastSpeechDebug);
        }
    }

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
        const voiceLang = normalizeLang(voice.lang);
        const voiceName = String(voice.name || '').toLowerCase();
        const targetLang = normalizeLang(lang);
        const family = getLangFamily(targetLang);
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
        const voiceLang = normalizeLang(voice && voice.lang);
        const targetLang = normalizeLang(lang);

        return Boolean(
            voiceLang &&
            targetLang &&
            voiceLang === targetLang
        );
    }

    function getMatchingVoices(voices, lang) {
        return (Array.isArray(voices) ? voices : []).filter((voice) => isVoiceForLang(voice, lang));
    }

    function findSavedVoice(voices, lang, voiceURI) {
        const savedVoiceId = String(voiceURI || '');
        if (!savedVoiceId) return null;

        return getMatchingVoices(voices, lang).find((voice) => {
            return getVoiceId(voice) === savedVoiceId || voice.name === savedVoiceId;
        }) || null;
    }

    function chooseVoiceWithReason(voices, lang, voiceURI) {
        const savedVoice = findSavedVoice(voices, lang, voiceURI);
        if (savedVoice) {
            return { voice: savedVoice, reason: 'saved-voice' };
        }

        const matchingVoices = getMatchingVoices(voices, lang);
        if (matchingVoices.length === 0) {
            return { voice: null, reason: 'no-matching-lang' };
        }

        const voice = matchingVoices
            .map((voice) => ({ voice, score: scoreVoice(voice, lang) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)[0]?.voice || null;

        return { voice, reason: voice ? 'automatic-lang-match' : 'no-scored-voice' };
    }

    function chooseVoice(voices, lang, voiceURI) {
        return chooseVoiceWithReason(voices, lang, voiceURI).voice;
    }

    function getSavedVoiceCandidate(voices, voiceURI) {
        const savedVoiceId = String(voiceURI || '');
        if (!savedVoiceId) return null;

        return (Array.isArray(voices) ? voices : []).find((voice) => {
            return getVoiceId(voice) === savedVoiceId || voice.name === savedVoiceId;
        }) || null;
    }

    function getDebugSnapshot() {
        return {
            lastAttempt: lastSpeechDebug,
            cachedVoices: cachedVoices.map(getVoiceDebugInfo)
        };
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
        const selection = chooseVoiceWithReason(voices, profile.lang, profile.voiceURI);
        const voice = selection.voice;
        const savedVoiceCandidate = getSavedVoiceCandidate(voices, profile.voiceURI);
        const matchingVoices = getMatchingVoices(voices, profile.lang);
        const baseDebug = {
            status: voice ? 'selected' : 'blocked',
            reason: selection.reason,
            targetLabel: profile.label,
            targetLang: profile.lang,
            savedVoiceURI: profile.voiceURI || '',
            savedVoiceCandidate: getVoiceDebugInfo(savedVoiceCandidate),
            selectedVoice: getVoiceDebugInfo(voice),
            matchingVoiceCount: matchingVoices.length,
            matchingVoices: matchingVoices.map(getVoiceDebugInfo),
            availableVoiceCount: voices.length
        };

        if (!voice) {
            publishSpeechDebug(baseDebug);
            throw new Error(`未找到 ${profile.label} (${profile.lang}) 的可用 TTS 声音，请在扩展设置中选择匹配声音或安装对应语言语音包。`);
        }

        if (!isVoiceForLang(voice, profile.lang)) {
            publishSpeechDebug(Object.assign({}, baseDebug, {
                status: 'blocked',
                reason: 'selected-voice-lang-mismatch'
            }));
            throw new Error(`已阻止朗读：选中的声音 ${voice.name || getVoiceId(voice)} (${voice.lang || 'unknown'}) 与目标语言 ${profile.lang} 不匹配。`);
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = profile.lang;
        utterance.rate = rate;
        utterance.voice = voice;

        publishSpeechDebug(Object.assign({}, baseDebug, {
            utteranceLang: utterance.lang
        }));

        window.speechSynthesis.speak(utterance);
    }

    if ('speechSynthesis' in window) {
        refreshVoices();
        window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    }

    app.speech = {
        speak,
        refreshVoices,
        voiceSelection: Object.freeze({
            chooseVoice,
            chooseVoiceWithReason,
            findSavedVoice,
            getMatchingVoices,
            isVoiceForLang
        }),
        getDebugSnapshot
    };
})();
