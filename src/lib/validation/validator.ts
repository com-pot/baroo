import z, { type ZodSafeParseError } from 'zod';


export interface ValidationError {
    field: string;
    message: string;
}

export type ValidationIssue = ZodSafeParseError<any>["error"]["issues"][number]
export function getFieldErrors(errors: ValidationIssue[]): Record<string, ValidationError[]> {
    const result: Record<string, ValidationError[]> = {}
    for (const issue of errors) {
        const path = issue.path.join(".")
        if (!result[path]) result[path] = []
        result[path].push({
            field: path,
            message: issue.message,
        })
    }

    return result
}
