# R-BISO LAFIYAR-NOMA V4

**R-BISO LAFIYAR-NOMA** is a mobile-first crop disease screening and advisory app branded for **R-BISO AGRICULTURAL PRODUCTS ENTERPRISE**.

## Included
- Maize, tomato, rice, groundnut and soybean
- Photo capture/upload
- AI image screening through a server-side OpenAI API key
- Manual symptom checker
- Disease library
- English / Hausa UI
- Farmer profile
- Server scan history
- Simple admin dashboard
- PWA manifest + service worker
- Render deployment configuration

## Local setup

1. Install Node.js 20+.
2. Run:
   `npm install`
3. Copy `.env.example` to `.env`.
4. Set:
   - `OPENAI_API_KEY=your_secret_key`
   - `OPENAI_MODEL=gpt-5.6-luna`
   - `ADMIN_KEY=your_long_random_admin_password`
5. Run:
   `npm start`
6. Open `http://localhost:3000`.

Admin:
`http://localhost:3000/admin`

Health check:
`http://localhost:3000/api/health`

## Render deployment

1. Put the contents of this folder into a GitHub repository.
2. In Render, choose **New → Web Service** and connect the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` = `gpt-5.6-luna`
   - `ADMIN_KEY`
6. Deploy.

Do **not** put the OpenAI API key inside `index.html`, GitHub, or a public file.

## Important production notes

The included JSON files are prototype storage. On a hosted service, filesystem persistence can be limited, so for a real multi-farmer launch use a proper database (for example PostgreSQL) and proper authentication.

Also add:
- HTTPS
- rate limiting
- farmer consent/privacy notice
- stronger admin authentication
- image validation
- verified Nigerian extension guidance
- testing with real field photos
- clear “advisory screening, not definitive diagnosis” wording

Never give pesticide rates or chemical instructions without verifying the product label and local agricultural guidance.
