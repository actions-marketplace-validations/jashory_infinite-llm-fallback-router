'use strict';

function number(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value) {
  if (value == null || value === '') return null;
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function codexWindow(window) {
  if (!window || typeof window !== 'object') return null;
  const used = number(window.used_percent ?? window.usedPercent ?? window.used_percentage ?? window.usedPercentage ?? window.used);
  const total = number(window.total ?? 100) || 100;
  const remaining = used != null ? Math.max(0, total - used) : (number(window.remaining) ?? 100);
  const remainingPct = total > 0 ? Math.max(0, Math.min(100, Math.round((remaining / total) * 100))) : 0;
  
  let rAt = iso(window.reset_at ?? window.resets_at ?? window.resetAt);
  if (!rAt && window.reset_after_seconds) {
    rAt = new Date(Date.now() + Number(window.reset_after_seconds) * 1000).toISOString();
  }
  
  return {
    used: used != null ? used : (total - remaining),
    total,
    remaining,
    remainingPercentage: remainingPct,
    resetAt: rAt,
    unlimited: false,
    source: 'codex-usage'
  };
}

function modelQuota(model) {
  if (!model || typeof model !== 'object') return null;
  const quotaInfo = model.quotaInfo || {};
  const rAt = iso(quotaInfo.resetTime ?? quotaInfo.reset_time);
  const rawFrac = quotaInfo.remainingFraction ?? quotaInfo.remaining_fraction;
  const frac = rawFrac != null ? number(rawFrac) : (rAt && Date.parse(rAt) > Date.now() ? 0 : null);
  const remainingPct = frac != null ? Math.max(0, Math.min(100, Math.round(frac * 100))) : 100;
  const total = 1000;
  const remaining = Math.round((remainingPct / 100) * total);
  const used = total - remaining;
  
  return {
    used,
    total,
    remaining,
    remainingPercentage: remainingPct,
    resetAt: rAt,
    unlimited: false,
    displayName: model.displayName || model.name,
    disabled: false,
    source: 'model-quota'
  };
}

function antigravitySummary(data) {
  const groups = Array.isArray(data?.groups) ? data.groups : data?.quotaSummary?.groups;
  const result = {};
  if (Array.isArray(groups)) {
    for (const group of groups) {
      const family = /claude|gpt/i.test(group?.displayName || '') ? 'claude_gpt' :
        /gemini/i.test(group?.displayName || '') ? 'gemini' : null;
      if (!family) continue;
      for (const bucket of Array.isArray(group.buckets) ? group.buckets : []) {
        const label = `${bucket?.window || ''} ${bucket?.bucketId || ''} ${bucket?.displayName || ''}`.toLowerCase();
        const window = /weekly/.test(label) ? 'weekly' : /5h|five hour|daily/.test(label) ? 'session' : null;
        if (!window) continue;
        const key = `${family}_${window}`;
        const rawReset = iso(bucket.resetTime ?? bucket.reset_time);
        const rawFrac = bucket.remainingFraction ?? bucket.remaining_fraction;
        const frac = rawFrac != null ? number(rawFrac) : (rawReset && Date.parse(rawReset) > Date.now() ? 0 : null);
        const remainingPct = frac != null ? Math.max(0, Math.min(100, Math.round(frac * 100))) : 100;
        const total = 1000;
        const remaining = Math.round((remainingPct / 100) * total);
        const used = total - remaining;
        const rAt = rawReset || (window === 'weekly' ? new Date(Date.now() + 7 * 86400000).toISOString() : new Date(Date.now() + 5 * 3600000).toISOString());
        
        result[key] = {
          used,
          total,
          remaining,
          remainingPercentage: remainingPct,
          resetAt: rAt,
          unlimited: false,
          displayName: `${family === 'claude_gpt' ? 'Claude & GPT' : 'Gemini'} (${window === 'weekly' ? 'Weekly' : '5h'})`,
          disabled: false,
          description: bucket.description || group.description || null,
          source: 'quota-summary'
        };
      }
    }
  }
  return result;
}

module.exports = { codexWindow, modelQuota, antigravitySummary };
