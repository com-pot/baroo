import { readFileSync } from 'node:fs';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import devtools from "vite-plugin-devtools-json";
import { defineConfig, loadEnv } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default ({ mode }) => {
    process.env = {
        ...process.env,
        ...loadEnv(mode, process.cwd(), ''),
    };

    // import.meta.env.VITE_NAME available here with: process.env.VITE_NAME
    // import.meta.env.VITE_PORT available here with: process.env.VITE_PORT

    return defineConfig({
        /**
         * Which bundle is on the tablet, baked in rather than fetched. A kiosk runs a
         * whole evening with no server to ask, so the answer has to travel with the code.
         */
        define: {
            __APP_VERSION__: JSON.stringify(pkg.version),
            __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
        },

        plugins: [
            sveltekit(),
            basicSsl(),
            devtools(),
            paraglideVitePlugin({
                project: './project.inlang',
                outdir: './src/lib/paraglide',
                strategy: ['url', 'baseLocale'],
            }),
        ],

        server: {
            proxy: {
                '/storage': {
                    target: process.env.PB_BASE_URL,
                    rewrite: (path) => path.replace(/^\/storage/, ''),
                },
            },
        },
    });
}
