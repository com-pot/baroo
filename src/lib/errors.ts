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
    return { error, data: data || {} } as AppError<ErrCode, ErrData>
}

export function isError<ErrCode extends string = string>(s: unknown, error?: ErrCode): s is AppError & {data?: Record<string, unknown>} {
    if (!s || typeof s !== "object") return false
    if (!('error' in s && 'data' in s)) return false

    if (error && s.error !== error) return false

    return true
}

export async function fromResponse(message: string, response: Response): Promise<AppError<string, Record<string, unknown>>> {
    const text = await response.text()
    const details = response.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(text)
        : { $body: text }

    return {
        error: `${message}: ${response.status}`,
        data: details,
    }
}
