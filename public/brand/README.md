# Tany brand source

Source: https://tany.in/ (retrieved 2026-10-23).

- `tany-logo.png`: original `/brand/tany-logo.png`, 916 ? 320; display at 40px high without recoloring or cropping.
- `../fonts/space-grotesk-*.woff2`: the exact variable Space Grotesk font files served by the site, weights 300?700. Latin, Latin Extended, and Vietnamese subsets and the site's adjusted Arial fallback are preserved.
- `app/globals.css`: the site's light-theme root tokens, including `--brand` / `--primary: #e5270b`, all 12 vertical palettes, `--radius: .625rem`, neutral surfaces, borders, and typography.
- Source CSS: `/_next/static/chunks/27h2b1fparw6k.css` and `/_next/static/chunks/1vos3w0d47pxg.css`.
- Spacing follows the site's 4px scale (24px section gaps/padding); pill CTA radius uses `--radius ? 2.6`, matching `rounded-4xl` on the site's sign-in button.

Assets are served locally so the admin dashboard does not require a runtime connection to tany.in.
