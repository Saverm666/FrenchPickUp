(function() {
    'use strict';

    const app = window.__frenchPickupExtension;

    function createButton(label, color, hoverColor) {
        const button = document.createElement('button');
        button.textContent = label;
        button.style.cssText = `
            flex: 1;
            background: ${color};
            color: #ffffff;
            border: none;
            padding: 6px 0;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
        `;
        button.addEventListener('mouseover', () => {
            button.style.background = hoverColor;
        });
        button.addEventListener('mouseout', () => {
            button.style.background = color;
        });
        return button;
    }

    class TooltipView {
        constructor({ onTranslate, onSpeak, onInteract }) {
            this.onTranslate = onTranslate;
            this.onSpeak = onSpeak;
            this.onInteract = onInteract;
            this.refs = {};
            this.root = this.createRoot();
        }

        createRoot() {
            document.querySelectorAll(`#${app.TOOLTIP_ID}`).forEach((node) => node.remove());

            const root = document.createElement('div');
            root.id = app.TOOLTIP_ID;
            root.dataset.frenchPickupCurrent = 'true';
            root.style.cssText = `
                position: fixed;
                z-index: 2147483647;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                border-radius: 8px;
                padding: 10px;
                display: none;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 14px;
                color: #1a202c;
                line-height: 1.5;
                width: 220px;
                user-select: none;
                -webkit-user-select: none;
            `;

            const phonetic = document.createElement('div');
            phonetic.style.cssText = 'color: #e11d48; font-family: "Lucida Sans Unicode", "Arial", sans-serif; font-weight: bold; font-size: 15px; margin-bottom: 8px; display: none;';

            const buttonRow = document.createElement('div');
            buttonRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px;';

            const translateButton = createButton('翻译', '#3b82f6', '#2563eb');
            const speakButton = createButton('朗读', '#10b981', '#059669');
            translateButton.addEventListener('click', (event) => {
                event.stopPropagation();
                this.onTranslate();
            });
            speakButton.addEventListener('click', (event) => {
                event.stopPropagation();
                this.onSpeak();
            });

            buttonRow.appendChild(translateButton);
            buttonRow.appendChild(speakButton);

            const speedRow = document.createElement('div');
            speedRow.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 12px; color: #4a5568;';

            const speedLabel = document.createElement('span');
            speedLabel.textContent = `语速: ${app.DEFAULT_RATE.toFixed(1)}`;
            speedLabel.style.whiteSpace = 'nowrap';

            const speedSlider = document.createElement('input');
            speedSlider.type = 'range';
            speedSlider.min = '0.1';
            speedSlider.max = '2.0';
            speedSlider.step = '0.1';
            speedSlider.value = String(app.DEFAULT_RATE);
            speedSlider.style.cssText = 'width: 120px; flex: 0 0 120px; cursor: pointer; margin: 0;';
            speedSlider.addEventListener('input', () => {
                speedLabel.textContent = `语速: ${Number(speedSlider.value).toFixed(1)}`;
            });

            speedRow.appendChild(speedLabel);
            speedRow.appendChild(speedSlider);

            const result = document.createElement('div');
            result.style.cssText = `
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid #e2e8f0;
                display: none;
                word-wrap: break-word;
                font-size: 13px;
                color: #2d3748;
            `;

            const translation = document.createElement('div');
            result.appendChild(translation);

            root.appendChild(phonetic);
            root.appendChild(buttonRow);
            root.appendChild(speedRow);
            root.appendChild(result);
            document.body.appendChild(root);

            this.refs = {
                phonetic,
                result,
                translation,
                speedSlider
            };

            const suppress = () => this.onInteract();
            root.addEventListener('mousedown', suppress, true);
            root.addEventListener('mouseup', suppress, true);
            root.addEventListener('click', suppress, true);

            return root;
        }

        contains(target) {
            return this.root.contains(target);
        }

        getRate() {
            return Number(this.refs.speedSlider.value) || app.DEFAULT_RATE;
        }

        reset() {
            this.refs.result.style.display = 'none';
            this.refs.translation.textContent = '';
            this.refs.phonetic.style.display = 'none';
            this.refs.phonetic.textContent = '';
        }

        showAt(clientX, clientY) {
            this.root.style.left = `${clientX}px`;
            this.root.style.top = `${clientY + 15}px`;
            this.root.style.display = 'block';
            this.keepInViewport();
        }

        keepInViewport() {
            const margin = 8;
            const rect = this.root.getBoundingClientRect();
            const left = Math.min(
                Math.max(margin, this.root.offsetLeft),
                window.innerWidth - rect.width - margin
            );
            const top = Math.min(
                Math.max(margin, this.root.offsetTop),
                window.innerHeight - rect.height - margin
            );

            this.root.style.left = `${left}px`;
            this.root.style.top = `${top}px`;
        }

        hide() {
            this.root.style.display = 'none';
        }

        remove() {
            this.root.remove();
        }

        showPhoneticLoading() {
            this.refs.phonetic.textContent = '获取音标中...';
            this.refs.phonetic.style.display = 'block';
        }

        setPhonetic(phonetic) {
            if (!phonetic) {
                this.refs.phonetic.style.display = 'none';
                this.refs.phonetic.textContent = '';
                return;
            }

            this.refs.phonetic.textContent = `法语: /${phonetic}/`;
            this.refs.phonetic.style.display = 'block';
        }

        showTranslationLoading() {
            this.refs.result.style.display = 'block';
            this.refs.translation.textContent = '正在翻译中...';
        }

        setTranslation(text) {
            this.refs.result.style.display = 'block';
            this.refs.translation.textContent = text || '翻译返回结果为空';
        }
    }

    app.TooltipView = TooltipView;
})();
