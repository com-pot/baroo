import { deLocalizeUrl } from '$lib/paraglide/runtime';
import type { Reroute } from '@sveltejs/kit';

const hostsConfig = {
    'lizard.kous.at': {
        match: ['/'],
        redirect: '/gzt',
    },
}


export const reroute: Reroute = ({ url }) => {
    // De-localizing has to come first, so `/en` reaches the counter too.
    const pathname = deLocalizeUrl(url).pathname;

    const config = hostsConfig[url.hostname as keyof typeof hostsConfig]
    if (config?.match?.some((test) => pathname === test)) {
        return config.redirect
    }

    return pathname;
};
