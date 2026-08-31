import type { Bar, BarMember, BarOfferItem } from '$lib/bar/BarModel';
import type { MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
import type { TagMapping } from '$lib/bar/tags';
import type { PosDeviceConfig, PosDeviceKind } from '$lib/pos/device';

/** Everything a tablet needs to run a bar with no network. */
export type BarSnapshot = {
    capturedAt: string;
    bar: Bar;
    offerItems: BarOfferItem[];
    members: BarMember[];
    mappings: TagMapping[];
    /** Per-member history, so summaries work offline. Keyed by member id. */
    timelines: Record<BarMember['id'], MemberTimelineEntry[]>;
    /** Last settlement per member, so standings can be computed offline. */
    lastSettlements: Record<BarMember['id'], string>;
};

/** The tablet's identity, written once at enrolment. */
export type DeviceIdentity = {
    deviceId: string;
    token: string;
    label: string;
    kind: PosDeviceKind;
    barSlug: string;
    barName: string;
    enrolledAt: string;
    /** Kiosk settings from backstage, refreshed on every snapshot pull. */
    config?: PosDeviceConfig;
};
