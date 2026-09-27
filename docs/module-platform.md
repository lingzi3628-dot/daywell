# Daywell in-app modules (v1)

## Host architecture

```text
┌──────────────────────── Daywell host ────────────────────────┐
│ Auth/session · navigation · theme · search · AI · reminders  │
│  ┌──────────┐   install/permission flow   ┌───────────────┐  │
│  │ App Store│ ───────────────────────────▶│ Slot registry │  │
│  └──────────┘                             └───────┬───────┘  │
│                                                   │          │
│         ┌──────────── bundled module views ──────▼───────┐  │
│         │ Tasks · Habits · Journal · Notes · Money       │  │
│         │ Each receives a permission-checked HostSDK only │  │
│         └───────────────────┬─────────────────────────────┘  │
└─────────────────────────────┼────────────────────────────────┘
                              ▼
        Host API + user session → PostgreSQL + module data
```

Example manifests and the JSON Schema live in `src/lib/modules/catalog.ts` and `src/lib/modules/manifest.schema.json`. Each built-in manifest declares a `builtin:` entry point, an integrity label, data/settings schemas, permission list, UI slots, routes, and AI tools.

## Runtime and security boundary

The initial catalog contains first-party bundles compiled with the host. Modules receive `HostSDK` capabilities in `src/lib/modules/host-sdk.ts`; they do not receive the auth cookie, database handle, React host state, or raw task data except through a granted SDK method. Storage writes use a user/module namespace, local cache for offline use, and an authenticated host endpoint for sync. The API checks installation, enabled state, and `storage` permission. The SDK checks each task and AI call against the install grant. React error boundaries contain component failures.

This first release deliberately does not execute arbitrary remote JavaScript. A signature string is an integrity identifier for the bundled first-party entry, not public-key verification. Calendar, people, files, recurring task scheduling, voice/photo capture, and external-module sandboxing need host services that do not exist yet; they are not represented as working APIs. Remote third-party bundles should only be enabled after a signed worker/iframe bridge is implemented and reviewed.

## TypeScript host SDK

See `src/lib/modules/host-sdk.ts`. It provides namespaced storage, tasks, AI tools, toasts/confirm, reminder permission, search registration, and command registration. Unsupported host services throw explicit errors instead of exposing fake data.

## Lifecycle and rollback

`POST /api/modules` installs or updates a catalog module, stores the user-granted permissions and version, and can uninstall while retaining data by default. Passing `deleteData: true` opts into deleting its namespace. Catalog releases are immutable bundled versions; updating swaps the selected version metadata after the host build ships the new bundle. The store only opens installed versions, and the slot registry unregisters module UI on uninstall. The API has no remote kill switch yet; the host can disable a module per user.
