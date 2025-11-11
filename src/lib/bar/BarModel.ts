export type Bar = {
    slug: string;
    name: string;
}

export type BarOfferItem = {
    key: string;
    name: string;
    pricing: Record<string, number>;
    variantLabels?: Record<string, string>; // Maps normalized keys to display labels
    variantVolumes?: Record<string, number>; // Maps variant keys to volume in milliliters (ML)
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
    variant: 'x' | '1';
    createdAt: Date;
}
