function get(url, headers, cb) {
  $httpClient.get({ url: url, headers: headers || {}, timeout: 15 }, function(error, response, data) {
    cb(error, response, data);
  });
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

function getJSON(url) {
  return new Promise(function(resolve) {
    get(url, { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, function(error, response, data) {
      if (error || !response || response.status !== 200) return resolve(null);
      try {
        var obj = JSON.parse(data);
        if (obj && !obj.error) return resolve(obj);
      } catch (e) {}
      resolve(null);
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
      if (error || !response) return resolve({ ok: false, text: '不可用', ms: ms });
      var code = response.status || 0;
      var body = String(data || '').toLowerCase();
      var ok = [200, 301, 302, 307, 308, 403].indexOf(code) >= 0;
      if (keyword && code === 200 && body && body.indexOf(keyword) === -1) ok = false;
      resolve({ ok: ok, text: ok ? (name === 'Gemini' ? '入口可达' : '可用') : ('异常 ' + code), ms: ms });
    });
  });
}

function flagEmoji(code) {
  code = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🌍';
  return String.fromCodePoint(code.charCodeAt(0) + 127397, code.charCodeAt(1) + 127397);
}

function cnType(companyType, isDatacenter, isMobile) {
  var t = String(companyType || '').toLowerCase();
  if (isMobile) return '移动网络';
  if (isDatacenter || t === 'hosting') return '数据中心';
  if (t === 'isp') return '家宽';
  if (t === 'business') return '商宽/商企';
  if (t === 'education') return '教育网';
  if (t === 'government') return '政企网络';
  return '未知';
}

function calcRisk(info) {
  var risk = 8;
  if (info.is_datacenter) risk += 28;
  if (info.is_proxy) risk += 18;
  if (info.is_vpn) risk += 15;
  if (info.is_tor) risk += 35;
  if (info.is_abuser) risk += 18;
  if (info.is_crawler) risk += 8;
  if (risk > 100) risk = 100;
  var purity = 100 - risk;
  var label = risk >= 80 ? '极高' : risk >= 60 ? '高' : risk >= 40 ? '中' : risk >= 20 ? '低' : '很低';
  return { risk: risk, purity: purity, label: label };
}

function shortLoc(info) {
  var city = info.city || '';
  var state = info.state || '';
  var country = info.country || '';
  return [city, state, country].filter(Boolean).join(' ') || '未知';
}

function airportHint(countryCode, city, state) {
  var text = (String(city || '') + ' ' + String(state || '') + ' ' + String(countryCode || '')).toUpperCase();
  if (text.indexOf('SINGAPORE') >= 0 || text.indexOf('SG') >= 0) return 'SIN';
  if (text.indexOf('TOKYO') >= 0 || text.indexOf('JP') >= 0) return 'TYO';
  if (text.indexOf('OSAKA') >= 0) return 'KIX';
  if (text.indexOf('HONG KONG') >= 0 || text.indexOf('HK') >= 0) return 'HKG';
  if (text.indexOf('TAIWAN') >= 0 || text.indexOf('TAIPEI') >= 0 || text.indexOf('TW') >= 0) return 'TPE';
  if (text.indexOf('LOS ANGELES') >= 0) return 'LAX';
  if (text.indexOf('SAN JOSE') >= 0 || text.indexOf('SANTA CLARA') >= 0) return 'SJC';
  if (text.indexOf('NEW YORK') >= 0) return 'NYC';
  if (text.indexOf('SEOUL') >= 0 || text.indexOf('KR') >= 0) return 'ICN';
  return '未知';
}

(async function() {
  var ipv4 = await getText('https://api-ipv4.ip.sb/ip');
  var ipv6 = await getText('https://api-ipv6.ip.sb/ip');
  var mainIP = await getText('https://api.ip.sb/ip');

  var geo = null;
  if (mainIP) geo = await getJSON('https://api.ipapi.is/?q=' + encodeURIComponent(mainIP));

  var chatgpt = await siteCheck('ChatGPT', 'https://chatgpt.com/', 'chatgpt');
  var claude = await siteCheck('Claude', 'https://claude.ai/', 'claude');
  var gemini = await siteCheck('Gemini', 'https://gemini.google.com/', 'gemini');

  var location = geo && geo.location ? geo.location : {};
  var company = geo && geo.company ? geo.company : {};
  var asn = geo && geo.asn ? geo.asn : {};
  var datacenter = geo && geo.datacenter ? geo.datacenter : {};
  var abuse = geo && geo.abuse ? geo.abuse : {};

  var info = {
    ip: (geo && geo.ip) || mainIP || '未知',
    country_code: location.country_code || asn.country || '',
    country: location.country || datacenter.country || '未知',
    state: location.state || datacenter.region || '',
    city: location.city || datacenter.city || '',
    isp: company.name || asn.org || datacenter.datacenter || '未知',
    asn: asn.asn ? ('AS' + asn.asn) : '未知',
    asn_org: asn.org || company.name || '未知',
    company_type: company.type || asn.type || '未知',
    is_datacenter: !!(geo && geo.is_datacenter),
    is_mobile: !!(geo && geo.is_mobile),
    is_proxy: !!(geo && geo.is_proxy),
    is_vpn: !!(geo && geo.is_vpn),
    is_tor: !!(geo && geo.is_tor),
    is_abuser: !!(geo && geo.is_abuser),
    is_crawler: !!(geo && geo.is_crawler),
    abuser_score: company.abuser_score || asn.abuser_score || '未知',
    abuse_email: abuse.email || '未知'
  };

  var risk = calcRisk(info);
  var place = shortLoc(info);
  var entry = airportHint(info.country_code, info.city, info.state);
  var netTags = [
    info.is_datacenter ? '机房' : null,
    info.is_mobile ? '移动' : null,
    info.is_proxy ? 'Proxy' : null,
    info.is_vpn ? 'VPN' : null,
    info.is_tor ? 'Tor' : null,
    info.is_abuser ? 'Abuser' : null
  ].filter(Boolean).join('/') || '正常';

  var warp = /cloudflare/i.test((info.isp || '') + ' ' + (info.asn_org || '')) ? 'on' : 'off';
  var avg = Math.round((chatgpt.ms + claude.ms + gemini.ms) / 3);
  var okCount = [chatgpt.ok, claude.ok, gemini.ok].filter(Boolean).length;
  var style = okCount === 3 ? 'good' : okCount >= 1 ? 'info' : 'alert';

  var lines = [
    '🤖 ChatGPT  ' + (chatgpt.ok ? '✅ ' : '❌ ') + chatgpt.text + ' (' + chatgpt.ms + 'ms)',
    '🧠 Claude   ' + (claude.ok ? '✅ ' : '❌ ') + claude.text + ' (' + claude.ms + 'ms)',
    '✨ Gemini   ' + (gemini.ok ? '🌐 ' : '❌ ') + gemini.text + ' (' + gemini.ms + 'ms)',
    '────────────',
    '主出口 IP： ' + info.ip,
    '归属： ' + flagEmoji(info.country_code) + ' ' + place,
    '运营商： ' + info.isp,
    'ASN： ' + info.asn + ' ' + info.asn_org,
    '类型： ' + cnType(info.company_type, info.is_datacenter, info.is_mobile),
    '网络标记： ' + netTags,
    '风险： ' + risk.label + (risk.risk >= 40 ? ' ⚠️ ' : ' ') + risk.risk + '/100，纯净度： ' + risk.purity + '/100',
    '机房： ' + entry,
    'Abuser： ' + info.abuser_score,
    'WARP： ' + warp,
    '────────────',
    'IPv4： ' + (ipv4 || '不可用'),
    'IPv6： ' + (ipv6 || '不可用'),
    '地区一致性： ' + (ipv4 && ipv6 ? '双栈可用' : (ipv4 ? '仅 IPv4' : (ipv6 ? '仅 IPv6' : '未知'))),
    'AI 延迟： ' + avg + 'ms',
    'IP 查询： ' + (geo ? '成功' : '失败'),
    '────────────',
    'Gemini 检测： Web 半严格',
    '说明： 网页可达，不代表登录后一定可对话',
    '策略组： 我的节点',
    '更新： ' + new Date().toLocaleString('zh-CN', { hour12: false })
  ];

  $done({
    title: '节点体检 Pro Max',
    content: lines.join('\n'),
    style: style,
    icon: 'waveform.path.ecg',
    'icon-color': okCount === 3 ? '#34C759' : (okCount >= 1 ? '#0A84FF' : '#FF9F0A')
  });
})();
