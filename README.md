# Optisave — Software para consultorios médicos

**Optisave** es un SaaS multi-tenant para consultorios, clínicas pequeñas y profesionales independientes en México y Latinoamérica. Centraliza en una plataforma web lo que muchos resuelven con **papel + Excel + WhatsApp + agenda física**: pacientes, expediente clínico, citas, documentos, inventario, analítica, reservas públicas y recordatorios.

> **Para quién es:** médicos, optometristas, podólogos, ortodoncistas, nutricionistas, psicólogos, especialistas Care (bienestar/estética) y recepción que necesitan digitalizar sin un ERP hospitalario.

Sitio: [https://www.optisave.app](https://www.optisave.app) · Docs: `/docs` · FAQ: `/faq` · Seguridad de datos: `/docs/seguridad-datos`

---

## ¿Qué gana una clínica al contratar Optisave?

### Corto plazo (primeras semanas)

| Beneficio | Qué deja de pasar |
|-----------|-------------------|
| **Menos papel en recepción** | El paciente se registra con **QR** o con el **enlace permanente de reserva** (Google Business). |
| **Agenda visible para todo el equipo** | Citas en vista día, semana y mes; reprogramar **arrastrando** la cita. |
| **Directorio tipo Excel** | En `/home/view` ordenas, filtras e importas/exportas pacientes sin abrir Excel. |
| **Documentos en segundos** | Recetas, constancias y formatos se generan con datos ya capturados. |
| **Acceso multi-dispositivo** | Web app: PC, tablet o celular. Desktop es un producto aparte (opcional). |

### Mediano plazo (1–6 meses)

| Beneficio | Impacto |
|-----------|---------|
| **Historial clínico unificado** | Consultas, diagnósticos, firma y documentos en un expediente por paciente. |
| **Menos inasistencias** | Recordatorios por **WhatsApp** (ventana 12:00–18:00 h, México) y, si se contrata, agente conversacional OptiAI. |
| **Inventario integrado** | Stock, ventas y proveedores en `/home/inventario` (incluido según plan). |
| **Analítica e IA** | Métricas del consultorio y **OptiAI** (GPT / Claude / Ollama) sobre datos de la clínica. |
| **Módulos por especialidad** | Pagas y activas solo lo que usas. **1 licencia de módulo = 1 doctor.** |

### Largo plazo (6+ meses)

| Beneficio | Ventaja |
|-----------|---------|
| **Escalar sin cambiar de sistema** | Varios doctores o sedes en la misma cuenta, con roles. |
| **Imagen profesional** | QR, reservas en Maps, documentos y expediente digital. |
| **Datos aislados por clínica** | Multi-tenant con **RLS**: otra clínica no ve tus pacientes. |
| **Crecimiento modular** | Extensiones (Alegra, Google, OptiAI) sin migrar expedientes. |

---

## Funcionalidades destacadas

### 1. Registro con QR y reservas públicas

- **QR de sala de espera** (`/home/qr`): token temporal; el paciente llena datos en el celular.
- **Enlace permanente de reserva** (`/home/reservas`): no caduca como el QR; se pega en Google Business. Flujo público: `/public/reservar/{token}` → `/public/registro-paciente`.
- Auto-registro y citas pasan por RPCs acotadas (no lectura anónima de tablas clínicas).

### 2. Documentos clínicos y NOM-024

- PDFs/imprimibles desde el historial (`historialclinico/.../documents`).
- Persistencia en BD: consultas, documentos, ediciones.
- Prácticas alineadas a **NOM-024-SSA3-2012**: CIE-10, número de expediente, firma al cerrar, **hash SHA-256** del contenido, bitácora `audit_expediente`.
- Conservación declarada: expedientes **mínimo 5 años** (NOM-004); auditoría **mínimo 3 años**.

### 3. Agenda inteligente

- Vistas mes / semana / día, drag & drop, filtros por módulo, doctor y estado.
- Acceso al historial desde la tarjeta de la cita (`/home/agenda`).

### 4. Directorio de pacientes

- Tabla tipo Excel: sort, columnas, tarjetas, CSV/Excel (`/home/view`).
- Alta individual (`/home/crearpaciente`) e importación masiva (datos demográficos).

### 5. Módulos clínicos

| Módulo | Qué cubre |
|--------|-----------|
| **Optometría** | Refracción, recetas ópticas, órdenes de laboratorio, RX. |
| **Podología** | Valoraciones y seguimiento. |
| **Medicina general** | Certificados, consentimientos, documento libre. |
| **Ortodoncia** | Odontograma, plan de tratamiento. |
| **Care** | Clientes y sesiones de bienestar/estética. |
| **Nutrición** | Evaluación nutricional y hábitos (módulo en plataforma). |
| **Psicología** | Consulta psicológica y seguimiento (módulo en plataforma). |

Formularios configurables: `/home/historialclinico/configForms`.

### 6. Optisave Cloud y Optisave Desktop

Dos productos. **No comparten base de datos** (proyectos Supabase distintos).

| | **Cloud** (este repo, `apps/web`) | **Desktop** |
|---|-----------------------------------|-------------|
| Acceso | Navegador | Instalación Windows 10/11 |
| Datos | Supabase Cloud | Supabase local + respaldos del producto Desktop |
| Licencia | Plan mensual/anual por módulos | Licencia de adquisición (cotización) |
| Marketing | [optisave.app](https://www.optisave.app) | `/desktop` (descarga con sesión) |

El **offline-first** de la web (IndexedDB / Dexie) es un **mecanismo técnico**: si se cae internet, la consulta puede seguir y luego sincroniza. No es el producto Desktop. Los datos locales viven en ese equipo: usar PCs de la clínica y cerrar sesión.

### 7. WhatsApp, OptiAI e inventario

**Recordatorios WhatsApp** (integrado, con límites):

- Vincular el número con QR (Baileys / instancia del consultorio).
- Envíos automáticos **12:00–18:00 h** (México).
- Optisave no responde por el contenido enviado desde la cuenta vinculada.

**Agente OptiAI / bot de citas** (extensión):

- Motor TypeScript en `apps/web/app/home/(user)/optiai/_lib/engine/` (OpenAI, Anthropic u Ollama).
- Chat en Analytics/Home y webhook WhatsApp.
- La carpeta raíz `OptiAI/` (Python/FastAPI) está **deprecada**; no hay que levantarla.
- RAG: botón **Vectorizar BD** en Extensiones. No hay cron de reindexación automática.

**Inventario:** `/home/inventario` (stock, ventas, proveedores).

### 8. Extensiones (`/home/extensiones`)

Optisave no vende esas APIs: el consultorio conecta lo que ya contrató.

| Conector | Estado |
|----------|--------|
| **Alegra** | Vivo — timbrado CFDI desde cobros (PAC del cliente). |
| **Google Reservas** | Vivo — enlace permanente hacia Optisave. |
| **Google Reviews** | Vivo — reseñas en la página pública de reserva. |
| **OptiAI** | Vivo — llaves del proveedor del consultorio + vectorizar BD. |
| **Google Maps Booking (Actions Center)** | Próximamente. |
| **WhatsApp Cloud (API Meta oficial)** | Próximamente (hoy el canal operativo es Baileys). |

---

## Seguridad y privacidad (estado actual)

La clínica es **responsable del tratamiento** (LFPDPPP); Optisave es **encargado**. El consentimiento del paciente se documenta en el alta. Detalle: `/docs/seguridad-datos`, `/privacy-policy`, Términos cláusula 3.4.

| Control | Qué hace |
|---------|----------|
| **RLS (PostgreSQL / Supabase)** | Cada fila clínica va ligada a la cuenta. Otra clínica no lee tus pacientes. El rol `anon` no tiene tablas clínicas; QR/reservas usan funciones acotadas + token. |
| **Auth** | Email/contraseña u OAuth Google. MFA disponible; obligatorio para super admin. `/home` exige sesión. |
| **RBAC** | Owner, miembros, permisos; **1 licencia de módulo = 1 doctor**. |
| **CSRF + CSP** | Middleware CSRF; CSP en producción (Nosecone). |
| **Trusted Types** | En producción, HTML/scripts inyectados pasan por política: se recortan `<script>`, iframes y `on*`; se rechaza `eval` / `new Function` (salvo JSON-LD). |
| **Aviso en consola** | Banner anti self-XSS. Pegar scripts de terceros está prohibido. |
| **Baneo** | No es automático por abrir DevTools. Un Super Admin puede banear desde `/admin`. Las violaciones de Trusted Types/CSP se registran en `/api/security/violations`. |
| **Cifrado** | TLS 1.2+ en tránsito; cifrado en reposo de Supabase (no campo a campo). |
| **Onboarding legal** | Aceptación de Términos, Aviso y responsabilidad del suscriptor (versión `2026-08-17`). |

Soporte oficial **nunca** pide pegar código en la consola.

---

## Mapa del panel autenticado — `apps/web/app/home/(user)`

| Carpeta | Ruta | Qué resuelve |
|---------|------|----------------|
| `page.tsx` | `/home` | Dashboard. |
| `view/` | `/home/view` | Directorio de pacientes (tabla Excel). |
| `crearpaciente/` | `/home/crearpaciente` | Alta de paciente. |
| `buscarpaciente/` | `/home/buscarpaciente` | Búsqueda global. |
| `historialclinico/` | `/home/historialclinico/[id]` | Expediente, consultas, documentos, `configForms`. |
| `agenda/` | `/home/agenda` | Citas mes/semana/día + drag & drop. |
| `qr/` | `/home/qr` | QR temporal de auto-registro. |
| `reservas/` | `/home/reservas` | Enlace permanente + branding para Google. |
| `inventario/` | `/home/inventario` | Stock, ventas, proveedores. |
| `analytics/` | `/home/analytics` | Métricas clínicas (+ OptiAI). |
| `AnaliticsCare/` | `/home/AnaliticsCare` | Analítica Care. |
| `recordatorios/` | `/home/recordatorios` | WhatsApp recordatorios. |
| `whatsapp/` | `/home/whatsapp` | Panel cuando hay instancia vinculada. |
| `extensiones/` | `/home/extensiones` | Alegra, Google, OptiAI. |
| `business/` | `/home/business` | Negocio, horarios, branding. |
| `settings/` | `/home/settings` | Perfil y doctores (cupo de licencias). |
| `account/` | `/home/account` | Cuenta, MFA, membresía. |
| `billing/` | `/home/billing` | Stripe: planes y módulos. |
| `clientes/` + `crearcliente/` | `/home/clientes` | Clientes Care. |
| `sessions/` | `/home/sessions/[id]` | Sesiones Care. |
| `redireccion-paciente/` | flujo post-QR | Puente a registro público. |
| `_lib/` | — | Servicios + `offline/` (IndexedDB). |

Sitio público relevante: `(marketing)/` (landing, pricing, blog, `/docs`, `/faq`, legal), `/public/registro-paciente`, `/public/reservar/[token]`.

---

## Documentos médicos: quién es responsable

| Actor | Responsabilidad |
|-------|-----------------|
| **Profesional** | Contenido clínico, diagnóstico, veracidad y revisión antes de entregar. |
| **Clínica** | NOM-004/024, consentimientos, privacidad (responsable LFPDPPP). |
| **Optisave** | Plantillas, autocompletado, almacenamiento, PDF y trazabilidad; **no** sustituye criterio médico. |
| **Firma en pantalla** | Apoyo visual; validez según regulación aplicable. |

Plantillas: medicina general, optometría, podología, ortodoncia (en `historialclinico/.../documents/templates/`).

---

## Limitaciones actuales

| Área | Limitación |
|------|------------|
| **CFDI** | No es un PAC propio. El timbrado va por **Alegra** (extensión) con la cuenta del consultorio. Stripe cobra la suscripción Optisave, no los ingresos clínicos. |
| **WhatsApp recordatorios** | QR de vinculación; ventana 12:00–18:00 h; sin responsabilidad por uso indebido del número. |
| **WhatsApp Cloud oficial** | Aún no; el canal actual es Baileys. |
| **OptiAI** | Requiere API key del consultorio y vectorizar BD a mano. `OptiAI/` Python no está en uso. |
| **Cloud** | Internet para operación normal. Offline es caché local, no un servidor en el consultorio. |
| **App nativa** | Web responsive; no hay iOS/Android en tiendas. |
| **Licencias** | 1 módulo = 1 doctor; sin licencia no hay formularios de esa especialidad. |
| **Cloud vs Desktop** | Supabase distintos; migración no automática. |
| **NOM-024 / LFPDPPP** | Controles técnicos en producto; el cumplimiento ante autoridad es de la clínica. |
| **Migración histórica** | Import CSV demográfico; el expediente en papel no se escanea solo. |
| **Terceros** | Supabase, Vercel, Stripe, Baileys, Alegra, Google, Meta. |
| **Trusted Types** | Efectivo en Chromium (Chrome/Edge). Firefox/Safari no lo aplican igual. |

---

## Ficha técnica

| Capa | Tecnología |
|------|------------|
| **App** | Next.js (App Router), React 19, Tailwind, Turbo + pnpm workspaces |
| **Datos** | Supabase (PostgreSQL, Auth, Storage, Realtime) + RLS |
| **Pagos** | Stripe |
| **Offline web** | Dexie / IndexedDB (`_lib/offline/`) |
| **CMS marketing** | Keystatic (`/content`) |
| **IA** | OptiAI TypeScript (OpenAI / Anthropic / Ollama) |
| **Despliegue** | Vercel |
| **Roles** | Propietario, miembros, doctor, recepción (según workspace) |

Node `>= 18.18`. Package manager: **pnpm 10**.

---

## Guía de inicio rápido (desarrollo)

### 1. Sincronizar con GitHub (opcional y destructivo)

Esto **borra cambios locales no guardados**:

```bash
git fetch origin
git reset --hard origin/main
```

### 2. Variables de entorno (Vercel)

```bash
pnpm dlx vercel link
pnpm dlx vercel env pull .env.local
```

En PowerShell, copia a la app web:

```powershell
Copy-Item .env.local apps/web/.env.local
```

Además de Supabase/Stripe, suele hacer falta:

```env
CMS_CLIENT=keystatic
NEXT_PUBLIC_KEYSTATIC_CONTENT_PATH=content/
NEXT_PUBLIC_SITE_URL=https://www.optisave.app
```

En producción el CSP estricto (y Trusted Types) se activa salvo `ENABLE_STRICT_CSP=false`.

### 3. Levantar el proyecto

```bash
pnpm dev
```

App en [http://localhost:3000](http://localhost:3000).

| Ruta | Descripción |
|------|-------------|
| `/` | Landing |
| `/docs` | Documentación (incluye `/docs/seguridad-datos`) |
| `/faq` | Preguntas frecuentes |
| `/home` | Dashboard (sesión) |
| `/home/view` | Pacientes |
| `/home/agenda` | Agenda |
| `/home/extensiones` | Conectores |
| `/home/reservas` | Enlace permanente de reserva |

Supabase local (opcional): `pnpm supabase:web:start` / `pnpm supabase:web:reset`.

---

## Estructura del monorepo

```
OpticSave_app/
├── apps/web/                 # Next.js (producto Cloud)
│   ├── app/(marketing)/      # Landing, docs, FAQ, legal, pricing
│   ├── app/home/(user)/      # Panel del consultorio
│   ├── app/public/           # Registro paciente y reservar/{token}
│   ├── app/api/              # Cron, webhooks, chat, security/violations
│   └── supabase/             # Schemas, migraciones, tests RLS
├── packages/                 # @kit/* (auth, ui, billing, supabase)
├── OptiAI/                   # Legacy Python — NO USAR
├── baileys-service/          # Canal WhatsApp (si aplica al deploy)
├── deploy/
└── turbo.json
```

---

## Contribuciones

1. Fork y rama (`git checkout -b feature/…`).
2. Commit y push.
3. Pull Request.

No commitear `.env`, claves ni `service_role`.

---

## Licencia y contacto

- Sitio: [https://www.optisave.app](https://www.optisave.app)
- Contacto: `/contact`
- Docs: `/docs` · FAQ: `/faq` · Privacidad: `/privacy-policy` · Términos: `/terms-of-service`

*Optisave — menos papel, más consultas.*
