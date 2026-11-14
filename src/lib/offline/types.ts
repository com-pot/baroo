import type { Bar, BarMember, BarOfferItem, OfferPackage } from '$lib/bar/BarModel';
import type { MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
import type { TagMapping } from '$lib/bar/tags';
import type { PosDevice } from '$lib/pos/device';
import type { BarTap } from '$lib/taps/barTap';

export type BarSnapshot = {
    capturedAt: string;
    bar: Bar;
    offerItems: BarOfferItem[];
    /** Registered and unsealed, missing in snapshots from before packages */
    packages?: OfferPackage[];
    /** Flushed packages per item key, missing in snapshots from before they were counted */
    flushedPackages?: Record<BarOfferItem['key'], number>;
    members: BarMember[];
    mappings: TagMapping[];
    timelines: Record<BarMember['id'], MemberTimelineEntry[]>;
    /** The bar's taps, missing in snapshots from before they were prepared in backstage */
    taps?: Pick<BarTap, 'sequence' | 'name'>[];
};

export type DeviceIdentity = {
    token: string;
    bar: Pick<Bar, "slug" | "name">,
    device: Pick<PosDevice, "id" | "kind" | "label" | "config">
};
