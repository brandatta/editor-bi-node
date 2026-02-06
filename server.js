require("dotenv").config();
const express = require("express");
const path = require("path");
const { getPool, quoteIdent, isBiCol } = require("./db");

const app = express();
const pool = getPool();

const TABLE = process.env.APP_TABLE;
const PK_COLS = String(process.env.APP_PK || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const LIMIT = Number(process.env.APP_LIMIT || 200);

if (!TABLE) throw new Error("Falta APP_TABLE en .env");
if (PK_COLS.length === 0) throw new Error("Falta APP_PK en .env (ej: col1,col2)");

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// GET /api/data => devuelve rows + columns + meta
app.get("/api/data", async (req, res) => {
  try {
    const sql = `SELECT * FROM ${quoteIdent(TABLE)} LIMIT ?`;
    const [rows] = await pool.query(sql, [LIMIT]);

    const columns = rows.length ? Object.keys(rows[0]) : [];
    const biCols = columns.filter(isBiCol);

    res.json({
      table: TABLE,
      limit: LIMIT,
      pk: PK_COLS,
      columns,
      biCols,
      rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/update
 * Body:
 * {
 *   "changes": [
 *     {
 *       "pk": {"material_codigo":"X","centro":"Y"},
 *       "set": {"bi_x": "nuevo", "bi_y": 123}
 *     }
 *   ]
 * }
 */
app.post("/api/update", async (req, res) => {
  const changes = req.body?.changes;
  if (!Array.isArray(changes)) {
    return res.status(400).json({ error: "Body inválido: se esperaba {changes: [...]}" });
  }

  // Validaciones defensivas
  for (const ch of changes) {
    if (!ch?.pk || typeof ch.pk !== "object") {
      return res.status(400).json({ error: "Cambio inválido: falta pk" });
    }
    if (!ch?.set || typeof ch.set !== "object") {
      return res.status(400).json({ error: "Cambio inválido: falta set" });
    }
    for (const k of Object.keys(ch.set)) {
      if (!isBiCol(k)) {
        return res.status(400).json({ error: `Columna no permitida (no BI): ${k}` });
      }
    }
    for (const pk of PK_COLS) {
      if (!(pk in ch.pk)) {
        return res.status(400).json({ error: `Falta PK ${pk} en pk` });
      }
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let updatedRows = 0;

    for (const ch of changes) {
      const setCols = Object.keys(ch.set);
      if (setCols.length === 0) continue;

      const setSql = setCols.map((c) => `${quoteIdent(c)}=?`).join(", ");
      const whereSql = PK_COLS.map((pk) => `${quoteIdent(pk)}=?`).join(" AND ");

      const vals = [
        ...setCols.map((c) => ch.set[c]),
        ...PK_COLS.map((pk) => ch.pk[pk])
      ];

      const sql = `UPDATE ${quoteIdent(TABLE)} SET ${setSql} WHERE ${whereSql}`;
      const [result] = await conn.query(sql, vals);

      // Contamos como "fila tocada" si hubo ejecución con set
      // (si querés exactitud: usar result.affectedRows)
      if (result.affectedRows > 0) updatedRows += 1;
    }

    await conn.commit();
    res.json({ updatedRows });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

app.get("/health", (req, res) => res.send("ok"));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Editor BI escuchando en http://0.0.0.0:${PORT}`);
});
