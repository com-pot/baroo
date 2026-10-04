/// <reference path="../pb_data/types.d.ts" />

// Pairing codes are four digits and PocketBase's port is reachable directly, so the
// SvelteKit throttle alone does not stop guessing. Rate limit the redeem endpoint here too.
const ENROLL_LABEL = "POST /api/baroo/device/enroll";

migrate((app) => {
    const settings = app.settings();

    settings.rateLimits.enabled = true;
    settings.rateLimits.rules = [
        ...settings.rateLimits.rules.filter((rule) => rule.label !== ENROLL_LABEL),
        { label: ENROLL_LABEL, audience: "", duration: 60, maxRequests: 5 },
    ];

    app.save(settings);
}, (app) => {
    const settings = app.settings();

    settings.rateLimits.rules = settings.rateLimits.rules.filter((rule) => rule.label !== ENROLL_LABEL);

    app.save(settings);
});
