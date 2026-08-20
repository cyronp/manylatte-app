import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'apps/web/src/routeTree.gen.ts',
      'packages/db/src/generated/**',
    ],
  },
  ...tseslint.configs.recommended,
);
