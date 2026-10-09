export type AppError<ErrCode extends string = string, ErrData extends Record<string, unknown>|undefined = undefined> =
ErrData extends undefined ? {error: ErrCode} : {
    error: ErrCode,
    data: ErrData,
}

export function appError<ErrCode extends string = string>(code: ErrCode): AppError<ErrCode, undefined>
export function appError<ErrCode extends string = string, ErrData extends Record<string, unknown> = Record<string, unknown>>(code: ErrCode, data: ErrData): AppError<ErrCode, ErrData>
export function appError<ErrCode extends string = string, ErrData extends Record<string, unknown> = Record<string, unknown>>(
    error: ErrCode,
    data?: ErrData,
): AppError<ErrCode, ErrData> {
    return { error, data }
}

export function isError<ErrCode extends string = string>(s: unknown, error?: ErrCode): s is AppError {
    if (!s || typeof s !== "object") return false
    if (!('error' in s && 'data' in s)) return false

    if (error && s.error !== error) return false

    return true
}
