import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

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
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { '@typescript-eslint/no-floating-promises': 'error' },
  },
  {
    files: [
      'apps/web/src/features/canvas/use-*.ts',
      'apps/web/src/components/socket-provider/*.tsx',
    ],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
);
