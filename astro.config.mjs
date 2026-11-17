// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://globoknot.com',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
