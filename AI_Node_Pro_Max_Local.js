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
      if (error || !response || response.status < 200 || response.status >= 300) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        resolve(null);
      }
    });
  });
}

function siteCheck(name, url, keyword) {
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

async function getGeo(mainIP) {
  var geo = null;
  if (mainIP) {
    geo = await getJSON('http://ip-api.com/json/' + encodeURIComponent(mainIP) + '?fields=status,message,country,countryCode,timezone,city,isp,org,as,mobile,proxy,hosting,query');
  }
  var backup = null;
  if ((!geo || geo.status !== 'success') && mainIP) {
    backup = await getJSON('https://ipinfo.io/' + encodeURIComponent(mainIP) + '/json');
  }
  return { geo: geo, backup: backup };
}

async function getAbuseScore(ip, key) {
  if (!key || !ip) return { name: 'AbuseIPDB', ok: false, score: null };
  var data = await getJSON('https://api.abuseipdb.com/api/v2/check?ipAddress=' + encodeURIComponent(ip) + '&maxAgeInDays=90', {
    'Key': key,
    'Accept': 'application/json'
  });
  var score = data && data.data && typeof data.data.abuseConfidenceScore === 'number' ? data.data.abuseConfidenceScore : null;
  return { name: 'AbuseIPDB', ok: score !== null, score: score };
}

async function getIPQSScore(ip, key) {
  if (!key || !ip) return { name: 'IPQS', ok: false, score: null };
  var data = await getJSON('https://www.ipqualityscore.com/api/json/ip/' + encodeURIComponent(key) + '/' + encodeURIComponent(ip));
  var score = data && typeof data.fraud_score === 'number' ? data.fraud_score : null;
  return { name: 'IPQS', ok: score !== null, score: score };
}

async function getScamScore(ip, key) {
  if (!key || !ip) return { name: 'Scamalytics', ok: false, score: null };
  var data = await getJSON('https://api.scamalytics.com/v1/query/' + encodeURIComponent(ip), {
    'X-API-Key': key
  });
  var score = null;
  if (data) {
    if (typeof data.score === 'number') score = data.score;
    if (score === null && typeof data.fraud_score === 'number') score = data.fraud_score;
    if (score === null && data.data && typeof data.data.score === 'number') score = data.data.score;
  }
  return { name: 'Scamalytics', ok: score !== null, score: score };
}

function aggregatePurity(scores, hosting, proxy) {
  var weights = { AbuseIPDB: 0.40, IPQS: 0.35, Scamalytics: 0.25 };
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
    var w = weights[item.name] || 0.2;
    risk += item.score * w;
    weightSum += w;
  });
  risk = weightSum > 0 ? risk / weightSum : risk;
  if (hosting) risk += 8;
  if (proxy) risk += 12;
  return { purity: clamp(Math.round(100 - risk), 0, 100), mode: 'api' };
}

(async function() {
  var args = parseArgument();
  var ABUSE_KEY = args.abuse || '';
  var IPQS_KEY = args.ipqs || '';
  var SCAM_KEY = args.scam || '';
  var PANEL_NAME = args.panel || '节点体检 Pro Max';

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

  var [chatgpt, claude, gemini, abuse, ipqs, scam] = await Promise.all([
    siteCheck('ChatGPT', 'https://chatgpt.com/', 'chatgpt'),
    siteCheck('Claude', 'https://claude.ai/', 'claude'),
    siteCheck('Gemini', 'https://gemini.google.com/', 'gemini'),
    getAbuseScore(mainIP, ABUSE_KEY),
    getIPQSScore(mainIP, IPQS_KEY),
    getScamScore(mainIP, SCAM_KEY)
  ]);

  var purityInfo = aggregatePurity([abuse, ipqs, scam], hosting, proxy);
  var speedText = 'ChatGPT ' + chatgpt.ms + 'ms · Claude ' + claude.ms + 'ms · Gemini ' + gemini.ms + 'ms';
  var sourceUsed = [abuse, ipqs, scam].filter(function(x) { return x.ok; }).map(function(x) { return x.name; }).join(' / ') || '本地估算';
  var okCount = [chatgpt.ok, claude.ok, gemini.ok].filter(Boolean).length;
  var style = purityInfo.purity >= 75 ? 'good' : purityInfo.purity >= 50 ? 'info' : 'alert';
  if (okCount === 0) style = 'alert';

  var lines = [
    '📍 城市  ' + city + ' · ' + timezone,
    '🏠 类型  ' + cnType(hosting, mobile, isp),
    '✨ 综合纯净度  ' + purityInfo.purity + '/100 · ' + scoreLevel(purityInfo.purity),
    '🚀 速度  ' + speedText,
    '🧩 来源  ' + sourceUsed
  ];

  $done({
    title: PANEL_NAME,
    content: lines.join('\n'),
    style: style,
    icon: 'checkmark.shield',
    'icon-color': purityInfo.purity >= 75 ? '#34C759' : (purityInfo.purity >= 50 ? '#0A84FF' : '#FF9F0A')
  });
})();

