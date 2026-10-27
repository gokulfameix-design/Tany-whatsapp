# Original Tany brand assets

Downloaded unchanged from https://app.tany.in/brand/ on 2026-10-23.

- `tany-icon.png`: the app's main Tany icon (`LogoIcon`).
- `tany-logo.png`: the already verified main wordmark copied byte-for-byte from `public/brand/tany-logo.png`, originally https://tany.in/brand/tany-logo.png.
- `tany{vertical}-icon.svg`: original 240 x 240 product icons for all 12 verticals.
- `tany{vertical}-wordmark.svg`: original light-theme wordmarks, with their intrinsic dimensions preserved in `lib/brand-logos.ts`.
- The app's public ProductLogo component references `/brand/${product}-wordmark.svg`; product keys use `tanymotos`, `tanyeats`, etc.

`lib/brand-logos.ts` is the shared asset mapping. `components/brand-logo.tsx` renders icons at 32px and wordmarks at 28px high with `object-contain`. Assets are not cropped, recolored, or recreated.

See `sources.json` for original paths, dimensions, and SHA-256 hashes. All assets are served locally; the dashboard does not depend on runtime requests to the source website.
