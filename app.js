const QC_DB = (() => {
  const models = ['Liebherr LHM 600','Konecranes RTG 655','ZPMC STS G4','Gottwald HMK 7608','Liebherr STS 3045'];
  const d = [];
  for (let i = 1; i <= 120; i++)
    d.push({ qc: 'QC' + String(i).padStart(3,'0'), model: models[i % 5], speed: +(45 + Math.random() * 10).toFixed(1) });
  return d;
})();

const F = { f1:1.0, f2:0.5, f3:1.9157, f4:1.5326, f5:3.0651, f6:1.9157 };

let S = {
  tab: 'predict', recTab: 'pending',
  operator: localStorage.getItem('ptp_op') || '',
  records: [], loading: false,
  form: { vessel:'', qc:'', cmph:'', f1:0, f2:0, f3:0, f4:0, f5:0, f6:0, f7:0, f8:0 },
  result: null, expandId: null
};

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const addMin = (d, m) => new Date(d.getTime() + m * 60000);
const toHM = d => d.toTimeString().slice(0,5);
const parseT = s => { const [h,m] = s.split(':'); const d = new Date(); d.setHours(+h,+m,0,0); return d; };

async function loadRecords() {
  S.loading = true; renderTab();
  const { data, error } = await sb.from('pilot_booking_records').select('*').order('created_at', { ascending: false });
  S.loading = false;
  if (!error && data) S.records = data;
  renderTab();
}

async function dbInsert(rec) {
  const { error } = await sb.from('pilot_booking_records').insert([rec]);
  if (error) { alert('Save failed: ' + error.message); return false; }
  return true;
}

async function dbUpdate(id, updates) {
  const { error } = await sb.from('pilot_booking_records').update(updates).eq('id', id);
  if (error) { alert('Update failed: ' + error.message); return false; }
  return true;
}

function calcAll(f, cmph, qcSpeed) {
  const base = 60 / cmph;
  let containerMin = 0;
  ['f1','f2','f3','f4','f5','f6'].forEach(id => { containerMin += +(f[id]||0) * base * F[id]; });
  const gantryMin = +(f.f7||0) * 17.5 / qcSpeed;
  const bufferMin = +(f.f8||0);
  return { containerMin, gantryMin, bufferMin, totalMin: containerMin + gantryMin + bufferMin };
}

function classifyQuality(srtTime, actualLastLift) {
  const srt = parseT(srtTime);
  const actual = parseT(actualLastLift);
  const windowStart = addMin(actual, -15);
  return (srt >= windowStart && srt <= actual) ? 'GOOD' : 'NOT QUALITY';
}

function R() {
  const root = document.getElementById('root');
  root.innerHTML = '';
  if (!S.operator) { renderLogin(root); return; }
  renderApp(root);
}

function renderLogin(root) {
  root.innerHTML = `<div class="login-wrap">
  <div class="card" style="text-align:center">
    <i class="ti ti-anchor" style="font-size:32px;color:#185FA5"></i>
    <div style="font-weight:500;font-size:15px;margin:10px 0 4px">PTP Pilot Booking System</div>
    <div style="font-size:12px;color:#6b6b67;margin-bottom:20px">Port of Tanjung Pelepas</div>
    <div class="fi" style="margin-bottom:12px">
      <label>Operator ID</label>
      <div class="iw"><input id="op-inp" placeholder="e.g. OPS01" style="text-transform:uppercase" onkeydown="if(event.key==='Enter')doLogin()"></div>
    </div>
    <button class="btn" onclick="doLogin()">Enter system</button>
  </div></div>`;
}

function renderApp(root) {
  root.innerHTML = `
  <div class="topbar">
    <i class="ti ti-anchor" style="font-size:18px;color:#185FA5"></i>
    <span style="font-weight:500;font-size:14px">PTP Pilot Booking</span>
    <span style="font-size:12px;color:#6b6b67;margin-left:4px">Port of Tanjung Pelepas</span>
    <span style="margin-left:auto;font-size:11px;color:#6b6b67;display:flex;align-items:center;gap:6px">
      <i class="ti ti-user" style="font-size:13px"></i>${S.operator}
      <button class="btn-sm" onclick="doLogout()" style="font-size:11px;padding:3px 8px">change</button>
    </span>
  </div>
  <div class="nav">
    <button class="${S.tab==='predict'?'active':''}" onclick="setTab('predict')"><i class="ti ti-calculator" style="font-size:14px"></i>Prediction</button>
    <button class="${S.tab==='records'?'active':''}" onclick="setTab('records')"><i class="ti ti-clipboard-list" style="font-size:14px"></i>Records<span style="background:#f1f0eb;border-radius:4px;padding:1px 5px;font-size:10px;margin-left:4px">${S.records.length}</span></button>
    <button class="${S.tab==='dashboard'?'active':''}" onclick="setTab('dashboard')"><i class="ti ti-chart-bar" style="font-size:14px"></i>Dashboard</button>
  </div>
  <div id="tab-body"></div>`;
  renderTab();
}

function renderTab() {
  const tb = document.getElementById('tab-body');
  if (!tb) return;
  if (S.tab === 'predict') renderPredict(tb);
  else if (S.tab === 'records') renderRecords(tb);
  else renderDashboard(tb);
}

function renderPredict(tb) {
  const f = S.form;
  const qc = QC_DB.find(q => q.qc === f.qc);
  const qcSpeed = qc ? qc.speed : null;
  const cmph = parseFloat(f.cmph) || 0;
  const base = cmph > 0 ? 60 / cmph : 0;
  const mini = (id, factor) => { const qty = parseFloat(f[id]) || 0; return (cmph && qty) ? (qty * base * factor).toFixed(1) + ' min' : ''; };

  tb.innerHTML = `
  <div class="card">
    <div class="ctitle">Vessel & crane</div>
    <div class="g2" style="margin-bottom:9px">
      <div class="fi">
        <label>Vessel name</label>
        <div class="iw"><input id="f-vessel" value="${f.vessel}" placeholder="e.g. EVER GIVEN" style="text-transform:uppercase" oninput="S.form.vessel=this.value.toUpperCase()"></div>
      </div>
      <div class="fi">
        <label>QC number</label>
        <div class="iw"><select id="f-qc" onchange="onQC(this.value)">
          <option value="">— select —</option>
          ${QC_DB.map(q => `<option value="${q.qc}" ${f.qc===q.qc?'selected':''}>${q.qc}</option>`).join('')}
        </select></div>
        ${qc ? `<div style="font-size:10px;color:#6b6b67;margin-top:2px">${qc.model} · ${qc.speed} m/min</div>` : ''}
      </div>
    </div>
    <div class="g2">
      <div class="fi">
        <label>CMPH — crane moves per hour</label>
        <div class="iw"><input id="f-cmph" type="number" value="${f.cmph}" placeholder="e.g. 28" min="1" max="60" oninput="S.form.cmph=this.value;renderTab()"></div>
        ${cmph > 0 ? `<div style="font-size:10px;color:#6b6b67;margin-top:2px">${(60/cmph).toFixed(2)} min per move</div>` : ''}
      </div>
      <div class="fi">
        <label>QC travel speed (m/min)</label>
        <div class="iw"><input value="${qcSpeed ? qcSpeed.toFixed(1)+' m/min' : '—'}" readonly></div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="ctitle">Container workload</div>
    <div class="g2" style="margin-bottom:9px">
      <div class="fi"><label>Normal container</label>
        <div class="iw"><input type="number" value="${f.f1||0}" min="0" oninput="S.form.f1=+this.value;renderTab()"><div class="utag">Unit</div></div>
        <div style="font-size:10px;color:#6b6b67;margin-top:2px;min-height:14px">${mini('f1',1.0)}</div>
      </div>
      <div class="fi"><label>Twin container</label>
        <div class="iw"><input type="number" value="${f.f2||0}" min="0" oninput="S.form.f2=+this.value;renderTab()"><div class="utag">Unit</div></div>
        <div style="font-size:10px;color:#6b6b67;margin-top:2px;min-height:14px">${mini('f2',0.5)}</div>
      </div>
      <div class="fi"><label>Gearbox</label>
        <div class="iw"><input type="number" value="${f.f3||0}" min="0" oninput="S.form.f3=+this.value;renderTab()"><div class="utag">Unit</div></div>
        <div style="font-size:10px;color:#6b6b67;margin-top:2px;min-height:14px">${mini('f3',1.9157)}</div>
      </div>
      <div class="fi"><label>Hatch cover</label>
        <div class="iw"><input type="number" value="${f.f4||0}" min="0" oninput="S.form.f4=+this.value;renderTab()"><div class="utag">Unit</div></div>
        <div style="font-size:10px;color:#6b6b67;margin-top:2px;min-height:14px">${mini('f4',1.5326)}</div>
      </div>
      <div class="fi"><label>OOG</label>
        <div class="iw"><input type="number" value="${f.f5||0}" min="0" oninput="S.form.f5=+this.value;renderTab()"><div class="utag">Unit</div></div>
        <div style="font-size:10px;color:#6b6b67;margin-top:2px;min-height:14px">${mini('f5',3.0651)}</div>
      </div>
      <div class="fi"><label>Open top</label>
        <div class="iw"><input type="number" value="${f.f6||0}" min="0" oninput="S.form.f6=+this.value;renderTab()"><div class="utag">Unit</div></div>
        <div style="font-size:10px;color:#6b6b67;margin-top:2px;min-height:14px">${mini('f6',1.9157)}</div>
      </div>
    </div>
    <div class="g2">
      <div class="fi"><label>Gantry movement</label>
        <div class="iw"><input type="number" value="${f.f7||0}" min="0" oninput="S.form.f7=+this.value;renderTab()"><div class="utag">Bay</div></div>
        <div style="font-size:10px;color:#6b6b67;margin-top:2px;min-height:14px">${(qcSpeed&&f.f7>0)?((+f.f7*17.5/qcSpeed).toFixed(1)+' min travel'):''}</div>
      </div>
      <div class="fi"><label>Breakdown</label>
        <div class="iw"><input type="number" value="${f.f8||0}" min="0" oninput="S.form.f8=+this.value;renderTab()"><div class="utag">Min</div></div>
        <div style="font-size:10px;color:#6b6b67;margin-top:2px;min-height:14px">Added to total operation time</div>
      </div>
    </div>
  </div>

  <div class="card">
    <button class="btn" onclick="doCalc()">Calculate prediction</button>
    ${S.result ? renderResult() : ''}
  </div>`;
}

function renderResult() {
  const r = S.result;
  return `<div class="sep"></div>
  <div class="ctitle">Prediction result</div>
  <div class="rbox">
    <div class="rrow"><span>Container work time</span><span class="rval">${r.containerMin.toFixed(1)} min</span></div>
    <div class="rrow"><span>Gantry travel time</span><span class="rval">${r.gantryMin.toFixed(1)} min</span></div>
    <div class="rrow"><span>Breakdown / buffer</span><span class="rval">${r.bufferMin.toFixed(0)} min</span></div>
    <div class="rrow" style="font-weight:500"><span>Total operation time</span><span class="rval">${r.totalMin.toFixed(1)} min · ${(r.totalMin/60).toFixed(2)} hrs</span></div>
  </div>
  <div class="hrow">
    <div>
      <div style="font-size:11px;color:#6b6b67">Predicted last lift</div>
      <div style="font-size:10px;color:#6b6b67;margin-top:2px">Current time + total operation time</div>
    </div>
    <span class="bigtime" style="color:#185FA5">${r.lastLiftStr}</span>
  </div>
  <div class="hrow">
    <div>
      <div style="font-size:11px;color:#6b6b67">Call pilot at (SRT)</div>
      <div style="font-size:10px;color:#6b6b67;margin-top:2px">Predicted last lift − 15 min</div>
    </div>
    <span class="bigtime" style="color:#0F6E56">${r.srtStr}</span>
  </div>
  <div class="info-box">SRT is GOOD only if it falls within 15 min before actual last lift. Too early or too late = NOT QUALITY.</div>
  <div class="sep"></div>
  <div class="fi" style="margin-bottom:9px">
    <label>Remarks <span style="font-size:10px;opacity:.6">(optional)</span></label>
    <textarea id="p1-rem" rows="2" placeholder="Any notes or assumptions about this prediction..."></textarea>
  </div>
  <button class="btn btn-green" onclick="savePhase1()">Save prediction record</button>`;
}

function renderRecords(tb) {
  const pending = S.records.filter(r => !r.actual_last_lift_time);
  const completed = S.records.filter(r => r.actual_last_lift_time);
  const list = S.recTab === 'done' ? completed : pending;
  tb.innerHTML = `
  <div style="display:flex;gap:6px;margin-bottom:10px">
    <button class="btn-sm" onclick="S.recTab='pending';renderTab()" style="${S.recTab!=='done'?'border-color:#0F6E56;color:#0F6E56':''}">
      Pending<span style="background:#f1f0eb;border-radius:4px;padding:1px 5px;font-size:10px;margin-left:4px">${pending.length}</span>
    </button>
    <button class="btn-sm" onclick="S.recTab='done';renderTab()" style="${S.recTab==='done'?'border-color:#0F6E56;color:#0F6E56':''}">
      Completed<span style="background:#f1f0eb;border-radius:4px;padding:1px 5px;font-size:10px;margin-left:4px">${completed.length}</span>
    </button>
    <button class="btn-sm" onclick="loadRecords()" style="margin-left:auto">
      <i class="ti ti-refresh" style="font-size:13px;vertical-align:-1px"></i> Refresh
    </button>
  </div>
  <div class="card">
    ${S.loading ? '<div class="loading">Loading records...</div>' :
      !list.length ? '<div class="empty">No records here yet.</div>' :
      list.map(r => `
      <div class="rec-row" onclick="toggleExp('${r.id}')">
        <div>
          <div class="rec-vessel">${r.vessel_name}</div>
          <div class="rec-meta">${r.qc_number} · CMPH ${r.cmph} · ${new Date(r.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} · ${r.operator_id}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge ${r.booking_quality==='GOOD'?'bg':r.booking_quality==='NOT QUALITY'?'bb':'bp'}">${r.booking_quality||'Pending'}</span>
          <i class="ti ti-chevron-${S.expandId===r.id?'up':'down'}" style="font-size:14px;color:#6b6b67"></i>
        </div>
      </div>
      ${S.expandId===r.id ? renderExpanded(r) : ''}`).join('')}
  </div>`;
}

function renderExpanded(r) {
  const hasActual = !!r.actual_last_lift_time;
  return `<div class="expand-panel">
  <div class="ep-title">Phase 1 — prediction</div>
  <div class="rbox" style="margin-bottom:8px">
    <div class="rrow"><span>QC / CMPH</span><span class="rval">${r.qc_number} · ${r.cmph} CMPH</span></div>
    <div class="rrow"><span>Container time</span><span class="rval">${parseFloat(r.container_min).toFixed(1)} min</span></div>
    <div class="rrow"><span>Gantry + breakdown</span><span class="rval">${parseFloat(r.gantry_min).toFixed(1)} + ${r.buffer_min} min</span></div>
    <div class="rrow"><span>Total operation time</span><span class="rval">${parseFloat(r.total_min).toFixed(1)} min</span></div>
    <div class="rrow"><span>Predicted last lift</span><span class="rval" style="color:#185FA5">${r.predicted_last_lift_time}</span></div>
    <div class="rrow"><span>Suggested SRT</span><span class="rval" style="color:#0F6E56">${r.suggested_srt}</span></div>
    ${r.remarks ? `<div class="rrow"><span>Remarks</span><span style="font-size:11px;color:#6b6b67;max-width:55%;text-align:right">${r.remarks}</span></div>` : ''}
  </div>
  ${hasActual ? `
  <div class="ep-title" style="margin-top:10px">Phase 2 — actual</div>
  <div class="rbox">
    <div class="rrow"><span>Actual last lift</span><span class="rval">${r.actual_last_lift_time}</span></div>
    <div class="rrow"><span>Pilot onboard</span><span class="rval">${r.actual_pilot_onboard_time}</span></div>
    <div class="rrow"><span>Actual SRT</span><span class="rval">${r.actual_srt_time}</span></div>
    <div class="rrow"><span>SRT compliance window</span><span class="rval">${r.srt_window_start} – ${r.actual_last_lift_time}</span></div>
    <div class="rrow"><span>Suggested SRT was</span><span class="rval" style="color:${r.booking_quality==='GOOD'?'#0F6E56':'#A32D2D'}">${r.suggested_srt} → ${r.booking_quality}</span></div>
    <div class="rrow"><span>Deviation (pred vs actual LL)</span><span class="rval" style="color:${Math.abs(r.deviation_minutes)<=30?'#0F6E56':'#A32D2D'}">${r.deviation_minutes>0?'+':''}${r.deviation_minutes} min</span></div>
    <div class="rrow"><span>Remarks</span><span style="font-size:11px;color:#6b6b67;max-width:55%;text-align:right">${r.actual_remarks}</span></div>
  </div>` : `
  <div class="ep-title" style="margin-top:10px">Phase 2 — enter actual data</div>
  <div class="g3" style="margin-bottom:9px">
    <div class="fi"><label>Actual last lift</label><div class="iw"><input type="time" id="a-ll"></div></div>
    <div class="fi"><label>Pilot onboard</label><div class="iw"><input type="time" id="a-po"></div></div>
    <div class="fi"><label>Actual SRT</label><div class="iw"><input type="time" id="a-srt"></div></div>
  </div>
  <div class="fi" style="margin-bottom:9px">
    <label>Remarks <span style="font-size:10px;color:#6b6b67">(mandatory)</span></label>
    <textarea id="a-rem" rows="2" placeholder="What happened — early completion, breakdown, vessel delay, etc."></textarea>
  </div>
  <button class="btn btn-green" onclick="savePhase2('${r.id}')">Save actual data</button>`}
  </div>`;
}

function renderDashboard(tb) {
  const done = S.records.filter(r => r.actual_last_lift_time);
  const good = done.filter(r => r.booking_quality === 'GOOD');
  const notQ = done.filter(r => r.booking_quality === 'NOT QUALITY');
  const avgDev = done.length ? Math.round(done.reduce((s,r) => s + Math.abs(r.deviation_minutes), 0) / done.length) : 0;
  const srtRate = done.length ? Math.round(good.length / done.length * 100) : 0;

  tb.innerHTML = `
  <div class="g4" style="margin-bottom:10px">
    <div class="metric"><div class="mlabel">Total predictions</div><div class="mval">${S.records.length}</div><div class="msub">all time</div></div>
    <div class="metric"><div class="mlabel">Validated</div><div class="mval">${done.length}</div><div class="msub">with actual data</div></div>
    <div class="metric"><div class="mlabel">SRT compliance</div><div class="mval" style="color:${srtRate>=80?'#0F6E56':srtRate>=60?'#854F0B':'#A32D2D'}">${srtRate}%</div><div class="msub">${good.length} GOOD · ${notQ.length} NOT QUALITY</div></div>
    <div class="metric"><div class="mlabel">Avg LL deviation</div><div class="mval">${avgDev} min</div><div class="msub">predicted vs actual</div></div>
  </div>
  ${done.length < 1 ? `<div class="card empty">Complete some records first to see analytics.</div>` : `
  <div class="card">
    <div class="ctitle">SRT compliance</div>
    <div style="display:flex;gap:16px;font-size:11px;color:#6b6b67;margin-bottom:8px">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:2px;background:#639922;display:inline-block"></span>GOOD (${good.length})</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:2px;background:#E24B4A;display:inline-block"></span>NOT QUALITY (${notQ.length})</span>
    </div>
    <div style="position:relative;width:100%;height:170px"><canvas id="ch-q" role="img" aria-label="SRT compliance doughnut chart">${good.length} GOOD, ${notQ.length} NOT QUALITY.</canvas></div>
  </div>
  <div class="card">
    <div class="ctitle">Last lift deviation — last 12 records</div>
    <div style="display:flex;gap:16px;font-size:11px;color:#6b6b67;margin-bottom:8px">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:2px;background:#378ADD;display:inline-block"></span>Within 30 min</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:2px;background:#E24B4A;display:inline-block"></span>Over 30 min</span>
    </div>
    <div style="position:relative;width:100%;height:200px"><canvas id="ch-d" role="img" aria-label="Deviation bar chart">Deviation in minutes per vessel.</canvas></div>
  </div>
  <div class="card">
    <div class="ctitle">Recent completed records</div>
    <table>
      <thead><tr>
        <th style="width:25%">Vessel</th><th style="width:12%">QC</th>
        <th style="width:13%">Pred LL</th><th style="width:13%">Actual LL</th>
        <th style="width:12%">SRT</th><th style="width:10%">Dev</th><th>Quality</th>
      </tr></thead>
      <tbody>${done.slice(0,10).map(r => `<tr>
        <td>${r.vessel_name}</td>
        <td style="font-family:monospace">${r.qc_number}</td>
        <td style="font-family:monospace">${r.predicted_last_lift_time}</td>
        <td style="font-family:monospace">${r.actual_last_lift_time}</td>
        <td style="font-family:monospace">${r.suggested_srt}</td>
        <td style="font-family:monospace;color:${Math.abs(r.deviation_minutes)<=30?'#0F6E56':'#A32D2D'}">${r.deviation_minutes>0?'+':''}${r.deviation_minutes}</td>
        <td><span class="badge ${r.booking_quality==='GOOD'?'bg':'bb'}">${r.booking_quality}</span></td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`}`;

  if (done.length >= 1) {
    setTimeout(() => {
      if (document.getElementById('ch-q')) {
        new Chart(document.getElementById('ch-q'), {
          type: 'doughnut',
          data: { labels:['GOOD','NOT QUALITY'], datasets:[{ data:[good.length,notQ.length], backgroundColor:['#639922','#E24B4A'], borderWidth:0 }] },
          options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, cutout:'65%' }
        });
      }
      const last12 = done.slice(0,12).reverse();
      if (document.getElementById('ch-d')) {
        new Chart(document.getElementById('ch-d'), {
          type: 'bar',
          data: { labels: last12.map(r => r.vessel_name.slice(0,10)), datasets:[{ data: last12.map(r => r.deviation_minutes), backgroundColor: last12.map(r => Math.abs(r.deviation_minutes)<=30?'#378ADD':'#E24B4A'), borderWidth:0, borderRadius:3 }] },
          options: { responsive:true, maintainAspectRatio:false, scales:{ y:{ grid:{ color:'rgba(0,0,0,.06)' }, ticks:{ font:{size:10} } }, x:{ ticks:{ autoSkip:false, maxRotation:35, font:{size:10} } } }, plugins:{ legend:{ display:false } } }
        });
      }
    }, 150);
  }
}

window.doLogin = function() {
  const v = document.getElementById('op-inp')?.value.trim().toUpperCase();
  if (!v) { alert('Please enter your operator ID.'); return; }
  S.operator = v; localStorage.setItem('ptp_op', v);
  R(); loadRecords();
};
window.doLogout = function() { S.operator = ''; S.records = []; R(); };
window.setTab = function(t) { S.tab = t; S.result = null; if (t === 'records' || t === 'dashboard') loadRecords(); else R(); };
window.onQC = function(v) { S.form.qc = v; renderTab(); };
window.toggleExp = function(id) { S.expandId = S.expandId===id ? null : id; renderTab(); };

window.doCalc = function() {
  const f = S.form;
  f.vessel = document.getElementById('f-vessel')?.value.trim().toUpperCase() || f.vessel;
  f.cmph = document.getElementById('f-cmph')?.value || f.cmph;
  if (!f.vessel) { alert('Please enter the vessel name.'); return; }
  if (!f.qc) { alert('Please select a QC number.'); return; }
  if (!f.cmph || +f.cmph <= 0) { alert('Please enter CMPH.'); return; }
  const qc = QC_DB.find(q => q.qc === f.qc);
  const res = calcAll(f, +f.cmph, qc ? qc.speed : 50);
  const now = new Date();
  const lastLift = addMin(now, res.totalMin);
  const srt = addMin(lastLift, -15);
  S.result = { ...res, lastLiftStr: toHM(lastLift), srtStr: toHM(srt) };
  renderTab();
  setTimeout(() => { const el = document.querySelector('.hrow'); if (el) el.scrollIntoView({ behavior:'smooth', block:'nearest' }); }, 100);
};

window.savePhase1 = async function() {
  const rem = document.getElementById('p1-rem')?.value.trim() || '';
  const f = S.form; const r = S.result;
  const qc = QC_DB.find(q => q.qc === f.qc);
  const rec = {
    id: genId(), vessel_name: f.vessel, qc_number: f.qc,
    qc_model: qc?.model||'', qc_speed: qc?.speed||50, cmph: +f.cmph,
    f1:+f.f1, f2:+f.f2, f3:+f.f3, f4:+f.f4, f5:+f.f5, f6:+f.f6, f7:+f.f7, f8:+f.f8,
    container_min: r.containerMin, gantry_min: r.gantryMin,
    buffer_min: r.bufferMin, total_min: r.totalMin,
    predicted_last_lift_time: r.lastLiftStr, suggested_srt: r.srtStr,
    operator_id: S.operator, remarks: rem,
    created_at: new Date().toISOString()
  };
  const ok = await dbInsert(rec);
  if (!ok) return;
  S.result = null;
  S.form = { vessel:'', qc:'', cmph:'', f1:0, f2:0, f3:0, f4:0, f5:0, f6:0, f7:0, f8:0 };
  alert('Saved: ' + rec.vessel_name + '\nCall pilot at: ' + rec.suggested_srt);
  S.tab = 'records'; S.recTab = 'pending';
  loadRecords();
};

window.savePhase2 = async function(id) {
  const ll = document.getElementById('a-ll')?.value;
  const po = document.getElementById('a-po')?.value;
  const srt = document.getElementById('a-srt')?.value;
  const rem = document.getElementById('a-rem')?.value.trim();
  if (!ll || !po || !srt) { alert('All three time fields are mandatory.'); return; }
  if (!rem) { alert('Remarks are mandatory.'); return; }
  const rec = S.records.find(r => r.id === id);
  const srtWindowStart = toHM(addMin(parseT(ll), -15));
  const quality = classifyQuality(rec.suggested_srt, ll);
  const deviation = Math.round((parseT(ll) - parseT(rec.predicted_last_lift_time)) / 60000);
  const ok = await dbUpdate(id, {
    actual_last_lift_time: ll, actual_pilot_onboard_time: po, actual_srt_time: srt,
    srt_window_start: srtWindowStart, booking_quality: quality,
    deviation_minutes: deviation, actual_remarks: rem
  });
  if (!ok) return;
  S.expandId = null;
  loadRecords();
};

document.addEventListener('DOMContentLoaded', function() {
  if (S.operator) loadRecords(); else R();
});
