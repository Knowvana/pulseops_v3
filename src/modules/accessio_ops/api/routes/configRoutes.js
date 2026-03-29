import { Router } from 'express';
import { loadGeneralSettings, saveModuleConfig } from './helpers.js';
import { createAoLogger } from '../lib/moduleLogger.js';

const log = createAoLogger('configRoutes.js');
const router = Router();

// ── GET /config/cluster ──────────────────────────────────────────────────────
router.get('/config/cluster', async (req, res) => {
  try {
    const config = await loadGeneralSettings();
    res.json({ success: true, data: config });
  } catch (err) {
    log.error('GET cluster config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── PUT /config/cluster ──────────────────────────────────────────────────────
router.put('/config/cluster', async (req, res) => {
  try {
    const config = req.body;
    log.info('Saving cluster config', config);
    await saveModuleConfig('general_settings', config, 'Cluster configuration settings');
    res.json({ success: true, data: config, message: 'Cluster configuration saved successfully' });
  } catch (err) {
    log.error('PUT cluster config failed', { message: err.message });
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

export default router;
