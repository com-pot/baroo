/// <reference path="../pb_data/types.d.ts" />

/**
 * Authorizes a tap with the config backstage materialized, handing back the tap's token.
 * Refreshing the token key revokes whatever token the tap had before - the token itself
 * is never stored, only when it's `validThrough`.
 */
routerAdd("POST", "/api/baroo/taps/{id}/authorize", (e) => {
    const lib = require(`${__hooks}/tap.lib.js`);

    let tap;
    try {
        tap = $app.findRecordById(lib.TapsCollection, e.request.pathValue("id"));
    } catch {
        return e.json(404, { reason: "tap-unknown" });
    }

    const info = e.requestInfo();
    if (!$app.canAccessRecord(tap, info, tap.collection().updateRule)) {
        return e.json(403, { reason: "forbidden" });
    }

    const configChecksum = String(info.body.configChecksum ?? "");
    const validThrough = new DateTime(new Date(Date.now() + tap.collection().authToken.duration * 1000).toISOString().replace("T", " "));

    let token;
    try {
        $app.runInTransaction((txApp) => {
            tap.set("config", info.body.config ?? null);
            tap.set("configChecksum", configChecksum);
            tap.set("validThrough", validThrough);
            tap.refreshTokenKey();
            tap.setRandomPassword();
            txApp.save(tap);

            token = tap.newAuthToken();
        });
    } catch (err) {
        $app.logger().error("could not authorize a tap", "tap", tap.id, "error", String(err));
        return e.json(503, { reason: "unavailable" });
    }

    return e.json(200, { token, validThrough: validThrough.string() });
}, $apis.requireAuth("users"));

/**
 * A tap checking in, which is how the server tells who a tap is, on every request.
 * Doubles as its heartbeat.
 */
routerAdd("POST", "/api/baroo/tap/hello", (e) => {
    const lib = require(`${__hooks}/tap.lib.js`);

    const tap = e.auth;
    tap.set("lastSeen", new DateTime());
    try {
        $app.save(tap);
    } catch (err) {
        $app.logger().warn("could not mark a tap as seen", "tap", tap.id, "error", String(err));
    }

    try {
        return e.json(200, lib.tapResponse($app, tap));
    } catch {
        return e.json(403, { reason: "tap-bar-gone" });
    }
}, $apis.requireAuth("bar_taps"));

/**
 * Taps file unseals and flushes of their own bar onto themselves, nothing else
 */
onRecordCreateRequest((e) => {
    const lib = require(`${__hooks}/tap.lib.js`);

    const auth = e.auth;
    if (!auth || auth.collection().name !== lib.TapsCollection) {
        return e.next();
    }

    const type = e.record.getString("type");
    if (type !== "unseal" && type !== "flush") {
        throw new ForbiddenError("taps file unseals and flushes only");
    }

    const bar = $app.findRecordById("bars", auth.getString("bar"));
    const data = lib.readJson(e.record, "data") || {};

    e.record.set("target", `bar:${bar.getString("slug")}`);
    e.record.set("data", { ...data, tap: lib.tapRef(auth) });

    return e.next();
}, "events");

/**
 * Keeps what each tap pours in step with the packages unsealed onto it and flushed,
 * whoever did it - the tap a package came off as well as the one it went on
 */
onRecordAfterCreateSuccess((e) => {
    const lib = require(`${__hooks}/tap.lib.js`);

    const tap = e.record.getString("tap");
    if (tap) {
        try {
            lib.recomputeNowServing(e.app, tap);
        } catch (err) {
            e.app.logger().error("could not tell what the tap pours", "tap", tap, "error", String(err));
        }
    }

    return e.next();
}, "bar_offer_packages");

onRecordAfterUpdateSuccess((e) => {
    const lib = require(`${__hooks}/tap.lib.js`);

    const taps = [e.record.getString("tap"), e.record.original().getString("tap")]
        .filter((tap, i, all) => tap && all.indexOf(tap) === i);
    for (const tap of taps) {
        try {
            lib.recomputeNowServing(e.app, tap);
        } catch (err) {
            e.app.logger().error("could not tell what the tap pours", "tap", tap, "error", String(err));
        }
    }

    return e.next();
}, "bar_offer_packages");
