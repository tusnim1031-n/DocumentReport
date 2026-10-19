

### Cloudflare Preview branch settings

The Next.js app and `wrangler.jsonc` live in the repository subdirectory `DocumentReport/` (the repository root only contains the build-entry wrapper). In Workers Builds > Settings > Builds > Previews Base, set Root directory to `/DocumentReport`, Build command to `pnpm exec opennextjs-cloudflare build`, and Preview command to `npx wrangler preview`. Keep `previews: {}` in `DocumentReport/wrangler.jsonc`; Wrangler must run from this app directory to load that config.
