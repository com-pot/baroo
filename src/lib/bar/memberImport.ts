import type { AppError } from "$lib/errors";
import { pbResponseErrorMessage } from "$lib/pocketbase";
import type { Bar, BarMember } from "./BarModel";

export type MemberImportError =
    | AppError<'format'>
    | AppError<'invalid_seq', { value: string }>
    | AppError<'duplicate_seq', { seq: number }>
    | AppError<'duplicate_name', { nickName: string }>
    | AppError<'name_taken', { nickName: string; seq: number }>
    | AppError<'write_failed', { message: string }>;

export type MemberImportIssue = {
    /** 1-based, blank lines counted. */
    lineNo: number;
    raw: string;
    reason: MemberImportError;
};

type PlannedRow = { lineNo: number; raw: string; seq: number; nickName: string };

export type MemberImportPlan = {
    creates: PlannedRow[];
    renames: (PlannedRow & { id: BarMember["id"] })[];
    unchanged: number;
    issues: MemberImportIssue[];
};

export function plannedRowCount(plan: MemberImportPlan): number {
    return plan.creates.length + plan.renames.length + plan.unchanged;
}

export function planMemberImport(
    text: string,
    existing: Pick<BarMember, 'id' | 'seq' | 'nickName'>[],
): MemberImportPlan {
    const plan: MemberImportPlan = { creates: [], renames: [], unchanged: 0, issues: [] };

    const bySeq = new Map(existing.map(member => [member.seq, member]));
    const byNickName = new Map(existing.map(member => [member.nickName, member]));

    const seenSeq = new Set<number>();
    const seenNickName = new Set<string>();

    text.split(/\r\n|\r|\n/).forEach((raw, index) => {
        const lineNo = index + 1;
        if (!raw.trim()) return;

        const reject = (reason: MemberImportError) => plan.issues.push({ lineNo, raw, reason });

        const fields = parseMemberImportLine(raw);
        if (!fields) return reject({ error: 'format' });

        const seq = Number(fields.seq);
        if (!Number.isInteger(seq) || seq < 1) return reject({ error: 'invalid_seq', data: { value: fields.seq } });

        const { nickName } = fields;

        if (seenSeq.has(seq)) return reject({ error: 'duplicate_seq', data: { seq } });
        if (seenNickName.has(nickName)) return reject({ error: 'duplicate_name', data: { nickName } });

        // Both `(bar, seq)` and `(bar, nickName)` are unique, so a name that belongs to
        // somebody else is a conflict even when this row's own number is free. That also
        // rejects a straight swap of two names, which no single-row upsert could apply.
        const nameOwner = byNickName.get(nickName);
        if (nameOwner && nameOwner.seq !== seq) {
            return reject({ error: 'name_taken', data: { nickName, seq: nameOwner.seq } });
        }

        seenSeq.add(seq);
        seenNickName.add(nickName);

        const member = bySeq.get(seq);
        if (!member) {
            plan.creates.push({ lineNo, raw, seq, nickName });
        } else if (member.nickName !== nickName) {
            plan.renames.push({ id: member.id, lineNo, raw, seq, nickName });
        } else {
            plan.unchanged++;
        }
    });

    return plan;
}

export async function executeImportPlan(ctx: Pick<App.Locals, "pb">, bar: Pick<Bar, "id">, plan: ReturnType<typeof planMemberImport>) {
    const issues: MemberImportIssue[] = [];
    let created = 0;
    let renamed = 0;

    for (const row of plan.creates) {
        try {
            await ctx.pb.collection<BarMember>('bar_members').create({
                bar: bar.id,
                nickName: row.nickName,
                seq: row.seq,
            });
            created++;
        } catch (err) {
            issues.push({
                lineNo: row.lineNo,
                raw: row.raw,
                reason: { error: 'write_failed', data: { message: pbResponseErrorMessage(err) } },
            });
        }
    }

    for (const row of plan.renames) {
        try {
            await ctx.pb.collection<BarMember>('bar_members').update(row.id, {
                nickName: row.nickName,
            });
            renamed++;
        } catch (err) {
            issues.push({
                lineNo: row.lineNo,
                raw: row.raw,
                reason: { error: 'write_failed', data: { message: pbResponseErrorMessage(err) } },
            });
        }
    }

    return {
        created,
        renamed,
        issues,
    }
}

export function parseMemberImportLine(raw: string): { seq: string; nickName: string } | null {
    const [seq, nickName] = raw.split('\t').map(field => field.trim());

    if (!seq || !nickName) return null;

    return { seq, nickName };
}
