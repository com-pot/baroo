import { isError } from "$lib/errors"
import { isMessageRef } from "$lib/i18n"
import { m } from "$lib/paraglide/messages"

export default function safeError() {
    const container = $state({
        value: undefined as App.Error | undefined,

        catch<T>(err: unknown) {
            if (isError(err) && isMessageRef(err.data?.messageRef)) {
                const ref = err.data?.messageRef
                container.set({ message: m[ref.$t](ref.data), details: ref.data })
                return
            }

            throw err
        },
        set(error: App.Error) {
            container.value = error
        },
        clear() {
            container.value = undefined
        }
    })

    return container
}
