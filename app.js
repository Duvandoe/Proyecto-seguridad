// app.js (ES module) - reemplaza las variables de abajo con tus datos
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://rbhqlaojiadqwshtvbgh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaHFsYW9qaWFkcXdzaHR2YmdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3OTk2MjIsImV4cCI6MjA4MDM3NTYyMn0.N_97-E_K-zdQ86bfSTohZoJHhYGnAkEwJiY0XYdJrBo'; // NO usar service role en frontend

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- UTILIDADES ----------
function $ (sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function toast(msg, type='info') {
  console.log(`[${type}] ${msg}`);
  // si quieres, implementa una UI de toasts aquí
}

// ---------- AUTH: registro y login ----------
export async function registerWithEmail({ email, password, full_name, role='support' }) {
  const { data, error } = await supabase.auth.signUp({ email, password }, { data: { full_name } });
  if (error) throw error;

  // después de signup, crea metadata en app_users (usa el id de auth)
  const userId = data.user?.id;
  if (!userId) return { ok: true, message: 'Verifica el correo para activar cuenta.' };

  // buscar role id
  const { data: rdata, error: rerr } = await supabase.from('roles').select('id').eq('name', role).limit(1).single();
  const role_id = rdata?.id ?? null;

  await supabase.from('app_users').insert({ id: userId, full_name, role_id });
  return { ok: true };
}

export async function signInWithEmail({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) toast(error.message, 'error');
  else toast('Sesión cerrada', 'info');
}

// ---------- SESSION / PROTECT PAGES ----------
export function onAuthStateChanged(callback) {
  const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return () => listener.unsubscribe();
}

export async function requireAuth(redirectTo='/login.html') {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.href = redirectTo;
    throw new Error('no auth');
  }
  return data.session.user;
}

// ---------- DASHBOARD: métricas simples ----------
export async function fetchDashboardMetrics() {
  // simula métricas locales o desde tabla backups
  const { data: metrics, error } = await supabase
    .from('backups')
    .select('server_name, status, last_backup_at, size_bytes')
    .limit(20);

  if (error) throw error;
  return metrics;
}

// ---------- USER MANAGEMENT: CRUD ----------
export async function listUsers() {
  // join app_users + auth.users (metadata)
  const { data, error } = await supabase
    .from('app_users')
    .select('id, full_name, status, created_at, roles(name)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getUser(id) {
  const { data, error } = await supabase.from('app_users').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createUser({ email, password, full_name, role='support' }) {
  // crear usuario en auth
  const { data, error } = await supabase.auth.admin.createUser ? 
     await supabase.auth.admin.createUser({ email }) : // en caso de env con service role (NO en frontend)
     { error: new Error('createUser en frontend no está permitido. Use invite-flow o haga desde backend.') };

  // RECOMENDACIÓN: desde frontend usa signUp o invite email. Operaciones admin require backend.
  if (error) throw error;
  return data;
}

export async function updateUser(id, patch) {
  const { data, error } = await supabase.from('app_users').update(patch).eq('id', id);
  if (error) throw error;
  return data;
}

export async function deleteUser(id) {
  // eliminar metadata; auth.user eliminación requiere Service Role (backend)
  const { data, error } = await supabase.from('app_users').delete().eq('id', id);
  if (error) throw error;
  return data;
}

// ---------- LOGS / SIMULACIÓN BACKUP ----------
export async function pushLog({ user_id=null, level='info', message }) {
  await supabase.from('system_logs').insert({ user_id, level, message });
}

export async function simulateBackup(serverName='Servidor-1') {
  // Inserta o actualiza fila de backups
  const now = new Date().toISOString();
  const size = Math.floor(Math.random()*1e9);
  // upsert por server_name
  const { data, error } = await supabase.from('backups').upsert({
    server_name: serverName,
    status: 'completed',
    last_backup_at: now,
    size_bytes: size
  }, { onConflict: ['server_name'] });

  if (error) throw error;
  await pushLog({ level: 'info', message: `Backup simulado para ${serverName} tamaño ${size}`});
  return data;
}

// ---------- UI HOOKS: conectar HTML con funciones ----------
export function attachLoginHandlers() {
  const btn = $('#login button[type="button"]');
  if (!btn) return;
  btn.onclick = async (e) => {
    const email = $('#login input[type="email"]').value.trim();
    const pass  = $('#login input[type="password"]').value;
    try {
      await signInWithEmail({ email, password: pass });
      toast('Inicio de sesión correcto', 'success');
      // redirige
      window.location.href = '/dashboard.html';
    } catch (err) {
      toast(err.message || 'Error en login', 'error');
    }
  };
}

export function attachRegisterHandlers() {
  const btn = $('#register button[type="button"]');
  if (!btn) return;
  btn.onclick = async () => {
    const full_name = $('#register input[type="text"]').value.trim();
    const email = $('#register input[type="email"]').value.trim();
    const pwd = $('#register input[type="password"]').value;
    try {
      await registerWithEmail({ email, password: pwd, full_name, role: 'support' });
      toast('Registro creado. Revisa tu correo para confirmar.', 'success');
      // opcional: redirigir al login
      window.location.href = '/login.html';
    } catch (err) {
      toast(err.message || 'Error en registro', 'error');
    }
  };
}

export async function renderDashboard() {
  const metrics = await fetchDashboardMetrics();

  // SERVER STATUS
  $("#serverStatus").innerHTML = `
    <div class="flex items-center gap-3">
      <div class="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
      <span class="text-green-400">Operando Correctamente</span>
    </div>
  `;

  // RESOURCE USAGE
  $("#resourceStats").innerHTML = `
    <p>CPU: <span class="font-bold">32%</span></p>
    <p>Memoria: <span class="font-bold">58%</span></p>
    <p>Almacenamiento: <span class="font-bold">72%</span></p>
  `;

  // BACKUP PROGRESS
  $("#backupProgress").innerHTML = `
    <p class="mb-2">Último respaldo: <strong>${new Date().toLocaleTimeString()}</strong></p>
    <div class="w-full bg-gray-700 rounded-full h-3">
      <div class="bg-blue-600 h-3 w-3/4 animate-pulse"></div>
    </div>
  `;

  // SYSTEM LOGS (EJEMPLO)
  $("#systemLogs").textContent = `
[12:01] Backup completado
[11:45] Usuario Admin inició sesión
[11:12] Sincronización con la nube
  `;

  // USER ACTIVITY
  $("#usersActivity").innerHTML = `
    <li class="item">Admin <span class="text-green-400">Activo</span></li>
    <li class="item">Soporte01 <span class="text-yellow-400">En pausa</span></li>
    <li class="item">Auditor <span class="text-red-400">Desconectado</span></li>
  `;
}

export async function createUserFrontend({ full_name, email, password, role }) {
  // 1. Crear en auth (signUp)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name } }
  });

  if (error) throw error;

  const userId = data.user.id;

  // 2. buscar role_id
  const { data: rdata } = await supabase.from('roles')
    .select('id')
    .eq('name', role)
    .single();

  const role_id = rdata?.id ?? null;

  // 3. Insertar datos en tabla app_users
  await supabase.from('app_users').insert({
  id: userId,
  full_name,
  email,
  role_id,
  status: "Activo"
});


  return true;
}

export async function updateUserFrontend(id, { full_name, role }) {
  const { data: rdata } = await supabase.from('roles')
    .select('id')
    .eq('name', role)
    .single();
  
  const role_id = rdata?.id ?? null;

  const { error } = await supabase
    .from('app_users')
    .update({ full_name, role_id })
    .eq('id', id);

  if (error) throw error;
  return true;
}

export async function deleteUserFrontend(id) {
  const { error } = await supabase.from('app_users').delete().eq('id', id);
  if (error) throw error;
  return true;
}

export async function listUsersFrontend() {
  const { data, error } = await supabase
  .from('app_users')
  .select(`
    id,
    full_name,
    email,
    status,
    roles(name)
  `);

  if (error) throw error;
  return data;
}


async function renderUsersTable() {
  const tableBody = document.querySelector("#usersTableBody");
  if (!tableBody) return;

  const { data, error } = await supabase
    .from('app_users')
    .select(`
      id,
      full_name,
      email,
      status,
      roles(name)
    `);

  if (error) {
    console.error("Error al cargar usuarios:", error);
    return;
  }

  tableBody.innerHTML = "";

  data.forEach((u) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="py-2">${u.full_name}</td>
      <td class="py-2">${u.email ?? "Sin correo"}</td>
      <td class="py-2">${u.roles?.name ?? "N/A"}</td>
      <td class="py-2">${u.status ?? "Activo"}</td>

      <td class="py-2 flex gap-2">
        <button class="edit-user flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg transition" data-id="${u.id}">
          Editar
        </button>

        <button class="delete-user  flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1.5 rounded-lg transition" data-id="${u.id}">
          Eliminar
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}


export function initUserCrud() {
  const modal = $('#userModal');
  const closeBtn = $('#closeModal');
  const saveBtn = $('#saveUserBtn');

  const nameInput = $('#modalFullName');
  const emailInput = $('#modalEmail');
  const passInput = $('#modalPassword');
  const roleInput = $('#modalRole');

  let editingId = null;

  // ---- abrir modal crear ----
  $('#openCreateUser').onclick = () => {
    editingId = null;
    $('#modalTitle').textContent = "Crear Usuario";

    emailInput.disabled = false;
    passInput.disabled = false;

    nameInput.value = "";
    emailInput.value = "";
    passInput.value = "";

    modal.classList.remove("hidden");
  };

  // ---- cerrar modal ----
  closeBtn.onclick = () => modal.classList.add("hidden");

  // ---- guardar ----
  saveBtn.onclick = async () => {
    try {
      if (editingId) {
        await updateUserFrontend(editingId, {
          full_name: nameInput.value,
          role: roleInput.value
        });
      } else {
        await createUserFrontend({
          full_name: nameInput.value,
          email: emailInput.value,
          password: passInput.value,
          role: roleInput.value
        });
      }

      modal.classList.add("hidden");
      await renderUsersTable();

    } catch (err) {
      toast(err.message, "error");
    }
  };

  // ---- manejar clicks editar/eliminar ----
  document.body.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    // ---- ELIMINAR ----
    if (btn.classList.contains("delete-user")) {
      const id = btn.dataset.id;

      if (!confirm("¿Eliminar usuario?")) return;
      await deleteUserFrontend(id);
      return renderUsersTable();
    }

    // ---- EDITAR ----
    if (btn.classList.contains("edit-user")) {
      editingId = btn.dataset.id;

      const user = await getUser(editingId);

      nameInput.value = user.full_name;
      emailInput.value = user.email;
      emailInput.disabled = true;
      passInput.disabled = true;

      // buscar el rol
      const roleName = user.roles?.name ?? "support";
      roleInput.value = roleName;

      $('#modalTitle').textContent = "Editar Usuario";
      modal.classList.remove("hidden");
    }
  });
}



// Run automatic attachers based on presence of sections
window.addEventListener('DOMContentLoaded', () => {
  // asume que cada HTML tiene un <main id="login"> o id="register", id="dashboard"...
  if ($('#login')) attachLoginHandlers();
  if ($('#register')) attachRegisterHandlers();
  if ($('#dashboard')) {
    // render placeholders
    renderDashboard();
    // simulate a backup button if exists
    const sim = $('#simulateBackupBtn');
    if (sim) sim.onclick = async () => {
      await simulateBackup('Servidor-Principal');
      toast('Backup simulado');
      renderDashboard();
    };
  }
  if ($('#userManagement')) renderUsersTable();
  if ($('#userManagement')) initUserCrud();
});
