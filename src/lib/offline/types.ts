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
    /**
     * The package currently open for each offer item, so the kiosk can count stock down
     * without asking. Optional: snapshots pulled before this existed simply have none,
     * and an item with no entry has never been unsealed as far as the tablet knows.
     */
    unseals?: Record<BarOfferItem['key'], SnapshotUnseal>;
};

/** The open package of one offer item, as the last pull found it. */
export type SnapshotUnseal = {
    occurredAt: string;
    /** What the package holds, in its serving preset's measure. */
    quantity: number;
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
