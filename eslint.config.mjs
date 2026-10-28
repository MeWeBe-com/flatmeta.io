import next from 'eslint-config-next';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'public/sw.js', 'playwright-report/**', 'test-results/**'] },
  ...next,
  {
    rules: {
      '@next/next/no-img-element': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default config;
