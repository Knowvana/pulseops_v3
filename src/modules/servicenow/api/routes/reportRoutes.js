// ============================================================================
// ServiceNow Module — Report Routes
//
// ENDPOINTS:
//   GET /stats                → Dashboard statistics (live from SNOW)
//   GET /reports              → SLA compliance + volume analytics
//   GET /reports/incidents    → Incident report (live from SNOW)
//   GET /reports/ritms        → RITM report
//   GET /reports/sla          → SLA compliance report
//   GET /reports/sla/incidents → Incident SLA report with time filter
//   GET /business-hours       → Get business hours config
//   PUT /business-hours       → Save business hours config
//   GET /config/settings      → Get general settings
//   PUT /config/settings      → Save general settings
//
// MOUNT: router.use('/', reportRoutes)  (in index.js)
// ============================================================================
import { Router } from 'express';
import path from 'path';
import {
  loadConnectionConfig, loadDefaultsConfig, loadIncidentConfig,
  buildAssignmentGroupQuery, snowRequest, snowVal,
  readJsonFile, writeJsonFile, CONFIG_DIR,
  DatabaseService, dbSchema,
} from './helpers.js';

const router = Router();

// ── GET /stats — Dashboard statistics (always fetches live from SNOW) ────
router.get('/stats', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.json({
        success: true,
        data: {
          notConfigured: true, connectionStatus: 'not_configured',
          total: 0, open: 0, inProgress: 0, critical: 0, slaBreached: 0, resolvedToday: 0,
          lastSync: defaults.sync?.lastSync || null,
        },
      });
    }

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const queryParts = [`sysparm_limit=${defaults.sync?.maxIncidents || 500}`, 'sysparm_fields=number,short_description,priority,state,opened_at,resolved_at,closed_at,assigned_to'];
    if (agQuery) queryParts.push(`sysparm_query=${agQuery}`);

    let incidents = [];
    try {
      const result = await snowRequest(conn, 'table/incident', queryParts.join('&'));
      if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
        incidents = result.data.result;
      }
    } catch { /* SNOW unreachable — return zeros */ }

    // Load SLA thresholds from DB
    let slaThresholds = {};
    try {
      const slaResult = await DatabaseService.query(`SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true`);
      for (const row of slaResult.rows) {
        slaThresholds[row.priority] = { responseMinutes: Number(row.response_minutes || 0), resolutionMinutes: Number(row.resolution_minutes || 0) };
      }
    } catch { /* use empty */ }

    const total = incidents.length;
    const open = incidents.filter(i => String(snowVal(i.state)) === '1').length;
    const inProgress = incidents.filter(i => ['2', '3'].includes(String(snowVal(i.state)))).length;
    const critical = incidents.filter(i => String(snowVal(i.priority)) === '1' && !['6', '7', '8'].includes(String(snowVal(i.state)))).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const resolvedToday = incidents.filter(i => {
      if (!['6', '7'].includes(String(snowVal(i.state)))) return false;
      const resolvedDate = snowVal(i.resolved_at) || snowVal(i.closed_at);
      return resolvedDate && String(resolvedDate).slice(0, 10) === todayStr;
    }).length;

    let slaBreached = 0;
    for (const inc of incidents) {
      const openedAt = snowVal(inc.opened_at);
      const resolvedAt = snowVal(inc.resolved_at);
      const st = String(snowVal(inc.state));
      if (openedAt && !resolvedAt && !['6', '7', '8'].includes(st)) {
        const openedMinutesAgo = (Date.now() - new Date(openedAt).getTime()) / 60000;
        const p = String(snowVal(inc.priority));
        const pKey = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
        const threshold = slaThresholds[pKey]?.resolutionMinutes || (p === '1' ? 120 : p === '2' ? 360 : p === '3' ? 960 : 2400);
        if (openedMinutesAgo > threshold) slaBreached++;
      }
    }

    return res.json({
      success: true,
      data: {
        connectionStatus: 'connected',
        total, open, inProgress, critical, slaBreached, resolvedToday,
        lastSync: defaults.sync?.lastSync || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Stats failed: ${err.message}` } });
  }
});

// ── GET /reports — SLA compliance + volume analytics (live from SNOW) ────
router.get('/reports', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const defaults = loadDefaultsConfig();

    if (!conn.isConfigured) {
      return res.json({ success: true, data: { notConfigured: true, totalIncidents: 0, slaCompliance: 100, lastSync: defaults.sync?.lastSync || null } });
    }

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const queryParts = [];
    if (agQuery) queryParts.push(agQuery);
    queryParts.push('ORDERBYDESCnumber');

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=500&sysparm_fields=number,priority,state,opened_at,resolved_at,closed_at&sysparm_query=${queryParts.join('^')}`
    );

    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    // Load SLA thresholds from DB
    let slaThresholds = {};
    try {
      const slaResult = await DatabaseService.query(`SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true`);
      for (const row of slaResult.rows) {
        slaThresholds[row.priority] = { resolutionMinutes: Number(row.resolution_minutes) };
      }
    } catch { /* empty */ }

    const totalIncidents = incidents.length;
    let slaBreaches = 0;
    const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    const byState = {};
    let totalResolved = 0;
    const resolutionByPriority = {};

    for (const inc of incidents) {
      const p = String(snowVal(inc.priority) || '4');
      const pKey = p === '1' ? 'critical' : p === '2' ? 'high' : p === '3' ? 'medium' : 'low';
      priorityCounts[pKey] = (priorityCounts[pKey] || 0) + 1;

      const s = String(snowVal(inc.state) || 'unknown');
      byState[s] = (byState[s] || 0) + 1;

      if (['6', '7'].includes(s)) totalResolved++;

      const openedAt = snowVal(inc.opened_at);
      const resolvedAt = snowVal(inc.resolved_at) || snowVal(inc.closed_at);
      const pLabel = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
      const threshold = slaThresholds[pLabel]?.resolutionMinutes || (p === '1' ? 120 : p === '2' ? 360 : p === '3' ? 960 : 2400);

      if (openedAt && resolvedAt) {
        const resHours = Math.round((new Date(resolvedAt) - new Date(openedAt)) / 3600000 * 10) / 10;
        if (!resolutionByPriority[pKey]) resolutionByPriority[pKey] = { total: 0, count: 0 };
        resolutionByPriority[pKey].total += resHours;
        resolutionByPriority[pKey].count++;
        if ((resHours * 60) > threshold) slaBreaches++;
      } else if (openedAt && !['6', '7', '8'].includes(s)) {
        const openMinutes = (Date.now() - new Date(openedAt).getTime()) / 60000;
        if (openMinutes > threshold) slaBreaches++;
      }
    }

    const slaCompliance = totalIncidents > 0
      ? Math.round(((totalIncidents - slaBreaches) / totalIncidents) * 100)
      : 100;

    const avgResolution = {};
    for (const [k, v] of Object.entries(resolutionByPriority)) {
      avgResolution[k] = v.count > 0 ? Math.round((v.total / v.count) * 10) / 10 : null;
    }

    const slaThresholdHours = {};
    for (const [label, cfg] of Object.entries(slaThresholds)) {
      const key = label.startsWith('1') ? 'critical' : label.startsWith('2') ? 'high' : label.startsWith('3') ? 'medium' : 'low';
      slaThresholdHours[key] = Math.round(cfg.resolutionMinutes / 60 * 10) / 10;
    }

    return res.json({
      success: true,
      data: {
        totalIncidents, totalResolved, slaCompliance, slaBreaches,
        priorityCounts, byState,
        resolutionByPriority: avgResolution,
        slaThresholds: slaThresholdHours,
        lastSync: defaults.sync?.lastSync || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Reports failed: ${err.message}` } });
  }
});

// ── GET /reports/incidents — Incident report (live from SNOW) ────────────
router.get('/reports/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.json({ success: true, data: { totalCount: 0, incidents: [] } });

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const { startDate, endDate } = req.query;

    const queryParts = [];
    if (agQuery) queryParts.push(agQuery);
    if (startDate) queryParts.push(`opened_at>=${startDate}`);
    if (endDate) queryParts.push(`opened_at<=${endDate}`);
    queryParts.push('ORDERBYDESCnumber');

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=200&sysparm_fields=number,short_description,priority,state,category,assignment_group,opened_at,resolved_at&sysparm_query=${queryParts.join('^')}`
    );

    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    const byPriority = {}, byState = {}, byCategory = {};
    const closed = incidents.filter(i => ['6', '7'].includes(String(snowVal(i.state))));
    for (const inc of incidents) {
      byPriority[String(snowVal(inc.priority) || '4')] = (byPriority[String(snowVal(inc.priority) || '4')] || 0) + 1;
      byState[String(snowVal(inc.state) || 'unknown')] = (byState[String(snowVal(inc.state) || 'unknown')] || 0) + 1;
      byCategory[snowVal(inc.category) || 'General'] = (byCategory[snowVal(inc.category) || 'General'] || 0) + 1;
    }
    return res.json({
      success: true,
      data: {
        totalCount: incidents.length, totalClosed: closed.length,
        reportingPeriod: { start: startDate || null, end: endDate || null },
        byPriority, byState, byCategory,
        incidents: incidents.slice(0, 100).map(i => ({
          number: snowVal(i.number), shortDescription: snowVal(i.short_description), priority: snowVal(i.priority),
          state: snowVal(i.state), category: snowVal(i.category), assignmentGroup: snowVal(i.assignment_group),
          openedAt: snowVal(i.opened_at),
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Incident report failed: ${err.message}` } });
  }
});

// ── GET /reports/ritms — RITM report ─────────────────────────────────────
router.get('/reports/ritms', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    const { startDate, endDate } = req.query;
    let ritms = [];
    if (conn.isConfigured) {
      try {
        const result = await snowRequest(conn, 'table/sc_req_item', 'sysparm_limit=200');
        if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) ritms = result.data.result;
      } catch { /* use empty */ }
    }
    if (startDate) ritms = ritms.filter(r => r.opened_at >= startDate);
    if (endDate) ritms = ritms.filter(r => r.opened_at <= endDate);
    const byPriority = {}, byState = {}, byCatalogItem = {};
    for (const r of ritms) {
      byPriority[String(r.priority || '4')] = (byPriority[String(r.priority || '4')] || 0) + 1;
      byState[String(r.state || 'unknown')] = (byState[String(r.state || 'unknown')] || 0) + 1;
      byCatalogItem[r.cat_item || 'General'] = (byCatalogItem[r.cat_item || 'General'] || 0) + 1;
    }
    return res.json({
      success: true,
      data: {
        totalCount: ritms.length,
        reportingPeriod: { start: startDate || null, end: endDate || null },
        byPriority, byState, byCatalogItem,
        ritms: ritms.slice(0, 100).map(r => ({
          number: r.number, shortDescription: r.short_description, priority: r.priority,
          state: r.state, catalogItem: r.cat_item, assignmentGroup: r.assignment_group,
          openedAt: r.opened_at, fulfillmentTime: null,
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `RITM report failed: ${err.message}` } });
  }
});

// ── GET /reports/sla — SLA compliance report ─────────────────────────────
router.get('/reports/sla', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) return res.json({ success: true, data: { incidentSla: { byPriority: {} }, ritmSla: { byPriority: {} } } });

    const incidentConfig = await loadIncidentConfig();
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    const queryParts = [];
    if (agQuery) queryParts.push(agQuery);
    queryParts.push('ORDERBYDESCnumber');

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=500&sysparm_fields=number,priority,state,opened_at,resolved_at,closed_at&sysparm_query=${queryParts.join('^')}`
    );
    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    let slaThresholds = {};
    try {
      const slaResult = await DatabaseService.query(`SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true`);
      for (const row of slaResult.rows) {
        slaThresholds[row.priority] = { responseMinutes: Number(row.response_minutes), resolutionMinutes: Number(row.resolution_minutes) };
      }
    } catch { /* empty */ }

    const incidentSlaByPriority = {};
    for (const inc of incidents) {
      const p = String(snowVal(inc.priority) || '4');
      const pLabel = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
      if (!incidentSlaByPriority[pLabel]) {
        const threshold = slaThresholds[pLabel] || { responseMinutes: 60, resolutionMinutes: 480 };
        incidentSlaByPriority[pLabel] = {
          responseTarget: threshold.responseMinutes, resolutionTarget: threshold.resolutionMinutes,
          responseMet: 0, responseBreached: 0, resolutionMet: 0, resolutionBreached: 0,
        };
      }
      const openedAt = snowVal(inc.opened_at);
      const resolvedAt = snowVal(inc.resolved_at) || snowVal(inc.closed_at);
      if (openedAt) {
        const threshold = slaThresholds[pLabel] || { resolutionMinutes: 480 };
        if (resolvedAt) {
          const resolutionMinutes = (new Date(resolvedAt) - new Date(openedAt)) / 60000;
          if (resolutionMinutes <= threshold.resolutionMinutes) incidentSlaByPriority[pLabel].resolutionMet++;
          else incidentSlaByPriority[pLabel].resolutionBreached++;
        } else if (!['6', '7', '8'].includes(String(snowVal(inc.state)))) {
          const openMinutes = (Date.now() - new Date(openedAt).getTime()) / 60000;
          if (openMinutes > threshold.resolutionMinutes) incidentSlaByPriority[pLabel].resolutionBreached++;
          else incidentSlaByPriority[pLabel].resolutionMet++;
        }
      }
    }
    for (const val of Object.values(incidentSlaByPriority)) {
      const total = val.resolutionMet + val.resolutionBreached;
      val.resolutionCompliance = total > 0 ? Math.round((val.resolutionMet / total) * 100) : null;
      val.responseCompliance = val.resolutionCompliance;
      val.responseMet = val.resolutionMet;
      val.responseBreached = val.resolutionBreached;
    }
    return res.json({
      success: true,
      data: { incidentSla: { byPriority: incidentSlaByPriority }, ritmSla: { byPriority: {} } },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `SLA report failed: ${err.message}` } });
  }
});

// ── GET /reports/sla/incidents — Incident SLA report with time filter ────
router.get('/reports/sla/incidents', async (req, res) => {
  try {
    const conn = loadConnectionConfig();
    if (!conn.isConfigured) {
      return res.status(400).json({ success: false, error: { message: 'ServiceNow connection is not configured.' } });
    }

    const { period = 'monthly' } = req.query;
    const incidentConfig = await loadIncidentConfig();

    const now = new Date();
    let startDate;
    if (period === 'daily') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    } else if (period === 'weekly') {
      const weekStart = new Date(now);
      const day = weekStart.getDay();
      const diff = (day === 0 ? 6 : day - 1); // Monday as week start
      weekStart.setDate(weekStart.getDate() - diff);
      weekStart.setHours(0, 0, 0, 0);
      startDate = weekStart.toISOString().slice(0, 10);
    } else {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = monthStart.toISOString().slice(0, 10);
    }

    const queryParts = [`${incidentConfig.createdColumn}>=${startDate}`, 'ORDERBYDESCnumber'];
    const agQuery = buildAssignmentGroupQuery(incidentConfig.assignmentGroup);
    if (agQuery) queryParts.unshift(agQuery);

    const fields = ['sys_id','number','short_description','priority','state','assigned_to',
      incidentConfig.createdColumn, incidentConfig.closedColumn, 'resolved_at'].filter(Boolean);

    const result = await snowRequest(conn, 'table/incident',
      `sysparm_limit=500&sysparm_fields=${[...new Set(fields)].join(',')}&sysparm_query=${queryParts.join('^')}`
    );

    let incidents = [];
    if (result.statusCode >= 200 && result.statusCode < 300 && result.data?.result) {
      incidents = result.data.result;
    }

    let slaThresholds = {};
    try {
      const slaResult = await DatabaseService.query(`SELECT * FROM ${dbSchema}.sn_sla_config WHERE enabled = true`);
      for (const row of slaResult.rows) {
        slaThresholds[row.priority] = { responseMinutes: Number(row.response_minutes), resolutionMinutes: Number(row.resolution_minutes) };
      }
    } catch { /* use empty */ }

    let businessHours = null;
    try {
      businessHours = readJsonFile(path.join(CONFIG_DIR, 'servicenow_business_hours.json'));
    } catch { /* ignore */ }

    const incidentSlaData = incidents.map(inc => {
      const p = String(snowVal(inc.priority));
      const pKey = p === '1' ? '1 - Critical' : p === '2' ? '2 - High' : p === '3' ? '3 - Medium' : '4 - Low';
      const createdAt = snowVal(inc[incidentConfig.createdColumn]);
      const closedAt = snowVal(inc[incidentConfig.closedColumn]) || snowVal(inc.resolved_at);
      const threshold = slaThresholds[pKey] || { responseMinutes: 60, resolutionMinutes: 480 };

      let resolutionMinutes = null;
      let slaMet = null;
      if (createdAt && closedAt) {
        const created = new Date(createdAt);
        const closed = new Date(closedAt);
        resolutionMinutes = Math.round((closed - created) / 60000);

        if (businessHours && Array.isArray(businessHours) && businessHours.length > 0) {
          let bizMinutes = 0;
          const cursor = new Date(created);
          while (cursor < closed) {
            const dayOfWeek = cursor.getDay();
            const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek];
            const dayConfig = businessHours.find(d => d.day === dayName);
            if (dayConfig?.isBusinessDay && dayConfig.startTime && dayConfig.endTime) {
              const [sh, sm] = dayConfig.startTime.split(':').map(Number);
              const [eh, em] = dayConfig.endTime.split(':').map(Number);
              const dayStart = new Date(cursor); dayStart.setHours(sh, sm, 0, 0);
              const dayEnd = new Date(cursor); dayEnd.setHours(eh, em, 0, 0);
              const effectiveStart = cursor > dayStart ? cursor : dayStart;
              const effectiveEnd = closed < dayEnd ? closed : dayEnd;
              if (effectiveStart < effectiveEnd) {
                bizMinutes += (effectiveEnd - effectiveStart) / 60000;
              }
            }
            cursor.setDate(cursor.getDate() + 1);
            cursor.setHours(0, 0, 0, 0);
          }
          resolutionMinutes = Math.round(bizMinutes);
        }

        slaMet = resolutionMinutes <= threshold.resolutionMinutes;
      }

      return {
        number: snowVal(inc.number), shortDescription: snowVal(inc.short_description),
        priority: pKey, state: snowVal(inc.state), assignedTo: snowVal(inc.assigned_to),
        createdAt, closedAt, resolutionMinutes, targetMinutes: threshold.resolutionMinutes, slaMet,
      };
    });

    const summaryByPriority = {};
    for (const inc of incidentSlaData) {
      if (!summaryByPriority[inc.priority]) {
        summaryByPriority[inc.priority] = { total: 0, met: 0, breached: 0, pending: 0, targetMinutes: inc.targetMinutes };
      }
      summaryByPriority[inc.priority].total++;
      if (inc.slaMet === true) summaryByPriority[inc.priority].met++;
      else if (inc.slaMet === false) summaryByPriority[inc.priority].breached++;
      else summaryByPriority[inc.priority].pending++;
    }

    return res.json({
      success: true,
      data: {
        period, startDate, endDate: now.toISOString().slice(0, 10),
        totalIncidents: incidents.length, summaryByPriority,
        incidents: incidentSlaData,
        incidentConfig: { createdColumn: incidentConfig.createdColumn, closedColumn: incidentConfig.closedColumn },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `SLA report failed: ${err.message}` } });
  }
});

// ── GET/PUT /business-hours ──────────────────────────────────────────────
router.get('/business-hours', (req, res) => {
  try {
    const hours = readJsonFile(path.join(CONFIG_DIR, 'servicenow_business_hours.json')) || [];
    return res.json({ success: true, data: hours });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load business hours: ${err.message}` } });
  }
});

router.put('/business-hours', (req, res) => {
  try {
    writeJsonFile(path.join(CONFIG_DIR, 'servicenow_business_hours.json'), req.body);
    return res.json({ success: true, message: 'Business hours saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save business hours: ${err.message}` } });
  }
});

// ── GET/PUT /config/settings ─────────────────────────────────────────────
router.get('/config/settings', (req, res) => {
  try {
    const settings = readJsonFile(path.join(CONFIG_DIR, 'servicenow_settings.json')) || {};
    return res.json({ success: true, data: settings });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to load settings: ${err.message}` } });
  }
});

router.put('/config/settings', (req, res) => {
  try {
    writeJsonFile(path.join(CONFIG_DIR, 'servicenow_settings.json'), req.body);
    return res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: `Failed to save settings: ${err.message}` } });
  }
});

export default router;
