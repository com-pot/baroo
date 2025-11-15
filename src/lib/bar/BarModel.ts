export type Bar = {
    id: string;
    slug: string;
    name: string;
}

export type BarOfferItem = {
    key: string;
    name: string;
    pricing: Record<string, number>;
    variantLabels?: Record<string, string>; // Maps normalized keys to display labels
    variantVolumes?: Record<string, number>; // Maps variant keys to volume in milliliters (ML)
    preview_1x1: string | null; // Path to 1x1 preview image
}

export type BarMember = {
    id: string;
    nickName: string;
    seq: number;
}

export interface MemberBalance {
    id: string;
    items: BarOrderItem[];
}

export interface BarOrderItem {
    key: BarOfferItem["key"];
    variant: string;
    createdAt: Date;
}
