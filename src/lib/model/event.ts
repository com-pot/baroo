import type { BaseModel } from "pocketbase";

export type AppEvent<T extends object = object> = {
    type: string;
    target: string;
    data: T;
    occurredAt: string;
    clientId?: string;
    created: string;
} & BaseModel;
