function get(url, headers, cb) {
  $httpClient.get({ url: url, headers: headers || {}, timeout: 20 }, function(error, response, data) {
    cb(error, response, data);
  });
}

function parseArgument() {
  var raw = typeof $argument !== 'undefined' ? $argument : '';
  var out = {};
  raw.split('&').forEach(function(pair) {
    var idx = pair.indexOf('=');
    if (idx === -1) return;
    var k = pair.slice(0, idx);
    var v = pair.slice(idx + 1);
    out[k] = decodeURIComponent(v || '');
  });
  return out;
}

function getText(url) {
  return new Promise(function(resolve) {
    get(url, { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' }, function(error, response, data) {
      if (error || !response || response.status !== 200) return resolve(null);
      var text = String(data || '').trim();
      resolve(text || null);
    });
  });
}

function getJSON(url, headers) {
  return new Promise(function(resolve) {
    get(url, Object.assign({ 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, headers || {}), function(error, response, data) {
      var status = response ? response.status : 0;
      if (error || !response || status < 200 || status >= 300) {
        return resolve({ ok: false, status: status, error: error || 'http_error', data: data || '' });
      }
      try {
        resolve({ ok: true, status: status, json: JSON.parse(data), data: data || '' });
      } catch (e) {
        resolve({ ok: false, status: status, error: 'json_parse_error', data: data || '' });
      }
    });
  });
}

function siteCheck(url, keyword) {
  return new Promise(function(resolve) {
    var start = Date.now();
    get(url, {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'en-US,en;q=0.9'
    }, function(error, response, data) {
      var ms = Date.now() - start;
      if (error || !response) return resolve({ ok: false, ms: ms });
      var code = response.status || 0;
      var body = String(data || '').toLowerCase();
      var ok = [200, 301, 302, 307, 308, 403].indexOf(code) >= 0;
      if (keyword && code === 200 && body && body.indexOf(keyword) === -1) ok = false;
      resolve({ ok: ok, ms: ms });
    });
  });
}

function cleanOrg(text) {
  return String(text || '未知')
    .replace(/, Inc\.?/g, '')
    .replace(/, LLC/g, '')
    .replace(/Amazon\.com/gi, 'Amazon')
    .replace(/Corporation/gi, 'Corp');
}

function cnType(hosting, mobile, ispName) {
  if (mobile) return '移动网络';
  if (hosting) return '机房 IP';
  if (/residential|broadband|fiber|telecom|isp/i.test(String(ispName || ''))) return '住宅 IP';
  return '普通网络';
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function scoreLevel(score) {
  if (score >= 85) return '非常干净';
  if (score >= 70) return '较干净';
  if (score >= 55) return '一般';
  if (score >= 40) return '偏风险';
  return '高风险';
}

function numOr(defaultValue, val) {
  var n = parseFloat(val);
  return isNaN(n) ? defaultValue : n;
}

function base64Encode(str) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var out = '';
  var i = 0;
  while (i < str.length) {
    var c1 = str.charCodeAt(i++);
    var c2 = str.charCodeAt(i++);
    var c3 = str.charCodeAt(i++);
    var e1 = c1 >> 2;
    var e2 = ((c1 & 3) << 4) | (c2 >> 4);
    var e3 = isNaN(c2) ? 64 : (((c2 & 15) << 2) | (c3 >> 6));
    var e4 = isNaN(c3) ? 64 : (c3 & 63);
    out += chars.charAt(e1) + chars.charAt(e2) + chars.charAt(e3) + chars.charAt(e4);
  }
  return out;
}

function fmtSource(name, item) {
  if (!item || !item.ok || typeof item.score !== 'number') return name + ' --';
  return name + ' ' + item.score;
}

function fmtDebug(name, item) {
  if (!item) return name + ': none';
  if (item.ok) return name + ': ok';
  var bits = [];
  if (item.status) bits.push('http ' + item.status);
  if (item.error) bits.push(item.error);
  if (item.auth) bits.push(item.auth);
  return name + ': ' + (bits.join(', ') || 'fail');
}

async function getGeo(mainIP) {
  var geo = null;
  if (mainIP) {
    var r = await getJSON('http://ip-api.com/json/' + encodeURIComponent(mainIP) + '?fields=status,message,country,countryCode,timezone,city,isp,org,as,mobile,proxy,hosting,query');
    geo = r.ok ? r.json : null;
  }
  var backup = null;
  if ((!geo || geo.status !== 'success') && mainIP) {
    var b = await getJSON('https://ipinfo.io/' + encodeURIComponent(mainIP) + '/json');
    backup = b.ok ? b.json : null;
  }
  return { geo: geo, backup: backup };
}

async function getAbuseScore(ip, key) {
  if (!key || !ip) return { name: 'AbuseIPDB', ok: false, score: null, error: 'missing_key' };
  var r = await getJSON('https://api.abuseipdb.com/api/v2/check?ipAddress=' + encodeURIComponent(ip) + '&maxAgeInDays=90', {
    'Key': key,
    'Accept': 'application/json'
  });
  if (!r.ok) return { name: 'AbuseIPDB', ok: false, score: null, status: r.status, error: r.error };
  var data = r.json;
  var score = data && data.data && typeof data.data.abuseConfidenceScore === 'number' ? data.data.abuseConfidenceScore : null;
  return { name: 'AbuseIPDB', ok: score !== null, score: score, status: r.status, error: score === null ? 'no_score' : null };
}

async function getIPQSScore(ip, key) {
  if (!key || !ip) return { name: 'IPQS', ok: false, score: null, error: 'missing_key' };
  var r = await getJSON('https://www.ipqualityscore.com/api/json/ip/' + encodeURIComponent(key) + '/' + encodeURIComponent(ip));
  if (!r.ok) return { name: 'IPQS', ok: false, score: null, status: r.status, error: r.error };
  var data = r.json;
  var score = data && typeof data.fraud_score === 'number' ? data.fraud_score : null;
  return { name: 'IPQS', ok: score !== null, score: score, status: r.status, error: score === null ? 'no_score' : null };
}

async function getScamScore(ip, user, key) {
  if (!ip || (!key && !user)) return { name: 'Scamalytics', ok: false, score: null, error: 'missing_auth' };

  var tries = [];
  if (user && key) {
    tries.push({ auth: 'basic', headers: { 'Authorization': 'Basic ' + base64Encode(user + ':' + key) } });
  }
  if (key) {
    tries.push({ auth: 'x-api-key', headers: { 'X-API-Key': key } });
    tries.push({ auth: 'bearer', headers: { 'Authorization': 'Bearer ' + key } });
  }

  for (var i = 0; i < tries.length; i++) {
    var t = tries[i];
    var r = await getJSON('https://api.scamalytics.com/v1/query/' + encodeURIComponent(ip), t.headers);
    if (!r.ok) {
      var preview = String(r.data || '').slice(0, 80).replace(/\s+/g, ' ');
      t.fail = { status: r.status, error: r.error, preview: preview };
      continue;
    }
    var data = r.json;
    var score = null;
    if (data) {
      if (typeof data.score === 'number') score = data.score;
      if (score === null && typeof data.fraud_score === 'number') score = data.fraud_score;
      if (score === null && data.data && typeof data.data.score === 'number') score = data.data.score;
    }
    if (score !== null) return { name: 'Scamalytics', ok: true, score: score, status: r.status, auth: t.auth };
    t.fail = { status: r.status, error: 'no_score', preview: String(r.data || '').slice(0, 80).replace(/\s+/g, ' ') };
  }

  var last = tries[tries.length - 1] || {};
  var fail = last.fail || {};
  return { name: 'Scamalytics', ok: false, score: null, status: fail.status, error: fail.error || 'all_auth_failed', auth: last.auth || '' };
}

function aggregatePurity(scores, hosting, proxy, weights) {
  var used = scores.filter(function(x) { return x.ok && typeof x.score === 'number'; });
  if (!used.length) {
    var baseRisk = 8;
    if (hosting) baseRisk += 28;
    if (proxy) baseRisk += 20;
    return { purity: clamp(100 - baseRisk, 0, 100), mode: 'fallback' };
  }
  var weightSum = 0;
  var risk = 0;
  used.forEach(function(item) {
    var w = weights[item.name] || 0;
    risk += item.score * w;
    weightSum += w;
  });
  if (weightSum <= 0) {
    used.forEach(function(item) { risk += item.score; });
    risk = risk / used.length;
  } else {
    risk = risk / weightSum;
  }
  if (hosting) risk += 8;
  if (proxy) risk += 12;
  return { purity: clamp(Math.round(100 - risk), 0, 100), mode: 'api' };
}

(async function() {
  var args = parseArgument();
  var ABUSE_KEY = args.abuse || '';
  var IPQS_KEY = args.ipqs || '';
  var SCAM_USER = args.scam_user || '';
  var SCAM_KEY = args.scam_key || '';
  var PANEL_NAME = args.panel || '节点体检 Pro Max Debug';
  var weights = {
    AbuseIPDB: numOr(40, args.wabuse),
    IPQS: numOr(35, args.wipqs),
    Scamalytics: numOr(25, args.wscam)
  };

  var mainIP = await getText('https://api.ip.sb/ip');
  var geoPack = await getGeo(mainIP);
  var geo = geoPack.geo;
  var backup = geoPack.backup;

  var city = (geo && geo.city) || (backup && backup.city) || '未知';
  var timezone = (geo && geo.timezone) || '未知';
  var isp = cleanOrg((geo && geo.isp) || (backup && backup.org) || '未知');
  var hosting = !!(geo && geo.hosting);
  var proxy = !!(geo && geo.proxy);
  var mobile = !!(geo && geo.mobile);

  var results = await Promise.all([
    siteCheck('https://chatgpt.com/', 'chatgpt'),
    siteCheck('https://claude.ai/', 'claude'),
    siteCheck('https://gemini.google.com/', 'gemini'),
    getAbuseScore(mainIP, ABUSE_KEY),
    getIPQSScore(mainIP, IPQS_KEY),
    getScamScore(mainIP, SCAM_USER, SCAM_KEY)
  ]);

  var chatgpt = results[0];
  var claude = results[1];
  var gemini = results[2];
  var abuse = results[3];
  var ipqs = results[4];
  var scam = results[5];

  var purityInfo = aggregatePurity([abuse, ipqs, scam], hosting, proxy, weights);
  var speedText = 'ChatGPT ' + chatgpt.ms + 'ms · Claude ' + claude.ms + 'ms · Gemini ' + gemini.ms + 'ms';
  var style = purityInfo.purity >= 75 ? 'good' : purityInfo.purity >= 50 ? 'info' : 'alert';

  var lines = [
    '📍 城市  ' + city + ' · ' + timezone,
    '🏠 类型  ' + cnType(hosting, mobile, isp),
    '✨ 综合纯净度  ' + purityInfo.purity + '/100 · ' + scoreLevel(purityInfo.purity),
    '🧪 单项  ' + fmtSource('Abuse', abuse) + ' · ' + fmtSource('IPQS', ipqs) + ' · ' + fmtSource('Scam', scam),
    '🔎 调试  ' + fmtDebug('A', abuse) + ' | ' + fmtDebug('I', ipqs) + ' | ' + fmtDebug('S', scam),
    '🚀 速度  ' + speedText
  ];

  $done({
    title: PANEL_NAME,
    content: lines.join('\n'),
    style: style,
