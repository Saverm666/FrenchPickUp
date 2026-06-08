(function() {
    'use strict';

    const app = window.__frenchPickupExtension;

    if (window.__frenchPickupCleanup) {
        window.__frenchPickupCleanup();
    }

    if (app.controller && typeof app.controller.cleanup === 'function') {
        app.controller.cleanup();
    }

    function isChatGptHost() {
        return /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(window.location.hostname);
    }

    function normalizeText(text) {
        return String(text || '').replace(/\s+/g, '');
    }

    function isLegacyFrenchPickupTooltip(node) {
        if (!(node instanceof HTMLElement)) return false;
        if (node.id === app.TOOLTIP_ID) return false;
        if (node.dataset && node.dataset.frenchPickupCurrent === 'true') return false;
        if (!node.querySelector('input[type="range"]')) return false;

        const buttonText = Array.from(node.querySelectorAll('button'))
            .map((button) => normalizeText(button.textContent))
            .join('|');

        return /翻译|缈昏瘧/.test(buttonText) && /朗读|鏈楄/.test(buttonText);
    }

    function removeLegacyFrenchPickupTooltips() {
        document.querySelectorAll('body > div').forEach((node) => {
            if (isLegacyFrenchPickupTooltip(node)) {
                node.remove();
            }
        });
    }

    function scheduleLegacyFrenchPickupCleanup() {
        if (isChatGptHost()) return;

        [0, 30, 120, 300].forEach((delay) => {
            window.setTimeout(removeLegacyFrenchPickupTooltips, delay);
        });
    }

    class ContentController {
        constructor() {
            this.selectedText = '';
            this.suppressUntil = 0;
            this.phoneticRequestId = 0;
            this.disposed = false;
            this.lastSelectionSnapshot = null;

            this.tooltip = new app.TooltipView({
                onTranslate: () => this.translateSelectedText(),
                onSpeak: () => this.speakSelectedText(),
                onInteract: () => this.suppressSelectionPopup()
            });

            this.handleMouseup = this.handleMouseup.bind(this);
            this.handleMousedown = this.handleMousedown.bind(this);
            this.handleSelectionChange = this.handleSelectionChange.bind(this);

            document.addEventListener('selectionchange', this.handleSelectionChange, true);
            document.addEventListener('mouseup', this.handleMouseup, true);
            document.addEventListener('mousedown', this.handleMousedown, true);
            scheduleLegacyFrenchPickupCleanup();
        }

        suppressSelectionPopup() {
            this.suppressUntil = Date.now() + app.POPUP_SUPPRESS_MS;
        }

        isSelectionSuppressed() {
            return Date.now() < this.suppressUntil;
        }

        handleMouseup(event) {
            if (this.disposed || this.isSelectionSuppressed()) return;
            if (this.tooltip.contains(event.target)) return;
            const text = this.getSelectedText() || this.getRecentSelectionText();
            if (!text) {
                this.tooltip.hide();
                return;
            }

            const position = {
                clientX: event.clientX,
                clientY: event.clientY
            };

            window.setTimeout(() => {
                this.showForSelection(text, position);
            }, 10);
        }

        handleSelectionChange() {
            if (this.disposed || this.isSelectionSuppressed()) return;

            const text = this.getSelectedText();
            if (text) {
                this.lastSelectionSnapshot = { text, capturedAt: Date.now() };
            }
        }

        getRecentSelectionText() {
            if (!this.lastSelectionSnapshot) return '';
            if (Date.now() - this.lastSelectionSnapshot.capturedAt > 800) return '';
            return this.lastSelectionSnapshot.text;
        }

        handleMousedown(event) {
            if (this.disposed || this.tooltip.contains(event.target)) return;
            if (this.getSelectedText()) return;

            this.tooltip.hide();
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        }

        async showForSelection(text, position) {
            if (this.disposed || this.isSelectionSuppressed()) return;
            if (!text) {
                this.tooltip.hide();
                return;
            }

            this.selectedText = text;
            this.tooltip.reset();
            this.tooltip.showAt(position.clientX, position.clientY);
            scheduleLegacyFrenchPickupCleanup();

            await app.settingsReady;
            if (this.disposed || text !== this.selectedText) return;

            if (app.api.isFrenchTerm(text)) {
                this.loadPhonetic(text);
            }
        }

        getSelectedText() {
            const selection = window.getSelection();
            return selection ? selection.toString().trim() : '';
        }

        async loadPhonetic(text) {
            const requestId = ++this.phoneticRequestId;
            this.tooltip.showPhoneticLoading();

            try {
                const phonetic = await app.api.fetchPhonetic(text);
                if (this.disposed || requestId !== this.phoneticRequestId || text !== this.selectedText) return;
                this.tooltip.setPhonetic(phonetic);
            } catch (error) {
                if (requestId === this.phoneticRequestId) {
                    this.tooltip.setPhonetic('');
                }
            }
        }

        async translateSelectedText() {
            const text = this.selectedText;
            if (!text) return;

            this.tooltip.showTranslationLoading();

            try {
                await app.settingsReady;
                const translatedText = await app.api.translateText(text);
                if (text === this.selectedText) {
                    this.tooltip.setTranslation(translatedText);
                }
            } catch (error) {
                if (text === this.selectedText) {
                    this.tooltip.setTranslation('网络请求失败，可能是接口被墙或跨域限制');
                }
            }
        }

        async speakSelectedText() {
            if (!this.selectedText) return;

            if (!('speechSynthesis' in window)) {
                alert('抱歉，您的浏览器不支持语音朗读功能！');
                return;
            }

            try {
                await app.settingsReady;
                await app.speech.speak(this.selectedText, this.tooltip.getRate());
            } catch (error) {
                alert(error && error.message ? error.message : '抱歉，您的浏览器不支持语音朗读功能！');
            }
        }

        cleanup() {
            this.disposed = true;
            document.removeEventListener('selectionchange', this.handleSelectionChange, true);
            document.removeEventListener('mouseup', this.handleMouseup, true);
            document.removeEventListener('mousedown', this.handleMousedown, true);
            this.tooltip.remove();

            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        }
    }

    app.controller = new ContentController();
    window.__frenchPickupCleanup = () => {
        if (app.controller) {
            app.controller.cleanup();
            app.controller = null;
        }
    };
})();
