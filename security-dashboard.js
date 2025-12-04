// security-dashboard.js
import { supabase, signOut } from './app.js';

// utilidades DOM
const $ = sel => document.querySelector(sel);
const $all = sel => Array.from(document.querySelectorAll(sel));

let chartAccess = null;
let chartAlerts = null;
let gaugeIntegrity = null;
let gaugeEncryption = null;
let gaugeBackup = null;

/* -------------------------------------------
   CHARTS INICIALES
-------------------------------------------- */
function initCharts() {
  // Access attempts
  const ctxA = document.getElementById('chartAccessAttempts').getContext('2d');
  chartAccess = new Chart(ctxA, {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Éxitos', data: [], borderColor:'#34D399', fill:false, tension:0.2 },
      { label: 'Fallos',  data: [], borderColor:'#F87171', fill:false, tension:0.2 }
    ]},
    options: {
      responsive:true,
      plugins:{ legend:{labels:{color:'#cbd5e1'}}},
      scales:{
        x:{ ticks:{color:'#9ca3af'} },
        y:{ ticks:{color:'#9ca3af'} }
      }
    }
  });

  // Alerts bar
  const ctxB = document.getElementById('chartAlerts').getContext('2d');
  chartAlerts = new Chart(ctxB, {
    type:'bar',
    data:{ labels:['Critical','High','Medium','Low'], datasets:[
      { data:[0,0,0,0], backgroundColor:['#ef4444','#f97316','#f59e0b','#60a5fa'] }
    ]},
    options:{
      responsive:true,
      plugins:{legend:{display:false}},
      scales:{
        x:{ ticks:{color:'#9ca3af'} },
        y:{ ticks:{color:'#9ca3af'}, beginAtZero:true }
      }
    }
  });

  // Gauges
  function createGauge(id, value, color){
    return new Chart(document.getElementById(id), {
      type:'doughnut',
      data:{
        labels:['value','rest'],
        datasets:[{ data:[value,100-value], backgroundColor:[color,'#1f2937'] }]
      },
      options:{ cutout:'75%', plugins:{legend:{display:false}} }
    });
  }

  gaugeIntegrity  = createGauge('gaugeIntegrity', 92,  '#34D399');
  gaugeEncryption = createGauge('gaugeEncryption',100, '#60A5FA');
  gaugeBackup     = createGauge('gaugeBackup',    100, '#A78BFA');
}

/* -------------------------------------------
   CARGA DE DATOS DESDE SUPABASE
-------------------------------------------- */
async function loadKpisAndCharts() {

  /* -------- BACKUPS -------- */
  try {
    const { data: backup, error } = await supabase
      .from('backups')
      .select('server_name,last_backup_at,size_bytes,status')
      .order('last_backup_at', { ascending:false })
      .limit(1)
      .single();

    if (error) throw error;

    if (backup) {
      $('#kpiLastBackup').textContent = new Date(backup.last_backup_at).toLocaleString();
      $('#kpiBackupSize').textContent = `${Math.round(backup.size_bytes/1024/1024)} MB · ${backup.status}`;

      const hoursSince = (Date.now() - new Date(backup.last_backup_at)) / 3600000;
      const pct = hoursSince < 3 ? 100 : Math.max(10, 100 - Math.round(hoursSince));

      gaugeBackup.data.datasets[0].data = [pct, 100-pct];
      gaugeBackup.update();
    }
  } catch {
    $('#kpiLastBackup').textContent = 'Sin backups';
    $('#kpiBackupSize').textContent = '-';
  }

  /* -------- SYSTEM LOGS -------- */
  try {
    const { data: logs, error } = await supabase
      .from('system_logs')
      .select('id, created_at, user_id, level, message')   // <--- meta corregido
      .order('created_at', { ascending:false })
      .limit(200);

    if (error) throw error;

    renderEventsTable(logs);
    buildAccessChartData(logs);
    buildAlertsData(logs);

    $('#kpiRecentEvents').textContent = logs.length;
  } catch {
    $('#kpiRecentEvents').textContent = '0';
  }

  $('#kpiServerStatus').textContent = 'Operativo';
  $('#kpiUptime').textContent = '99.12%';
}

/* -------------------------------------------
   TABLA DE EVENTOS
-------------------------------------------- */
function renderEventsTable(logs) {
  const tbody = $('#eventsTableBody');
  tbody.innerHTML = '';

  logs.slice(0,50).forEach(l => {
    const tr = document.createElement('tr');
    const date = new Date(l.created_at).toLocaleString();
    const level = (l.level || '').toLowerCase();

    tr.innerHTML = `
      <td class="py-2 px-3 text-xs text-gray-300">${date}</td>
      <td class="py-2 px-3 text-xs text-gray-300">${l.user_id || 'sistema'}</td>
      <td class="py-2 px-3 text-xs font-medium 
          ${level==='error'?'text-red-400':level==='warning'?'text-yellow-400':'text-green-400'}
      ">${level}</td>
      <td class="py-2 px-3 text-xs text-gray-300">${escape(l.message)}</td>
    `;
    tbody.appendChild(tr);
  });
}

const escape = s => String(s||'').replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));

/* -------------------------------------------
   DATOS PARA LAS GRÁFICAS
-------------------------------------------- */
function buildAccessChartData(logs) {
  const now = Date.now();
  const hours = Array.from({length:24},(_,i)=>{
    const d = new Date(now - ((23-i)*3600000));
    return `${String(d.getHours()).padStart(2,'0')}:00`;
  });

  const ok = Array(24).fill(0);
  const fail = Array(24).fill(0);

  logs.forEach(l=>{
    const diff = Math.floor((now - new Date(l.created_at)) / 3600000);
    if (diff >= 0 && diff < 24) {
      const idx = 23 - diff;
      if (['error','warning'].includes((l.level||'').toLowerCase())) fail[idx]++;
      else ok[idx]++;
    }
  });

  chartAccess.data.labels = hours;
  chartAccess.data.datasets[0].data = ok;
  chartAccess.data.datasets[1].data = fail;
  chartAccess.update();
}

function buildAlertsData(logs) {
  const count = { critical:0, high:0, medium:0, low:0 };

  logs.forEach(l=>{
    const lvl = (l.level || '').toLowerCase();
    if (lvl === 'critical') count.critical++;
    else if (lvl === 'error') count.high++;
    else if (lvl === 'warning') count.medium++;
    else count.low++;
  });

  chartAlerts.data.datasets[0].data = [
    count.critical, count.high, count.medium, count.low
  ];
  chartAlerts.update();

  const risk = count.critical*5 + count.high*2 + count.medium;
  const integrity = Math.max(20, 100 - Math.min(80, risk));

  gaugeIntegrity.data.datasets[0].data = [integrity, 100-integrity];
  gaugeIntegrity.update();
}

/* -------------------------------------------
   REALTIME
-------------------------------------------- */
function subscribeRealtime() {
  supabase.channel('system_logs_changes')
    .on('postgres_changes', { event:'INSERT', table:'system_logs', schema:'public' }, () => {
      loadKpisAndCharts();
    })
    .subscribe();

  supabase.channel('backup_changes')
    .on('postgres_changes', { event:'INSERT', table:'backups', schema:'public' }, () => {
      loadKpisAndCharts();
    })
    .subscribe();
}

/* -------------------------------------------
   HANDLERS & INIT
-------------------------------------------- */
function attachHandlers() {
  $('#btnRefresh').onclick = () => loadKpisAndCharts();
  $('#btnLogout').onclick = async () => {
    await signOut();
    location.href = '/Login.html';
  };
}

async function init() {
  initCharts();
  attachHandlers();
  await loadKpisAndCharts();
  subscribeRealtime();
}

init();
