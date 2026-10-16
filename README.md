# GameOnix Backend (Vercel + Google Sheets)

This is a standalone Vercel serverless backend. It does not contain your React frontend.

## API routes

- `POST /api/auth/register` — create an account
- `POST /api/auth/login` — sign in with email or username
- `GET /api/auth/me` — return the current signed-in user
- `POST /api/auth/logout` — clear the session cookie
- `GET /api/health` — health check

## 1. Prepare the Google Sheet

Use a tab named `Sheet1` (or set `GOOGLE_SHEET_NAME` to your actual tab name). Row 1 must contain these exact headers in this order:

`username | password_hash | email | name | created_at | comments | likes | favorites | theme`

You can keep the existing columns, but rename the existing `password` header to `password_hash`. Do not put plaintext passwords in the sheet. Existing accounts whose password column contains plaintext are not compatible with this secure login flow; migrate/reset those accounts rather than comparing plaintext passwords.

## 2. Configure Google Cloud

1. Open Google Cloud Console and create/select a project.
2. Enable **Google Sheets API**.
3. Create a service account and generate a JSON key.
4. Copy the service account email and `private_key` value from that JSON.
5. Share the spreadsheet with the service account email as an **Editor**.

Keep the downloaded JSON key private. Never commit it to GitHub or put it in frontend/Vite variables.

## 3. Configure environment variables

Set these in Vercel Project Settings → Environment Variables:

- `GOOGLE_SHEET_ID`: the ID between `/d/` and `/edit` in the spreadsheet URL.
- `GOOGLE_SHEET_NAME`: the exact worksheet/tab name, e.g. `Sheet1`.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: service account email.
- `GOOGLE_PRIVATE_KEY`: the full private key, including BEGIN/END lines. In Vercel, paste the key as one value with newline characters; the code also supports literal `\\n`.
- `SESSION_SECRET`: a cryptographically random secret of at least 32 characters.
- `FRONTEND_URL`: exact frontend origin, without a trailing slash, e.g. `https://your-frontend.example.com`. For local development use `http://localhost:5173`.

After setting or changing environment variables, redeploy the project.

## 4. Deploy backend only

1. Put this folder in its own GitHub repository (recommended), e.g. `backend`.
2. In Vercel, choose **Add New → Project**, import only that backend repository.
3. Framework preset: Other. Root Directory: repository root.
4. Add the environment variables above and deploy.
5. Test `https://YOUR-BACKEND.vercel.app/api/health`.

If you keep the backend folder inside an existing monorepo, import that repository but set Vercel Root Directory to `backend` (or whatever you name this folder). The frontend will not be deployed by this backend project.

## 5. Local development

```bash
npm install
npx vercel dev
```

Copy `.env.example` to `.env` and fill in real values. Do not commit `.env`.

## Request examples

Register:
```json
{
  "name": "Player Name",
  "username": "player123",
  "email": "player@example.com",
  "password": "a-strong-password",
  "confirmPassword": "a-strong-password"
}
```

Login:
```json
{
  "identity": "player123",
  "password": "a-strong-password",
  "rememberMe": true
}
```

For a separate frontend domain, the API uses an HttpOnly Secure cookie with `SameSite=None`. Some browsers block third-party cookies when frontend and API are on unrelated domains. For production reliability, use custom domains under the same site where possible, or consider a managed auth/database service.

## Important limitations

Google Sheets is suitable for a small prototype, not high-traffic production authentication. Simultaneous registrations can race because Sheets does not enforce unique constraints. For a growing public service, use a database with unique indexes and a mature authentication provider.
