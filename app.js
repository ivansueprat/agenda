'use strict';
/* Mi CRM (móvil). Los datos viven solo en este teléfono. El código de esta página no contiene ningún dato. */
const VERSION_APP = '1.0.0';
const K_PKG = 'micrm_pkg', K_LOG = 'micrm_log', K_META = 'micrm_meta';

/* ---------- utilidades ---------- */
function h(tag, attrs, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'checked' || k === 'value' || k === 'disabled') e[k] = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hoy = () => iso(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const sumarDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
function sumarMeses(s, n) {
  const d = parse(s), dia = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return iso(d);
}
const fmt = s => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function etiquetaDia(s) {
  const hy = hoy();
  if (s === hy) return 'Hoy';
  if (s === sumarDias(hy, 1)) return 'Mañana';
  if (s === sumarDias(hy, -1)) return 'Ayer';
  const d = parse(s), n = DIAS[d.getDay()];
  return n[0].toUpperCase() + n.slice(1) + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
}
const euros = v => (v == null || v === '' ? '' : Number(v).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }));
const sinAcentos = t => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const digitos = t => (t || '').replace(/[^\d+]/g, '');
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}
let temporizador;
function toast(msg, mal) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'ver' + (mal ? ' mal' : '');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { t.className = ''; }, mal ? 5000 : 2200);
}

/* ---------- estado guardado en el teléfono ---------- */
let PKG = null, LOG = [], META = {};
let CM = new Map();
function leer(clave, def) {
  try { const t = localStorage.getItem(clave); return t ? JSON.parse(t) : def; } catch (e) { return def; }
}
function escribir(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (e) {
    toast('No se pudo guardar en el móvil (¿sin memoria?)', true); return false;
  }
}
function cargarTodo() { PKG = leer(K_PKG, null); LOG = leer(K_LOG, []); META = leer(K_META, {}); reindexar(); }
function reindexar() {
  CM = new Map();
  if (!PKG) return;
  for (const i of PKG.indice || []) CM.set(i.id, Object.assign({ reducida: true }, i));
  for (const c of PKG.clientes || []) CM.set(c.id, c);
}
function anotar(cambio) {
  LOG.push(Object.assign({ uid: uuid(), creado: new Date().toISOString() }, cambio));
  return escribir(K_LOG, LOG);
}
function quitarCambio(uid) { LOG = LOG.filter(c => c.uid !== uid); escribir(K_LOG, LOG); }

/* ---------- lo que ya está hecho en el móvil (se superpone a los datos del PC) ---------- */
const visitaHecha = v => LOG.some(c => c.tipo === 'visita' && (c.visita_id === v.id || (c.cliente_id === v.cliente_id && c.fecha === v.fecha)));
const tareaHechaLog = id => LOG.find(c => c.tipo === 'tarea_hecha' && c.tarea_id === id);
const seguimientoHecho = id => LOG.some(c => c.tipo === 'seguimiento_oferta' && c.oferta_id === id);
function tareasLocales(clienteId) {
  const out = [];
  for (const c of LOG) {
    if (c.tipo === 'tarea_nueva' && (clienteId == null || c.cliente_id === clienteId))
      out.push({ local: true, descripcion: c.descripcion, fecha_limite: c.fecha_limite, prioridad: c.prioridad, cliente_id: c.cliente_id });
    if (c.tipo === 'visita' && (clienteId == null || c.cliente_id === clienteId))
      for (const t of c.tareas || [])
        out.push({ local: true, descripcion: t.descripcion, fecha_limite: t.fecha_limite, prioridad: t.prioridad, cliente_id: c.cliente_id });
  }
  return out;
}
const nombreCliente = id => (CM.get(id) ? CM.get(id).nombre : '(cliente borrado)');

/* ---------- piezas de pantalla ---------- */
function aviso(texto, clase) { return h('div', { class: 'aviso ' + (clase || '') }, texto); }
function insignia(c) {
  if (!c || !c.clasificacion) return null;
  return h('span', { class: 'badge ' + c.clasificacion }, c.clasificacion);
}
function filaCliente(c, sub, href) {
  return h('a', { class: 'fila', href },
    h('div', { class: 'principal' }, h('b', null, c.nombre), h('span', { class: 'sub' }, sub)), insignia(c));
}
function filaVisita(v) {
  const c = CM.get(v.cliente_id) || { nombre: '(cliente borrado)' };
  const sub = [c.poblacion, v.motivo].filter(Boolean).join(' · ');
  return filaCliente(c, sub, '#/cliente/' + v.cliente_id + '?v=' + v.id);
}
function filaTarea(t) {
  const hecha = !!tareaHechaLog(t.id);
  const cli = t.cliente_id ? nombreCliente(t.cliente_id) : '';
  const venc = t.fecha_limite && t.fecha_limite < hoy() && !hecha;
  const cb = h('input', { type: 'checkbox', checked: hecha, 'aria-label': 'Hecha', onchange: () => alternarTarea(t) });
  return h('label', { class: 'fila' + (hecha ? ' hecha' : ''), style: 'margin:0;color:var(--ink);font-size:1rem' }, cb,
    h('div', { class: 'principal' }, h('b', null, t.descripcion),
      h('span', { class: 'sub' }, [cli, t.fecha_limite ? 'para ' + fmt(t.fecha_limite) : ''].filter(Boolean).join(' · '))),
    venc ? h('span', { class: 'badge mal' }, 'vencida') : (t.prioridad === 'alta' ? h('span', { class: 'badge aviso' }, 'alta') : null));
}
function filaTareaLocal(t) {
  return h('div', { class: 'fila' }, h('span', null, '🕓'),
    h('div', { class: 'principal' }, h('b', null, t.descripcion),
      h('span', { class: 'sub' }, ['nueva, pendiente de enviar', t.fecha_limite ? 'para ' + fmt(t.fecha_limite) : ''].filter(Boolean).join(' · '))));
}
function alternarTarea(t) {
  const previo = tareaHechaLog(t.id);
  if (previo) quitarCambio(previo.uid);
  else anotar({ tipo: 'tarea_hecha', tarea_id: t.id, fecha: hoy() });
  render(true);
}
function lista(filas) { return h('div', { class: 'lista' }, filas); }
function vacio(icono, texto, boton) {
  return h('div', { class: 'vacio' }, h('div', { class: 'grande' }, icono), h('p', null, texto), boton);
}

/* ---------- pantallas ---------- */
function pHoy() {
  if (!PKG) return [vacio('📲', 'Todavía no hay datos del PC en este móvil.',
    h('a', { class: 'boton primario', href: '#/sync' }, 'Cargar datos del PC'))];
  const hy = hoy(), out = [];
  if (PKG.generado.slice(0, 10) < hy)
    out.push(aviso('Datos del PC del ' + fmt(PKG.generado) + '. Si desde entonces has cambiado algo en el PC, vuelve a cargarlos en «Sincronizar».'));
  const pend = PKG.visitas.filter(v => !visitaHecha(v));
  const hechasHoy = LOG.filter(c => c.tipo === 'visita' && c.fecha === hy).length;
  const deHoy = pend.filter(v => v.fecha === hy), atras = pend.filter(v => v.fecha < hy);
  if (atras.length) { out.push(h('h2', null, 'Atrasadas'), lista(atras.map(filaVisita))); }
  out.push(h('h2', null, 'Hoy' + (hechasHoy ? ' · ' + hechasHoy + ' hecha' + (hechasHoy === 1 ? '' : 's') + ' ✓' : '')));
  out.push(deHoy.length ? lista(deHoy.map(filaVisita))
    : h('div', { class: 'lista' }, h('div', { class: 'fila' }, h('span', { class: 'sub' }, hechasHoy ? 'Todo hecho por hoy.' : 'No hay visitas previstas para hoy.'))));
  const fut = pend.filter(v => v.fecha > hy), dias = [...new Set(fut.map(v => v.fecha))].sort();
  for (const d of dias) out.push(h('h2', null, etiquetaDia(d)), lista(fut.filter(v => v.fecha === d).map(filaVisita)));
  const ofs = (PKG.ofertas_seguir || []).filter(o => !seguimientoHecho(o.id) && (!o.proximo_seguimiento || o.proximo_seguimiento <= hy));
  if (ofs.length) {
    out.push(h('h2', null, 'Ofertas a seguir'));
    out.push(lista(ofs.map(o => h('a', { class: 'fila', href: '#/oferta/' + o.id },
      h('div', { class: 'principal' }, h('b', null, o.cliente || nombreCliente(o.cliente_id)),
        h('span', { class: 'sub' }, ['Oferta ' + o.numero, euros(o.total), o.proximo_seguimiento ? 'seguir ' + fmt(o.proximo_seguimiento) : ''].filter(Boolean).join(' · ')))))));
  }
  const ts = (PKG.tareas || []).filter(t => t.fecha_limite && t.fecha_limite <= hy);
  if (ts.length) out.push(h('h2', null, 'Tareas para hoy o vencidas'), lista(ts.map(filaTarea)));
  return out;
}

let busqueda = '';
function pClientes() {
  if (!PKG) return [vacio('📲', 'Carga primero los datos del PC.', h('a', { class: 'boton primario', href: '#/sync' }, 'Sincronizar'))];
  const todos = [...CM.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const caja = h('input', { type: 'search', placeholder: 'Buscar por nombre, nº o población', autocomplete: 'off', value: busqueda });
  const res = h('div');
  function pintar() {
    const q = sinAcentos(caja.value.trim());
    busqueda = caja.value;
    const ok = q ? todos.filter(c => sinAcentos(c.nombre + ' ' + c.numero + ' ' + c.poblacion).includes(q)) : todos;
    res.replaceChildren(h('h2', null, ok.length + ' cliente' + (ok.length === 1 ? '' : 's') + (ok.length > 60 ? ' (primeros 60)' : '')),
      ok.length ? lista(ok.slice(0, 60).map(c => filaCliente(c, [c.numero, c.poblacion].filter(Boolean).join(' · '), '#/cliente/' + c.id)))
        : vacio('🔍', 'Nada con ese texto.'));
  }
  caja.addEventListener('input', pintar);
  pintar();
  return [caja, res];
}

function datoFila(k, v, enlace) {
  if (!v) return null;
  return h('div', { class: 'dato' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, enlace ? h('a', { href: enlace }, v) : v));
}
function pCliente(id, params) {
  const c = CM.get(id);
  if (!c) return [vacio('❓', 'Este cliente ya no está en los datos del móvil.')];
  const vid = params.get('v') ? Number(params.get('v')) : null;
  const out = [];
  const mapa = [c.direccion, c.poblacion].filter(Boolean).join(', ');
  const acciones = [];
  if (c.telefono) acciones.push(h('a', { class: 'boton', href: 'tel:' + digitos(c.telefono) }, '📞 Llamar'));
  if (mapa) acciones.push(h('a', { class: 'boton', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapa), target: '_blank', rel: 'noopener' }, '🗺 Cómo llegar'));
  acciones.push(h('a', { class: 'boton primario', href: '#/visita/' + id + (vid ? '?v=' + vid : '') }, '✍ Registrar visita'));
  acciones.push(h('a', { class: 'boton', href: '#/nota/' + id }, '📝 Nota'));
  out.push(h('div', { class: 'tarjeta' },
    h('div', { style: 'display:flex;gap:8px;align-items:center;justify-content:space-between' },
      h('h3', { style: 'margin:0;font-size:1.15rem' }, c.nombre), insignia(c)),
    h('div', { class: 'sub' }, [c.numero ? 'Nº ' + c.numero : 'Potencial', c.poblacion].filter(Boolean).join(' · ')),
    h('div', { class: 'acciones' }, acciones)));
  if (c.reducida) out.push(aviso('Ficha reducida: este cliente no estaba en la agenda de los próximos días. Puedes llamarle y registrar visita; el detalle completo está en el PC.'));
  else {
    const datos = [datoFila('Dirección', c.direccion), datoFila('Zona', c.zona),
      datoFila('Teléfono', c.telefono, c.telefono ? 'tel:' + digitos(c.telefono) : null),
      datoFila('Email', c.email, c.email ? 'mailto:' + c.email : null)].filter(Boolean);
    if (datos.length) out.push(h('div', { class: 'tarjeta' }, datos));
    if ((c.contactos || []).length) {
      out.push(h('h2', null, 'Contactos'));
      out.push(lista(c.contactos.map(k => h('div', { class: 'fila' },
        h('div', { class: 'principal' }, h('b', null, k.nombre + (k.principal ? ' ★' : '')), h('span', { class: 'sub' }, [k.cargo, k.email].filter(Boolean).join(' · '))),
        k.telefono ? h('a', { class: 'boton mini', href: 'tel:' + digitos(k.telefono) }, '📞 ' + k.telefono) : null))));
    }
  }
  const pend = (PKG.tareas || []).filter(t => t.cliente_id === id), locales = tareasLocales(id);
  if (pend.length || locales.length) out.push(h('h2', null, 'Tareas'), lista([pend.map(filaTarea), locales.map(filaTareaLocal)]));
  const ofs = (c.ofertas || []).filter(o => !seguimientoHecho(o.id));
  if (ofs.length) out.push(h('h2', null, 'Ofertas abiertas'), lista(ofs.map(o => h('a', { class: 'fila', href: '#/oferta/' + o.id },
    h('div', { class: 'principal' }, h('b', null, 'Oferta ' + o.numero + ' · ' + euros(o.total)),
      h('span', { class: 'sub' }, fmt(o.fecha) + (o.proximo_seguimiento ? ' · seguir ' + fmt(o.proximo_seguimiento) : '')))))));
  if ((c.ultimas || []).length) out.push(h('h2', null, 'Últimas visitas'), lista(c.ultimas.map(u => h('div', { class: 'fila' },
    h('div', { class: 'principal' }, h('b', null, fmt(u.fecha) + (u.contacto ? ' · ' + u.contacto : '')),
      h('span', { class: 'notas' }, u.resumen || '(sin resumen)'))))));
  const locNotas = LOG.filter(x => x.tipo === 'nota' && x.cliente_id === id);
  if (c.notas || locNotas.length) out.push(h('h2', null, 'Notas'), h('div', { class: 'tarjeta notas' },
    [c.notas, ...locNotas.map(n => '[' + fmt(n.fecha) + ' móvil, pendiente de enviar] ' + n.texto)].filter(Boolean).join('\n')));
  return out;
}

function pVisita(id, params) {
  const c = CM.get(id);
  if (!c) return [vacio('❓', 'Cliente no encontrado.')];
  const vid = params.get('v') ? Number(params.get('v')) : null;
  const contactos = c.contactos || [];
  const fecha = h('input', { type: 'date', value: hoy() });
  const sel = h('select', null, h('option', { value: '' }, '— Sin contacto concreto —'),
    contactos.map(k => h('option', { value: k.id }, k.nombre + (k.cargo ? ' (' + k.cargo + ')' : ''))),
    h('option', { value: 'nuevo' }, '＋ Contacto nuevo…'));
  const principal = contactos.find(k => k.principal);
  if (principal) sel.value = String(principal.id);
  const nNombre = h('input', { placeholder: 'Nombre' }), nCargo = h('input', { placeholder: 'Cargo' }), nTel = h('input', { type: 'tel', placeholder: 'Teléfono' });
  const nuevo = h('div', { style: 'display:none' }, h('div', { class: 'dos', style: 'margin-top:8px' }, nNombre, nCargo), h('div', { style: 'margin-top:8px' }, nTel));
  sel.addEventListener('change', () => { nuevo.style.display = sel.value === 'nuevo' ? 'block' : 'none'; });
  const resumen = h('textarea', { placeholder: 'Qué se ha hablado, qué necesita…' });
  const rapidas = ['Sin novedades', 'No estaba', 'Cerrado', 'Pide oferta', 'Pedido en curso'].map(t =>
    h('button', { type: 'button', class: 'ficha-chip', onclick: () => { resumen.value = (resumen.value ? resumen.value.trimEnd() + '. ' : '') + t + '.'; } }, t));
  const tareasBox = h('div');
  const filas = [];
  function anadirTarea() {
    const d = h('input', { placeholder: 'Qué hay que hacer' }), f = h('input', { type: 'date' });
    const p = h('select', null, h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'alta' }, 'Alta'), h('option', { value: 'baja' }, 'Baja'));
    const caja = h('div', { class: 'tarea-nueva' }, d, h('div', { class: 'dos', style: 'margin-top:8px' }, f, p),
      h('button', { type: 'button', class: 'mini', style: 'margin-top:8px', onclick: () => { caja.remove(); filas.splice(filas.indexOf(r), 1); } }, 'Quitar'));
    const r = { d, f, p };
    filas.push(r); tareasBox.append(caja); d.focus();
  }
  const prox = h('input', { type: 'date' });
  const atajo = (txt, fn) => h('button', { type: 'button', class: 'ficha-chip', onclick: () => { prox.value = fn(fecha.value || hoy()); } }, txt);
  const guardarBtn = h('button', { class: 'primario', style: 'width:100%;margin-top:18px', onclick: guardar }, 'Guardar visita');
  function guardar() {
    if (!fecha.value) return toast('Falta la fecha', true);
    if (!resumen.value.trim()) return toast('Escribe un resumen, aunque sea corto', true);
    const cambio = { tipo: 'visita', cliente_id: id, visita_id: vid, fecha: fecha.value, resumen: resumen.value.trim() };
    if (sel.value === 'nuevo') {
      if (!nNombre.value.trim()) return toast('Falta el nombre del contacto nuevo', true);
      cambio.contacto_nuevo = { nombre: nNombre.value.trim(), cargo: nCargo.value.trim(), telefono: nTel.value.trim() };
    } else if (sel.value) cambio.contacto_id = Number(sel.value);
    const ts = filas.filter(r => r.d.value.trim()).map(r => ({ descripcion: r.d.value.trim(), fecha_limite: r.f.value || null, prioridad: r.p.value }));
    if (ts.length) cambio.tareas = ts;
    if (prox.value) {
      if (prox.value <= fecha.value) return toast('La próxima visita debe ser posterior a esta', true);
      cambio.proxima = prox.value;
    }
    guardarBtn.disabled = true;
    if (!anotar(cambio)) { guardarBtn.disabled = false; return; }
    toast('Visita guardada ✓');
    location.hash = '#/';
  }
  return [
    h('div', { class: 'tarjeta' },
      h('b', null, c.nombre), h('div', { class: 'sub' }, c.poblacion || ''),
      h('label', null, 'Fecha de la visita'), fecha,
      h('label', null, 'Con quién has hablado'), sel, nuevo,
      h('label', null, 'Resumen'), resumen, h('div', { class: 'fichas' }, rapidas)),
    h('div', { class: 'tarjeta' }, h('h3', null, 'Tareas que salen de la visita'), tareasBox,
      h('button', { type: 'button', style: 'margin-top:8px', onclick: anadirTarea }, '＋ Añadir tarea')),
    h('div', { class: 'tarjeta' }, h('h3', null, 'Próxima visita'), prox,
      h('div', { class: 'fichas' }, atajo('1 semana', f => sumarDias(f, 7)), atajo('2 semanas', f => sumarDias(f, 14)),
        atajo('1 mes', f => sumarMeses(f, 1)), atajo('3 meses', f => sumarMeses(f, 3)),
        h('button', { type: 'button', class: 'ficha-chip', onclick: () => { prox.value = ''; } }, 'Ninguna'))),
    guardarBtn];
}

function pNota(id) {
  const c = CM.get(id);
  if (!c) return [vacio('❓', 'Cliente no encontrado.')];
  const t = h('textarea', { placeholder: 'Nota para la ficha del cliente…' });
  return [h('div', { class: 'tarjeta' }, h('b', null, c.nombre), h('label', null, 'Nota'), t,
    h('button', { class: 'primario', style: 'width:100%;margin-top:14px', onclick: () => {
      if (!t.value.trim()) return toast('La nota está vacía', true);
      if (anotar({ tipo: 'nota', cliente_id: id, fecha: hoy(), texto: t.value.trim() })) { toast('Nota guardada ✓'); history.back(); }
    } }, 'Guardar nota'))];
}

function pOferta(id) {
  const o = (PKG.ofertas_seguir || []).find(x => x.id === id)
    || [...CM.values()].flatMap(c => (c.ofertas || []).map(x => Object.assign({ cliente_id: c.id }, x))).find(x => x.id === id);
  if (!o) return [vacio('❓', 'Oferta no encontrada.')];
  const nota = h('textarea', { placeholder: 'Qué ha dicho el cliente de la oferta…' }), prox = h('input', { type: 'date' });
  const atajo = (txt, fn) => h('button', { type: 'button', class: 'ficha-chip', onclick: () => { prox.value = fn(hoy()); } }, txt);
  return [h('div', { class: 'tarjeta' },
    h('b', null, 'Oferta ' + o.numero + ' · ' + (o.cliente || nombreCliente(o.cliente_id))),
    h('div', { class: 'sub' }, [euros(o.total), fmt(o.fecha)].filter(Boolean).join(' · ')),
    o.notas ? h('p', { class: 'notas sub' }, o.notas) : null,
    o.cliente_id && CM.get(o.cliente_id) && CM.get(o.cliente_id).telefono
      ? h('div', { class: 'acciones' }, h('a', { class: 'boton', href: 'tel:' + digitos(CM.get(o.cliente_id).telefono) }, '📞 Llamar')) : null,
    h('label', null, 'Resultado del seguimiento'), nota,
    h('label', null, 'Próximo seguimiento'), prox,
    h('div', { class: 'fichas' }, atajo('1 semana', f => sumarDias(f, 7)), atajo('2 semanas', f => sumarDias(f, 14)), atajo('1 mes', f => sumarMeses(f, 1))),
    h('button', { class: 'primario', style: 'width:100%;margin-top:16px', onclick: () => {
      if (anotar({ tipo: 'seguimiento_oferta', oferta_id: id, fecha: hoy(), nota: nota.value.trim(), proximo: prox.value || null })) {
        toast('Seguimiento guardado ✓'); location.hash = '#/';
      }
    } }, 'Guardar seguimiento'))];
}

function pTareas() {
  if (!PKG) return [vacio('📲', 'Carga primero los datos del PC.', h('a', { class: 'boton primario', href: '#/sync' }, 'Sincronizar'))];
  const hy = hoy(), out = [h('a', { class: 'boton primario', style: 'width:100%', href: '#/tarea' }, '＋ Nueva tarea')];
  const ts = PKG.tareas || [];
  const grupos = [['Vencidas', t => t.fecha_limite && t.fecha_limite < hy], ['Para hoy', t => t.fecha_limite === hy],
    ['Próximas', t => t.fecha_limite && t.fecha_limite > hy], ['Sin fecha', t => !t.fecha_limite]];
  for (const [nombre, f] of grupos) {
    const g = ts.filter(f);
    if (g.length) out.push(h('h2', null, nombre), lista(g.map(filaTarea)));
  }
  const loc = tareasLocales(null);
  if (loc.length) out.push(h('h2', null, 'Nuevas (pendientes de enviar)'), lista(loc.map(filaTareaLocal)));
  if (!ts.length && !loc.length) out.push(vacio('🎉', 'No hay tareas pendientes.'));
  return out;
}

function pTareaNueva(params) {
  const cid = params.get('c') ? Number(params.get('c')) : null;
  const desc = h('input', { placeholder: 'Qué hay que hacer' }), f = h('input', { type: 'date' });
  const p = h('select', null, h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'alta' }, 'Alta'), h('option', { value: 'baja' }, 'Baja'));
  const cli = h('select', null, h('option', { value: '' }, '— Sin cliente —'),
    [...CM.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c => h('option', { value: c.id }, c.nombre + (c.poblacion ? ' · ' + c.poblacion : ''))));
  if (cid) cli.value = String(cid);
  return [h('div', { class: 'tarjeta' }, h('label', null, 'Tarea'), desc, h('label', null, 'Cliente'), cli,
    h('div', { class: 'dos' }, h('div', null, h('label', null, 'Para el día'), f), h('div', null, h('label', null, 'Prioridad'), p)),
    h('button', { class: 'primario', style: 'width:100%;margin-top:16px', onclick: () => {
      if (!desc.value.trim()) return toast('Falta la descripción', true);
      if (anotar({ tipo: 'tarea_nueva', cliente_id: cli.value ? Number(cli.value) : null, descripcion: desc.value.trim(), fecha_limite: f.value || null, prioridad: p.value })) {
        toast('Tarea guardada ✓'); location.hash = '#/tareas';
      }
    } }, 'Guardar tarea'))];
}

/* ---------- sincronizar ---------- */
function descCambio(c) {
  const t = {
    visita: () => 'Visita · ' + nombreCliente(c.cliente_id) + ' · ' + fmt(c.fecha),
    tarea_hecha: () => 'Tarea hecha · ' + (((PKG && PKG.tareas) || []).find(x => x.id === c.tarea_id) || { descripcion: '#' + c.tarea_id }).descripcion,
    tarea_nueva: () => 'Tarea nueva · ' + c.descripcion,
    nota: () => 'Nota · ' + nombreCliente(c.cliente_id),
    seguimiento_oferta: () => 'Seguimiento de oferta #' + c.oferta_id
  }[c.tipo];
  return t ? t() : c.tipo;
}
function cargarArchivo(file) {
  const lector = new FileReader();
  lector.onerror = () => toast('No se pudo leer el archivo', true);
  lector.onload = () => {
    let d;
    try { d = JSON.parse(String(lector.result).replace(/^﻿/, '')); } catch (e) { return toast('Ese archivo no es válido', true); }
    if (d && Array.isArray(d.cambios)) return toast('Ese es un archivo del móvil. Busca para_movil.json', true);
    if (!d || d.version !== 1 || !Array.isArray(d.visitas) || !Array.isArray(d.clientes)) return toast('No parece el archivo para_movil.json', true);
    if (PKG && d.generado < PKG.generado && !confirm('Este archivo es más antiguo (' + fmt(d.generado) + ') que el que ya tienes (' + fmt(PKG.generado) + '). ¿Cargarlo igualmente?')) return;
    const importados = new Set(d.importados || []);
    const antes = LOG.length;
    LOG = LOG.filter(c => !importados.has(c.uid));
    PKG = d;
    if (!escribir(K_PKG, PKG) || !escribir(K_LOG, LOG)) return;
    reindexar();
    const recogidos = antes - LOG.length;
    toast('Datos cargados ✓' + (recogidos ? ' · el PC ya había recogido ' + recogidos + ' cambio' + (recogidos === 1 ? '' : 's') : ''));
    render();
  };
  lector.readAsText(file);
}
async function enviarAlPC() {
  if (!LOG.length) return toast('No hay nada que enviar');
  const ahora = new Date();
  const base = 'desde_movil_' + iso(ahora) + '_' + pad(ahora.getHours()) + pad(ahora.getMinutes());
  const texto = JSON.stringify({ version: 1, generado: ahora.toISOString(), cambios: LOG });
  if (navigator.canShare && navigator.share) {
    for (const [ext, tipo] of [['json', 'application/json'], ['txt', 'text/plain']]) {
      const f = new File([texto], base + '.' + ext, { type: tipo });
      if (!navigator.canShare({ files: [f] })) continue;
      try {
        await navigator.share({ files: [f], title: 'Datos del CRM' });
        META.envio = ahora.toISOString(); escribir(K_META, META); render(true);
        return;
      } catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const a = h('a', { href: URL.createObjectURL(new Blob([texto], { type: 'application/json' })), download: base + '.json' });
  document.body.append(a); a.click(); a.remove();
  META.envio = ahora.toISOString(); escribir(K_META, META);
  toast('Archivo guardado en Descargas. Súbelo a la carpeta de Drive.');
  render(true);
}
function pSync() {
  const out = [];
  const entrada = h('input', { type: 'file', style: 'display:none', onchange: e => { if (e.target.files[0]) cargarArchivo(e.target.files[0]); } });
  out.push(h('div', { class: 'tarjeta' }, h('h3', null, '1 · Datos del PC'),
    PKG ? h('p', { class: 'sub', style: 'margin:0 0 6px' }, 'Generados el ' + fmt(PKG.generado) + ' a las ' + PKG.generado.slice(11, 16) + ' · '
      + PKG.visitas.length + ' visitas, ' + PKG.clientes.length + ' fichas, ' + PKG.indice.length + ' clientes más en el índice.')
      : h('p', { class: 'sub', style: 'margin:0 0 6px' }, 'Aún no has cargado nada.'),
    h('p', { style: 'margin:0 0 10px;font-size:.92rem' }, 'Pulsa y elige el archivo ', h('b', null, 'para_movil.json'), ' de la carpeta de Drive.'),
    h('button', { class: 'primario', style: 'width:100%', onclick: () => entrada.click() }, '📥 Cargar datos del PC'), entrada));
  out.push(h('div', { class: 'tarjeta' }, h('h3', null, '2 · Enviar al PC (' + LOG.length + ' cambio' + (LOG.length === 1 ? '' : 's') + ')'),
    LOG.length ? h('p', { class: 'sub', style: 'margin:0 0 10px' }, 'Elige «Drive» al compartir y guárdalo en la carpeta MiCRM_movil.')
      : h('p', { class: 'sub', style: 'margin:0' }, 'No hay cambios pendientes.'),
    LOG.length ? h('button', { class: 'primario', style: 'width:100%', onclick: enviarAlPC }, '📤 Enviar al PC') : null,
    META.envio ? h('p', { class: 'sub', style: 'margin:10px 0 0' }, 'Último envío: ' + fmt(META.envio) + ' ' + META.envio.slice(11, 16) + ' UTC. Los cambios desaparecen de aquí cuando el PC los recoja y cargues sus datos nuevos.') : null));
  if (LOG.length) {
    out.push(h('h2', null, 'Pendientes de recoger por el PC'));
    out.push(lista(LOG.map(c => h('div', { class: 'fila' }, h('div', { class: 'principal' }, h('span', null, descCambio(c))),
      h('button', { class: 'mini', onclick: () => { if (confirm('¿Quitar este cambio de la lista?')) { quitarCambio(c.uid); render(true); } } }, 'Quitar')))));
  }
  out.push(h('h2', null, 'Acerca de'));
  out.push(h('div', { class: 'tarjeta sub' }, 'Mi CRM móvil ' + VERSION_APP + '. Los datos de clientes están solo en este teléfono.',
    h('div', { style: 'margin-top:10px' }, h('button', { class: 'peligro mini', onclick: () => {
      if (confirm('Se borrarán los datos de este móvil, incluidos los cambios que no hayas enviado. ¿Seguro?')) {
        try { localStorage.removeItem(K_PKG); localStorage.removeItem(K_LOG); localStorage.removeItem(K_META); } catch (e) { /* nada */ }
        cargarTodo(); toast('Datos borrados'); render();
      }
    } }, 'Borrar datos de este móvil'))));
  return out;
}

/* ---------- navegación ---------- */
function rutaActual() {
  const [p, q] = location.hash.slice(1).split('?');
  return { partes: (p || '/').split('/').filter(Boolean), params: new URLSearchParams(q || '') };
}
const PESTANAS = [['', '📅', 'Hoy'], ['clientes', '👥', 'Clientes'], ['tareas', '✅', 'Tareas'], ['sync', '🔄', 'Sincronizar']];
function render(conservar) {
  const y = window.scrollY;
  const { partes, params } = rutaActual();
  const id = partes[1] ? Number(partes[1]) : null;
  let titulo = 'Mi CRM', cuerpo, atras = true;
  switch (partes[0]) {
    case undefined: titulo = 'Hoy'; cuerpo = pHoy(); atras = false; break;
    case 'clientes': titulo = 'Clientes'; cuerpo = pClientes(); atras = false; break;
    case 'tareas': titulo = 'Tareas'; cuerpo = pTareas(); atras = false; break;
    case 'sync': titulo = 'Sincronizar'; cuerpo = pSync(); atras = false; break;
    case 'cliente': titulo = (CM.get(id) || {}).nombre || 'Cliente'; cuerpo = pCliente(id, params); break;
    case 'visita': titulo = 'Registrar visita'; cuerpo = pVisita(id, params); break;
    case 'nota': titulo = 'Nueva nota'; cuerpo = pNota(id); break;
    case 'oferta': titulo = 'Seguimiento de oferta'; cuerpo = PKG ? pOferta(id) : []; break;
    case 'tarea': titulo = 'Nueva tarea'; cuerpo = pTareaNueva(params); break;
    default: location.hash = '#/'; return;
  }
  const cab = document.getElementById('cab');
  cab.replaceChildren(...[
    atras ? h('button', { class: 'atras', 'aria-label': 'Volver', onclick: () => (history.length > 1 ? history.back() : (location.hash = '#/')) }, '‹') : null,
    h('h1', null, titulo),
    partes[0] === undefined ? h('span', { class: 'fecha' }, DIAS[new Date().getDay()] + ' ' + new Date().getDate() + '/' + (new Date().getMonth() + 1)) : null].filter(Boolean));
  document.getElementById('app').replaceChildren(...[].concat(cuerpo));
  const activa = ['', 'clientes', 'tareas', 'sync'].includes(partes[0] || '') ? (partes[0] || '') : (partes[0] === 'cliente' ? 'clientes' : '');
  document.getElementById('nav').replaceChildren(...PESTANAS.map(([r, ico, txt]) =>
    h('a', { href: '#/' + r, class: r === activa ? 'on' : '' }, h('span', null, ico), txt,
      r === 'sync' && LOG.length ? h('b', { class: 'n' }, LOG.length) : null)));
  window.scrollTo(0, conservar ? y : 0);
}

window.addEventListener('hashchange', () => render());
cargarTodo();
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
