# Raisen Investments Ltd

FactoryOS is a web app, not a desktop-only app. It runs in a browser and shares one central data store through the backend, so multiple devices see the same records.

## Run locally

1. Install Node.js 18 or newer.
2. Open this folder in a terminal.
3. Run `npm install`.
4. Run `npm run dev` to start the frontend and backend together.

## Production mode

1. Run `npm run build`.
2. Run `npm start` to serve the built app and API from the backend on port 4000.
3. Set real values for `JWT_SECRET` and all role password env vars before using `NODE_ENV=production`; the server now refuses placeholder defaults in production.

## Data storage

Shared data is stored in `server/data/raisen-db.json`.

## Security notes

The backend uses JWT login, Helmet, CORS restrictions, and rate limiting.
Change the default passwords and JWT secret in `.env` before real company use.

## Testing

1. Run `npm test` for the frontend Vitest checks.
2. Run `npm run check:ui` for the browser accessibility/performance check.
3. Run `npm run loadtest:api` for the API load test.
4. Run `npm run security:scan` for the deployed-build security scan.
5. Run `npm run smoke:api` to start a temporary API instance and verify auth plus store read/write/delete flows.

Default seeded passwords:

- Manager: `Manager@123`
- Owner: `Owner@123`
- Supervisor: `Supervisor@123`
- Sales: `Sales@123`
- HR: `Hr@123`
- Maintenance: `Maintenance@123`
