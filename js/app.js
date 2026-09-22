import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, setDoc, serverTimestamp, Bytes } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const state = { user: null, admin: false, adminName: '', browsing: false, machines: [], install: null, objectUrls: [], auditBatch: null };
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
$$('[data-app-version]').forEach(element => { element.textContent = window.APP_VERSION; });

function toast(message, type = '') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  $('#toastRegion').append(item);
  setTimeout(() => item.remove(), 4500);
}
function busy(button, active, label) {
  if (active) button.dataset.originalLabel = button.textContent;
  button.disabled = active;
  button.textContent = active ? label : button.dataset.originalLabel;
}
function route() {
  const [page = '', id = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { page, id };
}
function page(title, eyebrow, description, body, actions = '') {
  return `<section class="page"><div class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2><p>${esc(description)}</p></div><div class="heading-actions">${actions}</div></div>${body}</section>`;
}
const normalized = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').trim();
function machineFilterMarkup() {
  const options = key => [...new Set(state.machines.map(machine => String(machine[key] || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es-MX'))
    .map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  return `<div class="machine-filters"><label class="machine-search"><span>Buscar máquina</span><input id="machineSearch" type="search" placeholder="Nombre, activo o descripción…" autocomplete="off"></label><label><span>Planta</span><select id="plantFilter"><option value="">Todas las plantas</option>${options('plant')}</select></label><label><span>Departamento</span><select id="departmentFilter"><option value="">Todos los departamentos</option>${options('department')}</select></label><button id="clearMachineFilters" class="button secondary compact" type="button">Limpiar filtros</button></div><p id="machineFilterCount" class="filter-count"></p>`;
}
function bindMachineFilters(cardSelector) {
  const cards = $$(cardSelector);
  const search = $('#machineSearch');
  const plant = $('#plantFilter');
  const department = $('#departmentFilter');
  const count = $('#machineFilterCount');
  const apply = () => {
    const term = normalized(search.value);
    const selectedPlant = normalized(plant.value);
    const selectedDepartment = normalized(department.value);
    let visible = 0;
    cards.forEach(card => {
      const matches = (!term || normalized(card.dataset.search).includes(term)) && (!selectedPlant || normalized(card.dataset.plant) === selectedPlant) && (!selectedDepartment || normalized(card.dataset.department) === selectedDepartment);
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    count.textContent = `${visible} de ${cards.length} máquina${cards.length === 1 ? '' : 's'}`;
    const empty = $('#machineFilterEmpty');
    if (empty) empty.hidden = visible !== 0;
  };
  search.addEventListener('input', apply);
  plant.addEventListener('change', apply);
  department.addEventListener('change', apply);
  $('#clearMachineFilters').onclick = () => { search.value = ''; plant.value = ''; department.value = ''; apply(); search.focus(); };
  apply();
  return apply;
}
function imageObjectUrl(data) {
  if (!data?.file?.toUint8Array) return '';
  const url = URL.createObjectURL(new Blob([data.file.toUint8Array()], { type: data.mimeType || 'image/webp' }));
  state.objectUrls.push(url);
  return url;
}
function clearImages() {
  state.objectUrls.forEach(url => URL.revokeObjectURL(url));
  state.objectUrls = [];
}
async function imageAt(...segments) {
  try {
    const snapshot = await getDoc(doc(db, ...segments));
    return snapshot.exists() ? imageObjectUrl(snapshot.data()) : '';
  } catch (error) {
    if (error?.code === 'permission-denied') {
      console.warn(`Sin permiso para leer la imagen: ${segments.join('/')}`);
      return '';
    }
    throw error;
  }
}
async function loadMachines() {
  const snapshot = await getDocs(query(collection(db, 'machines'), orderBy('name')));
  state.machines = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
async function adminAllowed(user) {
  if (!user) return false;
  const snapshot = await getDoc(doc(db, 'usuarios', user.uid));
  const profile = snapshot.data();
  state.adminName = String(profile?.nombre || profile?.name || user.displayName || '').trim();
  return profile?.rol === 'admin' && profile?.estatus === 'activo';
}
function showAccess() {
  $('#accessView').hidden = false;
  $('#appView').hidden = true;
}
function showApp() {
  const name = state.admin ? (state.adminName || state.user?.email || 'Administrador') : 'Operador';
  $('#profileName').textContent = name;
  $('#profileRole').textContent = state.admin ? 'Administrador de rutinas' : 'Consulta de rutina';
  $('#profileAvatar').textContent = name.charAt(0).toUpperCase();
  $('#navigation').innerHTML = state.admin
    ? '<a href="#/admin" data-page="admin">▦ <span>Administrar máquinas</span></a><a href="#/auditorias" data-page="auditorias">✓ <span>Auditorías</span></a><a href="#/qr" data-page="qr">▣ <span>Códigos QR</span></a><a href="#/help" data-page="help">? <span>Ayuda</span></a>'
    : '<a href="#/" data-page="home">⌕ <span>Consultar rutina</span></a><a href="#/help" data-page="help">? <span>Ayuda</span></a>';
  $('#accessView').hidden = true;
  $('#appView').hidden = false;
  render();
}
async function home() {
  clearImages();
  await loadMachines();
  const cards = await Promise.all(state.machines.map(async machine => {
    const photo = await imageAt('machines', machine.id, 'images', 'cover');
    return `<article class="machine-card"><div class="machine-art">${photo ? `<img src="${photo}" alt="Foto de ${esc(machine.name)}" loading="lazy">` : '⚙'}</div><div class="machine-body"><p class="eyebrow">${esc(machine.plant)} · ${esc(machine.department)}</p><h3>${esc(machine.name)}</h3><div class="machine-model">Activo: ${esc(machine.assetNumber)}</div><p class="machine-review">${esc(machine.description)}</p><div class="machine-footer"><span class="machine-availability">Rutina vigente</span><a class="button primary compact" href="#/rutina/${encodeURIComponent(machine.id)}">Ver rutina</a></div></div></article>`;
  }));
  $('#mainContent').innerHTML = `<section class="page"><div class="hero"><div><p class="eyebrow light">Mantenimiento autónomo</p><h2>Consulta tu rutina</h2><p>Selecciona la máquina o escanea el código QR de tu estación.</p></div><div class="hero-icon">⚙</div></div><div class="machine-grid" style="margin-top:24px">${cards.join('') || '<div class="empty-state">Aún no hay máquinas publicadas.</div>'}</div></section>`;
}
async function routine(machineId) {
  clearImages();
  const snapshot = await getDoc(doc(db, 'machines', machineId));
  if (!snapshot.exists()) {
    $('#mainContent').innerHTML = page('Rutina no encontrada', 'Consulta', 'Revisa el código QR o solicita apoyo.', '<div class="empty-state">No existe esta estación.</div>');
    return;
  }
  const machine = snapshot.data();
  const activities = await getDocs(query(collection(db, 'machines', machineId, 'routines'), orderBy('order')));
  const items = activities.docs.map(item => ({ id: item.id, ...item.data() }));
  const groups = new Map();
  items.forEach(item => { const activityType = item.activityType || 'General'; groups.set(activityType, [...(groups.get(activityType) || []), item]); });
  let cards = '';
  for (const [activityType, group] of groups) {
    cards += `<section class="routine-type-group"><header><span>✦</span><div><p>Tipo de actividad</p><h3>${esc(activityType)}</h3></div><b>${group.length} actividad${group.length === 1 ? '' : 'es'}</b></header><div class="routine-type-list">`;
    for (const item of group) {
      const photo = await imageAt('machines', machineId, 'routines', item.id, 'images', 'reference');
      cards += `<article class="list-card routine-activity-card" style="display:block"><div class="routine-card-heading"><span class="badge">Paso ${Number(item.order) || 1}</span><span class="frequency-chip">${esc(item.frequency || 'Sin frecuencia')}</span><h3>${esc(item.activity)}</h3></div><div class="routine-details"><div><small>Material</small><p>${esc(item.material || 'No aplica')}</p></div><div><small>Equipo de protección</small><p>${esc(item.ppe || 'No aplica')}</p></div></div>${item.waste ? `<div class="notice"><strong>⚠ Residuos / advertencia</strong><span>${esc(item.waste)}</span></div>` : ''}${photo ? `<img class="photo" src="${photo}" alt="Referencia de ${esc(item.activity)}">` : ''}</article>`;
    }
    cards += '</div></section>';
  }
  $('#mainContent').innerHTML = page(machine.name, 'Rutina de mantenimiento', `${machine.plant} · ${machine.department} · Activo ${machine.assetNumber}`, cards || '<div class="empty-state">Esta máquina aún no tiene actividades.</div>', '<a class="button secondary" href="#/">Volver</a>');
}
async function admin() {
  clearImages();
  await loadMachines();
  const cards = await Promise.all(state.machines.map(async machine => {
    const photo = await imageAt('machines', machine.id, 'images', 'cover');
    return `<article class="machine-card admin-machine-card" data-machine-card data-plant="${esc(machine.plant)}" data-department="${esc(machine.department)}" data-search="${esc(`${machine.name} ${machine.assetNumber} ${machine.description} ${machine.plant} ${machine.department}`)}"><div class="machine-art">${photo ? `<img src="${photo}" alt="Foto de ${esc(machine.name)}" loading="lazy">` : '⚙'}</div><div class="machine-body"><p class="eyebrow">${esc(machine.plant)} · ${esc(machine.department)}</p><h3>${esc(machine.name)}</h3><div class="machine-model">Activo: ${esc(machine.assetNumber)}</div><p class="machine-review">${esc(machine.description)}</p><div class="admin-machine-actions"><button class="button secondary compact" data-edit-machine="${esc(machine.id)}">Editar</button><button class="button primary compact" data-routines="${esc(machine.id)}">Actividades</button><button class="button danger compact" data-delete-machine="${esc(machine.id)}">Eliminar</button></div></div></article>`;
  }));
  $('#mainContent').innerHTML = page('Administrar máquinas', 'Inventario', 'Agrega, edita o elimina máquinas y sus actividades.', `${state.machines.length ? machineFilterMarkup() : ''}<div class="admin-machine-grid">${cards.join('') || '<div class="empty-state">Aún no hay máquinas. Agrega la primera.</div>'}</div>${state.machines.length ? '<div id="machineFilterEmpty" class="empty-state" hidden>No se encontraron máquinas con esos filtros.</div>' : ''}`, '<button id="newMachine" class="button primary">＋ Agregar máquina</button>');
  if (state.machines.length) bindMachineFilters('[data-machine-card]');
  $('#newMachine').onclick = () => machineModal();
  $$('[data-edit-machine]').forEach(button => button.onclick = () => machineModal(state.machines.find(item => item.id === button.dataset.editMachine)));
  $$('[data-routines]').forEach(button => button.onclick = () => routineAdmin(state.machines.find(item => item.id === button.dataset.routines)));
  $$('[data-delete-machine]').forEach(button => button.onclick = () => deleteMachine(state.machines.find(item => item.id === button.dataset.deleteMachine), button));
}
async function deleteMachine(machine, button) {
  if (!state.admin || !machine) return;
  if (!confirm(`¿Eliminar la máquina "${machine.name}" y todas sus actividades y fotos? Esta acción no se puede deshacer.`)) return;
  busy(button, true, 'Eliminando…');
  try {
    const routines = await getDocs(collection(db, 'machines', machine.id, 'routines'));
    for (const routine of routines.docs) {
      const photos = await getDocs(collection(db, 'machines', machine.id, 'routines', routine.id, 'images'));
      for (const photo of photos.docs) await deleteDoc(photo.ref);
      await deleteDoc(routine.ref);
    }
    const photos = await getDocs(collection(db, 'machines', machine.id, 'images'));
    for (const photo of photos.docs) await deleteDoc(photo.ref);
    await deleteDoc(doc(db, 'machines', machine.id));
    await admin();
    toast('Máquina y actividades eliminadas.');
  } catch (error) { toast(`No se pudo eliminar: ${error.message}`, 'error'); busy(button, false); }
}
async function routineAdmin(machine) {
  if (!machine) return admin();
  const snapshot = await getDocs(query(collection(db, 'machines', machine.id, 'routines'), orderBy('order')));
  const routines = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const cards = routines.map(item => `<article class="list-card"><div><span class="badge">${esc(item.activityType || 'General')}</span><h3>${esc(item.activity)}</h3><p>${esc(item.frequency)} · ${esc(item.material || 'Sin material')}</p></div><div><small>Orden</small><p>${Number(item.order) || 1}</p></div><div class="list-actions"><button class="button secondary compact" data-edit-routine="${esc(item.id)}">Editar</button><button class="button danger compact" data-delete-routine="${esc(item.id)}">Eliminar</button></div></article>`).join('');
  $('#mainContent').innerHTML = page(`Actividades · ${machine.name}`, 'Rutina', 'Organiza los pasos que verá el operador.', `<div class="card-list">${cards || '<div class="empty-state">No hay actividades registradas.</div>'}</div>`, '<button id="newRoutine" class="button primary">＋ Agregar actividad</button><button id="backAdmin" class="button secondary">Volver</button>');
  $('#newRoutine').onclick = () => routineModal(machine);
  $('#backAdmin').onclick = admin;
  $$('[data-edit-routine]').forEach(button => button.onclick = () => routineModal(machine, routines.find(item => item.id === button.dataset.editRoutine)));
  $$('[data-delete-routine]').forEach(button => button.onclick = async () => {
    if (!confirm('¿Eliminar esta actividad y sus fotos?')) return;
    const photos = await getDocs(collection(db, 'machines', machine.id, 'routines', button.dataset.deleteRoutine, 'images'));
    for (const photo of photos.docs) await deleteDoc(photo.ref);
    await deleteDoc(doc(db, 'machines', machine.id, 'routines', button.dataset.deleteRoutine));
    await routineAdmin(machine);
  });
}
function machineModal(machine = {}) {
  const form = $('#machineForm');
  form.reset();
  form.elements.machineId.value = machine.id || '';
  form.elements.name.value = machine.name || '';
  form.elements.plant.value = machine.plant || '';
  form.elements.department.value = machine.department || '';
  form.elements.assetNumber.value = machine.assetNumber || '';
  form.elements.description.value = machine.description || '';
  form.elements.photo.required = !machine.id;
  $('#machinePhotoHelp').textContent = machine.id
    ? 'Selecciona una imagen solamente si deseas reemplazar la foto actual.'
    : 'WebP, JPG o PNG. Máximo final: 180 KB.';
  $('#machineDialogTitle').textContent = machine.id ? 'Editar máquina' : 'Agregar máquina';
  $('#machineDialog').showModal();
}
function routineModal(machine, routine = {}) {
  const form = $('#routineForm');
  form.reset();
  for (const field of ['activityType', 'activity', 'frequency', 'order', 'material', 'ppe', 'waste']) form.elements[field].value = routine[field] ?? (field === 'activityType' ? 'General' : field === 'frequency' ? 'Diaria' : field === 'order' ? 1 : '');
  form.elements.machineId.value = machine.id;
  form.elements.routineId.value = routine.id || '';
  $('#routineDialogTitle').textContent = routine.id ? 'Editar actividad' : 'Agregar actividad';
  $('#routineDialog').showModal();
}
async function optimize(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Selecciona una imagen PNG, JPG o WebP.');
  const image = new Image();
  const source = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error('No se pudo leer la foto.')); image.src = source; });
    const ratio = Math.min(1200 / image.width, 1200 / image.height, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    for (let quality = .9; quality >= .3; quality -= .1) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (blob?.size <= 180 * 1024) return blob;
    }
    throw Error('La foto no pudo reducirse a 180 KB. Prueba con otra imagen.');
  } finally { URL.revokeObjectURL(source); }
}
async function savePhoto(path, file) {
  if (!file?.size) return;
  const image = await optimize(file);
  await setDoc(doc(db, ...path), { file: Bytes.fromUint8Array(new Uint8Array(await image.arrayBuffer())), mimeType: 'image/webp', updatedAt: serverTimestamp() });
}
async function qr() {
  clearImages();
  await loadMachines();
  const cards = state.machines.map(machine => `<label class="qr-select-card" data-qr-machine data-plant="${esc(machine.plant)}" data-department="${esc(machine.department)}" data-search="${esc(`${machine.name} ${machine.assetNumber} ${machine.description} ${machine.plant} ${machine.department}`)}"><input type="checkbox" value="${esc(machine.id)}" data-qr-select><span class="qr-select-check">✓</span><div><p class="eyebrow">${esc(machine.plant)} · ${esc(machine.department)}</p><h3>${esc(machine.name)}</h3><p>Activo: ${esc(machine.assetNumber)}</p></div></label>`).join('');
  const actions = state.machines.length ? '<button id="selectAllQr" class="button secondary">Seleccionar visibles</button><button id="prepareQr" class="button primary" disabled>Preparar impresión</button>' : '';
  $('#mainContent').innerHTML = page('Códigos QR', 'Estaciones', 'Selecciona las máquinas que deseas imprimir. Se acomodarán hasta cuatro tarjetas diferentes por hoja.', `${state.machines.length ? machineFilterMarkup() : ''}<div class="qr-select-grid">${cards || '<div class="empty-state">Primero registra una máquina.</div>'}</div>${state.machines.length ? '<div id="machineFilterEmpty" class="empty-state" hidden>No se encontraron máquinas con esos filtros.</div>' : ''}`, actions);
  if (state.machines.length) bindMachineFilters('[data-qr-machine]');
  const selections = $$('[data-qr-select]');
  const updateSelection = () => {
    const count = selections.filter(item => item.checked).length;
    $('#prepareQr').disabled = count === 0;
    $('#prepareQr').textContent = count ? `Preparar impresión (${count})` : 'Preparar impresión';
  };
  selections.forEach(item => item.onchange = updateSelection);
  if ($('#selectAllQr')) $('#selectAllQr').onclick = () => { selections.forEach(item => { if (!item.closest('[data-qr-machine]').hidden) item.checked = true; }); updateSelection(); };
  if ($('#prepareQr')) $('#prepareQr').onclick = async () => {
    const selectedIds = selections.filter(item => item.checked).map(item => item.value);
    const selectedMachines = state.machines.filter(machine => selectedIds.includes(machine.id));
    clearImages();
    const posters = await Promise.all(selectedMachines.map(async (machine, index) => {
      const photo = await imageAt('machines', machine.id, 'images', 'cover');
      return `<article class="qr-sticker"><header><div class="qr-sticker-brand"><span>⚙</span><div><strong>SISTEMA DE TRABAJO CABORCA</strong><small>MANTENIMIENTO AUTÓNOMO</small></div></div><b>RUTINA DIGITAL</b></header><section class="qr-sticker-machine">${photo ? `<img src="${photo}" alt="Foto de ${esc(machine.name)}">` : '<div class="qr-sticker-placeholder">⚙</div>'}<div><p>${esc(machine.plant)} · ${esc(machine.department)}</p><h2>${esc(machine.name)}</h2><span>ACTIVO: ${esc(machine.assetNumber)}</span></div></section><section class="qr-sticker-scan"><div><p>CONSULTA LA RUTINA VIGENTE</p><h3>Escanea con la cámara de tu teléfono</h3><span>Consulta actividades, materiales e indicaciones de seguridad.</span></div><div class="qr-sticker-code"><div id="qr-${index}"></div><strong>ESCANEA AQUÍ</strong></div></section><footer><span>SEGURIDAD · LIMPIEZA · CONSERVACIÓN</span><strong>SOMOS LO QUE HACEMOS</strong></footer></article>`;
    }));
    $('#mainContent').innerHTML = `<section class="page qr-print-page"><div class="page-heading qr-screen-only"><div><p class="eyebrow">Vista previa</p><h2>Tarjetas seleccionadas</h2><p>${selectedMachines.length} tarjeta${selectedMachines.length === 1 ? '' : 's'} · hasta 4 por hoja</p></div></div><div class="qr-sticker-grid">${posters.join('')}</div><div class="qr-screen-actions"><button id="printQr" class="button primary">Imprimir tarjetas</button><button id="backQr" class="button secondary">Volver a seleccionar</button></div></section>`;
    selectedMachines.forEach((machine, index) => {
      const url = `${location.href.split('#')[0]}#/rutina/${encodeURIComponent(machine.id)}`;
      new QRCode($(`#qr-${index}`), { text: url, width: 220, height: 220, colorDark: '#102f26', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
    });
    $('#printQr').onclick = () => window.print();
    $('#backQr').onclick = qr;
  };
}
function currentWeek() {
  const date = new Date();
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const first = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return `${target.getUTCFullYear()}-W${String(Math.ceil((((target - first) / 86400000) + 1) / 7)).padStart(2, '0')}`;
}
const auditStatusClass = value => normalized(value).replace(/\s+/g, '-');
async function loadAudits() {
  const snapshot = await getDocs(query(collection(db, 'audits'), orderBy('auditDate', 'desc')));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
async function audits() {
  const items = await loadAudits();
  const openFindings = items.reduce((total, item) => total + Number(item.openFindings || 0), 0);
  const average = items.length ? Math.round(items.reduce((total, item) => total + Number(item.compliance || 0), 0) / items.length) : 0;
  const groups = new Map();
  items.forEach(item => { const key = item.batchId || item.id; groups.set(key, [...(groups.get(key) || []), item]); });
  const batches = [...groups.values()].map(group => {
    const first = group[0];
    const cards = group.map(item => `<article class="audit-card"><div class="audit-score" style="--score:${Number(item.compliance) || 0}"><strong>${Number(item.compliance) || 0}%</strong><small>Cumplimiento</small></div><div class="audit-card-body"><div class="audit-card-top"><span class="badge">${esc(item.week)}</span><span class="audit-status ${auditStatusClass(item.status)}">${esc(item.status)}</span></div><h3>${esc(item.machineName)}</h3><p>${esc(item.plant)} · ${esc(item.department)}</p><small>Activo ${esc(item.assetNumber)} · ${esc(item.auditDate)}</small><div class="audit-card-footer"><span class="finding-count">${Number(item.openFindings || 0)} hallazgo(s) abierto(s)</span><a class="button primary compact" href="#/auditoria/${encodeURIComponent(item.id)}">Ver auditoría</a></div></div></article>`).join('');
    return `<section class="audit-batch-group"><header><div><p class="eyebrow">Jornada de auditoría</p><h3>${esc(first.week)} · ${esc(first.auditDate)}</h3></div><span>${group.length} máquina${group.length === 1 ? '' : 's'}</span></header><div class="audit-list">${cards}</div></section>`;
  }).join('');
  const summary = `<div class="audit-summary"><article><span>▤</span><div><strong>${items.length}</strong><small>Auditorías realizadas</small></div></article><article><span>✓</span><div><strong>${average}%</strong><small>Cumplimiento promedio</small></div></article><article><span>!</span><div><strong>${openFindings}</strong><small>Hallazgos abiertos</small></div></article></div>`;
  $('#mainContent').innerHTML = page('Auditorías semanales', 'Mantenimiento', 'Evalúa el mantenimiento autónomo y da seguimiento a los hallazgos.', `${summary}<div class="audit-batches">${batches || '<div class="empty-state">Todavía no existen auditorías. Crea la primera.</div>'}</div>`, '<a class="button primary" href="#/auditoria-nueva">＋ Nueva auditoría</a>');
}
async function newAudit() {
  await loadMachines();
  const today = new Date().toISOString().slice(0, 10);
  const cards = state.machines.map(machine => `<label class="qr-select-card audit-machine-select" data-audit-machine data-plant="${esc(machine.plant)}" data-department="${esc(machine.department)}" data-search="${esc(`${machine.name} ${machine.assetNumber} ${machine.description} ${machine.plant} ${machine.department}`)}"><input type="checkbox" value="${esc(machine.id)}" data-audit-select><span class="qr-select-check">✓</span><div><p class="eyebrow">${esc(machine.plant)} · ${esc(machine.department)}</p><h3>${esc(machine.name)}</h3><p>Activo: ${esc(machine.assetNumber)}</p></div></label>`).join('');
  const body = `<form id="auditSetupForm"><div class="audit-batch-data"><label>Semana<input name="week" type="week" value="${currentWeek()}" required></label><label>Fecha de auditoría<input name="auditDate" type="date" value="${today}" required></label><div><strong id="auditMachineCount">0 seleccionadas</strong><small>Cada máquina conservará su propio resultado.</small></div></div>${state.machines.length ? machineFilterMarkup() : ''}<div class="audit-selection-actions"><button id="selectVisibleAudits" class="button secondary" type="button">Seleccionar visibles</button><button id="clearAuditSelection" class="button secondary" type="button">Quitar selección</button></div><div class="qr-select-grid audit-machine-grid">${cards || '<div class="empty-state">Primero registra máquinas para poder auditarlas.</div>'}</div>${state.machines.length ? '<div id="machineFilterEmpty" class="empty-state" hidden>No se encontraron máquinas con esos filtros.</div>' : ''}<div class="audit-submit"><button id="startAuditBatch" class="button primary big" type="submit" disabled>Iniciar auditoría</button><a class="button secondary big" href="#/auditorias">Cancelar</a></div></form>`;
  $('#mainContent').innerHTML = page('Nueva auditoría', 'Evaluación semanal', 'Selecciona todas las máquinas que se revisarán durante esta jornada.', body, '<a class="button secondary" href="#/auditorias">Cancelar</a>');
  if (state.machines.length) bindMachineFilters('[data-audit-machine]');
  const selections = $$('[data-audit-select]');
  const updateCount = () => {
    const count = selections.filter(item => item.checked).length;
    $('#auditMachineCount').textContent = `${count} máquina${count === 1 ? '' : 's'} seleccionada${count === 1 ? '' : 's'}`;
    $('#startAuditBatch').disabled = count === 0;
    $('#startAuditBatch').textContent = count ? `Iniciar auditoría (${count})` : 'Iniciar auditoría';
  };
  selections.forEach(item => item.onchange = updateCount);
  if ($('#selectVisibleAudits')) $('#selectVisibleAudits').onclick = () => { selections.forEach(item => { if (!item.closest('[data-audit-machine]').hidden) item.checked = true; }); updateCount(); };
  if ($('#clearAuditSelection')) $('#clearAuditSelection').onclick = () => { selections.forEach(item => { item.checked = false; }); updateCount(); };
  $('#auditSetupForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const machineIds = selections.filter(item => item.checked).map(item => item.value);
    if (!machineIds.length) return;
    state.auditBatch = { id: crypto.randomUUID(), machineIds, week: String(form.get('week')), auditDate: String(form.get('auditDate')), current: 0 };
    await auditChecklist(machineIds[0], state.auditBatch.week, state.auditBatch.auditDate);
  };
}
async function auditChecklist(machineId, week, auditDate) {
  const machine = state.machines.find(item => item.id === machineId);
  if (!machine) return newAudit();
  const snapshot = await getDocs(query(collection(db, 'machines', machineId, 'routines'), orderBy('order')));
  const routines = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  if (!routines.length) {
    toast(`${machine.name} no tiene actividades y fue omitida.`, 'error');
    if (state.auditBatch && state.auditBatch.current < state.auditBatch.machineIds.length - 1) {
      state.auditBatch.current += 1;
      return auditChecklist(state.auditBatch.machineIds[state.auditBatch.current], week, auditDate);
    }
    state.auditBatch = null;
    location.hash = '#/auditorias';
    return;
  }
  const rows = routines.map((item, index) => `<article class="audit-item" data-audit-item data-routine-id="${esc(item.id)}" data-activity-type="${esc(item.activityType || 'General')}" data-activity="${esc(item.activity)}" data-frequency="${esc(item.frequency)}" data-waste="${esc(item.waste || '')}" data-order="${Number(item.order) || index + 1}"><header><span class="audit-step">${Number(item.order) || index + 1}</span><div><span class="badge">${esc(item.activityType || 'General')}</span><span class="frequency-chip">${esc(item.frequency)}</span><h3>${esc(item.activity)}</h3></div></header>${item.waste ? `<div class="audit-warning"><strong>⚠ Residuos / advertencia</strong><span>${esc(item.waste)}</span></div>` : ''}<div class="audit-item-fields"><label>Resultado<select name="result" required><option value="">Seleccionar</option><option value="Cumple">Cumple</option><option value="No cumple">No cumple</option><option value="No aplica">No aplica</option></select></label><label class="finding-only">Prioridad<select name="priority"><option value="Media">Media</option><option value="Baja">Baja</option><option value="Alta">Alta</option><option value="Crítica">Crítica</option></select></label><label class="span-2">Observación o hallazgo<textarea name="observation" rows="2" maxlength="1000" placeholder="Describe lo observado"></textarea></label><label class="finding-only">Responsable<input name="responsible" maxlength="120" placeholder="Nombre o área responsable"></label><label class="finding-only">Fecha compromiso<input name="dueDate" type="date"></label><label class="span-2 finding-only">Evidencia del hallazgo <small>Máximo final 180 KB.</small><input name="evidence" type="file" accept="image/png,image/jpeg,image/webp"></label></div></article>`).join('');
  const batchPosition = state.auditBatch ? `Máquina ${state.auditBatch.current + 1} de ${state.auditBatch.machineIds.length} · ` : '';
  $('#mainContent').innerHTML = page(`Auditar · ${machine.name}`, `${machine.plant} · ${machine.department}`, `${batchPosition}Semana ${week} · Activo ${machine.assetNumber}`, `<form id="auditForm"><div class="audit-progress"><strong id="auditAnswered">0 de ${routines.length} evaluadas</strong><span><i id="auditProgressBar"></i></span></div><div class="audit-checklist">${rows}</div><div class="audit-submit"><button class="button primary big" type="submit">Guardar y continuar</button><a class="button secondary big" href="#/auditorias">Cancelar lote</a></div></form>`);
  const form = $('#auditForm');
  const refresh = () => {
    const answered = $$('[name="result"]', form).filter(field => field.value).length;
    $('#auditAnswered').textContent = `${answered} de ${routines.length} evaluadas`;
    $('#auditProgressBar').style.width = `${Math.round(answered / routines.length * 100)}%`;
  };
  $$('[name="result"]', form).forEach(field => field.onchange = () => {
    const item = field.closest('[data-audit-item]');
    item.classList.toggle('noncompliant', field.value === 'No cumple');
    refresh();
  });
  form.onsubmit = async event => {
    event.preventDefault();
    const button = $('button[type="submit"]', form);
    const results = $$('[data-audit-item]', form).map(item => {
      const result = $('[name="result"]', item).value;
      return { item, routineId: item.dataset.routineId, activityType: item.dataset.activityType, activity: item.dataset.activity, frequency: item.dataset.frequency, waste: item.dataset.waste, order: Number(item.dataset.order), result, observation: $('[name="observation"]', item).value.trim(), priority: $('[name="priority"]', item).value, responsible: $('[name="responsible"]', item).value.trim(), dueDate: $('[name="dueDate"]', item).value, evidence: $('[name="evidence"]', item).files[0] };
    });
    if (results.some(item => !item.result)) { toast('Evalúa todas las actividades antes de finalizar.', 'error'); return; }
    const incomplete = results.find(item => item.result === 'No cumple' && (!item.observation || !item.responsible || !item.dueDate));
    if (incomplete) { toast('Todo incumplimiento necesita descripción, responsable y fecha compromiso.', 'error'); incomplete.item.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    busy(button, true, 'Guardando auditoría…');
    try {
      const evaluated = results.filter(item => item.result !== 'No aplica');
      const compliant = results.filter(item => item.result === 'Cumple').length;
      const findings = results.filter(item => item.result === 'No cumple');
      const compliance = evaluated.length ? Math.round(compliant / evaluated.length * 100) : 100;
      const reference = await addDoc(collection(db, 'audits'), { batchId: state.auditBatch?.id || crypto.randomUUID(), machineId, machineName: machine.name, plant: machine.plant, department: machine.department, assetNumber: machine.assetNumber, week: String(week), auditDate: String(auditDate), auditorUid: state.user.uid, auditorName: state.adminName || state.user.email || 'Administrador', compliance, status: findings.length ? 'Con hallazgos' : 'Completada', totalActivities: results.length, compliantActivities: compliant, openFindings: findings.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      for (const item of results) {
        await addDoc(collection(db, 'audits', reference.id, 'results'), { routineId: item.routineId, activityType: item.activityType, activity: item.activity, frequency: item.frequency, waste: item.waste, order: item.order, result: item.result, observation: item.observation, priority: item.result === 'No cumple' ? item.priority : '', createdAt: serverTimestamp() });
        if (item.result === 'No cumple') {
          const finding = await addDoc(collection(db, 'audits', reference.id, 'findings'), { routineId: item.routineId, activityType: item.activityType, activity: item.activity, description: item.observation, priority: item.priority, responsible: item.responsible, dueDate: item.dueDate, status: 'Abierto', correctiveAction: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          if (item.evidence) await savePhoto(['audits', reference.id, 'findings', finding.id, 'images', 'before'], item.evidence);
        }
      }
      if (state.auditBatch && state.auditBatch.current < state.auditBatch.machineIds.length - 1) {
        state.auditBatch.current += 1;
        toast(`Máquina guardada. Continúa con la ${state.auditBatch.current + 1} de ${state.auditBatch.machineIds.length}.`);
        await auditChecklist(state.auditBatch.machineIds[state.auditBatch.current], week, auditDate);
      } else {
        const total = state.auditBatch?.machineIds.length || 1;
        state.auditBatch = null;
        toast(`Auditoría finalizada: ${total} máquina${total === 1 ? '' : 's'} guardada${total === 1 ? '' : 's'}.`);
        location.hash = '#/auditorias';
      }
    } catch (error) { toast(`No se pudo guardar la auditoría: ${error.message}`, 'error'); busy(button, false); }
  };
}
async function auditDetail(auditId) {
  clearImages();
  const snapshot = await getDoc(doc(db, 'audits', auditId));
  if (!snapshot.exists()) { $('#mainContent').innerHTML = page('Auditoría no encontrada', 'Error', '', '<div class="empty-state">El registro no existe.</div>'); return; }
  const audit = { id: snapshot.id, ...snapshot.data() };
  if (audit.auditorUid === state.user?.uid && state.adminName) audit.auditorName = state.adminName;
  const resultSnapshot = await getDocs(query(collection(db, 'audits', auditId, 'results'), orderBy('order')));
  const results = resultSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const findingSnapshot = await getDocs(collection(db, 'audits', auditId, 'findings'));
  const findings = findingSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const resultRows = results.map(item => `<tr><td>${Number(item.order)}</td><td>${esc(item.activity)}<small>${esc(item.activityType || 'General')} · ${esc(item.frequency)}</small>${item.waste ? `<small class="result-warning">⚠ Residuos / advertencia: ${esc(item.waste)}</small>` : ''}</td><td><span class="result-pill ${auditStatusClass(item.result)}">${esc(item.result)}</span></td><td>${esc(item.observation || '—')}</td></tr>`).join('');
  const findingCards = [];
  for (const finding of findings) {
    const before = await imageAt('audits', auditId, 'findings', finding.id, 'images', 'before');
    const after = await imageAt('audits', auditId, 'findings', finding.id, 'images', 'after');
    findingCards.push(`<article class="finding-card" data-finding="${esc(finding.id)}"><header><span class="priority ${normalized(finding.priority)}">${esc(finding.priority)}</span><span class="audit-status ${auditStatusClass(finding.status)}">${esc(finding.status)}</span></header><h3>${esc(finding.activity)}</h3><p>${esc(finding.description)}</p><div class="finding-meta"><span><small>Responsable</small>${esc(finding.responsible)}</span><span><small>Fecha compromiso</small>${esc(finding.dueDate)}</span></div>${before || after ? `<div class="finding-images">${before ? `<figure><img src="${before}" alt="Evidencia inicial"><figcaption>Hallazgo</figcaption></figure>` : ''}${after ? `<figure><img src="${after}" alt="Evidencia de corrección"><figcaption>Corrección</figcaption></figure>` : ''}</div>` : ''}<div class="finding-followup audit-screen-only"><label>Estado<select name="status"><option${finding.status === 'Abierto' ? ' selected' : ''}>Abierto</option><option${finding.status === 'En proceso' ? ' selected' : ''}>En proceso</option><option${finding.status === 'Corregido' ? ' selected' : ''}>Corregido</option><option${finding.status === 'Verificado' ? ' selected' : ''}>Verificado</option><option${finding.status === 'Cerrado' ? ' selected' : ''}>Cerrado</option></select></label><label>Acción correctiva<textarea name="correctiveAction" rows="2" maxlength="1000">${esc(finding.correctiveAction || '')}</textarea></label><label>Evidencia de corrección<input name="afterEvidence" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="button primary compact" type="button" data-save-finding="${esc(finding.id)}">Guardar seguimiento</button></div></article>`);
  }
  const report = `<section class="audit-report"><header class="report-header"><div><p>Sistema de Trabajo Caborca</p><h2>Reporte de auditoría semanal</h2></div><div class="report-score"><strong>${Number(audit.compliance)}%</strong><span>Cumplimiento</span></div></header><div class="report-machine"><div><small>Máquina</small><strong>${esc(audit.machineName)}</strong></div><div><small>Activo</small><strong>${esc(audit.assetNumber)}</strong></div><div><small>Planta</small><strong>${esc(audit.plant)}</strong></div><div><small>Departamento</small><strong>${esc(audit.department)}</strong></div><div><small>Semana</small><strong>${esc(audit.week)}</strong></div><div><small>Auditor</small><strong>${esc(audit.auditorName)}</strong></div></div><h3 class="report-section-title">Evaluación de actividades</h3><div class="table-wrap"><table class="audit-table"><thead><tr><th>#</th><th>Actividad</th><th>Resultado</th><th>Observación</th></tr></thead><tbody>${resultRows}</tbody></table></div><h3 class="report-section-title">Hallazgos y seguimiento</h3><div class="finding-list">${findingCards.join('') || '<div class="empty-state compact-empty">Sin hallazgos. La máquina cumple todas las actividades evaluadas.</div>'}</div><footer class="report-footer">Auditoría ${esc(audit.week)} · ${esc(audit.auditDate)} · Rutinas STC v${esc(window.APP_VERSION)}</footer></section>`;
  $('#mainContent').innerHTML = `<section class="page audit-detail-page"><div class="page-heading audit-screen-only"><div><p class="eyebrow">Reporte</p><h2>${esc(audit.machineName)}</h2><p>${esc(audit.week)} · ${findings.length} hallazgo(s)</p></div><div class="heading-actions"><button id="printAudit" class="button primary">Imprimir reporte</button><a class="button secondary" href="#/auditorias">Volver</a></div></div>${report}</section>`;
  $('#printAudit').onclick = () => window.print();
  $$('[data-save-finding]').forEach(button => button.onclick = async () => {
    const card = button.closest('[data-finding]');
    const findingId = card.dataset.finding;
    busy(button, true, 'Guardando…');
    try {
      await updateDoc(doc(db, 'audits', auditId, 'findings', findingId), { status: $('[name="status"]', card).value, correctiveAction: $('[name="correctiveAction"]', card).value.trim(), updatedAt: serverTimestamp() });
      const file = $('[name="afterEvidence"]', card).files[0];
      if (file) await savePhoto(['audits', auditId, 'findings', findingId, 'images', 'after'], file);
      const refreshed = await getDocs(collection(db, 'audits', auditId, 'findings'));
      const open = refreshed.docs.filter(item => !['Cerrado', 'Verificado'].includes(item.data().status)).length;
      await updateDoc(doc(db, 'audits', auditId), { openFindings: open, status: open ? 'Con hallazgos' : 'Cerrada', updatedAt: serverTimestamp() });
      toast('Seguimiento actualizado.');
      await auditDetail(auditId);
    } catch (error) { toast(`No se pudo actualizar: ${error.message}`, 'error'); busy(button, false); }
  });
}
function help() {
  const instructions = state.admin ? 'Crea una máquina, agrega sus actividades y genera el QR para colocar en la estación.' : 'Escanea el QR de tu estación, sigue los pasos en orden y consulta las fotos si tienes dudas.';
  const manual = `<section class="help-manual"><div class="help-manual-heading"><p class="eyebrow">Manual de uso</p><h2>Todas las funciones de la aplicación</h2><p>Abre cada tema para consultar el procedimiento completo.</p></div>
  <details open><summary><span>01</span><div><strong>Acceso y perfiles</strong><small>Operadores y administradores</small></div></summary><ol><li>En la pantalla inicial, pulsa <b>Consultar rutina</b> para entrar como operador sin iniciar sesión.</li><li>Pulsa <b>Acceso administrador</b> para gestionar máquinas, actividades, QR y auditorías.</li><li>Escribe el correo y contraseña registrados en Firebase Authentication.</li><li>La cuenta debe tener un documento en <code>usuarios/{uid}</code> con <code>rol: admin</code> y <code>estatus: activo</code>.</li><li>Si el perfil contiene el campo <code>nombre</code>, se mostrará en el sidebar y en los reportes; de lo contrario se mostrará el correo.</li><li>Usa el botón de salida ubicado arriba a la derecha para cerrar la sesión de forma segura.</li></ol></details>
  <details><summary><span>02</span><div><strong>Administrar máquinas</strong><small>Alta, edición y eliminación</small></div></summary><ol><li>Abre <b>Administrar máquinas</b> desde el menú.</li><li>Usa el buscador o filtra por Planta y Departamento para localizar un registro.</li><li>Pulsa <b>Agregar máquina</b> y captura Nombre, Planta, Departamento, No. de Activo, Foto y Descripción.</li><li>La foto se convierte automáticamente a WebP y se reduce a un máximo de 180 KB.</li><li>Pulsa <b>Editar</b> para cambiar los datos o reemplazar la fotografía.</li><li>Pulsa <b>Eliminar</b> para borrar la máquina, sus actividades y fotografías. Esta acción requiere confirmación y no se puede deshacer.</li></ol></details>
  <details><summary><span>03</span><div><strong>Actividades de mantenimiento</strong><small>Construcción de la rutina</small></div></summary><ol><li>En la tarjeta de una máquina, pulsa <b>Actividades</b>.</li><li>Agrega el Tipo de actividad, por ejemplo Limpieza, Lubricación, Inspección, Ajuste o Conservación. También puedes escribir otro tipo.</li><li>Captura la descripción de la actividad, Frecuencia, Orden, Material, Equipo de protección y Residuos / advertencia.</li><li>Agrega una fotografía de referencia cuando ayude al operador a identificar el punto de trabajo.</li><li>Usa el Orden para establecer la secuencia de los pasos.</li><li>Edita o elimina actividades desde la misma pantalla.</li><li>En la rutina del operador, las actividades se agrupan automáticamente en contenedores por Tipo de actividad.</li><li>Los registros antiguos sin tipo aparecen en el grupo <b>General</b> hasta que sean editados.</li></ol></details>
  <details><summary><span>04</span><div><strong>Consulta de rutina</strong><small>Uso del operador</small></div></summary><ol><li>El operador puede escanear el QR colocado en la máquina o entrar por <b>Consultar rutina</b>.</li><li>Si entra manualmente, selecciona la tarjeta de la máquina y pulsa <b>Ver rutina</b>.</li><li>Consulta los grupos de actividades y sigue los pasos en el orden indicado.</li><li>Cada actividad muestra frecuencia, material, equipo de protección, residuos o advertencias y fotografía de referencia.</li><li>El QR abre directamente la máquina correspondiente sin solicitar inicio de sesión.</li></ol></details>
  <details><summary><span>05</span><div><strong>Códigos QR e impresión</strong><small>Tarjetas para las máquinas</small></div></summary><ol><li>Abre <b>Códigos QR</b> desde el menú administrativo.</li><li>Busca una máquina o filtra por Planta y Departamento.</li><li>Marca una o varias máquinas. <b>Seleccionar visibles</b> marca solamente los resultados mostrados por los filtros.</li><li>Pulsa <b>Preparar impresión</b> para generar una tarjeta diferente por máquina.</li><li>Revisa la vista previa y pulsa <b>Imprimir tarjetas</b>.</li><li>La impresión acomoda hasta cuatro tarjetas por hoja A4, en una cuadrícula de 2 × 2. Las tarjetas adicionales continúan en páginas nuevas.</li><li>Pulsa <b>Volver a seleccionar</b> para modificar el conjunto antes de imprimir.</li></ol></details>
  <details><summary><span>06</span><div><strong>Auditorías semanales</strong><small>Evaluación de varias máquinas</small></div></summary><ol><li>Abre <b>Auditorías</b> y pulsa <b>Nueva auditoría</b>.</li><li>Selecciona Semana y Fecha de auditoría.</li><li>Busca y filtra las máquinas por Planta o Departamento.</li><li>Marca todas las máquinas de la jornada o utiliza <b>Seleccionar visibles</b>. También puedes quitar toda la selección.</li><li>Pulsa <b>Iniciar auditoría</b>. La aplicación presentará las máquinas una por una.</li><li>Las máquinas sin actividades serán omitidas y la aplicación continuará con la siguiente.</li><li>Evalúa cada actividad como <b>Cumple</b>, <b>No cumple</b> o <b>No aplica</b>.</li><li>La barra superior indica cuántas actividades faltan por evaluar.</li><li>Pulsa <b>Guardar y continuar</b> para registrar la máquina y avanzar a la siguiente.</li><li>Las máquinas seleccionadas juntas se agrupan en el historial como una misma Jornada de auditoría, pero conservan resultados y reportes independientes.</li></ol></details>
  <details><summary><span>07</span><div><strong>Hallazgos y evidencias</strong><small>Registro del incumplimiento</small></div></summary><ol><li>Al seleccionar <b>No cumple</b>, se habilitan Prioridad, Responsable, Fecha compromiso y Evidencia.</li><li>Describe claramente el hallazgo en Observación. La descripción, responsable y fecha son obligatorios para guardar un incumplimiento.</li><li>Selecciona prioridad Baja, Media, Alta o Crítica.</li><li>Adjunta una fotografía desde la galería o cámara. Se comprime automáticamente a WebP con límite de 180 KB.</li><li>La advertencia de residuos de la actividad también queda guardada en el resultado histórico.</li><li>El porcentaje se calcula dividiendo actividades cumplidas entre actividades evaluadas; las marcadas No aplica no afectan el resultado.</li></ol></details>
  <details><summary><span>08</span><div><strong>Seguimiento de hallazgos</strong><small>Corrección, verificación y cierre</small></div></summary><ol><li>Abre una auditoría desde el historial y localiza el hallazgo.</li><li>Cambia su estado entre Abierto, En proceso, Corregido, Verificado o Cerrado.</li><li>Captura la Acción correctiva realizada.</li><li>Adjunta una Evidencia de corrección para comparar el antes y después.</li><li>Pulsa <b>Guardar seguimiento</b>.</li><li>Un hallazgo deja de contarse como abierto cuando está Verificado o Cerrado.</li><li>Cuando todos los hallazgos están atendidos, la auditoría cambia automáticamente a Cerrada.</li></ol></details>
  <details><summary><span>09</span><div><strong>Historial y reportes</strong><small>Consulta e impresión</small></div></summary><ol><li>La pantalla de Auditorías muestra cantidad realizada, cumplimiento promedio y hallazgos abiertos.</li><li>Las tarjetas se agrupan por Jornada de auditoría y muestran máquina, activo, resultado y hallazgos pendientes.</li><li>Pulsa <b>Ver auditoría</b> para abrir el reporte detallado.</li><li>El reporte conserva una copia histórica de máquina, planta, departamento, actividades, tipos, advertencias y auditor.</li><li>Revisa la evaluación, observaciones, hallazgos, responsables, fechas y fotografías.</li><li>Pulsa <b>Imprimir reporte</b> para obtener una versión preparada para hoja A4.</li></ol></details>
  <details><summary><span>10</span><div><strong>Búsqueda y filtros</strong><small>Localización rápida</small></div></summary><ol><li>El buscador reconoce nombre de máquina, número de activo, descripción, planta y departamento.</li><li>Combina el texto con los filtros de Planta y Departamento.</li><li>El contador indica cuántas máquinas coinciden.</li><li>Pulsa <b>Limpiar filtros</b> para restaurar la lista completa.</li><li>Los filtros están disponibles en Administración, Códigos QR y selección de máquinas para auditoría.</li></ol></details>
  <details><summary><span>11</span><div><strong>Instalación, conexión y actualización</strong><small>Funciones de la PWA</small></div></summary><ol><li>Cuando el navegador lo permita, pulsa <b>Instalar</b> en la barra superior para agregar la PWA al teléfono o computadora.</li><li>El indicador superior muestra si la aplicación está En línea o Sin conexión.</li><li>Se necesita conexión para leer o guardar la información vigente de Firebase.</li><li>El Service Worker conserva los archivos principales de la interfaz y cambia de caché con cada versión.</li><li>La versión instalada aparece en la pantalla inicial, al final del sidebar y en Ayuda → Acerca de.</li><li>Si una actualización no aparece inmediatamente, cierra y vuelve a abrir la PWA o recarga la página.</li></ol></details>
  <details><summary><span>12</span><div><strong>Seguridad y almacenamiento</strong><small>Firebase y plan gratuito</small></div></summary><ol><li>Las rutinas y fotografías necesarias para el operador tienen lectura pública mediante el enlace QR.</li><li>Crear, editar y eliminar información requiere una cuenta administradora activa.</li><li>Las auditorías, hallazgos y evidencias son información interna disponible únicamente para administradores.</li><li>Las fotografías se almacenan como documentos comprimidos en Firestore; no se utiliza Firebase Storage.</li><li>Para que los permisos coincidan con la aplicación, publica siempre el archivo <code>firestore.rules</code> actualizado en Firebase Console.</li></ol></details></section>`;
  $('#mainContent').innerHTML = page('Ayuda', 'Soporte', 'Información para usar la aplicación.', `<div class="help-grid"><article class="info-card"><h3>Cómo funciona</h3><p>${instructions}</p></article><article class="info-card"><h3>Conexión</h3><p>Necesitas conexión para consultar y guardar la información vigente.</p></article><article class="info-card"><h3>Acerca de</h3><p>Rutinas STC · HTML, CSS, JavaScript y Firebase.</p><span class="version-badge">Versión ${esc(window.APP_VERSION)}</span></article></div>${manual}`);
}
async function render() {
  const current = route();
  if (current.page === 'rutina' && current.id && !state.browsing && !state.admin) { state.browsing = true; showApp(); return; }
  if (!state.browsing && !state.admin) { showAccess(); return; }
  if (['admin', 'qr', 'auditorias', 'auditoria', 'auditoria-nueva'].includes(current.page) && !state.admin) { showAccess(); return; }
  $('#sidebar').classList.remove('open');
  const navigationPage = current.page.startsWith('auditoria') ? 'auditorias' : (current.page || 'home');
  $$('#navigation a').forEach(link => link.classList.toggle('active', link.dataset.page === navigationPage));
  try {
    if (current.page === 'rutina' && current.id) await routine(decodeURIComponent(current.id));
    else if (current.page === 'admin') await admin();
    else if (current.page === 'auditorias') await audits();
    else if (current.page === 'auditoria-nueva') await newAudit();
    else if (current.page === 'auditoria' && current.id) await auditDetail(decodeURIComponent(current.id));
    else if (current.page === 'qr') await qr();
    else if (current.page === 'help') help();
    else await home();
  } catch (error) {
    console.error(error);
    toast(`No se pudo cargar la información: ${error.message}`, 'error');
    $('#mainContent').innerHTML = page('No se pudo cargar', 'Error', 'Revisa la conexión y vuelve a intentar.', '<div class="empty-state">La información no está disponible.</div>');
  }
}

$('#userAccess').onclick = () => { state.browsing = true; showApp(); };
$('#adminAccess').onclick = () => $('#loginDialog').showModal();
$$('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
$('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const button = $('button[type="submit"]', event.currentTarget);
  const form = new FormData(event.currentTarget);
  busy(button, true, 'Validando…');
  try {
    const credential = await signInWithEmailAndPassword(auth, form.get('email'), form.get('password'));
    if (!await adminAllowed(credential.user)) { await signOut(auth); throw Error('Tu cuenta no está registrada como administradora.'); }
    state.user = credential.user;
    state.admin = true;
    state.browsing = false;
    $('#loginDialog').close();
    location.hash = '#/admin';
    showApp();
  } catch (error) { toast(error.message, 'error'); }
  finally { busy(button, false); }
};
$('#logoutButton').onclick = async () => { state.browsing = false; state.admin = false; state.adminName = ''; await signOut(auth); location.hash = '#/'; showAccess(); };
$('#menuButton').onclick = () => $('#sidebar').classList.add('open');
$('#sidebarBackdrop').onclick = () => $('#sidebar').classList.remove('open');
$('#machineForm').onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button = $('button[type="submit"]', event.currentTarget);
  const payload = {
    name: String(form.get('name')).trim(),
    plant: String(form.get('plant')).trim(),
    department: String(form.get('department')).trim(),
    assetNumber: String(form.get('assetNumber')).trim(),
    description: String(form.get('description')).trim()
  };
  busy(button, true, 'Guardando…');
  try {
    const id = form.get('machineId');
    const reference = id ? doc(db, 'machines', id) : await addDoc(collection(db, 'machines'), payload);
    if (id) await setDoc(reference, payload);
    await savePhoto(['machines', reference.id, 'images', 'cover'], form.get('photo'));
    $('#machineDialog').close();
    await admin();
    toast(id ? 'Máquina actualizada.' : 'Máquina agregada.');
  } catch (error) { toast(`No se pudo guardar: ${error.message}`, 'error'); }
  finally { busy(button, false); }
};
$('#routineForm').onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button = $('button[type="submit"]', event.currentTarget);
  const machineId = form.get('machineId');
  const payload = { activityType: String(form.get('activityType')).trim(), activity: String(form.get('activity')).trim(), frequency: form.get('frequency'), order: Number(form.get('order')), material: String(form.get('material')).trim(), ppe: String(form.get('ppe')).trim(), waste: String(form.get('waste')).trim(), updatedAt: serverTimestamp() };
  busy(button, true, 'Guardando…');
  try {
    const id = form.get('routineId');
    const reference = id ? doc(db, 'machines', machineId, 'routines', id) : await addDoc(collection(db, 'machines', machineId, 'routines'), { ...payload, createdAt: serverTimestamp() });
    if (id) await updateDoc(reference, payload);
    await savePhoto(['machines', machineId, 'routines', reference.id, 'images', 'reference'], form.get('photo'));
    $('#routineDialog').close();
    await routineAdmin(state.machines.find(machine => machine.id === machineId));
    toast('Actividad guardada.');
  } catch (error) { toast(`No se pudo guardar: ${error.message}`, 'error'); }
  finally { busy(button, false); }
};
window.addEventListener('hashchange', render);
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
function updateConnection() { const online = navigator.onLine; $('#connectionState').textContent = online ? 'En línea' : 'Sin conexión'; $('#connectionState').className = `connection ${online ? 'online' : 'offline'}`; }
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.install = event; $('#installButton').hidden = false; });
$('#installButton').onclick = async () => { await state.install?.prompt(); state.install = null; $('#installButton').hidden = true; };
updateConnection();
if ('serviceWorker' in navigator) navigator.serviceWorker.register(`./sw.js?v=${window.APP_VERSION}`).catch(console.warn);
onAuthStateChanged(auth, async user => {
  state.user = user;
  try { state.admin = await adminAllowed(user); }
  catch (error) { state.admin = false; console.error(error); }
  if (state.admin) { state.browsing = false; showApp(); }
  else if (route().page === 'rutina' && route().id) { state.browsing = true; showApp(); }
  else if (state.browsing) showApp();
  else showAccess();
});
