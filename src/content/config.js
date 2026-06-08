(function() {
    'use strict';

    const app = window.__frenchPickupExtension || {};
    const settingsApi = window.FrenchPickupSettings;

    if (app.stopSettingsWatch) {
        app.stopSettingsWatch();
    }

    Object.assign(app, {
        VERSION: '2.1.7',
        TOOLTIP_ID: 'french-pickup-tooltip-v2',
        LEGACY_TOOLTIP_IDS: ['french-pickup-tooltip'],
        DEFAULT_RATE: 0.8,
        POPUP_SUPPRESS_MS: 180,
        FRENCH_TEXT_PATTERN: /^[A-Za-zÀ-ÖØ-öø-ÿŒœÆæÇç'’.-]+$/,
        FRENCH_TRIM_PATTERN: /^[^A-Za-zÀ-ÖØ-öø-ÿŒœÆæÇç]+|[^A-Za-zÀ-ÖØ-öø-ÿŒœÆæÇç]+$/g,
        settings: settingsApi.getDefaultSettings(),
        getSettings() {
            return settingsApi.normalizeSettings(this.settings);
        },
        getLearningLanguage() {
            return settingsApi.getLanguage(this.getSettings().learningLang);
        }
    });

    app.settingsReady = settingsApi.getSettings()
        .then((settings) => {
            app.settings = settings;
            return settings;
        })
        .catch(() => app.settings);

    app.stopSettingsWatch = settingsApi.watchSettings((settings) => {
        app.settings = settings;
    });

    window.__frenchPickupExtension = app;
})();
