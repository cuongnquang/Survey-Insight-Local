import { defineConfig } from 'vite';

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://apis.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://sheets.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com",
  "frame-src https://accounts.google.com https://docs.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function injectCsp() {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const tag = `  <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n`;
      return html.replace('</head>', `${tag}  </head>`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [injectCsp()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
