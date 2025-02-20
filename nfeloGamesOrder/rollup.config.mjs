import { defineExternal, definePlugins } from '@gera2ld/plaid-rollup';
import { readPackageUp } from 'read-package-up';
import { defineConfig, watch } from 'rollup';
import userscript from 'rollup-plugin-userscript';

const { packageJson } = await readPackageUp();

export default defineConfig(
  Object.entries({
    'awesome-script': 'src/awesome-script/index.ts',
  }).map(([name, entry]) => ({
    input: entry,
    plugins: [
      ...definePlugins({
        esm: true,
        minimize: false,
        postcss: {
          inject: false,
          minimize: true,
        },
        extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx'],
        replaceValues: {
          ', store': '',
          'store.': '',
        },
      }),
      userscript((meta) =>
        meta.replace('process.env.AUTHOR', packageJson.author.name),
      ),
    ],
    external: defineExternal([
      '@violentmonkey/ui',
      '@violentmonkey/dom',
      'solid-js',
      'solid-js/web',
    ]),
    output: {
      format: 'iife',
      file: `dist/${name}.user.js`,
      globals: {
        // Note:
        // - VM.solid is just a third-party UMD bundle for solid-js since there is no official one
        // - If you don't want to use it, just remove `solid-js` related packages from `external`, `globals` and the `meta.js` file.
        'solid-js': 'VM.solid',
        'solid-js/web': 'VM.solid.web',
        '@violentmonkey/dom': 'VM',
        '@violentmonkey/ui': 'VM',
      },
      indent: false,
    },
  })),
);
