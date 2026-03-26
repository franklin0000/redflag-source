const router = require("express").Router();
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

// E.164-compatible phone validation (7-15 digits, optional leading +).
const PHONE_REGEX = /^\+?[1-9]\d{6,14}$/;

function validatePhone(phone) {
  const cleaned = String(phone || "").replace(/[\s\-().]/g, "");
  return PHONE_REGEX.test(cleaned) ? cleaned : null;
}

// GET /api/contacts
router.get("/", requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM trusted_contacts WHERE user_id=$1 ORDER BY created_at ASC",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("contacts GET:", err);
    res.status(500).json({ error: "Failed to load contacts" });
  }
});

// POST /api/contacts
router.post("/", requireAuth, async (req, res) => {
  const { name, relationship = "friend" } = req.body;
  const phone = validatePhone(req.body.phone);
  if (!name || !phone)
    return res.status(400).json({ error: !name ? "name is required" : "Invalid phone number (e.g. +15551234567)" });
  try {
    const { rows: ex } = await db.query(
      "SELECT COUNT(*) FROM trusted_contacts WHERE user_id=$1",
      [req.user.id]
    );
    if (parseInt(ex[0].count) >= 3) return res.status(400).json({ error: "Maximum 3 contacts allowed" });
    const { rows } = await db.query(
      "INSERT INTO trusted_contacts (user_id, name, phone, relationship) VALUES ($1,$2,$3,$4) RETURNING *",
      [req.user.id, name.trim(), phone, relationship]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("contacts POST:", err);
    res.status(500).json({ error: "Failed to add contact" });
  }
});

// PATCH /api/contacts/:id
router.patch("/:id", requireAuth, async (req, res) => {
  const { name, relationship } = req.body;
  const phone = req.body.phone !== undefined ? validatePhone(req.body.phone) : undefined;
  if (req.body.phone !== undefined && !phone)
    return res.status(400).json({ error: "Invalid phone number (e.g. +15551234567)" });
  try {
    const { rows } = await db.query(
      "UPDATE trusted_contacts SET name=COALESCE($1,name), phone=COALESCE($2,phone), relationship=COALESCE($3,relationship) WHERE id=$4 AND user_id=$5 RETURNING *",
      [name ? name.trim() : null, phone !== undefined ? phone : null, relationship || null, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Contact not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("contacts PATCH:", err);
    res.status(500).json({ error: "Failed to update contact" });
  }
});

// DELETE /api/contacts/:id
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      "DELETE FROM trusted_contacts WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: "Contact not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("contacts DELETE:", err);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

module.exports = router;
