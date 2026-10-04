import type { Bar, BarMember, BarOfferItem } from '$lib/bar/BarModel';
import type { UnsealEvent } from '$lib/bar/ops/unseal';
import type { MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
import type { TagMapping } from '$lib/bar/tags';
import type { PosDevice } from '$lib/pos/device';

export type BarSnapshot = {
    capturedAt: string;
    bar: Bar;
    offerItems: BarOfferItem[];
    members: BarMember[];
    mappings: TagMapping[];
    timelines: Record<BarMember['id'], MemberTimelineEntry[]>;
    unseals: Record<BarOfferItem['key'], UnsealEvent[]>;
};

export type DeviceIdentity = {
    token: string;
    bar: Pick<Bar, "slug" | "name">,
    device: Pick<PosDevice, "id" | "kind" | "label" | "config">
};
