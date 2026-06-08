(function() {
    'use strict';

    const app = window.__frenchPickupExtension;

    if (window.__frenchPickupCleanup) {
        window.__frenchPickupCleanup();
    }

    if (app.controller && typeof app.controller.cleanup === 'function') {
        app.controller.cleanup();
    }

    function normalizeText(text) {
        return String(text || '').replace(/\s+/g, '');
    }

    function isExtensionOwnedTooltip(node) {
        if (!(node instanceof HTMLElement)) return false;
        if (node.id === app.TOOLTIP_ID || (app.LEGACY_TOOLTIP_IDS || []).includes(node.id)) return true;
        if (!node.dataset) return false;
        return node.dataset.frenchPickup === 'tooltip' ||
            node.dataset.frenchPickupCurrent === 'true';
    }

    function hasLegacyTooltipText(buttonText) {
        const hasTranslate = /翻译|缈昏瘧/.test(buttonText);
        const hasSpeak = /朗读|鏈楄|美音|英音/.test(buttonText);
        return hasTranslate && hasSpeak;
    }

    function hasLegacyTooltipShape(node) {
        const range = node.querySelector('input[type="range"]');
        if (!range) return false;

        const rect = node.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        return rect.bottom >= 0 &&
            rect.right >= 0 &&
            width >= 180 &&
            width <= 420 &&
            height >= 48 &&
            height <= 320;
    }

    function isLegacyFrenchPickupTooltip(node, currentRoot) {
        if (!(node instanceof HTMLElement)) return false;
        if (currentRoot && (node === currentRoot || node.contains(currentRoot) || currentRoot.contains(node))) {
            return false;
        }

        if (isExtensionOwnedTooltip(node)) return true;
        if (node.closest('[data-french-pickup="tooltip"]')) return false;
        if (!hasLegacyTooltipShape(node)) return false;

        const buttonText = Array.from(node.querySelectorAll('button, [role="button"]'))
            .map((button) => normalizeText(button.textContent))
            .join('|');
        const nodeText = normalizeText(node.textContent);

        return hasLegacyTooltipText(buttonText) ||
            (/语速[:：]?|璇€/.test(nodeText) && /翻译|缈昏瘧/.test(nodeText) && /朗读|鏈楄|美音|英音/.test(nodeText));
    }

    class TooltipSingletonGuard {
        constructor(getCurrentRoot) {
            this.getCurrentRoot = getCurrentRoot;
            this.disposed = false;
            this.pruneTimer = 0;
            this.observer = null;
        }

        start() {
            this.pruneNow();

            if ('MutationObserver' in window && document.body) {
                this.observer = new MutationObserver((mutations) => {
                    if (this.disposed) return;
                    if (!this.hasPotentialTooltipMutation(mutations)) return;
                    this.schedulePrune();
                });

                this.observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['id', 'class', 'style', 'data-french-pickup', 'data-french-pickup-current']
                });
            }

            this.schedulePruneBurst();
        }

        hasPotentialTooltipMutation(mutations) {
            return mutations.some((mutation) => {
                if (mutation.type === 'attributes') {
                    return this.isPotentialTooltipNode(mutation.target);
                }

                return Array.from(mutation.addedNodes).some((node) => {
                    return this.isPotentialTooltipNode(node);
                });
            });
        }

        isPotentialTooltipNode(node) {
            if (!(node instanceof HTMLElement)) return false;
            if (node.id === app.TOOLTIP_ID) return true;
            if ((app.LEGACY_TOOLTIP_IDS || []).includes(node.id)) return true;
            if (node.dataset && (node.dataset.frenchPickup || node.dataset.frenchPickupCurrent)) return true;

            const text = normalizeText(node.textContent);
            if (!/翻译|缈昏瘧|美音|英音|朗读|鏈楄/.test(text)) return false;

            return Boolean(node.querySelector && node.querySelector('input[type="range"]'));
        }

        schedulePrune() {
            if (this.pruneTimer) return;

            this.pruneTimer = window.setTimeout(() => {
                this.pruneTimer = 0;
                this.pruneNow();
            }, 0);
        }

        schedulePruneBurst() {
            [0, 30, 120, 300, 700, 1200, 2000, 3500].forEach((delay) => {
                window.setTimeout(() => {
                    if (!this.disposed) this.pruneNow();
                }, delay);
            });
        }

        collectTooltipCandidates() {
            const currentRoot = this.getCurrentRoot();
            const nodes = Array.from(document.querySelectorAll('div'));

            return nodes
                .filter((node) => isLegacyFrenchPickupTooltip(node, currentRoot))
                .filter((node, index, list) => {
                    return !list.some((other, otherIndex) => {
                        return otherIndex !== index && other.contains(node);
                    });
                });
        }

        pruneNow() {
            this.collectTooltipCandidates().forEach((node) => {
                node.remove();
            });
        }

        dispose() {
            this.disposed = true;

            if (this.pruneTimer) {
                window.clearTimeout(this.pruneTimer);
                this.pruneTimer = 0;
            }

            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        }
    }

    class ContentController {
        constructor() {
            this.selectedText = '';
            this.suppressUntil = 0;
            this.phoneticRequestId = 0;
            this.disposed = false;
            this.lastSelectionSnapshot = null;
            this.lastPointerPosition = null;
            this.lastReleaseHandledAt = 0;

            this.tooltip = new app.TooltipView({
                onTranslate: () => this.translateSelectedText(),
                onSpeak: () => this.speakSelectedText(),
                onInteract: () => this.suppressSelectionPopup()
            });
            this.tooltipGuard = new TooltipSingletonGuard(() => this.tooltip.root);

            this.handleMouseup = this.handleMouseup.bind(this);
            this.handlePointerup = this.handlePointerup.bind(this);
            this.handleMousedown = this.handleMousedown.bind(this);
            this.handleSelectionChange = this.handleSelectionChange.bind(this);

            document.addEventListener('selectionchange', this.handleSelectionChange, true);
            document.addEventListener('mouseup', this.handleMouseup, true);
            document.addEventListener('pointerup', this.handlePointerup, true);
            document.addEventListener('mousedown', this.handleMousedown, true);
            this.tooltipGuard.start();
        }

        suppressSelectionPopup() {
            this.suppressUntil = Date.now() + app.POPUP_SUPPRESS_MS;
        }

        isSelectionSuppressed() {
            return Date.now() < this.suppressUntil;
        }

        handleMouseup(event) {
            this.showAfterSelectionRelease(event);
        }

        handlePointerup(event) {
            this.lastPointerPosition = {
                clientX: event.clientX,
                clientY: event.clientY,
                capturedAt: Date.now()
            };
            this.showAfterSelectionRelease(event);
        }

        showAfterSelectionRelease(event) {
            if (this.disposed || this.isSelectionSuppressed()) return;
            if (this.tooltip.contains(event.target)) return;

            const now = Date.now();
            if (now - this.lastReleaseHandledAt < 40) return;
            this.lastReleaseHandledAt = now;

            const snapshot = this.getSelectionSnapshot() || this.getRecentSelectionSnapshot();
            if (!snapshot || !snapshot.text) {
                this.tooltip.hide();
                return;
            }

            const position = this.getReleasePosition(event, snapshot);

            window.setTimeout(() => {
                this.showForSelection(snapshot.text, position);
            }, 10);
        }

        handleSelectionChange() {
            if (this.disposed || this.isSelectionSuppressed()) return;

            const snapshot = this.getSelectionSnapshot();
            if (snapshot && snapshot.text) {
                this.lastSelectionSnapshot = snapshot;
            }
        }

        getRecentSelectionSnapshot() {
            if (!this.lastSelectionSnapshot) return '';
            if (Date.now() - this.lastSelectionSnapshot.capturedAt > 800) return '';
            return this.lastSelectionSnapshot;
        }

        getReleasePosition(event, snapshot) {
            if (
                event &&
                typeof event.clientX === 'number' &&
                typeof event.clientY === 'number' &&
                (event.clientX !== 0 || event.clientY !== 0)
            ) {
                return {
                    clientX: event.clientX,
                    clientY: event.clientY
                };
            }

            if (
                this.lastPointerPosition &&
                Date.now() - this.lastPointerPosition.capturedAt < 800
            ) {
                return this.lastPointerPosition;
            }

            return snapshot.position;
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
            this.tooltipGuard.pruneNow();
            this.tooltip.reset();
            this.tooltip.showAt(position.clientX, position.clientY);
            this.tooltipGuard.schedulePruneBurst();

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

        getSelectionSnapshot() {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

            const text = selection.toString().trim();
            if (!text) return null;

            const range = selection.getRangeAt(0);
            const rects = Array.from(range.getClientRects())
                .filter((rect) => rect.width > 0 && rect.height > 0);
            const rect = rects[rects.length - 1] || range.getBoundingClientRect();

            return {
                text,
                position: {
                    clientX: rect && rect.left ? rect.left : window.innerWidth / 2,
                    clientY: rect && rect.bottom ? rect.bottom : window.innerHeight / 2
                },
                capturedAt: Date.now()
            };
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
            document.removeEventListener('pointerup', this.handlePointerup, true);
            document.removeEventListener('mousedown', this.handleMousedown, true);
            this.tooltipGuard.dispose();
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
