# ShortLink API

A URL shortener backend built with Node.js, Express and SQLite.

## Setup

1. `npm install`
2. Create a `.env` file:
   ```
   PORT=5000
   JWT_SECRET=your_secret
   ```
3. `node index.js`

All responses use this format:
`{ "success": true/false, "message": "...", "data": ... }`

## Endpoints

### POST /api/auth/register
- Purpose: create an account
- Auth: none
- Body: `{ "name": "Glory", "email": "g@mail.com", "password": "secret123" }`
- Success (201): `{ "success": true, "message": "Account created successfully", "data": { "id": 1, "name": "Glory", "email": "g@mail.com" } }`
- Errors: 400 (missing or invalid fields), 409 (email already registered)

### POST /api/auth/login
- Purpose: log in and receive a JWT
- Auth: none
- Body: `{ "email": "g@mail.com", "password": "secret123" }`
- Success (200): `{ "success": true, "message": "Login successful", "data": { "token": "...", "user": { ... } } }`
- Errors: 400 (missing fields), 401 (invalid email or password)

### POST /api/links
- Purpose: create a short link
- Auth: required (`Authorization: Bearer <token>`)
- Body: `{ "originalUrl": "https://example.com/page" }`
- Success (201): `{ "success": true, "message": "Short link created", "data": { "id": 1, "originalUrl": "...", "code": "aB3xYz", "clicks": 0 } }`
- Errors: 400 (invalid URL), 401 (not logged in)

### GET /api/links
- Purpose: list your links
- Auth: required
- Query parameters: `search` (text), `page` (default 1), `limit` (default 10, max 50)
- Success (200): `{ "success": true, "message": "Links fetched", "data": { "links": [...], "page": 1, "limit": 10, "total": 1, "totalPages": 1 } }`
- Errors: 401

### PUT /api/links/:id
- Purpose: change the destination URL of a link
- Auth: required
- Body: `{ "originalUrl": "https://new-url.com" }`
- Success (200): `{ "success": true, "message": "Link updated", "data": { ... } }`
- Errors: 400 (invalid URL), 401, 404 (link not found)

### DELETE /api/links/:id
- Purpose: delete a link
- Auth: required
- Success (200): `{ "success": true, "message": "Link deleted", "data": null }`
- Errors: 401, 404

### GET /:code
- Purpose: redirect to the original URL and count a click
- Auth: none
- Success: 302 redirect
- Errors: 404 (short link not found)