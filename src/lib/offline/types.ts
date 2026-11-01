import type { Bar, BarMember, BarOfferItem, OfferPackage } from '$lib/bar/BarModel';
import type { FlushEvent } from '$lib/bar/ops/flush';
import type { UnsealEvent } from '$lib/bar/ops/unseal';
import type { MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
import type { TagMapping } from '$lib/bar/tags';
import type { PosDevice } from '$lib/pos/device';

export type BarSnapshot = {
    capturedAt: string;
    bar: Bar;
    offerItems: BarOfferItem[];
    /** Missing in snapshots from before packages */
    packages?: OfferPackage[];
    members: BarMember[];
    mappings: TagMapping[];
    timelines: Record<BarMember['id'], MemberTimelineEntry[]>;
    unseals: Record<BarOfferItem['key'], UnsealEvent[]>;
    /** Missing in snapshots from before flush events */
    flushes?: Record<BarOfferItem['key'], FlushEvent[]>;
};

export type DeviceIdentity = {
    token: string;
    bar: Pick<Bar, "slug" | "name">,
    device: Pick<PosDevice, "id" | "kind" | "label" | "config">
    /** Pass to the venue's tap stream, absent when the server has no TapTappers */
    tapTicket?: string;
};
