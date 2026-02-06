let state = {
  data: null,     // {rows, columns, biCols, pk}
  original: null, // deep copy de rows
};

const elStatus = document.getElementById("status");
const elWrap = document.getElementById("tableWrap");
const saveBtn = document.getElementById("saveBtn");
const reloadBtn = document.getElementById("reloadBtn");

function setStatus(msg) {
  elStatus.textContent = msg || "";
}


function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

async function load() {
  setStatus("Cargando datos...");
  saveBtn.disabled = true;

  const r = await fetch("/api/data");
  const j = await r.json();
  if (!r.ok) {
    setStatus(j.error || "Error cargando", "err");
    return;
  }

  state.data = j;
  state.original = deepClone(j.rows);
  renderTable();
  setStatus(`Listo. Tabla: ${j.table}. Registros: ${j.rows.length}.`, "ok");
  saveBtn.disabled = false;
}

function pkKey(row, pkCols) {
  // string estable para mapear filas (si PK compuesta)
  return pkCols.map((k) => `${k}=${row[k]}`).join("|");
}

function renderTable() {
  const { rows, columns, biCols, pk } = state.data;

  const biSet = new Set(biCols);
  const pkSet = new Set(pk);

  // Map rowKey -> rowIndex (por seguridad)
  const rowIndexByKey = new Map();
  rows.forEach((r, idx) => rowIndexByKey.set(pkKey(r, pk), idx));

  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const c of columns) {
    const th = document.createElement("th");
    th.textContent = c + (biSet.has(c) ? " (editable)" : "");
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  rows.forEach((row, i) => {
    const tr = document.createElement("tr");

    columns.forEach((col) => {
      const td = document.createElement("td");

      if (biSet.has(col)) {
        const inp = document.createElement("input");
        inp.value = row[col] ?? "";

        inp.addEventListener("input", (e) => {
          const v = e.target.value;
          // actualiza state.data.rows
          state.data.rows[i][col] = v;

          // marcar visualmente si cambió vs original
          const orig = state.original[i][col] ?? "";
          if (String(v) !== String(orig)) inp.classList.add("changed");
          else inp.classList.remove("changed");
        });

        // pre-mark
        const orig = state.original[i][col] ?? "";
        if (String(inp.value) !== String(orig)) inp.classList.add("changed");

        td.appendChild(inp);
      } else {
        td.classList.add("readonly");
        td.textContent = row[col] == null ? "" : String(row[col]);
      }

      // opcional: resaltar PK
      if (pkSet.has(col)) td.style.opacity = "0.95";

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  elWrap.innerHTML = "";
  elWrap.appendChild(table);
}

function buildChanges() {
  const { pk } = state.data;
  const changes = [];

  for (let i = 0; i < state.data.rows.length; i++) {
    const rowNew = state.data.rows[i];
    const rowOld = state.original[i];

    const set = {};
    for (const col of state.data.biCols) {
      const a = rowOld[col] ?? "";
      const b = rowNew[col] ?? "";
      if (String(a) !== String(b)) set[col] = rowNew[col];
    }

    if (Object.keys(set).length === 0) continue;

    const pkObj = {};
    for (const k of pk) pkObj[k] = rowOld[k];

    changes.push({ pk: pkObj, set });
  }

  return changes;
}

async function save() {
  const changes = buildChanges();
  if (changes.length === 0) {
    setStatus("No hay cambios para guardar.", "ok");
    return;
  }

  saveBtn.disabled = true;
  reloadBtn.disabled = true;
  setStatus(`Guardando cambios (${changes.length} filas)...`);

  const r = await fetch("/api/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes })
  });

  const j = await r.json();
  if (!r.ok) {
    setStatus(j.error || "Error guardando", "err");
    saveBtn.disabled = false;
    reloadBtn.disabled = false;
    return;
  }

  setStatus(`Filas actualizadas: ${j.updatedRows}`, "ok");
  await load(); // recarga y resetea originales
  reloadBtn.disabled = false;
}

saveBtn.addEventListener("click", save);
reloadBtn.addEventListener("click", load);

load().catch((e) => setStatus(e.message, "err"));
