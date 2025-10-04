import * as esbuild from 'esbuild'
import metaUrlPlugin from '@chialab/esbuild-plugin-meta-url';
// import workerPlugin from '@chialab/esbuild-plugin-worker';

await esbuild.build({
    entryPoints: ['js/widget.js'],
    minify: false,
    format: 'esm',
    bundle: true,
    outdir: 'src/data_grid/static',
    plugins: [metaUrlPlugin()],
})
