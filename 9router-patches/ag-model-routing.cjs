'use strict';
const crypto = require('node:crypto');
const cache = new Map();

function base(model) {
  return String(model || '').replace(/^(ag|antigravity)\//, '').replace(/4\.6/g, '4-6').replace(/5\.5/g, '5-5');
}

function effort(body = {}) {
  const value = body._claudeEffort || body.output_config?.effort || body.reasoning_effort || body.effortLevel || body.reasoning?.effort;
  if (['low', 'medium', 'high', 'xhigh', 'max'].includes(value)) return value;
  const budget = body.thinking?.budget_tokens;
  return budget >= 16000 ? 'high' : budget > 0 && budget < 4000 ? 'low' : 'medium';
}

function unsupportedEffort(model, level) {
  const name = base(model);
  if ((level === 'xhigh' || level === 'max') && /^claude-(opus|sonnet)-4-6(?:-thinking)?$/.test(name)) {
    return new Error(`Antigravity ${name} does not support ${level} effort; choose low, medium, or high.`);
  }
  if ((level === 'xhigh' || level === 'max') && /^claude-(opus|sonnet)-5-5(?:-(low|medium|high))?$/.test(name)) {
    return new Error(`Antigravity ${name} does not support ${level} effort; choose low, medium, or high.`);
  }
  return null;
}

function ensureEffortSupported(model, body = {}) {
  const level = effort(body);
  const error = unsupportedEffort(model, level);
  if (error) {
    error.code = 'UNSUPPORTED_EFFORT';
    error.status = 400;
    throw error;
  }
  return level;
}

function resolveModel(model, body = {}) {
  const requested = base(model);
  const eff = ensureEffortSupported(requested, body);
  const match = requested.match(/^claude-(opus|sonnet)-5[-.]5(?:-(low|medium|high))?$/);
  if (match) {
    const family = match[1];
    let level = match[2];
    if (!level) level = (eff === 'low' || eff === 'high') ? eff : 'medium';
    return `claude-${family}-5-5-${level}`;
  }
  return requested === 'claude-opus-4-6' ? 'claude-opus-4-6-thinking' : requested;
}

function supports(models, requested) {
  if (!Array.isArray(models)) return true;
  if (models.length === 0) return false;
  const model = base(requested);
  if (!model.startsWith('claude-')) return true;
  const advertised = models.map(base);
  if (advertised.includes(model)) return true;
  if (model === 'claude-opus-4-6' || model === 'claude-opus-4-6-thinking') {
    return advertised.includes('claude-opus-4-6-thinking');
  }
  if (model === 'claude-sonnet-4-6') {
    return advertised.includes('claude-sonnet-4-6');
  }
  if (/^claude-(opus|sonnet)-5-5$/.test(model)) {
    return advertised.some(m => ['low', 'medium', 'high'].some(level => m === `${model}-${level}`));
  }
  return false;
}

async function discover(accounts, fetcher = fetch, proxyResolver = async () => null) {
  return new Map(await Promise.all(accounts.map(async account => {
    const fingerprint = crypto.createHash('sha256').update(String(account.accessToken || '') + ':' + String(account.projectId || '')).digest('hex');
    const key = account.id + ':' + fingerprint;
    let entry = cache.get(key);
    if (!entry || entry.until <= Date.now()) {
      entry = { until: Infinity };
      entry.promise = (async () => {
        try {
          const proxy = await proxyResolver(account);
          const response = await fetcher('https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels', {
            method: 'POST', signal: AbortSignal.timeout(6000),
            headers: { Authorization: 'Bearer ' + account.accessToken, 'Content-Type': 'application/json', 'User-Agent': 'antigravity/0.5.95 darwin/arm64' },
            body: JSON.stringify(account.projectId ? { project: account.projectId } : {}),
          }, proxy);
          if (!response.ok) throw new Error('Model discovery HTTP ' + response.status);
          const data = await response.json();
          if (!data.models || typeof data.models !== 'object' || Array.isArray(data.models)) throw new Error('Invalid model catalog');
          entry.until = Date.now() + 300000;
          return Object.keys(data.models);
        } catch {
          entry.until = Date.now() + 60000;
          return null;
        }
      })();
      cache.set(key, entry);
      if (cache.size > 1000) cache.delete(cache.keys().next().value);
    }
    return [account.id, await entry.promise];
  })));
}

function applyThinking(config, model, body) {
  if (!/^claude-(opus|sonnet)-4-6/.test(base(model))) return config;
  const level = ensureEffortSupported(model, body);
  const budget = { low: 1024, medium: 8192, high: 16384 }[level];
  return { ...config, thinkingConfig: { ...config.thinkingConfig, thinkingBudget: budget, includeThoughts: true } };
}

function exhaustedResponse(model, detail, retryAfter) {
  let message = String(detail || 'All compatible accounts rejected this request.');
  const start = message.indexOf('{');
  if (start >= 0) {
    try { message = JSON.parse(message.slice(start)).error?.message || message; } catch {}
  }
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'x-should-retry': 'false' };
  const delay = Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000);
  if (delay > 0) headers['retry-after'] = String(delay);
  return new Response(JSON.stringify({type:'error',error:{type:'rate_limit_error',message:`9Router checked the compatible accounts for ${model}. ${message}`}}), {status:429, headers});
}

module.exports = { base, effort, unsupportedEffort, ensureEffortSupported, resolveModel, supports, discover, applyThinking, exhaustedResponse };
