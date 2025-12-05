import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import devtools from "vite-plugin-devtools-json";
import { defineConfig, loadEnv } from 'vite';

export default ({ mode }) => {
    process.env = {
        ...process.env,
        ...loadEnv(mode, process.cwd(), ''),
    };

    // import.meta.env.VITE_NAME available here with: process.env.VITE_NAME
    // import.meta.env.VITE_PORT available here with: process.env.VITE_PORT

    return defineConfig({
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
