# Despliegue en Vercel — OptiSave Panel Comercial

El frontend estático (`index.html`, `app.js`, `styles.css`, `assets/`) y la API Fastify se despliegan juntos en un solo proyecto Vercel.

- Sitio: `https://tu-proyecto.vercel.app`
- API: `https://tu-proyecto.vercel.app/api/*` (por ejemplo `/api/health`, `/api/auth/login`)

## 1. Requisitos

- Cuenta en [Vercel](https://vercel.com)
- MongoDB Atlas con la base ya sembrada (`npm run seed:config` y usuarios)
- Vercel CLI (opcional): `npm i -g vercel`

## 2. Variables de entorno en Vercel

En el dashboard del proyecto → **Settings → Environment Variables**:

| Variable       | Descripción                          |
|----------------|--------------------------------------|
| `MONGODB_URI`  | URI de MongoDB Atlas                 |
| `JWT_SECRET`   | Secreto largo para tokens JWT        |
| `CORS_ORIGIN`  | (Opcional) URL del sitio en Vercel   |

Copia los valores de `optisave-comercial-api/.env` (nunca subas `.env` al repo).

## 3. Desplegar

Desde la raíz del proyecto:

```bash
cd "f:\Programathon\.atomlogic\optisave_app marketing"
vercel
```

La primera vez te pedirá iniciar sesión y confirmar el directorio. Para producción:

```bash
vercel --prod
```

También puedes conectar el repo en [vercel.com/new](https://vercel.com/new): **Root Directory** = raíz del proyecto (donde está `vercel.json`).

## 4. Verificar

1. Abre `https://TU-URL.vercel.app/api/health` → debe responder `{"status":"ok"}`
2. Abre el panel en `https://TU-URL.vercel.app` e inicia sesión
3. En **Configuración → Recargar desde BD** confirma que llega la config de Mongo

## 5. Desarrollo local (sin cambios)

```bash
# Terminal 1 — API
cd optisave-comercial-api
npm run dev

# Terminal 2 — Frontend
cd ..
npx serve . -l 5000
```

En local, `app.js` sigue usando `http://localhost:3000` automáticamente.

## 6. Seeds y jobs

Los scripts de seed y jobs (`seed:config`, `generarDeclaraciones`) se ejecutan **en tu máquina** apuntando a la misma `MONGODB_URI` de Atlas, no en Vercel.

## Estructura relevante

```
/
├── index.html, app.js, styles.css, assets/
├── api/index.js              ← función serverless (Fastify)
├── vercel.json               ← rewrites /api → función
└── optisave-comercial-api/
    └── src/app.js            ← buildApp() compartido local + Vercel
```
