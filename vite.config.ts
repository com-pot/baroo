import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import devtools from "vite-plugin-devtools-json";
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        sveltekit(),
        basicSsl(),
        devtools(),
        paraglideVitePlugin({
            project: './project.inlang',
            outdir: './src/lib/paraglide',
            strategy: ['url', 'baseLocale'],
        }),
    ]
});
