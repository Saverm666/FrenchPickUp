(function() {
    'use strict';

    const app = window.__frenchPickupExtension;

    const FRENCH_LETTER_CLASS = 'A-Za-z\\u00C0-\\u024F';
    const FRENCH_TERM_PATTERN = new RegExp(`^[${FRENCH_LETTER_CLASS}]+(?:['\\u2019-][${FRENCH_LETTER_CLASS}]+)*$`);
    const FRENCH_TRIM_PATTERN = new RegExp(`^[^${FRENCH_LETTER_CLASS}]+|[^${FRENCH_LETTER_CLASS}]+$`, 'g');

    function requestJson(url) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'fetchJson', url }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (!response || !response.ok) {
                    reject(new Error(response && response.error ? response.error : 'Request failed'));
                    return;
                }

                resolve(response.data);
            });
        });
    }

    function cleanPhonetic(value) {
        return String(value || '')
            .replace(/^1=/, '')
            .replace(/^\/+|\/+$/g, '')
            .replace(/^\[+|\]+$/g, '')
            .trim();
    }

    function normalizeTemplateName(name) {
        return String(name || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function splitTemplateParts(template) {
        const parts = [];
        let current = '';
        let braceDepth = 0;
        let bracketDepth = 0;

        for (let i = 0; i < template.length; i += 1) {
            const char = template[i];
            const next = template[i + 1];

            if (char === '{' && next === '{') {
                braceDepth += 1;
                current += char;
                i += 1;
                current += next;
                continue;
            }

            if (char === '}' && next === '}' && braceDepth > 0) {
                braceDepth -= 1;
                current += char;
                i += 1;
                current += next;
                continue;
            }

            if (char === '[' && next === '[') {
                bracketDepth += 1;
                current += char;
                i += 1;
                current += next;
                continue;
            }

            if (char === ']' && next === ']' && bracketDepth > 0) {
                bracketDepth -= 1;
                current += char;
                i += 1;
                current += next;
                continue;
            }

            if (char === '|' && braceDepth === 0 && bracketDepth === 0) {
                parts.push(current.trim());
                current = '';
                continue;
            }

            current += char;
        }

        parts.push(current.trim());
        return parts;
    }

    function parseTemplateParams(parts) {
        const positional = [];
        const named = {};

        parts.forEach((part) => {
            const equalIndex = part.indexOf('=');
            if (equalIndex > 0) {
                const key = part.slice(0, equalIndex).trim().toLowerCase();
                named[key] = part.slice(equalIndex + 1).trim();
            } else {
                positional.push(part);
            }
        });

        return { positional, named };
    }

    function isFrenchLanguageParam(value) {
        return String(value || '').trim().toLowerCase() === 'fr';
    }

    function firstCleanPhonetic(values) {
        for (const value of values) {
            const phonetic = cleanPhonetic(value);
            if (phonetic && !isFrenchLanguageParam(phonetic)) return phonetic;
        }

        return '';
    }

    function extractFromPronTemplate(positional, named) {
        const language = named.lang || named.langue || named.l || named[2];
        const hasFrenchLanguage = isFrenchLanguageParam(language) ||
            positional.some(isFrenchLanguageParam);

        if (!hasFrenchLanguage) return '';

        if (isFrenchLanguageParam(positional[0])) {
            return firstCleanPhonetic([named[1], positional[1]]);
        }

        return firstCleanPhonetic([named[1], positional[0]]);
    }

    function extractFromFrenchLanguageTemplate(positional, named) {
        const language = named.lang || named.langue || named.l || named[2] || positional[1];
        if (!isFrenchLanguageParam(language)) return '';

        return firstCleanPhonetic([named[1], positional[0]]);
    }

    function extractFromFrenchTemplate(positional, named) {
        return firstCleanPhonetic([named[1], positional[0], named.pron, named.api]);
    }

    function extractPhoneticFromTemplates(wikitext) {
        const templatePattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
        let matched;

        while ((matched = templatePattern.exec(wikitext))) {
            const parts = splitTemplateParts(matched[1]);
            const name = normalizeTemplateName(parts.shift());
            const params = parseTemplateParams(parts);

            if (name === 'pron' || name === 'pron-recons' || name === 'api') {
                const phonetic = extractFromPronTemplate(params.positional, params.named);
                if (phonetic) return phonetic;
            }

            if (name === 'phono' || name === 'phon') {
                const phonetic = extractFromFrenchLanguageTemplate(params.positional, params.named);
                if (phonetic) return phonetic;
            }

            if (name === 'fr-reg' || name.startsWith('fr-reg-')) {
                const phonetic = extractFromFrenchTemplate(params.positional, params.named);
                if (phonetic) return phonetic;
            }
        }

        return '';
    }

    function hasLanguageSections(wikitext) {
        return /^==(?!\=)\s*\{\{\s*(?:langue|-[a-z-]+-)\s*\|?[^}]*\}\}\s*==\s*$/im.test(wikitext);
    }

    function isFrenchLanguageHeading(heading) {
        const normalizedHeading = normalizeTemplateName(heading);
        return /\{\{\s*langue\s*\|\s*fr\s*(?:\||\}\})/i.test(heading) ||
            /\{\{\s*-fr-\s*\}\}/i.test(heading) ||
            normalizedHeading === 'francais';
    }

    function extractFrenchSection(wikitext) {
        const sectionPattern = /^==(?!\=)\s*(.*?)\s*==\s*$/gmi;
        let matched;

        while ((matched = sectionPattern.exec(wikitext))) {
            const heading = matched[1];

            if (isFrenchLanguageHeading(heading)) {
                const start = sectionPattern.lastIndex;
                const next = /^==(?!\=)\s*.*?\s*==\s*$/gmi;
                next.lastIndex = start;
                const nextMatch = next.exec(wikitext);
                const end = nextMatch ? nextMatch.index : wikitext.length;
                return wikitext.slice(start, end);
            }
        }

        return '';
    }

    function extractFrenchPhonetic(wikitext) {
        const frenchSection = extractFrenchSection(wikitext);
        if (frenchSection) return extractPhoneticFromTemplates(frenchSection);

        return '';
    }

    function normalizeFrenchTerm(text) {
        return String(text || '')
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[\u2018\u2019]/g, "'")
            .replace(FRENCH_TRIM_PATTERN, '')
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
        const word = normalizeFrenchTerm(text);
        return app.getSettings().learningLang === 'fr' && FRENCH_TERM_PATTERN.test(word);
    }

    app.api = {
        fetchPhonetic,
        translateText,
        isFrenchTerm,
        __debug: Object.freeze({
            cleanPhonetic,
            normalizeTemplateName,
            splitTemplateParts,
            parseTemplateParams,
            isFrenchLanguageParam,
            extractFromPronTemplate,
            extractFromFrenchLanguageTemplate,
            extractFromFrenchTemplate,
            extractPhoneticFromTemplates,
            hasLanguageSections,
            isFrenchLanguageHeading,
            extractFrenchSection,
            extractFrenchPhonetic,
            normalizeFrenchTerm
        })
    };
})();
