// @ts-check
const { themes } = require('prism-react-renderer');
const lightCodeTheme = themes.github;
const darkCodeTheme = themes.dracula;

module.exports = {
  title: 'Nutri Sport Hub',
  tagline: 'Nutrition and sport tracking workspace.',
  url: 'https://guillaumebizet.github.io',
  baseUrl: '/test/',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/logo.svg',
  organizationName: 'guillaumebizet',
  projectName: 'test',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'Nutri Sport Hub',
      logo: {
        alt: 'Nutri Sport Hub Logo',
        src: 'img/logo.svg',
      },
      items: [
        { to: '/', label: 'Accueil', position: 'left' },
        { to: '/metrics', label: 'Poids', position: 'left' },
        { to: '/nutrition', label: 'Nutrition', position: 'left' },
        { to: '/training', label: 'Entrainement', position: 'left' },
        { to: '/prompt-builder', label: 'Export IA', position: 'left' },
        { to: '/data-admin', label: 'Data', position: 'left' },
        { to: '/docs', label: 'Docs', position: 'right' },
      ],
    },
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
    },
  },
};
