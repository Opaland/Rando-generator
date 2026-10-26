import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      // Bac à sable des tests de mutation : une copie instrumentée du dépôt,
      // que le lint n'a aucune raison de relire — et qui rendait la porte
      // rouge sur des `@ts-nocheck` posés par l'outil lui-même.
      '.stryker-tmp',
      'reports',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.es2023 },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Les nombres et booléens dans les template strings sont voulus (UI, requêtes Overpass).
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },
  {
    /*
      `fs.rmSync` ne supprime rien, sans erreur, sous un chemin non ASCII
      (Node 24.13, Windows, mesuré le 26/10 — #612) : `dist/` n'était plus
      vidé, et le générateur d'intégrations annonçait « supprimé » des
      fichiers restés en place. Une règle plutôt qu'une consigne : elle ne
      demande à personne de s'en souvenir.
    */
    files: ['**/*.{js,mjs,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        ...['fs', 'node:fs'].map((name) => ({
          name,
          importNames: ['rmSync'],
          message:
            'rmSync ne supprime rien sous un chemin accentué (#612) : fs.promises.rm, ou unlinkSync pour un fichier.',
        })),
      ],
      'no-restricted-properties': [
        'error',
        {
          property: 'rmSync',
          message:
            'rmSync ne supprime rien sous un chemin accentué (#612) : fs.promises.rm, ou unlinkSync pour un fichier.',
        },
      ],
    },
  },
  {
    // Dans les tests, l'assertion non nulle est idiomatique après un toHaveLength.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
