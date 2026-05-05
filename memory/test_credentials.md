# Test Credentials

## Superadmin
- **Login:** admin
- **Password:** 220066mm

## Demo (read-only)
- **Endpoint:** `POST /api/auth/demo-login` (no body, no password)
- Returns JWT with `role=demo`. Backend middleware blocks POST/PUT/PATCH/DELETE with HTTP 403.
- Public entry point: `/demo` page → button "Войти в демо".

## Workspace invite flow
- Admin/Owner: visit `/team` → "Пригласить участника" → set email + role → copy link.
- Invitee: open `/invite/{token}` → enter name + password (≥6 chars) → POST `/api/auth/accept-invite`.
- Roles: `owner / admin / manager / accountant / viewer`. Server middleware enforces write restrictions.
