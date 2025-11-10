export type Bar = {
    slug: string;
    name: string;
}

export type BarOfferItem = {
    key: string;
    name: string;
    pricing: Record<string, number>
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
