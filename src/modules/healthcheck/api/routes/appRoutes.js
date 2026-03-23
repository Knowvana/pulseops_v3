// ============================================================================
// HealthCheck Module — Application & Category Routes
//
// PURPOSE: CRUD for monitored applications and user-defined categories.
//
// ENDPOINTS:
//   GET    /applications          → List all apps (with category info)
//   POST   /applications          → Create a new monitored app
//   PUT    /applications/:id      → Update an app
//   DELETE /applications/:id      → Delete an app
//   PATCH  /applications/:id/toggle → Toggle active/inactive
//
//   GET    /categories            → List all categories
//   POST   /categories            → Create a new category
//   PUT    /categories/:id        → Update a category
//   DELETE /categories/:id        → Delete a category (if not in use)
// ============================================================================
import { Router } from 'express';
import { hcUrls, apiErrors, apiMessages } from '#modules/healthcheck/api/config/index.js';
import { dbSchema, DatabaseService } from '#modules/healthcheck/api/routes/helpers.js';
import { createHcLogger } from '#modules/healthcheck/api/lib/moduleLogger.js';

const log = createHcLogger('appRoutes.js');
const router = Router();
const routes = hcUrls.routes;

// ═════════════════════════════════════════════════════════════════════════════
// APPLICATIONS
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /applications ────────────────────────────────────────────────────────
router.get(routes.applications, async (req, res) => {
  try {
    const result = await DatabaseService.query(
      `SELECT a.*, c.name AS category_name, c.color AS category_color
       FROM ${dbSchema}.hc_applications a
       LEFT JOIN ${dbSchema}.hc_categories c ON a.category_id = c.id
       ORDER BY a.sort_order, a.name`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    log.error('GET applications failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.applications.fetchFailed.replace('{message}', err.message) } });
  }
});

// ── POST /applications ───────────────────────────────────────────────────────
router.post(routes.applications, async (req, res) => {
  try {
    const { name, url, category_id, expected_status_code, expected_text, timeout_ms, description, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: { message: apiErrors.applications.nameRequired } });
    if (!url?.trim()) return res.status(400).json({ success: false, error: { message: apiErrors.applications.urlRequired } });

    // Validate URL format
    try { new URL(url); } catch {
      return res.status(400).json({ success: false, error: { message: apiErrors.applications.urlInvalid } });
    }

    const result = await DatabaseService.query(
      `INSERT INTO ${dbSchema}.hc_applications
       (name, url, category_id, expected_status_code, expected_text, timeout_ms, description, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        name.trim(),
        url.trim(),
        category_id || null,
        expected_status_code || 200,
        expected_text || null,
        timeout_ms || 10000,
        description || null,
        sort_order || 99,
      ]
    );
    log.info('Application created', { id: result.rows[0].id, name: name.trim() });
    res.status(201).json({ success: true, data: result.rows[0], message: apiMessages.applications.created });
  } catch (err) {
    log.error('POST application failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.applications.createFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /applications/:id ────────────────────────────────────────────────────
router.put(routes.applicationById, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, category_id, expected_status_code, expected_text, timeout_ms, description, sort_order, is_active } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: { message: apiErrors.applications.nameRequired } });
    if (!url?.trim()) return res.status(400).json({ success: false, error: { message: apiErrors.applications.urlRequired } });

    const result = await DatabaseService.query(
      `UPDATE ${dbSchema}.hc_applications
       SET name = $1, url = $2, category_id = $3, expected_status_code = $4,
           expected_text = $5, timeout_ms = $6,
           description = $7, sort_order = $8, is_active = $9, updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        name.trim(), url.trim(), category_id || null,
        expected_status_code || 200, expected_text || null, timeout_ms || 10000,
        description || null, sort_order || 99,
        is_active !== false, id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: { message: apiErrors.applications.notFound } });
    log.info('Application updated', { id, name: name.trim() });
    res.json({ success: true, data: result.rows[0], message: apiMessages.applications.updated });
  } catch (err) {
    log.error('PUT application failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.applications.updateFailed.replace('{message}', err.message) } });
  }
});

// ── DELETE /applications/:id ─────────────────────────────────────────────────
router.delete(routes.applicationById, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await DatabaseService.query(
      `DELETE FROM ${dbSchema}.hc_applications WHERE id = $1 RETURNING id, name`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: { message: apiErrors.applications.notFound } });
    log.info('Application deleted', { id, name: result.rows[0].name });
    res.json({ success: true, data: result.rows[0], message: apiMessages.applications.deleted });
  } catch (err) {
    log.error('DELETE application failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.applications.deleteFailed.replace('{message}', err.message) } });
  }
});

// ── PATCH /applications/:id/toggle ───────────────────────────────────────────
router.patch(routes.applicationToggle, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await DatabaseService.query(
      `UPDATE ${dbSchema}.hc_applications
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: { message: apiErrors.applications.notFound } });
    const app = result.rows[0];
    log.info('Application toggled', { id, name: app.name, is_active: app.is_active });
    res.json({ success: true, data: app, message: apiMessages.applications.updated });
  } catch (err) {
    log.error('PATCH toggle failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.applications.updateFailed.replace('{message}', err.message) } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /categories ──────────────────────────────────────────────────────────
router.get(routes.categories, async (req, res) => {
  try {
    const result = await DatabaseService.query(
      `SELECT c.*, COUNT(a.id)::int AS app_count
       FROM ${dbSchema}.hc_categories c
       LEFT JOIN ${dbSchema}.hc_applications a ON a.category_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order, c.name`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    log.error('GET categories failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.categories.fetchFailed.replace('{message}', err.message) } });
  }
});

// ── POST /categories ─────────────────────────────────────────────────────
router.post(routes.categories, async (req, res) => {
  try {
    const { name, description, color, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: { message: apiErrors.categories.nameRequired } });

    const result = await DatabaseService.query(
      `INSERT INTO ${dbSchema}.hc_categories (name, description, color, sort_order, is_system_default)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), description || null, color || '#6366f1', sort_order || 99, false]
    );
    log.info('Category created', { id: result.rows[0].id, name: name.trim() });
    res.status(201).json({ success: true, data: result.rows[0], message: apiMessages.categories.created });
  } catch (err) {
    log.error('POST category failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.categories.createFailed.replace('{message}', err.message) } });
  }
});

// ── PUT /categories/:id ──────────────────────────────────────────────────────
router.put(routes.categoryById, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: { message: apiErrors.categories.nameRequired } });

    // Check if this is the Core System category
    const catCheck = await DatabaseService.query(
      `SELECT is_system_default FROM ${dbSchema}.hc_categories WHERE id = $1`,
      [id]
    );
    if (catCheck.rows.length === 0) return res.status(404).json({ success: false, error: { message: apiErrors.categories.notFound } });
    if (catCheck.rows[0].is_system_default) {
      return res.status(403).json({ success: false, error: { message: apiErrors.categories.systemDefaultCannotEdit } });
    }

    const result = await DatabaseService.query(
      `UPDATE ${dbSchema}.hc_categories
       SET name = $1, description = $2, color = $3, sort_order = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name.trim(), description || null, color || '#6366f1', sort_order || 99, id]
    );
    log.info('Category updated', { id, name: name.trim() });
    res.json({ success: true, data: result.rows[0], message: apiMessages.categories.updated });
  } catch (err) {
    log.error('PUT category failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.categories.updateFailed.replace('{message}', err.message) } });
  }
});

// ── DELETE /categories/:id ───────────────────────────────────────────────────
router.delete(routes.categoryById, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if this is the Core System category
    const catCheck = await DatabaseService.query(
      `SELECT is_system_default FROM ${dbSchema}.hc_categories WHERE id = $1`,
      [id]
    );
    if (catCheck.rows.length === 0) return res.status(404).json({ success: false, error: { message: apiErrors.categories.notFound } });
    if (catCheck.rows[0].is_system_default) {
      return res.status(403).json({ success: false, error: { message: apiErrors.categories.systemDefaultCannotDelete } });
    }
    
    // Check if category is in use
    const usageResult = await DatabaseService.query(
      `SELECT COUNT(*)::int AS count FROM ${dbSchema}.hc_applications WHERE category_id = $1`,
      [id]
    );
    const count = usageResult.rows[0]?.count || 0;
    if (count > 0) {
      return res.status(409).json({ success: false, error: { message: apiErrors.categories.inUse.replace('{count}', count) } });
    }

    const result = await DatabaseService.query(
      `DELETE FROM ${dbSchema}.hc_categories WHERE id = $1 RETURNING id, name`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: { message: apiErrors.categories.notFound } });
    log.info('Category deleted', { id, name: result.rows[0].name });
    res.json({ success: true, data: result.rows[0], message: apiMessages.categories.deleted });
  } catch (err) {
    log.error('DELETE category failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: apiErrors.categories.deleteFailed.replace('{message}', err.message) } });
  }
});

export default router;
