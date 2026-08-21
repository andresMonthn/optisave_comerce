// ===================================================================
//  CONFIGURACIÓN DE LA API
// ===================================================================
const API_BASE_URL = (() => {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    if (host === 'localhost' || host === '127.0.0.1' || host === '') {
        return 'http://localhost:3000';
    }
    return '/api';
})();

// ---------------------------------------------------------------------
// CONTRATO DE API
//
// YA EXISTE en tu backend (confirmado por routes/*):
//   GET   /config-comercial
//   GET   /vendedores
//   GET   /vendedores/:id/cartera?estado=
//   GET   /vendedores/:id/declaraciones?periodo=
//   POST  /clientes { vendedorId, nombreClinica, ..., demoAgendada }
//   PATCH /clientes/:id { demoAgendada, estadoSolicitado, fechaAdquisicionLicencia }
//   GET   /clientes/pendientes-aprobacion  (admin)
//   PATCH /clientes/:id { aprobarSolicitud | rechazarSolicitud }  (admin)
//
// TODAVÍA NO EXISTE — lo necesitas para que el login funcione de verdad:
//   POST /auth/login { usuario, clave }
//     -> 200 { token, rol: 'admin' | 'agente', vendedorId?, nombre }
//     -> 401 si la clave/usuario no coinciden
//   El "token" puede ser cualquier string que luego valides en un
//   preHandler de Fastify en las demás rutas (Authorization: Bearer <token>).
//   Sin ese preHandler, las rutas actuales siguen abiertas — este frontend
//   ya manda el header listo para cuando lo agregues.
// ---------------------------------------------------------------------

const FIELD_MAP = {
    newDoctors: ['doctoresNuevos', 'newDoctors', 'doctoresLicenciaDoctor'],
    desktopSold: ['desktopVendidas', 'desktopSold', 'licenciasDesktop'],
    activeDoctors: ['doctoresActivos', 'activeDoctors'],
    commRate: ['tramoComision', 'commRate', 'porcentajeComision'],
    commDoctor: ['comisionDoctor', 'commDoctor'],
    commDesktop: ['comisionDesktop', 'commDesktop'],
    bonus: ['bono', 'bonus'],
    total: ['total', 'totalAPagar', 'montoTotal'],
};
function readField(obj, key) {
    for (const name of FIELD_MAP[key]) {
        if (obj && obj[name] !== undefined) return obj[name];
    }
    return undefined;
}

// ===================================================================
//  ESTADO GLOBAL / SESIÓN
// ===================================================================
const state = {
    token: null,
    role: null,            // 'admin' | 'agente'
    usuarioNombre: '',
    config: null,
    vendedores: [],
    carteraPorVendedor: {},
    pendientes: [],
    vendedorActualId: null, // para 'agente', su propio vendedorId (viene del login)
    whatif: {
        months: [], // [{ web, desktop, cancelaciones }, ...] índice 0 = mes 1
    },
};

// Aplica un estado visual (ok / warn / error) a un elemento de texto sin
// pisar los colores del tema con estilos en línea.
function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('text-ok', 'text-warn', 'text-error');
    if (kind) el.classList.add(`text-${kind}`);
}
function setSubhead(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('is-ok', 'is-warn', 'is-error');
    if (kind) el.classList.add(`is-${kind}`);
}

function saveSession() {
    sessionStorage.setItem('optisave_session', JSON.stringify({
        token: state.token, role: state.role, usuarioNombre: state.usuarioNombre, vendedorActualId: state.vendedorActualId,
    }));
}
function loadSession() {
    try {
        const raw = sessionStorage.getItem('optisave_session');
        if (!raw) return false;
        const s = JSON.parse(raw);
        Object.assign(state, s);
        return !!state.token;
    } catch { return false; }
}
function clearSession() {
    sessionStorage.removeItem('optisave_session');
    state.token = null; state.role = null; state.usuarioNombre = ''; state.vendedorActualId = null;
}

// Fetch que siempre manda el token — así, en cuanto protejas las rutas en
// el backend, esto ya funciona sin tocar el frontend de nuevo.
async function authFetch(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const res = await fetch(`${API_BASE_URL}${path}`, Object.assign({}, opts, { headers }));
    if (res.status === 401 || res.status === 403) {
        clearSession();
        showLogin('Tu sesión expiró o no tienes permiso. Entra de nuevo.');
        throw new Error('No autorizado');
    }
    return res;
}

// ===================================================================
//  HELPERS DE FORMATO
// ===================================================================
function fmt(v) {
    if (v === undefined || v === null || isNaN(v)) return '$0';
    return '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDec(v) {
    if (v === undefined || v === null || isNaN(v)) return '0%';
    return (v * 100).toFixed(1) + '%';
}
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatContacto(cliente) {
    const c = cliente?.contacto;
    if (!c) return '—';
    if (typeof c === 'string') return c;
    return c.nombre || c.email || c.telefono || '—';
}

function toInputDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function toInputTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildDemoAgendadaISO(fecha, hora) {
    if (!fecha) return null;
    const dt = `${fecha}T${hora || '09:00'}`;
    const d = new Date(dt);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatDemoAgendada(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function formatFecha(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('es-MX');
}

function renderEstadoClienteCell(cliente) {
    if (cliente.estadoSolicitado) {
        return `<span class="status-badge pendiente">Pendiente: ${escapeHtml(cliente.estadoSolicitado)}</span>`;
    }
    return `<span class="status-badge ${escapeHtml(cliente.estado)}">${escapeHtml(cliente.estado)}</span>`;
}

function currentPeriodo() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function getDoctorPrice() { return state.config?.precios?.doctorMensual || 0; }
function getDesktopPrice() { return state.config?.precios?.desktopAnual || 0; }
function getDesktopFixedComm() { return state.config?.precios?.desktopComisionFija || 0; }
function getVatRate() { return state.config?.ivaRate || 0; }

function formatTierRange(from, to) {
    const hi = Number(to);
    const lo = Number(from);
    if (hi >= 9999) return `${lo}+`;
    if (lo === hi) return `${lo}`;
    return `${lo}–${hi}`;
}

function lookupCommission(count) {
    if (!state.config?.tramosComision?.length) return 0;
    const n = Number(count);
    if (isNaN(n) || n < 0) return 0;
    const tiers = [...state.config.tramosComision].sort((a, b) => a.from - b.from);
    for (const tier of tiers) {
        if (n >= tier.from && n <= tier.to) return tier.rate;
    }
    return 0;
}

function lookupBonus(count) {
    if (!state.config?.tramosBono?.length) return 0;
    const n = Number(count);
    if (isNaN(n) || n < 0) return 0;
    const tiers = [...state.config.tramosBono].sort((a, b) => a.from - b.from);
    for (const tier of tiers) {
        if (n >= tier.from && n <= tier.to) return tier.amount;
    }
    return 0;
}

function isQuarterEndPeriodo(periodo) {
    const month = parseInt(String(periodo || '').split('-')[1], 10);
    return !isNaN(month) && month > 0 && month % 3 === 0;
}

// ===================================================================
//  LOGIN
// ===================================================================
function showLogin(errorMsg) {
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginError').textContent = errorMsg || '';
}

async function doLogin() {
    const usuario = document.getElementById('loginUsuario').value.trim();
    const clave = document.getElementById('loginClave').value;
    const errEl = document.getElementById('loginError');
    if (!usuario || !clave) {
        errEl.textContent = 'Ingresa usuario y clave.';
        return;
    }
    errEl.textContent = 'Verificando…';
    try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, clave }),
        });
        if (!res.ok) {
            errEl.textContent = 'Usuario o clave incorrectos.';
            return;
        }
        const data = await res.json();
        state.token = data.token || 'sin-token';
        state.role = data.rol === 'admin' ? 'admin' : 'agente';
        state.usuarioNombre = data.nombre || usuario;
        state.vendedorActualId = data.vendedorId || null;
        saveSession();
        await afterLogin();
    } catch (err) {
        console.error('Error en login:', err);
        errEl.textContent = 'No se pudo conectar con el servidor de autenticación.';
    }
}

function doLogout() {
    clearSession();
    document.getElementById('loginUsuario').value = '';
    document.getElementById('loginClave').value = '';
    showLogin('');
}

async function afterLogin() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    const badge = document.getElementById('sessionBadge');
    badge.style.display = 'inline-block';
    badge.textContent = `${state.usuarioNombre} · ${state.role === 'admin' ? 'Administrador' : 'Agente'}`;
    document.getElementById('logoutBtn').style.display = 'inline-block';

    const isAgente = state.role === 'agente';
    document.getElementById('panelAdmin').style.display = isAgente ? 'none' : 'block';
    document.getElementById('panelVendedor').style.display = isAgente ? 'block' : 'none';

    try {
        await loadConfigComercial();
        if (isAgente) {
            if (!state.vendedorActualId) {
                setSubhead(document.getElementById('subheadStatus'),
                    'Tu usuario no tiene un vendedor asociado. Contacta al administrador.', 'warn');
                return;
            }
            await loadCartera(state.vendedorActualId);
            renderMisClientes();
            await renderAgentCarteraReal();
        } else {
            await loadVendedores();
            await loadTodasLasCarteras();
            await loadPendientesAprobacion();
            renderVendedoresTable();
            renderPendientesTable();
            await recalcResumenGeneral();
            setupWhatifSimulator();
        }
    } catch (err) {
        // el error ya se muestra en el subhead
    }
}

// ===================================================================
//  CONFIG COMERCIAL
// ===================================================================
async function loadConfigComercial() {
    const statusEl = document.getElementById('subheadStatus');
    try {
        const res = await authFetch('/config-comercial');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.config = await res.json();
        if (state.role === 'admin') renderConfigReadonly(state.config);
        setSubhead(statusEl, 'Configuración cargada desde la BD · precios, comisiones y bonos en tiempo real', 'ok');
        refreshCalculationsFromConfig();
    } catch (err) {
        console.error('Error al cargar /config-comercial:', err);
        setSubhead(statusEl, 'No se pudo conectar con el servidor. Verifica que la API esté corriendo en ' + API_BASE_URL, 'error');
        throw err;
    }
}

async function refreshConfigComercial() {
    const btn = document.getElementById('refreshConfigBtn');
    if (btn) btn.disabled = true;
    try {
        await loadConfigComercial();
    } finally {
        if (btn) btn.disabled = false;
    }
}

function refreshCalculationsFromConfig() {
    if (!state.config) return;
    if (state.role === 'admin') {
        renderWhatifTable();
        if (state.vendedores.length) recalcResumenGeneral();
    } else if (state.vendedorActualId) {
        renderAgentCarteraReal();
    }
}

function renderConfigReadonly(config) {
    document.getElementById('doctorPrice').textContent = fmt(config.precios.doctorMensual);
    document.getElementById('desktopPrice').textContent = fmt(config.precios.desktopAnual);
    document.getElementById('desktopCommissionFixed').textContent = fmt(config.precios.desktopComisionFija);
    document.getElementById('vatRate').textContent = fmtDec(config.ivaRate);

    const comisionTiers = [...config.tramosComision].sort((a, b) => a.from - b.from);
    document.getElementById('tramosComisionDisplay').innerHTML = comisionTiers.map(t =>
        `<span><span class="tier-range">${formatTierRange(t.from, t.to)}</span> → ${(t.rate * 100).toFixed(0)}%</span>`
    ).join('');

    const bonoTiers = [...config.tramosBono].sort((a, b) => a.from - b.from);
    document.getElementById('tramosBonoDisplay').innerHTML = bonoTiers.map(t =>
        `<span><span class="tier-range">${formatTierRange(t.from, t.to)} doctores activos</span> → ${fmt(t.amount)}</span>`
    ).join('');

    const metaEl = document.getElementById('configUpdatedMeta');
    if (metaEl) {
        const when = config.updatedAt || config.vigenteDesde;
        metaEl.textContent = when
            ? `Valores vigentes desde la BD · última actualización ${new Date(when).toLocaleString('es-MX')}${config.updatedBy ? ` · ${config.updatedBy}` : ''}`
            : 'Valores cargados desde la BD (documento config_activa).';
    }
}

// ===================================================================
//  VENDEDORES (admin — solo lectura, alta se hace en BD)
// ===================================================================
async function loadVendedores() {
    try {
        const res = await authFetch('/vendedores');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.vendedores = await res.json();
    } catch (err) {
        console.error('Error al cargar /vendedores:', err);
        state.vendedores = [];
    }
}

function renderVendedoresTable() {
    const tbody = document.getElementById('vendedoresBody');
    if (!tbody) return;
    tbody.innerHTML = state.vendedores.map(v => {
        const count = (state.carteraPorVendedor[v._id] || []).length;
        const cuenta = v.cuenta; // { usuario, activo } o null si no tiene cuenta de acceso
        const accesoHtml = cuenta
            ? `<span class="status-badge ${cuenta.activo ? 'activo' : 'cancelado'}">${cuenta.activo ? 'Activo' : 'Desactivado'}</span>`
            : `<span class="status-badge prospecto">Sin cuenta</span>`;
        const toggleLabel = cuenta && cuenta.activo ? 'Desactivar acceso' : 'Activar acceso';

        return `<tr>
            <td>${escapeHtml(v.nombre)}</td>
            <td>${escapeHtml(cuenta?.usuario || v.email || '—')}</td>
            <td>${accesoHtml}</td>
            <td>${count}</td>
            <td>
                ${cuenta ? `<button class="mini-btn" data-toggle-acceso="${v._id}" data-activo="${cuenta.activo}">${toggleLabel}</button>
                <button class="mini-btn" data-cambiar-clave="${v._id}" data-nombre="${escapeHtml(v.nombre)}">Cambiar clave</button>` : ''}
            </td>
        </tr>`;
    }).join('') || `<tr><td colspan="5" class="text-muted">Aún no hay vendedores registrados.</td></tr>`;

    tbody.querySelectorAll('[data-toggle-acceso]').forEach(btn => {
        btn.addEventListener('click', () => toggleAccesoVendedor(btn.dataset.toggleAcceso, btn.dataset.activo !== 'true'));
    });
    tbody.querySelectorAll('[data-cambiar-clave]').forEach(btn => {
        btn.addEventListener('click', () => openClaveDialog(btn.dataset.cambiarClave, btn.dataset.nombre));
    });
}

async function addVendedor() {
    const nombre = document.getElementById('newVendedorNombre').value.trim();
    const email = document.getElementById('newVendedorEmail').value.trim();
    const clave = document.getElementById('newVendedorClave').value;
    const telefono = document.getElementById('newVendedorTelefono').value.trim();
    const statusEl = document.getElementById('vendedorAddStatus');

    if (!nombre || !email) {
        setStatus(statusEl, 'Nombre y correo son obligatorios.', 'error');
        return false;
    }
    if (!clave || clave.length < 6) {
        setStatus(statusEl, 'La clave debe tener al menos 6 caracteres.', 'error');
        return false;
    }
    try {
        const res = await authFetch('/vendedores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, email, clave, telefono }),
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        setStatus(statusEl, 'Agente creado.', 'ok');
        await loadVendedores();
        await loadTodasLasCarteras();
        renderVendedoresTable();
        await recalcResumenGeneral();
        return true;
    } catch (err) {
        console.error('Error al crear vendedor:', err);
        setStatus(statusEl, `No se pudo crear el agente (${err.message}).`, 'error');
        return false;
    }
}

async function toggleAccesoVendedor(vendedorId, nuevoActivo) {
    try {
        const res = await authFetch(`/vendedores/${vendedorId}/acceso`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: nuevoActivo }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await loadVendedores();
        renderVendedoresTable();
    } catch (err) {
        console.error('Error al cambiar acceso:', err);
        alert('No se pudo cambiar el acceso de este agente.');
    }
}

function openClaveDialog(vendedorId, nombre) {
    const dialog = document.getElementById('claveDialog');
    dialog.dataset.vendedorId = vendedorId;
    document.getElementById('claveDialogNombre').textContent = nombre;
    document.getElementById('claveDialogInput').value = '';
    document.getElementById('claveDialogStatus').textContent = '';
    dialog.showModal();
}

async function guardarNuevaClave() {
    const dialog = document.getElementById('claveDialog');
    const vendedorId = dialog.dataset.vendedorId;
    const clave = document.getElementById('claveDialogInput').value;
    const statusEl = document.getElementById('claveDialogStatus');

    if (!clave || clave.length < 6) {
        setStatus(statusEl, 'La clave debe tener al menos 6 caracteres.', 'error');
        return false;
    }
    try {
        const res = await authFetch(`/vendedores/${vendedorId}/clave`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clave }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
    } catch (err) {
        console.error('Error al cambiar clave:', err);
        setStatus(statusEl, 'No se pudo cambiar la clave.', 'error');
        return false;
    }
}

// ===================================================================
//  CARTERA DE CLIENTES
// ===================================================================
async function loadCartera(vendedorId, estado) {
    const qs = estado ? `?estado=${encodeURIComponent(estado)}` : '';
    try {
        const res = await authFetch(`/vendedores/${vendedorId}/cartera${qs}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cartera = await res.json();
        state.carteraPorVendedor[vendedorId] = cartera;
        return cartera;
    } catch (err) {
        console.error(`Error al cargar cartera de ${vendedorId}:`, err);
        state.carteraPorVendedor[vendedorId] = [];
        return [];
    }
}
async function loadTodasLasCarteras() {
    await Promise.all(state.vendedores.map(v => loadCartera(v._id)));
}

async function addCliente() {
    if (!state.vendedorActualId) {
        setStatus(document.getElementById('clienteAddStatus'), 'Tu usuario no tiene un vendedor asociado.', 'error');
        return;
    }
    const nombreClinica = document.getElementById('newClienteNombreClinica').value.trim();
    const contacto = document.getElementById('newClienteContacto').value.trim();
    const especialidad = document.getElementById('newClienteEspecialidad').value.trim();
    const tipoLicencia = document.getElementById('newClienteTipo').value;
    const demoFecha = document.getElementById('newClienteDemoFecha').value;
    const demoHora = document.getElementById('newClienteDemoHora').value;
    const demoAgendada = buildDemoAgendadaISO(demoFecha, demoHora);
    const statusEl = document.getElementById('clienteAddStatus');

    if (!nombreClinica) {
        setStatus(statusEl, 'El nombre de la clínica es obligatorio.', 'error');
        return false;
    }
    try {
        const payload = {
            vendedorId: state.vendedorActualId,
            nombreClinica,
            contacto: contacto ? { nombre: contacto } : undefined,
            especialidad,
            tipoLicencia,
            estado: 'prospecto',
        };
        if (demoAgendada) payload.demoAgendada = demoAgendada;

        const res = await authFetch('/clientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        setStatus(statusEl, 'Cliente agregado como prospecto.', 'ok');
        await loadCartera(state.vendedorActualId);
        renderMisClientes();
        await renderAgentCarteraReal();
        return true;
    } catch (err) {
        console.error('Error al crear cliente:', err);
        setStatus(statusEl, `No se pudo agregar el cliente (${err.message}).`, 'error');
        return false;
    }
}

async function updateClienteGestion(clienteId, body) {
    const statusEl = document.getElementById('estadoDialogStatus');
    try {
        const res = await authFetch(`/clientes/${clienteId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        await loadCartera(state.vendedorActualId);
        renderMisClientes();
        await renderAgentCarteraReal();
        return true;
    } catch (err) {
        console.error('Error al actualizar cliente:', err);
        setStatus(statusEl, err.message || 'No se pudo guardar los cambios.', 'error');
        return false;
    }
}

async function loadPendientesAprobacion() {
    if (state.role !== 'admin') return;
    try {
        const res = await authFetch('/clientes/pendientes-aprobacion');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.pendientes = await res.json();
    } catch (err) {
        console.error('Error al cargar solicitudes pendientes:', err);
        state.pendientes = [];
    }
}

function nombreVendedorDeCliente(vendedorId) {
    const v = state.vendedores.find(x => String(x._id) === String(vendedorId));
    return v ? v.nombre : '—';
}

function renderPendientesTable() {
    const tbody = document.getElementById('pendientesBody');
    if (!tbody) return;
    const pendientes = state.pendientes || [];

    tbody.innerHTML = pendientes.map(c => `
        <tr>
            <td>${escapeHtml(c.nombreClinica)}</td>
            <td>${escapeHtml(nombreVendedorDeCliente(c.vendedorId))}</td>
            <td><span class="status-badge pendiente">${escapeHtml(c.estadoSolicitado)}</span></td>
            <td>${formatFecha(c.fechaAdquisicionLicencia)}</td>
            <td>${formatDemoAgendada(c.demoAgendada)}</td>
            <td>
                <button class="mini-btn" data-aprobar="${c._id}">Aprobar</button>
                <button class="mini-btn" data-rechazar="${c._id}">Rechazar</button>
            </td>
        </tr>
    `).join('') || `<tr><td colspan="6" class="text-muted">No hay solicitudes pendientes.</td></tr>`;

    tbody.querySelectorAll('[data-aprobar]').forEach(btn => {
        btn.addEventListener('click', () => resolverSolicitudCliente(btn.dataset.aprobar, true));
    });
    tbody.querySelectorAll('[data-rechazar]').forEach(btn => {
        btn.addEventListener('click', () => resolverSolicitudCliente(btn.dataset.rechazar, false));
    });
}

async function resolverSolicitudCliente(clienteId, aprobar) {
    try {
        const res = await authFetch(`/clientes/${clienteId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(aprobar ? { aprobarSolicitud: true } : { rechazarSolicitud: true }),
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        await loadPendientesAprobacion();
        await loadTodasLasCarteras();
        renderPendientesTable();
        renderVendedoresTable();
        await recalcResumenGeneral();
    } catch (err) {
        console.error('Error al resolver solicitud:', err);
        alert(err.message || 'No se pudo procesar la solicitud.');
    }
}

function renderMisClientes() {
    const tbody = document.getElementById('misClientesBody');
    if (!tbody) return;
    const filtro = document.getElementById('filtroEstadoCartera')?.value || '';
    let mios = state.carteraPorVendedor[state.vendedorActualId] || [];
    if (filtro === 'pendiente') mios = mios.filter(c => c.estadoSolicitado);
    else if (filtro) mios = mios.filter(c => c.estado === filtro);

    tbody.innerHTML = mios.map(c => `
        <tr>
            <td>${escapeHtml(c.nombreClinica)}</td>
            <td>${escapeHtml(formatContacto(c))}</td>
            <td>${escapeHtml(c.especialidad || '—')}</td>
            <td>${c.tipoLicencia === 'desktop' ? 'Desktop' : 'Doctor'}</td>
            <td>${formatDemoAgendada(c.demoAgendada)}</td>
            <td>${renderEstadoClienteCell(c)}</td>
            <td><button class="mini-btn" data-open-estado="${c._id}">Gestionar</button></td>
        </tr>
    `).join('') || `<tr><td colspan="7" class="text-muted">Aún no has registrado clientes.</td></tr>`;

    tbody.querySelectorAll('[data-open-estado]').forEach(btn => {
        btn.addEventListener('click', () => openEstadoDialog(btn.dataset.openEstado));
    });
}

// ===================================================================
//  DIÁLOGOS (agregar cliente / cambiar estado)
// ===================================================================
function setupDialogs() {
    const addDialog = document.getElementById('addClienteDialog');
    document.getElementById('openAddClienteDialogBtn').addEventListener('click', () => {
        document.getElementById('newClienteNombreClinica').value = '';
        document.getElementById('newClienteContacto').value = '';
        document.getElementById('newClienteEspecialidad').value = '';
        document.getElementById('newClienteTipo').value = 'doctor';
        document.getElementById('newClienteDemoFecha').value = '';
        document.getElementById('newClienteDemoHora').value = '';
        document.getElementById('clienteAddStatus').textContent = '';
        addDialog.showModal();
    });
    document.getElementById('cancelAddClienteBtn').addEventListener('click', () => addDialog.close());
    document.getElementById('saveClienteBtn').addEventListener('click', async () => {
        const ok = await addCliente();
        if (ok) addDialog.close();
    });

    const estadoDialog = document.getElementById('estadoDialog');
    document.getElementById('cancelEstadoBtn').addEventListener('click', () => estadoDialog.close());
    document.getElementById('saveEstadoBtn').addEventListener('click', async () => {
        const clienteId = estadoDialog.dataset.clienteId;
        const demoFecha = document.getElementById('estadoDialogDemoFecha').value;
        const demoHora = document.getElementById('estadoDialogDemoHora').value;
        const solicitud = document.getElementById('estadoDialogSelect').value;
        const fechaLicencia = document.getElementById('estadoDialogFechaLicencia').value;

        const body = {
            demoAgendada: buildDemoAgendadaISO(demoFecha, demoHora),
        };

        if (solicitud) {
            if (!fechaLicencia) {
                setStatus(document.getElementById('estadoDialogStatus'),
                    'Indica la fecha de adquisición de la licencia.', 'error');
                return;
            }
            body.estadoSolicitado = solicitud;
            body.fechaAdquisicionLicencia = fechaLicencia;
        } else if (estadoDialog.dataset.initialSolicitud) {
            body.estadoSolicitado = null;
        }

        const ok = await updateClienteGestion(clienteId, body);
        if (ok) estadoDialog.close();
    });

    const addVendedorDialog = document.getElementById('addVendedorDialog');
    document.getElementById('openAddVendedorDialogBtn').addEventListener('click', () => {
        document.getElementById('newVendedorNombre').value = '';
        document.getElementById('newVendedorEmail').value = '';
        document.getElementById('newVendedorClave').value = '';
        document.getElementById('newVendedorTelefono').value = '';
        document.getElementById('vendedorAddStatus').textContent = '';
        addVendedorDialog.showModal();
    });
    document.getElementById('cancelAddVendedorBtn').addEventListener('click', () => addVendedorDialog.close());
    document.getElementById('saveVendedorBtn').addEventListener('click', async () => {
        const ok = await addVendedor();
        if (ok) addVendedorDialog.close();
    });

    const claveDialog = document.getElementById('claveDialog');
    document.getElementById('cancelClaveBtn').addEventListener('click', () => claveDialog.close());
    document.getElementById('saveClaveBtn').addEventListener('click', async () => {
        const ok = await guardarNuevaClave();
        if (ok) claveDialog.close();
    });
}

function openEstadoDialog(clienteId) {
    const dialog = document.getElementById('estadoDialog');
    const cartera = state.carteraPorVendedor[state.vendedorActualId] || [];
    const cliente = cartera.find(c => String(c._id) === String(clienteId));
    if (!cliente) return;

    dialog.dataset.clienteId = clienteId;
    dialog.dataset.initialSolicitud = cliente.estadoSolicitado || '';
    document.getElementById('estadoDialogClienteNombre').textContent = cliente.nombreClinica;
    document.getElementById('estadoDialogDemoFecha').value = toInputDate(cliente.demoAgendada);
    document.getElementById('estadoDialogDemoHora').value = toInputTime(cliente.demoAgendada);
    document.getElementById('estadoDialogSelect').value = cliente.estadoSolicitado || '';
    document.getElementById('estadoDialogFechaLicencia').value = toInputDate(
        cliente.fechaAdquisicionLicencia || cliente.fechaVenta
    );
    document.getElementById('estadoDialogStatus').textContent = '';
    dialog.showModal();
}

// ===================================================================
//  ESTIMACIÓN EN VIVO (respaldo mientras no exista declaración del cron)
// ===================================================================
function estimateFromCartera(vendedorId, periodo) {
    const mios = state.carteraPorVendedor[vendedorId] || [];
    const newDoctors = mios.filter(c => c.tipoLicencia !== 'desktop' && (c.estado === 'vendido' || c.estado === 'activo')).length;
    const desktopSold = mios.filter(c => c.tipoLicencia === 'desktop' && (c.estado === 'vendido' || c.estado === 'activo')).length;
    const activeDoctors = mios.filter(c => c.tipoLicencia !== 'desktop' && c.estado === 'activo').length;

    const dPrice = getDoctorPrice();
    const dskFixed = getDesktopFixedComm();
    const commRate = lookupCommission(newDoctors);
    const commDoctor = newDoctors * dPrice * commRate;
    const commDesktop = desktopSold * dskFixed;
    const bonus = isQuarterEndPeriodo(periodo) ? lookupBonus(activeDoctors) : 0;
    const total = commDoctor + commDesktop + bonus;

    return { newDoctors, desktopSold, activeDoctors, commRate, commDoctor, commDesktop, bonus, total, esEstimado: true };
}

async function fetchDeclaracion(vendedorId, periodo) {
    try {
        const res = await authFetch(`/vendedores/${vendedorId}/declaraciones?periodo=${encodeURIComponent(periodo)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();
        return list && list.length ? list[0] : null;
    } catch (err) {
        console.error('Error al cargar declaraciones:', err);
        return null;
    }
}

async function getVendedorTotals(vendedorId, periodo) {
    const decl = await fetchDeclaracion(vendedorId, periodo);
    if (decl) {
        return {
            newDoctors: readField(decl, 'newDoctors') ?? 0,
            desktopSold: readField(decl, 'desktopSold') ?? 0,
            activeDoctors: readField(decl, 'activeDoctors') ?? 0,
            commRate: readField(decl, 'commRate') ?? 0,
            commDoctor: readField(decl, 'commDoctor') ?? 0,
            commDesktop: readField(decl, 'commDesktop') ?? 0,
            bonus: readField(decl, 'bonus') ?? 0,
            total: readField(decl, 'total') ?? 0,
            esEstimado: false,
        };
    }
    if (!state.carteraPorVendedor[vendedorId]) await loadCartera(vendedorId);
    return estimateFromCartera(vendedorId, periodo);
}

async function renderAgentCarteraReal() {
    if (!state.config || !state.vendedorActualId) return;

    const periodoInput = document.getElementById('vSimPeriodoInput');
    if (!periodoInput) return;
    if (!periodoInput.value) periodoInput.value = currentPeriodo();

    const periodo = periodoInput.value;
    if (!state.carteraPorVendedor[state.vendedorActualId]) {
        await loadCartera(state.vendedorActualId);
    }

    const cartera = state.carteraPorVendedor[state.vendedorActualId] || [];
    const t = await getVendedorTotals(state.vendedorActualId, periodo);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('vSimTotalClientes', cartera.length);
    set('vSimNewDoctors', t.newDoctors);
    set('vSimDesktopSold', t.desktopSold);
    set('vSimActiveDoctors', t.activeDoctors);
    set('vSimCommRate', t.commRate > 0
        ? (Number(t.commRate) <= 1 ? (t.commRate * 100).toFixed(0) + '%' : t.commRate + '%')
        : '—');
    set('vSimCommDoctor', fmt(t.commDoctor));
    set('vSimCommDesktop', fmt(t.commDesktop));
    set('vSimBono', fmt(t.bonus));
    set('vSimTotal', fmt(t.total));

    const statusEl = document.getElementById('vSimRealStatus');
    const pendientes = cartera.filter(c => c.estadoSolicitado).length;
    const msgBase = t.esEstimado
        ? `Proyección con ${cartera.length} cliente(s) — periodo ${periodo}. Corte día 1 · pago día 5.`
        : `Declaración oficial de ${periodo}. Pago correspondiente al día 5.`;
    setStatus(statusEl,
        pendientes
            ? `${msgBase} Tienes ${pendientes} solicitud(es) pendientes de aprobación del administrador.`
            : msgBase,
        t.esEstimado ? 'warn' : 'ok');

    const tbody = document.getElementById('vSimClientesBody');
    if (!tbody) return;

    tbody.innerHTML = cartera.map(c => `
        <tr>
            <td>${escapeHtml(c.nombreClinica)}</td>
            <td>${escapeHtml(formatContacto(c))}</td>
            <td>${c.tipoLicencia === 'desktop' ? 'Desktop' : 'Web'}</td>
            <td>${formatDemoAgendada(c.demoAgendada)}</td>
            <td>${renderEstadoClienteCell(c)}</td>
            <td>${formatFecha(c.fechaVenta || c.fechaAdquisicionLicencia)}</td>
        </tr>
    `).join('') || `<tr><td colspan="6" class="text-muted">Aún no tienes clientes registrados. Agrega clientes en la pestaña «Mis clientes».</td></tr>`;
}

// ===================================================================
//  TAB "RESUMEN GENERAL" (admin)
// ===================================================================
async function recalcResumenGeneral() {
    if (!state.config) return;
    const periodoInput = document.getElementById('resumenPeriodoInput');
    if (!periodoInput.value) periodoInput.value = currentPeriodo();
    const periodo = periodoInput.value;

    const dPrice = getDoctorPrice();
    const dskPrice = getDesktopPrice();
    const vat = getVatRate();

    let totalNew = 0, totalDesktop = 0, totalCommDoctor = 0, totalCommDesktop = 0, totalBonus = 0, totalPagar = 0, totalGananciaSinIva = 0;
    let rowsHtml = '';

    for (const v of state.vendedores) {
        const t = await getVendedorTotals(v._id, periodo);
        const gananciaSinIva = t.newDoctors * dPrice;
        const gananciaNet = gananciaSinIva - t.commDoctor;
        const avg = t.newDoctors > 0 ? t.commDoctor / t.newDoctors : 0;

        totalNew += t.newDoctors;
        totalDesktop += t.desktopSold;
        totalCommDoctor += t.commDoctor;
        totalCommDesktop += t.commDesktop;
        totalBonus += t.bonus;
        totalPagar += t.total;
        totalGananciaSinIva += gananciaSinIva;

        rowsHtml += `<tr>
            <td>${escapeHtml(v.nombre)}${t.esEstimado ? ' <span class="hint">(estimado)</span>' : ''}</td>
            <td>${escapeHtml(periodo)}</td>
            <td><span class="ro-cell small">${t.newDoctors}</span></td>
            <td><span class="ro-cell small">${t.desktopSold}</span></td>
            <td><span class="ro-cell small">${t.activeDoctors}</span></td>
            <td><span class="ro-cell small">${t.commRate > 0 ? (Number(t.commRate) <= 1 ? (t.commRate * 100).toFixed(0) + '%' : t.commRate + '%') : '—'}</span></td>
            <td><span class="ro-cell small">${fmt(t.commDoctor)}</span></td>
            <td><span class="ro-cell small">${fmt(t.commDesktop)}</span></td>
            <td><span class="ro-cell small">${fmt(t.bonus)}</span></td>
            <td><span class="ro-cell small blue-bg">${fmt(t.total)}</span></td>
            <td><span class="ro-cell small">${fmt(avg)}</span></td>
            <td><span class="ro-cell small">${fmt(gananciaSinIva)}</span></td>
            <td><span class="ro-cell small ${gananciaNet >= 0 ? 'green-bg' : 'amber-bg'}">${fmt(gananciaNet)}</span></td>
        </tr>`;
    }

    document.getElementById('salesBody').innerHTML = rowsHtml || `<tr><td colspan="13" class="text-muted">Aún no hay vendedores registrados.</td></tr>`;

    const avgTotal = totalNew > 0 ? totalCommDoctor / totalNew : 0;
    const totalGananciaNet = totalGananciaSinIva - totalCommDoctor;

    document.getElementById('salesFoot').innerHTML = `
        <tr class="totals-row">
            <td colspan="2" style="text-align:right;font-weight:700;">TOTALES</td>
            <td><span class="ro-cell">${totalNew}</span></td>
            <td><span class="ro-cell">${totalDesktop}</span></td>
            <td>—</td><td>—</td>
            <td><span class="ro-cell">${fmt(totalCommDoctor)}</span></td>
            <td><span class="ro-cell">${fmt(totalCommDesktop)}</span></td>
            <td><span class="ro-cell">${fmt(totalBonus)}</span></td>
            <td><span class="ro-cell blue-bg">${fmt(totalPagar)}</span></td>
            <td><span class="ro-cell">${fmt(avgTotal)}</span></td>
            <td><span class="ro-cell">${fmt(totalGananciaSinIva)}</span></td>
            <td><span class="ro-cell ${totalGananciaNet >= 0 ? 'green-bg' : 'amber-bg'}">${fmt(totalGananciaNet)}</span></td>
        </tr>
        <tr class="totals-row">
            <td colspan="13" class="text-muted" style="text-align:right;padding:6px 12px;">
                Total vendedores: ${state.vendedores.length} · Doctores nuevos: ${totalNew} · Desktop: ${totalDesktop}
            </td>
        </tr>`;

    const doctorRevenue = totalNew * dPrice;
    const desktopRevenue = totalDesktop * dskPrice;
    const totalIncome = doctorRevenue + desktopRevenue;
    const vatAmount = totalIncome * vat;
    const mrr = doctorRevenue + (desktopRevenue / 12);
    const arr = mrr * 12;
    const netProfit = totalIncome - totalPagar;
    const costPercent = totalIncome > 0 ? totalPagar / totalIncome : 0;
    const marginPercent = totalIncome > 0 ? netProfit / totalIncome : 0;

    document.getElementById('bDoctorRevenue').textContent = fmt(doctorRevenue);
    document.getElementById('bDesktopRevenue').textContent = fmt(desktopRevenue);
    document.getElementById('bMRR').textContent = fmt(mrr);
    document.getElementById('bARR').textContent = fmt(arr);
    document.getElementById('bVAT').textContent = fmt(vatAmount);
    document.getElementById('bTotalIncome').textContent = fmt(totalIncome);
    document.getElementById('bCommercialCost').textContent = fmt(totalPagar);
    document.getElementById('bNetProfit').textContent = fmt(netProfit);
    document.getElementById('bCostPercent').textContent = fmtDec(costPercent);
    document.getElementById('bMarginPercent').textContent = fmtDec(marginPercent);

    const statusEl = document.getElementById('semaforoStatus');
    statusEl.classList.remove('text-ok', 'text-warn', 'text-error');
    if (marginPercent >= 0.55) {
        statusEl.innerHTML = '<span class="dot green"></span> <strong>Saludable</strong> (≥55%)';
        statusEl.classList.add('text-ok');
    } else if (marginPercent >= 0.40) {
        statusEl.innerHTML = '<span class="dot amber"></span> <strong>Vigilar</strong> (40–55%)';
        statusEl.classList.add('text-warn');
    } else {
        statusEl.innerHTML = '<span class="dot rose"></span> <strong>Revisar</strong> (&lt;40%)';
        statusEl.classList.add('text-error');
    }

    renderVendedoresTable();
}

// ===================================================================
//  SIMULADOR COMERCIAL (admin) — captura mes a mes
//
//  Entrada editable por mes: ventas Web, Desktop anual, cancelaciones Web.
//  Web recurrente: ingreso = activas × precio mensual; comisión solo sobre
//  ventas nuevas del mes × tramo; bono trimestral sobre activas retenidas.
//  Desktop: ingreso y comisión fija en el mes de la venta.
//  "Sin comisionar aún" = ingreso de la base previa (sin comisión de venta)
//  + neto Desktop del mes.
// ===================================================================

function emptySimMonth() {
    return { web: 0, desktop: 0, cancelaciones: 0 };
}

function ensureWhatifMonths(n) {
    const count = Math.max(1, Math.min(36, n));
    const current = state.whatif.months;
    if (count > current.length) {
        for (let i = current.length; i < count; i++) current.push(emptySimMonth());
    } else if (count < current.length) {
        state.whatif.months = current.slice(0, count);
    }
    return count;
}

let whatifSimBound = false;

function setupWhatifSimulator() {
    if (!state.config) return;
    if (whatifSimBound) {
        renderWhatifTable();
        return;
    }

    const monthsInput = document.getElementById('whatifMonths');
    ensureWhatifMonths(parseInt(monthsInput?.value, 10) || 12);
    renderWhatifTable();

    monthsInput?.addEventListener('change', () => {
        const n = ensureWhatifMonths(parseInt(monthsInput.value, 10) || 1);
        monthsInput.value = n;
        renderWhatifTable();
    });

    document.getElementById('whatifResetBtn')?.addEventListener('click', () => {
        const n = ensureWhatifMonths(parseInt(monthsInput.value, 10) || 1);
        state.whatif.months = Array.from({ length: n }, () => emptySimMonth());
        renderWhatifTable();
    });

    whatifSimBound = true;
}

function computeWhatifRows() {
    const dPrice = getDoctorPrice();
    const dskPrice = getDesktopPrice();
    const dskFixed = getDesktopFixedComm();

    let activasPrev = 0;
    let ingresoAcumulado = 0;
    let totalWebAcum = 0;
    let totalDesktopAcum = 0;
    const rows = [];

    state.whatif.months.forEach((m, idx) => {
        const mesNum = idx + 1;
        const webSold = Math.max(0, Number(m.web ?? m.doctor) || 0);
        const desktopSold = Math.max(0, Number(m.desktop) || 0);
        const cancelled = Math.max(0, Math.min(Number(m.cancelaciones) || 0, activasPrev + webSold));

        totalWebAcum += webSold;
        totalDesktopAcum += desktopSold;

        const activas = Math.max(0, activasPrev + webSold - cancelled);
        const rate = lookupCommission(webSold);

        const ingresoWeb = activas * dPrice;
        const ingresoDesktop = desktopSold * dskPrice;
        const ingreso = ingresoWeb + ingresoDesktop;
        ingresoAcumulado += ingreso;

        const commWeb = webSold * dPrice * rate;
        const commDesktop = desktopSold * dskFixed;

        const esTrimestre = mesNum % 3 === 0;
        const bono = esTrimestre ? lookupBonus(activas) : 0;

        const pagoVendedor = commWeb + commDesktop + bono;
        const utilidadMes = ingreso - pagoVendedor;

        rows.push({
            mesNum, webSold, desktopSold, cancelled,
            totalWebAcum, totalDesktopAcum, activas, rate,
            ingreso, ingresoAcumulado, commWeb, commDesktop,
            esTrimestre, bono, pagoVendedor, utilidadMes,
        });

        activasPrev = activas;
    });

    return rows;
}

function renderWhatifTable() {
    if (!state.config) return;
    const tbody = document.getElementById('whatifBody');
    const tfoot = document.getElementById('whatifFoot');
    if (!tbody || !tfoot) return;

    const rows = computeWhatifRows();

    tbody.innerHTML = rows.map(r => `
        <tr class="${r.esTrimestre ? 'whatif-quarter-row' : ''}">
            <td><span class="ro-cell small">Mes ${r.mesNum}</span></td>
            <td><input type="number" min="0" step="1" class="whatif-input" data-month="${r.mesNum - 1}" data-field="web" value="${r.webSold}" /></td>
            <td><input type="number" min="0" step="1" class="whatif-input" data-month="${r.mesNum - 1}" data-field="desktop" value="${r.desktopSold}" /></td>
            <td><input type="number" min="0" step="1" class="whatif-input" data-month="${r.mesNum - 1}" data-field="cancelaciones" value="${r.cancelled}" /></td>
            <td><span class="ro-cell small">${r.totalWebAcum}</span></td>
            <td><span class="ro-cell small">${r.totalDesktopAcum}</span></td>
            <td><span class="ro-cell small blue-bg">${r.activas}</span></td>
            <td><span class="ro-cell small">${r.rate > 0 ? (r.rate * 100).toFixed(0) + '%' : '—'}</span></td>
            <td><span class="ro-cell small">${fmt(r.ingreso)}</span></td>
            <td><span class="ro-cell small">${fmt(r.ingresoAcumulado)}</span></td>
            <td><span class="ro-cell small">${fmt(r.commWeb)}</span></td>
            <td><span class="ro-cell small">${fmt(r.commDesktop)}</span></td>
            <td><span class="ro-cell small amber-bg">${fmt(r.pagoVendedor)}</span></td>
            <td><span class="ro-cell small ${r.utilidadMes >= 0 ? 'green-bg' : 'rose-bg'}">${fmt(r.utilidadMes)}</span></td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.whatif-input').forEach(input => {
        input.addEventListener('input', () => {
            const monthIdx = parseInt(input.dataset.month, 10);
            const field = input.dataset.field;
            const val = Math.max(0, parseInt(input.value, 10) || 0);
            if (!state.whatif.months[monthIdx]) state.whatif.months[monthIdx] = emptySimMonth();
            state.whatif.months[monthIdx][field] = val;
            renderWhatifTable();
        });
    });

    const totalWeb = rows.reduce((s, r) => s + r.webSold, 0);
    const totalDesktop = rows.reduce((s, r) => s + r.desktopSold, 0);
    const totalCancel = rows.reduce((s, r) => s + r.cancelled, 0);
    const activasFinal = rows.length ? rows[rows.length - 1].activas : 0;
    const totalIncome = rows.reduce((s, r) => s + r.ingreso, 0);
    const totalCommWeb = rows.reduce((s, r) => s + r.commWeb, 0);
    const totalCommDesktop = rows.reduce((s, r) => s + r.commDesktop, 0);
    const totalBono = rows.reduce((s, r) => s + r.bono, 0);
    const totalPagoVendedor = rows.reduce((s, r) => s + r.pagoVendedor, 0);
    const totalNet = totalIncome - totalPagoVendedor;
    const marginPercent = totalIncome > 0 ? totalNet / totalIncome : 0;
    const mrrFinal = activasFinal * getDoctorPrice();

    tfoot.innerHTML = `
        <tr class="totals-row">
            <td style="text-align:right;font-weight:700;">TOTALES</td>
            <td><span class="ro-cell">${totalWeb}</span></td>
            <td><span class="ro-cell">${totalDesktop}</span></td>
            <td><span class="ro-cell">${totalCancel}</span></td>
            <td><span class="ro-cell">${totalWeb}</span></td>
            <td><span class="ro-cell">${totalDesktop}</span></td>
            <td><span class="ro-cell blue-bg">${activasFinal}</span></td>
            <td>—</td>
            <td><span class="ro-cell">${fmt(totalIncome)}</span></td>
            <td>—</td>
            <td><span class="ro-cell">${fmt(totalCommWeb)}</span></td>
            <td><span class="ro-cell">${fmt(totalCommDesktop)}</span></td>
            <td><span class="ro-cell amber-bg">${fmt(totalPagoVendedor)}</span></td>
            <td><span class="ro-cell ${totalNet >= 0 ? 'green-bg' : 'rose-bg'}">${fmt(totalNet)}</span></td>
        </tr>`;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('wTotalWeb', totalWeb);
    set('wTotalDesktop', totalDesktop);
    set('wTotalCancel', totalCancel);
    set('wActivasFinal', activasFinal);
    set('wTotalIncome', fmt(totalIncome));
    set('wTotalCommWeb', fmt(totalCommWeb));
    set('wTotalCommDesktop', fmt(totalCommDesktop));
    set('wTotalPagoVendedor', fmt(totalPagoVendedor));
    set('wTotalNet', fmt(totalNet));
    set('wMarginPercent', fmtDec(marginPercent));
    set('wMRRFinal', fmt(mrrFinal));
    set('wMRRSub', `mes ${rows.length} · ${activasFinal} activas · bono trim. ${fmt(totalBono)}`);
}

// ===================================================================
//  TABS
// ===================================================================
function setupTabs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const parent = btn.closest('#panelAdmin, #panelVendedor');
            parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            parent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            parent.querySelector(`[data-tab-panel="${btn.dataset.tab}"]`).classList.add('active');
            if (btn.dataset.tab === 'miSimulador') renderAgentCarteraReal();
        });
    });
}

// ===================================================================
//  INIT
// ===================================================================
document.addEventListener('DOMContentLoaded', async function () {
    setupTabs('adminTabs');
    setupTabs('vendedorTabs');
    setupDialogs();

    document.getElementById('loginBtn').addEventListener('click', doLogin);
    document.getElementById('loginClave').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    document.getElementById('logoutBtn').addEventListener('click', doLogout);
    document.getElementById('filtroEstadoCartera').addEventListener('change', renderMisClientes);
    document.getElementById('vSimPeriodoInput')?.addEventListener('change', renderAgentCarteraReal);
    document.getElementById('resumenPeriodoInput').addEventListener('change', recalcResumenGeneral);
    document.getElementById('refreshVendedoresBtn').addEventListener('click', async () => {
        await loadVendedores();
        await loadTodasLasCarteras();
        await loadPendientesAprobacion();
        renderVendedoresTable();
        renderPendientesTable();
        await recalcResumenGeneral();
    });
    document.getElementById('refreshConfigBtn')?.addEventListener('click', refreshConfigComercial);

    if (loadSession()) {
        await afterLogin();
    } else {
        showLogin('');
    }
});