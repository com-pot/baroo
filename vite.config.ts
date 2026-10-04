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

    return defineConfig({
        define: {
            __APP_VERSION__: JSON.stringify(pkg.version),
            __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
            __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
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
