/// <reference path="../pb_data/types.d.ts" />

/**
 * Redeems a backstage-issued pairing code. Runs with the app's own rights, so the
 * anonymous tablet never needs to read pairing codes or devices itself. What it gets
 * back is a token of the device's `enrolledBy` user, bound to this device.
 */
routerAdd("POST", "/api/baroo/device/enroll", (e) => {
    const lib = require(`${__hooks}/device.lib.js`);

    const code = String(e.requestInfo().body.code ?? "").trim();
    if (!/^\d{4}$/.test(code)) {
        return e.json(400, { reason: "unknown-code" });
    }

    let issued;
    try {
        issued = $app.findFirstRecordByFilter("pos_enrollment_codes", "code = {:code}", { code });
    } catch {
        return e.json(400, { reason: "unknown-code" });
    }

    const expiresAt = issued.getDateTime("expiresAt");
    if (expiresAt.isZero() || expiresAt.unix() <= Math.floor(Date.now() / 1000)) {
        return e.json(400, { reason: "expired" });
    }

    let device;
    try {
        device = $app.findRecordById("pos_devices", issued.getString("device"));
    } catch {
        $app.logger().error("enrollment code points at no device", "code", issued.id);
        return e.json(503, { reason: "unavailable" });
    }

    if (!device.getBool("active")) {
        return e.json(400, { reason: "device-inactive" });
    }

    let bar;
    try {
        bar = $app.findRecordById("bars", device.getString("bar"));
    } catch {
        $app.logger().error("device has no bar to pair into", "device", device.id);
        return e.json(503, { reason: "unavailable" });
    }

    if (!device.getString("enrolledBy")) {
        $app.logger().error("device has no enrolledBy, so no identity to act as", "device", device.id);
        return e.json(503, { reason: "unavailable" });
    }

    let token;
    let claimed = false;
    try {
        $app.runInTransaction((txApp) => {
            // Re-read inside the transaction: of two concurrent claims, only one deletes it.
            txApp.delete(txApp.findRecordById("pos_enrollment_codes", issued.id));
            claimed = true;

            device.set("lastSeen", new DateTime());
            txApp.save(device);

            // Minting inside the transaction keeps the code if minting fails.
            token = lib.mintDeviceToken(txApp, device);
        });
    } catch (err) {
        if (!claimed) {
            return e.json(400, { reason: "unknown-code" });
        }
        $app.logger().error("could not redeem enrollment code", "device", device.id, "error", String(err));
        return e.json(503, { reason: "unavailable" });
    }

    return e.json(200, {
        token,
        device: lib.deviceResponse(device),
        bar: {
            slug: bar.getString("slug"),
            name: bar.getString("name"),
        },
    });
});

/**
 * A tablet checking in to work a bar. The device is inferred from the token; it must be
 * paired into the requested bar. Marks the device as seen and hands back its token,
 * re-minted when it is running out.
 */
routerAdd("POST", "/api/baroo/device/check-in", (e) => {
    const lib = require(`${__hooks}/device.lib.js`);

    const token = lib.requestToken(e);
    const deviceId = lib.deviceClaim(token);
    if (!deviceId) {
        return e.json(401, { reason: "device-not-enrolled" });
    }

    const auth = lib.authorizeDevice($app, deviceId, e.auth?.id);
    if (!auth.ok) {
        return e.json(auth.status, { reason: auth.reason });
    }
    const device = auth.device;

    let bar;
    try {
        bar = $app.findRecordById("bars", device.getString("bar"));
    } catch {
        return e.json(403, { reason: "device-bar-mismatch" });
    }

    const expectedBar = e.requestInfo().body.bar
    if (expectedBar && bar.getString("slug") !== expectedBar) {
        return e.json(403, { reason: "device-bar-mismatch", authorizedBar: bar.getString("slug") });
    }

    device.set("lastSeen", new DateTime());
    try {
        $app.save(device);
    } catch (err) {
        $app.logger().error("could not mark device as seen", "device", device.id, "error", String(err));
    }

    let renewed = token;
    try {
        renewed = lib.ensureDeviceToken($app, device, token);
    } catch (err) {
        $app.logger().warn("could not renew a device token", "device", device.id, "error", String(err));
    }

    return e.json(200, {
        token: renewed,
        device: lib.deviceResponse(device),
        bar: {
            id: bar.id,
            slug: bar.getString("slug"),
            name: bar.getString("name"),
        },
    });
}, $apis.requireAuth("users"));

/**
 * For auth tokens vith device claim, ensures the device is usable
 */
routerUse((e) => {
    if (!e.auth) return e.next();

    const lib = require(`${__hooks}/device.lib.js`);

    const deviceId = lib.deviceClaim(lib.requestToken(e));
    if (!deviceId) return e.next();

    const auth = lib.authorizeDevice($app, deviceId, e.auth.id);
    if (!auth.ok) {
        return e.json(auth.status, { message: auth.reason, reason: auth.reason });
    }

    return e.next();
});
