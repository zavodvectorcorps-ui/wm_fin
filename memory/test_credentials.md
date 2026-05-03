# Test Credentials

## Superadmin
- **Login:** admin
- **Password:** 220066mm

## Demo (read-only)
- **Endpoint:** `POST /api/auth/demo-login` (no body, no password)
- Returns JWT with `role=demo`. Backend middleware blocks POST/PUT/PATCH/DELETE with HTTP 403.
- Public entry point: `/demo` page → button "Войти в демо".
