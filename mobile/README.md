# Daywell mobile

This is the native Android and iOS app, built with React Native and Expo. It uses the existing Next.js app as its API and the same Neon database, so accounts and workspaces are shared between mobile and web.

## Configure and run

1. Use Node.js 22.13 or newer. Deploy the Next.js app to a public HTTPS URL and finish its Neon environment setup using the root README.
2. From this directory, install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the deployed backend origin, without a trailing slash. For a phone testing a local backend, use your computer's LAN IP and port instead of `localhost`.
4. Run `npx expo install --fix` to align Expo modules with this project's SDK, then start with `npx expo start`.
5. Open it in Expo Go for development, or use an EAS development/production build for a standalone installable app.

The device session token is stored using Expo SecureStore and sent to the backend as a bearer token. The backend returns a token only when the request identifies itself as the native app. Do not put private server credentials in `EXPO_PUBLIC_*` variables; that prefix is bundled into the app.

## Store builds

Set up an Expo/EAS account, run `eas init` to associate this project, and replace the example package and bundle identifiers in `app.json` with identifiers registered to you. Then run `eas build --platform android --profile production` or `eas build --platform ios --profile production`. Signing credentials and store accounts are required for store distribution.

## Backend environment

The mobile app calls the same Next.js API as the web app. For sign-in, data sync, and AI connections to work end-to-end, the Vercel deployment needs:

- `DATABASE_URL_POOLED` — Neon pooled connection string (the `-pooler` hostname).
- `ENCRYPTION_KEY` — a random value of at least 32 characters, generated with `openssl rand -hex 32`. This is required in production because `src/lib/auth.ts` throws if it is missing or too short, and saved AI provider keys are encrypted with it. Set it in Vercel → Project → Settings → Environment Variables (all environments). Never put it in `EXPO_PUBLIC_*` variables or commit it to the repo.
- `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (optional) — enables the shared staff AI service used by the "Shared OpenRouter" card in the Account tab.

`EXPO_PUBLIC_API_URL` is committed in `eas.json` for all build profiles (development, preview, production), so EAS cloud builds will reach the backend without needing `mobile/.env`. Override it per-build by setting the env var in your EAS project settings, or by editing `eas.json` if you point the mobile app at a different backend (e.g. a staging URL).
