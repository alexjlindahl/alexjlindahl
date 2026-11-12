# Decision log

- App lives in `stack-here/` because the repo root is the GitHub profile README. On Vercel, set Root Directory to `stack-here`.
- Tool pricing has three states: `public` (read on the vendor's site, with source URL), `not_public` (contact sales), `unverified` (page could not be read). Only `public` USD prices feed the wasted-spend estimate. No price is ever estimated.
- The recorded price is the lowest paid plan on the vendor's page, so spend estimates lean low.
