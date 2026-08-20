# OptiSave Comercial API

Backend Fastify + Mongoose para el sistema integral de comisiones
(vendedores, cartera de clientes, seguimiento, declaraciones de comisión).

## 1. Instalar dependencias

```bash
npm install
```

## 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y pon tu `MONGODB_URI` real (usa la contraseña **rotada**, nunca
la que se compartió antes en chat). Este archivo nunca se sube a git —
ya está en `.gitignore`.

## 3. Inicializar la configuración comercial (precios, tramos, IVA)

Esto crea el documento único `config_activa` en Mongo. Solo se corre a mano,
nunca desde un endpoint público:

```bash
npm run seed:config
```

Para cambiar precios/tramos después, edita los valores directo en
`src/jobs/seedConfigComercial.js` y vuelve a correr el script, o edítalos
directo en MongoDB Compass/Atlas.

## 4. Levantar el servidor

```bash
npm run dev
```

Health check: `GET http://localhost:3000/health`

## 5. Generar declaraciones de comisión (cierre de periodo)

Pensado para correr por cron al cierre de cada trimestre:

```bash
PERIODO=Q1-2026 npm run job:generarDeclaraciones
```

## Endpoints disponibles

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/config-comercial` | Precios y tramos, solo lectura |
| GET | `/vendedores` | Listar vendedores |
| POST | `/vendedores` | Crear vendedor |
| GET | `/vendedores/:id/cartera` | Clientes de un vendedor (`?estado=activo`) |
| GET | `/vendedores/:id/declaraciones` | Declaraciones de comisión (`?periodo=Q1-2026`) |
| POST | `/clientes` | Agregar cliente a la cartera |
| PATCH | `/clientes/:id` | Actualizar cliente |
| GET | `/clientes/:id/interacciones` | Historial de seguimiento |
| POST | `/clientes/:id/interacciones` | Registrar interacción |

## Pendiente antes de producción

- Definir el rango de fechas exacto por `periodo` en `generarDeclaraciones.js`
  (actualmente cuenta clientes sin filtrar por fecha de venta dentro del trimestre).
- Autenticación en las rutas (JWT o API key) — por ahora están abiertas.
- Restringir CORS a tu dominio real en `server.js` en vez de `*`.
- Conectar el frontend vanilla (`index.html`/`app.js`) a estos endpoints en
  vez de a los valores hardcodeados actuales.
