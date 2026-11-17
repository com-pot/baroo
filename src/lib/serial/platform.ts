import { listIndex } from '$lib/lists'

export const usbVendors = listIndex('id', [
    { id: '2e8a', name: 'Raspberry Pi' },
])

export const serialPortFilters: SerialPortFilter[] = usbVendors.items.map(({ id }) => ({ usbVendorId: parseInt(id, 16) }))

/**
 * @returns like `"2e8a:0005"`
 */
export function serialPortId(port: SerialPort): string {
    const { usbVendorId, usbProductId } = port.getInfo()
    return `${hex(usbVendorId)}:${hex(usbProductId)}`
}

export function serialPortVendor(port: SerialPort): string {
    const vendor = usbVendors.index[hex(port.getInfo().usbVendorId)] as typeof usbVendors.items[number] | undefined
    return vendor?.name ?? 'Other USB device'
}

function hex(id: number | undefined): string {
    return id?.toString(16).padStart(4, '0') ?? '????'
}

/** A python literal of a JSON-like value */
export function pyLiteral(value: unknown): string {
    if (value === null || value === undefined) return 'None'
    if (typeof value === 'boolean') return value ? 'True' : 'False'
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`not a python number: ${value}`)
        return String(value)
    }
    // JSON escapes are valid python string escapes
    if (typeof value === 'string') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(pyLiteral).join(', ')}]`
    if (typeof value === 'object') {
        return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${pyLiteral(item)}`).join(', ')}}`
    }

    throw new Error(`not a python literal: ${typeof value}`)
}
