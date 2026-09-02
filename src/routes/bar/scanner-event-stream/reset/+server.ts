import { env } from "$env/dynamic/private";
import { error, json } from "@sveltejs/kit";

import type { RequestHandler } from './$types';
import { getScannerStructure } from '../scanner.server';

/**
 * Re-plug the reader on demand. The watchdog handles the case it can detect, but
 * a PN532 that stopped polling while CCID keeps answering looks healthy from
 * here and only the person watching a dark LED knows better.
 */
export const POST: RequestHandler = async () => {
    if (!env.USE_CARD_SSE) {
        return error(503, 'SSE scanner not enabled');
    }

    const scannerStructure = await getScannerStructure()
    const result = scannerStructure.resetReader('requested by staff')

    return json(result, { status: result.started ? 202 : 409 })
}
