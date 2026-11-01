/// <reference path="../pb_data/types.d.ts" />

/**
 * Keep `RemintWithinS` below this
 */
const DeviceTokenTtlS = 30 * 24 * 60 * 60;

/** Re-mint once this little life is left, so a tablet syncing weekly stays ahead of it. */
const RemintWithinS = 7 * 24 * 60 * 60;

const DeviceClaim = "device";

function mintDeviceToken(app, device) {
    const user = app.findRecordById("users", device.getString("enrolledBy"));
    const collection = user.collection();

    return $security.createJWT(
        {
            id: user.id,
            type: "auth",
            collectionId: collection.id,
            refreshable: false,
            [DeviceClaim]: device.id,
        },
        user.tokenKey() + collection.authToken.secret,
        DeviceTokenTtlS,
    );
}

/**
 * Picks the bearer token from request Authorization header
 *
 * @param {any} e
 * @returns {string}
 */
function requestToken(e) {
    return (e.request.header.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

/**
 * Picks the device id from auth token {@link DeviceClaim} claim
 *
 * @param {string} token
 * @returns {string} device id or empty string
 */
function deviceClaim(token) {
    if (!token) return "";

    try {
        const claims = $security.parseUnverifiedJWT(token);
        return typeof claims[DeviceClaim] === "string" ? claims[DeviceClaim] : "";
    } catch {
        return "";
    }
}

/**
 * The device the authenticated user may act as
 *
 * @returns {{ ok: false, status: number, reason: string }|{ ok: true, device: any }}
 */
function authorizeDevice(app, deviceId, authId) {
    let device;
    try {
        device = app.findRecordById("pos_devices", deviceId);
    } catch {
        return { ok: false, status: 401, reason: "device-revoked" };
    }

    if (!authId || device.getString("enrolledBy") !== authId) {
        return { ok: false, status: 401, reason: "device-revoked" };
    }

    if (!device.getBool("active")) {
        return { ok: false, status: 403, reason: "device-deactivated" };
    }

    return { ok: true, device };
}

/**
 * The token to hand back to a tablet: the one it presented while that still has life in
 * it, a freshly minted one when it hasn't.
 *
 * @param {string} token already verified by PocketBase
 * @returns {string}
 */
function ensureDeviceToken(app, device, token) {
    const exp = Number($security.parseUnverifiedJWT(token).exp) || 0;
    if (exp - Math.floor(Date.now() / 1000) > RemintWithinS) return token;

    return mintDeviceToken(app, device);
}

/** What a tablet gets to know about itself. */
function deviceResponse(device) {
    return {
        id: device.id,
        label: device.getString("label"),
        kind: device.getString("kind"),
        config: readJson(device, "config"),
    };
}

function readJson(record, field) {
    const raw = record.getString(field);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

module.exports = {
    mintDeviceToken,
    requestToken,
    deviceClaim,
    authorizeDevice,
    ensureDeviceToken,
    deviceResponse,
};
