# Daywell

Daywell is an installable, responsive productivity app built with Next.js, React, PostgreSQL, and Drizzle ORM.

## Run locally

1. Install Node.js 20.9 or newer and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set your Neon connection string. Use the pooled URL for app traffic. Set `ENCRYPTION_KEY` to a unique random value with at least 32 characters.
4. Generate and apply the database migration:

   ```sh
   npm run db:generate
   npm run db:migrate
   ```

5. Start the app with `npm run dev`. For production, run `npm run build` and `npm run start`.

## Deploy

Deploy as a Node.js Next.js application on a host that supports Next.js server routes. Configure `DATABASE_URL_POOLED` (or the Neon Vercel integration's `DATABASE_URL` / `POSTGRES_URL`) and `ENCRYPTION_KEY` as server-side environment variables. Set `DATABASE_URL_UNPOOLED` or `DATABASE_URL` to the direct Neon connection string for migrations. Never put database, storage, or AI secrets in `NEXT_PUBLIC_*` variables or commit them to source control. Run `npm run db:migrate` as a release step before serving a new version.

The app can be installed from a supported browser's menu after it is served over HTTPS. Its web app manifest and app icon are in `public/`.

## First Android download

To create a shareable Android APK, first deploy the web/API app and set `EXPO_PUBLIC_API_URL` in the EAS build environment to its HTTPS origin. From `mobile/`, run `npx eas-cli login`, `npx eas-cli init` once, then `npx eas-cli build --platform android --profile preview`. The preview profile produces an installable APK; EAS provides a download link when the build finishes. On Android, open that link and allow installation from the browser if prompted. The APK uses your deployed Daywell backend for registration, sign-in, and synced workspace data.

For a quick first release, the web app is already installable from the browser menu after deployment. Users can also download their signed-in workspace as JSON from **Settings → Account → Download my data**. The export includes goals, tasks, reminders, writing, check-ins, focus history, and connection details, but never API keys or session credentials.

## Policies, AI and updates

Terms of Service and Privacy Policy are available at `/terms` and `/privacy`. They identify Baby Seven as the operator and use the support WhatsApp number supplied by the owner. AI companion replies stream as they are generated on web and mobile; provider streaming support is required for token-by-token output. OpenAI-compatible providers and Gemini are supported.

Signed-in web workspaces refresh every 12 seconds while the page is visible. Mobile refreshes every 20 seconds while the app is active. Browser reminder notifications are delivered while the web app is open and notification permission is granted. These are near-live refreshes and foreground reminders; background push delivery needs a configured push provider and a scheduler. Vercel Hobby cron jobs are limited to one execution per day, so they cannot provide minute-accurate reminder delivery.

## Environment variables

See `.env.example` for the required and optional variables. `OPENROUTER_API_KEY` enables shared included AI access; users may instead add their own provider connection inside Settings. AI keys saved by users are encrypted with `ENCRYPTION_KEY`.

The Neon Auth and object storage settings are not required by this app: it currently uses its own email/password session flow and does not upload files. The server API uses PostgreSQL directly through the Neon pooled connection.

## Native mobile app

The React Native and Expo app is in [`mobile/`](mobile/README.md). It connects to the deployed Next.js API and shares its Neon backed accounts and workspaces. Configure `mobile/.env` with the API's HTTPS URL, install the mobile dependencies, and run `npx expo start` from that directory.
