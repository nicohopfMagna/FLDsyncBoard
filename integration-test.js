const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
let accessToken = '';

async function apiRequest(path, options = {}) {
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (accessToken && !mergedHeaders.Authorization) {
    mergedHeaders.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    headers: mergedHeaders,
    ...options
  });

  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }

  return { ok: res.ok, status: res.status, body };
}

async function apiRequestManualRedirect(path, options = {}) {
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (accessToken && !mergedHeaders.Authorization) {
    mergedHeaders.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    headers: mergedHeaders,
    redirect: 'manual',
    ...options
  });

  return {
    status: res.status,
    location: res.headers.get('location') || '',
    deprecation: res.headers.get('deprecation') || '',
    sunset: res.headers.get('sunset') || '',
    link: res.headers.get('link') || '',
    migration: res.headers.get('x-api-migration') || ''
  };
}

function formatError(result, fallback) {
  const detail = result && result.body && (result.body.error || result.body.message)
    ? ` Details: ${result.body.error || result.body.message}`
    : '';
  return `${fallback} (HTTP ${result ? result.status : 'n/a'}).${detail}`;
}

async function run() {
  const runId = Date.now();
  const stationId = `IT_ST_${runId}`;
  const lineId = `IT_LN_${runId}`;
  const shiftId = `IT_SH_${runId}`;
  const templateName = `IT_TEMPLATE_${runId}`;

  const results = [];
  const record = (name, ok, detail) => results.push({ name, ok, detail });
  let assignmentId = null;
  let templateId = null;

  try {
    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'local', username: 'admin', password: 'admin' })
    });
    const loginOk = loginRes.ok && loginRes.body && loginRes.body.accessToken;
    if (loginOk) {
      record('POST /api/auth/login', true, 'ok');
      accessToken = String(loginRes.body.accessToken || '');
    } else if (loginRes.status === 404) {
      accessToken = process.env.API_TOKEN || 'dev-token';
      record('POST /api/auth/login', true, 'not available on target server, fallback to legacy bearer token');
    } else {
      record('POST /api/auth/login', false, formatError(loginRes, 'Login failed'));
      throw new Error('Login failed, aborting integration test.');
    }

    const stationRes = await apiRequest('/api/station', {
      method: 'POST',
      body: JSON.stringify({ id: stationId, description: 'Integration Test Station' })
    });
    record('POST /api/station', stationRes.ok, stationRes.ok ? 'ok' : formatError(stationRes, 'Station write failed'));

    const lineRes = await apiRequest('/api/line', {
      method: 'POST',
      body: JSON.stringify({ id: lineId, description: 'Integration Test Line' })
    });
    record('POST /api/line', lineRes.ok, lineRes.ok ? 'ok' : formatError(lineRes, 'Line write failed'));

    const shiftRes = await apiRequest('/api/shift', {
      method: 'POST',
      body: JSON.stringify({ id: shiftId, name: 'Integration Shift', start: '06:00', end: '14:00', lineId, stationId })
    });
    record('POST /api/shift', shiftRes.ok, shiftRes.ok ? 'ok' : formatError(shiftRes, 'Shift write failed'));

    const assignRes = await apiRequest('/api/assign-shift', {
      method: 'POST',
      body: JSON.stringify({ shiftId, targetType: 'station', targetId: stationId })
    });
    record('POST /api/assign-shift', assignRes.ok, assignRes.ok ? 'ok' : formatError(assignRes, 'Shift assignment failed'));

    const assignResDuplicate = await apiRequest('/api/assign-shift', {
      method: 'POST',
      body: JSON.stringify({ shiftId, targetType: 'station', targetId: stationId })
    });
    record(
      'POST /api/assign-shift (duplicate business key)',
      assignResDuplicate.ok,
      assignResDuplicate.ok ? 'ok (idempotent expected)' : formatError(assignResDuplicate, 'Duplicate shift assignment failed')
    );

    const assignListRes = await apiRequest('/api/assign-shift');
    if (assignListRes.ok && Array.isArray(assignListRes.body)) {
      const foundAssignment = assignListRes.body.find((x) => x && x.shiftId === shiftId);
      assignmentId = foundAssignment ? Number(foundAssignment.id) : null;
      record('GET /api/assign-shift', Boolean(assignmentId), assignmentId ? `found ${assignmentId}` : 'Assignment not found');

      const matchingBusinessKeys = assignListRes.body.filter(
        (x) => x && x.shiftId === shiftId && x.targetType === 'station' && x.targetId === stationId
      );
      record(
        'GET /api/assign-shift uniqueness (business key)',
        matchingBusinessKeys.length === 1,
        matchingBusinessKeys.length === 1
          ? 'exactly one assignment row for business key'
          : `expected 1, found ${matchingBusinessKeys.length}`
      );
    } else {
      record('GET /api/assign-shift', false, formatError(assignListRes, 'Assignment list read failed'));
      record('GET /api/assign-shift uniqueness (business key)', false, 'Skipped because assignment list read failed');
    }

    const patchStationRes = await apiRequest(`/api/station/${stationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ description: 'Integration Test Station Updated', bottleneck: true, cycleTime: 44 })
    });
    record('PATCH /api/station/:id', patchStationRes.ok, patchStationRes.ok ? 'ok' : formatError(patchStationRes, 'Station patch failed'));

    const patchLineRes = await apiRequest(`/api/line/${lineId}`, {
      method: 'PATCH',
      body: JSON.stringify({ description: 'Integration Test Line Updated' })
    });
    record('PATCH /api/line/:id', patchLineRes.ok, patchLineRes.ok ? 'ok' : formatError(patchLineRes, 'Line patch failed'));

    const patchShiftRes = await apiRequest(`/api/shift/${shiftId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Integration Shift Updated', start: '07:00', end: '15:00' })
    });
    record('PATCH /api/shift/:id', patchShiftRes.ok, patchShiftRes.ok ? 'ok' : formatError(patchShiftRes, 'Shift patch failed'));

    if (assignmentId) {
      const patchAssignRes = await apiRequest(`/api/assign-shift/${assignmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ targetType: 'line', targetId: lineId, lineId })
      });
      record('PATCH /api/assign-shift/:id', patchAssignRes.ok, patchAssignRes.ok ? 'ok' : formatError(patchAssignRes, 'Shift assignment patch failed'));
    } else {
      record('PATCH /api/assign-shift/:id', false, 'Skipped because assignment id was not found');
    }

    const stationsRes = await apiRequest('/api/stations');
    const stationFound = stationsRes.ok && Array.isArray(stationsRes.body) && stationsRes.body.some((s) => s.id === stationId);
    record('GET /api/stations', stationFound, stationFound ? `found ${stationId}` : formatError(stationsRes, 'Station not found'));

    const linesRes = await apiRequest('/api/lines');
    const linesArray = Array.isArray(linesRes.body) ? linesRes.body : (linesRes.body ? [linesRes.body] : []);
    const lineFound = linesRes.ok && linesArray.some((l) => l.id === lineId);
    record('GET /api/lines', lineFound, lineFound ? `found ${lineId}` : formatError(linesRes, 'Line not found'));

    const shiftsRes = await apiRequest('/api/shifts');
    const shiftsArray = Array.isArray(shiftsRes.body) ? shiftsRes.body : (shiftsRes.body ? [shiftsRes.body] : []);
    const shiftFound = shiftsRes.ok && shiftsArray.some((s) => s.id === shiftId);
    record('GET /api/shifts', shiftFound, shiftFound ? `found ${shiftId}` : formatError(shiftsRes, 'Shift not found'));

    const unsShiftScheduleRes = await apiRequest(`/api/fld/shift-schedule-v1?lineId=${encodeURIComponent(lineId)}&timezone=-1`);
    const unsShiftScheduleOk = unsShiftScheduleRes.ok
      && unsShiftScheduleRes.body
      && typeof unsShiftScheduleRes.body.Version === 'string'
      && typeof unsShiftScheduleRes.body.Timestamp === 'string'
      && unsShiftScheduleRes.body.ShiftSchedule
      && typeof unsShiftScheduleRes.body.ShiftSchedule === 'object';
    record(
      'GET /api/fld/shift-schedule-v1',
      unsShiftScheduleOk,
      unsShiftScheduleOk ? 'envelope fields present' : formatError(unsShiftScheduleRes, 'UNS shift schedule failed')
    );

    const unsShiftScheduleByStationAndLineRes = await apiRequest(
      `/api/fld/shift-schedule-v1?stationId=${encodeURIComponent(stationId)}&lineId=${encodeURIComponent(lineId)}&timezone=Europe%2FBerlin`
    );
    const unsShiftScheduleByStationAndLineOk = unsShiftScheduleByStationAndLineRes.ok
      && unsShiftScheduleByStationAndLineRes.body
      && typeof unsShiftScheduleByStationAndLineRes.body.Version === 'string'
      && typeof unsShiftScheduleByStationAndLineRes.body.Timestamp === 'string'
      && unsShiftScheduleByStationAndLineRes.body.ShiftSchedule
      && typeof unsShiftScheduleByStationAndLineRes.body.ShiftSchedule === 'object';
    record(
      'GET /api/fld/shift-schedule-v1 (stationId+lineId)',
      unsShiftScheduleByStationAndLineOk,
      unsShiftScheduleByStationAndLineOk
        ? 'envelope fields present'
        : formatError(unsShiftScheduleByStationAndLineRes, 'UNS shift schedule with stationId+lineId failed')
    );

    const unsBreakScheduleRes = await apiRequest(`/api/fld/break-schedule-v1?lineId=${encodeURIComponent(lineId)}&timezone=-1`);
    const unsBreakScheduleOk = unsBreakScheduleRes.ok
      && unsBreakScheduleRes.body
      && typeof unsBreakScheduleRes.body.Version === 'string'
      && typeof unsBreakScheduleRes.body.Timestamp === 'string'
      && Array.isArray(unsBreakScheduleRes.body.BreakSchedule);
    record(
      'GET /api/fld/break-schedule-v1',
      unsBreakScheduleOk,
      unsBreakScheduleOk ? `break rows=${unsBreakScheduleRes.body.BreakSchedule.length}` : formatError(unsBreakScheduleRes, 'UNS break schedule failed')
    );

    const unsCycleTimeRes = await apiRequest(`/api/fld/cycle-time-v1?lineId=${encodeURIComponent(lineId)}`);
    const unsCycleTimeOk = unsCycleTimeRes.ok
      && unsCycleTimeRes.body
      && typeof unsCycleTimeRes.body.Version === 'string'
      && typeof unsCycleTimeRes.body.Timestamp === 'string'
      && unsCycleTimeRes.body.CycleTime
      && typeof unsCycleTimeRes.body.CycleTime.Value === 'string';
    record(
      'GET /api/fld/cycle-time-v1',
      unsCycleTimeOk,
      unsCycleTimeOk ? `value=${unsCycleTimeRes.body.CycleTime.Value}` : formatError(unsCycleTimeRes, 'UNS cycle time failed')
    );

    const fldMetadataLineRes = await apiRequest(`/api/fld/metadata-line-v1?lineId=${encodeURIComponent(lineId)}`);
    const metadataLine = fldMetadataLineRes.body && fldMetadataLineRes.body.MetadataLine
      ? fldMetadataLineRes.body.MetadataLine
      : null;
    const metadataChecks = {
      hasBody: Boolean(fldMetadataLineRes.body),
      hasVersion: typeof fldMetadataLineRes.body?.Version === 'string',
      hasTimestamp: typeof fldMetadataLineRes.body?.Timestamp === 'string',
      hasMetadataLineObject: Boolean(metadataLine && typeof metadataLine === 'object'),
      hasStationIds: Array.isArray(metadataLine?.StationIds),
      hasBottleneckStationIds: Array.isArray(metadataLine?.BottleneckStationIds),
      hasBottleneckCycleTimes: Array.isArray(metadataLine?.BottleneckCycleTimes),
      hasLastStationIdAlias: Array.isArray(metadataLine?.LastStationId)
    };
    const hasBottleneckCycleTimesShape = !Array.isArray(metadataLine?.BottleneckCycleTimes)
      ? false
      : metadataLine.BottleneckCycleTimes.every((entry) => entry
        && typeof entry === 'object'
        && typeof entry.StationId === 'string'
        && entry.StationId.length > 0
        && typeof entry.Value === 'string');
    const hasCycleShape = metadataLine
      && metadataLine.CycleTime
      && typeof metadataLine.CycleTime === 'object'
      && typeof metadataLine.CycleTime.Value === 'string';
    const fldMetadataLineOk = fldMetadataLineRes.ok
      && fldMetadataLineRes.body
      && typeof fldMetadataLineRes.body.Version === 'string'
      && typeof fldMetadataLineRes.body.Timestamp === 'string'
      && metadataLine
      && typeof metadataLine === 'object'
      && Array.isArray(metadataLine.StationIds)
      && Array.isArray(metadataLine.BottleneckStationIds)
      && Array.isArray(metadataLine.BottleneckCycleTimes)
      && hasBottleneckCycleTimesShape
      && Array.isArray(metadataLine.LastStationId)
      && hasCycleShape;
    record(
      'GET /api/fld/metadata-line-v1',
      fldMetadataLineOk,
      fldMetadataLineOk
        ? `stations=${fldMetadataLineRes.body.MetadataLine.StationIds.length}`
        : `${formatError(fldMetadataLineRes, 'FLD metadata line failed')} checks=${JSON.stringify({ ...metadataChecks, hasBottleneckCycleTimesShape, hasCycleShape })} payload=${JSON.stringify(fldMetadataLineRes.body || {})}`
    );

    const legacyUnsShiftRes = await apiRequest(`/api/uns/shift-schedule?lineId=${encodeURIComponent(lineId)}&timezone=-1`);
    const legacyUnsShiftOk = legacyUnsShiftRes.ok
      && legacyUnsShiftRes.body
      && typeof legacyUnsShiftRes.body.Version === 'string'
      && legacyUnsShiftRes.body.ShiftSchedule
      && typeof legacyUnsShiftRes.body.ShiftSchedule === 'object';
    record(
      'GET /api/uns/shift-schedule (redirect)',
      legacyUnsShiftOk,
      legacyUnsShiftOk ? 'redirected to FLD shift schedule' : formatError(legacyUnsShiftRes, 'Legacy UNS shift-schedule redirect failed')
    );

    const legacyUnsBreakRes = await apiRequest(`/api/uns/break-schedule?lineId=${encodeURIComponent(lineId)}&timezone=-1`);
    const legacyUnsBreakOk = legacyUnsBreakRes.ok
      && legacyUnsBreakRes.body
      && typeof legacyUnsBreakRes.body.Version === 'string'
      && Array.isArray(legacyUnsBreakRes.body.BreakSchedule);
    record(
      'GET /api/uns/break-schedule (redirect)',
      legacyUnsBreakOk,
      legacyUnsBreakOk ? 'redirected to FLD break schedule' : formatError(legacyUnsBreakRes, 'Legacy UNS break-schedule redirect failed')
    );

    const legacyUnsCycleRes = await apiRequest(`/api/uns/cycle-time?lineId=${encodeURIComponent(lineId)}`);
    const legacyUnsCycleOk = legacyUnsCycleRes.ok
      && legacyUnsCycleRes.body
      && typeof legacyUnsCycleRes.body.Version === 'string'
      && legacyUnsCycleRes.body.CycleTime
      && typeof legacyUnsCycleRes.body.CycleTime.Value === 'string';
    record(
      'GET /api/uns/cycle-time (redirect)',
      legacyUnsCycleOk,
      legacyUnsCycleOk ? 'redirected to FLD cycle time' : formatError(legacyUnsCycleRes, 'Legacy UNS cycle-time redirect failed')
    );

    const legacyRedirectMetaRes = await apiRequestManualRedirect(`/api/uns/shift-schedule?lineId=${encodeURIComponent(lineId)}&timezone=-1`);
    const legacyRedirectMetaOk = legacyRedirectMetaRes.status === 307
      && legacyRedirectMetaRes.location.includes('/api/fld/shift-schedule-v1')
      && legacyRedirectMetaRes.deprecation.toLowerCase() === 'true'
      && legacyRedirectMetaRes.sunset.length > 0
      && legacyRedirectMetaRes.link.includes('successor-version')
      && legacyRedirectMetaRes.migration.length > 0;
    record(
      'GET /api/uns/shift-schedule deprecation headers',
      legacyRedirectMetaOk,
      legacyRedirectMetaOk
        ? `status=${legacyRedirectMetaRes.status}, location=${legacyRedirectMetaRes.location}`
        : `status=${legacyRedirectMetaRes.status}, deprecation=${legacyRedirectMetaRes.deprecation}, sunset=${legacyRedirectMetaRes.sunset}, link=${legacyRedirectMetaRes.link}, migration=${legacyRedirectMetaRes.migration}`
    );

    const integrityRes = await apiRequest('/api/sql-integrity');
    const integrityOk = integrityRes.ok && integrityRes.body && typeof integrityRes.body === 'object';
    record('GET /api/sql-integrity', integrityOk, integrityOk ? JSON.stringify(integrityRes.body) : formatError(integrityRes, 'Integrity read failed'));

    const repairRes = await apiRequest('/api/sql-integrity-repair', { method: 'POST' });
    record('POST /api/sql-integrity-repair', repairRes.ok, repairRes.ok ? 'ok' : formatError(repairRes, 'Integrity repair failed'));

    const pointRes = await apiRequest('/api/point', {
      method: 'POST',
      body: JSON.stringify({
        measurement: 'integration_test_measurement',
        fields: { runId, source: 'integration-test' },
        tags: { scope: 'api' }
      })
    });
    record('POST /api/point', pointRes.ok, pointRes.ok ? 'ok' : formatError(pointRes, 'Generic point write failed'));

    const templateCreateRes = await apiRequest('/api/masterdata-template', {
      method: 'POST',
      body: JSON.stringify({
        plant: 'IT_PLANT',
        templateName,
        payload: {
          stations: [],
          lines: [],
          assignments: [],
          timeEvents: [],
          shiftModells: [],
          shiftSchedules: []
        }
      })
    });
    templateId = templateCreateRes.body?.template?.id || null;
    record(
      'POST /api/masterdata-template',
      templateCreateRes.ok && Boolean(templateId),
      templateCreateRes.ok ? `created ${templateId}` : formatError(templateCreateRes, 'Template create failed')
    );

    const templateCreateResDuplicate = await apiRequest('/api/masterdata-template', {
      method: 'POST',
      body: JSON.stringify({
        plant: 'IT_PLANT',
        templateName,
        payload: {
          stations: [],
          lines: [],
          assignments: [],
          timeEvents: [],
          shiftModells: [],
          shiftSchedules: []
        }
      })
    });
    record(
      'POST /api/masterdata-template (duplicate business key)',
      templateCreateResDuplicate.ok,
      templateCreateResDuplicate.ok ? 'ok (upsert expected)' : formatError(templateCreateResDuplicate, 'Duplicate template upsert failed')
    );

    const templateListRes = await apiRequest('/api/masterdata-templates?plant=IT_PLANT');
    if (templateListRes.ok && Array.isArray(templateListRes.body)) {
      const matchingTemplates = templateListRes.body.filter((t) => t && t.templateName === templateName && t.plant === 'IT_PLANT');
      record(
        'GET /api/masterdata-templates uniqueness (plant+templateName)',
        matchingTemplates.length === 1,
        matchingTemplates.length === 1
          ? 'exactly one template row for business key'
          : `expected 1, found ${matchingTemplates.length}`
      );
    } else {
      record(
        'GET /api/masterdata-templates uniqueness (plant+templateName)',
        false,
        formatError(templateListRes, 'Template list read failed')
      );
    }

    if (templateId) {
      const templateDeleteRes = await apiRequest(`/api/masterdata-templates/${templateId}`, { method: 'DELETE' });
      record(
        'DELETE /api/masterdata-templates/:id',
        templateDeleteRes.ok,
        templateDeleteRes.ok ? 'ok' : formatError(templateDeleteRes, 'Template delete failed')
      );
    } else {
      record('DELETE /api/masterdata-templates/:id', false, 'Skipped because template id was not created');
    }

    if (assignmentId) {
      const deleteAssignRes = await apiRequest(`/api/assign-shift/${assignmentId}`, { method: 'DELETE' });
      record('DELETE /api/assign-shift/:id', deleteAssignRes.ok, deleteAssignRes.ok ? 'ok' : formatError(deleteAssignRes, 'Shift assignment delete failed'));
    } else {
      record('DELETE /api/assign-shift/:id', false, 'Skipped because assignment id was not found');
    }

    const deleteShiftRes = await apiRequest(`/api/shift/${shiftId}`, { method: 'DELETE' });
    record('DELETE /api/shift/:id', deleteShiftRes.ok, deleteShiftRes.ok ? 'ok' : formatError(deleteShiftRes, 'Shift delete failed'));

    const deleteStationRes = await apiRequest(`/api/station/${stationId}`, { method: 'DELETE' });
    record('DELETE /api/station/:id', deleteStationRes.ok, deleteStationRes.ok ? 'ok' : formatError(deleteStationRes, 'Station delete failed'));

    const deleteLineRes = await apiRequest(`/api/line/${lineId}`, { method: 'DELETE' });
    record('DELETE /api/line/:id', deleteLineRes.ok, deleteLineRes.ok ? 'ok' : formatError(deleteLineRes, 'Line delete failed'));
  } catch (err) {
    record('Test runner', false, `Unexpected error: ${err.message || String(err)}`);
  }

  console.log('Integration test results:');
  for (const result of results) {
    const state = result.ok ? 'PASS' : 'FAIL';
    console.log(`- [${state}] ${result.name} -> ${result.detail}`);
  }

  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) {
    console.error(`\nIntegration test finished with ${failed} failure(s).`);
    process.exit(1);
  }

  console.log('\nIntegration test passed.');
  process.exit(0);
}

run();
