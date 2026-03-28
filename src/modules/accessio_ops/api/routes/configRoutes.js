import { Router } from 'express';
import { loadGeneralSettings, saveModuleConfig } from './helpers.js';
import { createAoLogger } from '../lib/moduleLogger.js';

const log = createAoLogger('configRoutes.js');
const router = Router();

// ── GET /config/general ──────────────────────────────────────────────────────
router.get('/config/general', async (req, res) => {
  try {
    const config = await loadGeneralSettings();
    res.json({ success: true, data: config });
  } catch (err) {
    log.error('GET general settings failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── PUT /config/general ──────────────────────────────────────────────────────
router.put('/config/general', async (req, res) => {
  try {
    const config = req.body;
    log.info('Saving general settings', config);
    await saveModuleConfig('general_settings', config, 'General module settings');
    res.json({ success: true, data: config, message: 'General settings saved successfully' });
  } catch (err) {
    log.error('PUT general settings failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

export default router;
