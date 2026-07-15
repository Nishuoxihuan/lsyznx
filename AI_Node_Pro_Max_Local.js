function get(url, headers, cb) {
  $httpClient.get({ url: url, headers: headers || {}, timeout: 12 }, function(error, response, data) {
    cb(error, response, data);
  });
}

function getText(url) {
  return new Promise(function(resolve) {
    get(url, { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' }, function(error, response, data) {
      if (error || !response || response.status !== 200) {
        resolve(null);
        return;
      }
      resolve(String(data || '').trim() || null);
    });
  });
}

function getJSON(url) {
  return new Promise(function(resolve) {
    get(url, { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, function(error, response, data) {
      if (error || !response || response.status !== 200) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        resolve(null);
      }
    });
  });
}

function requestSite(name, url, expectText) {
  return new Promise(function(resolve) {
    var start = Date.now();
    get(url, { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' }, function(error, response, data) {
      var ms = Date.now() - start;
      if (error || !response) {
        resolve({ ok: false, text: '不可用', ms: ms });
        return;
      }
      var code = response.status || 0;
      var body = String(data || '').toLowerCase();
      var ok = [200, 301, 302, 307, 308, 403].indexOf(code) >= 0 && (!expectText || body.indexOf(expectText) >= 0 || code === 403);
      resolve({ ok: ok, text: ok ? (name === 'Gemini' ? '入口可达' : '可用') : ('异常 ' + code), ms: ms });
    });
  });
}

function flag(code) {
  code = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🌍';
  return String.fromCodePoint(code.charCodeAt(0) + 127397, code.charCodeAt(1) + 127397);
}

function typeCN(type, isDatacenter) {
  var t = String(type || '').toLowerCase();
  if (isDatacenter || t.indexOf('hosting') >= 0 || t.indexOf('business') >= 0 || t.indexOf('datacenter') >= 0 || t.indexOf('server') >= 0) return '数据中心';
  if (t.indexOf('isp') >= 0 || t.indexOf('residential') >= 0 || t.indexOf('home') >= 0) return '家宽';
  return type || '未知';
}

function calcRisk(info) {
  var risk = 8;
  if (info.is_datacenter) risk += 30;
  if (info.is_proxy) risk += 18;
  if (info.is_vpn) risk += 15;
  if (info.is_tor) risk += 30;
  if (/cloudflare/i.test(String(info.companyName || info.asnOrg || ''))) risk += 8;
  if (risk > 100) risk = 100;
  var purity = 100 - risk;
  var label = risk >= 80 ? '极高' : risk >= 60 ? '高' : risk >= 40 ? '中' : risk >= 20 ? '低' : '很低';
  return { risk: risk, purity: purity, label: label };
}

(async function() {
  var ipv4 = await getText('https://api-ipv4.ip.sb/ip');
  var ipv6 = await getText('https://api-ipv6.ip.sb/ip');
  var mainIP = await getText('https://api.ip.sb/ip');
  var geo = await getJSON('https://api.ipapi.is/?q=me');

  var chatgpt = await requestSite('ChatGPT', 'https://chatgpt.com/', 'chatgpt');
  var claude = await requestSite('Claude', 'https://claude.ai/', 'claude');
  var gemini = await requestSite('Gemini', 'https://gemini.google.com/', 'gemini');

  var info = {
    ip: mainIP || (geo && geo.ip) || '未知',
    country: geo && geo.location ? (geo.location.country_code || geo.location.country) : '未知',
    countryName: geo && geo.location ? (geo.location.country || '未知') : '未知',
    city: geo && geo.location ? (geo.location.city || '') : '',
    region: geo && geo.location ? (geo.location.state || '') : '',
    isp: geo && geo.company ? (geo.company.name || '未知') : ((geo && geo.asn && geo.asn.org) || '未知'),
    asn: geo && geo.asn ? ('AS' + geo.asn.asn) : '未知',
    asnOrg: geo && geo.asn ? (geo.asn.org || '未知') : '未知',
    companyName: geo && geo.company ? (geo.company.name || '未知') : '未知',
    type: geo && geo.company ? (geo.company.type || '未知') : '未知',
    is_datacenter: !!(geo && (geo.is_datacenter || (geo.company && geo.company.is_datacenter))),
    is_proxy: !!(geo && geo.is_proxy),
    is_vpn: !!(geo && geo.is_vpn),
    is_tor: !!(geo && geo.is_tor)
  };

  var f = flag(info.country);
  var place = [info.city, info.region, info.countryName].filter(Boolean).join(' ') || '未知';
  var netFlags = [info.is_datacenter ? '机房' : null, info.is_proxy ? 'Proxy' : null, info.is_vpn ? 'VPN' : null, info.is_tor ? 'Tor' : null].filter(Boolean).join('/') || '正常';
  var risk = calcRisk(info);
  var warp = /cloudflare/i.test(String(info.companyName || info.asnOrg || '')) ? 'on' : 'off';
  var okCount = [chatgpt.ok, claude.ok, gemini.ok].filter(Boolean).length;
  var style = okCount === 3 ? 'good' : okCount >= 1 ? 'info' : 'alert';
  var avg = Math.round((chatgpt.ms + claude.ms + gemini.ms) / 3);

  var lines = [
    '🤖 ChatGPT  ' + (chatgpt.ok ? '✅ ' : '❌ ') + chatgpt.text + ' (' + chatgpt.ms + 'ms)',
    '🧠 Claude  ' + (claude.ok ? '✅ ' : '❌ ') + claude.text + ' (' + claude.ms + 'ms)',
    '✨ Gemini  ' + (gemini.ok ? '🌐 ' : '❌ ') + gemini.text + ' (' + gemini.ms + 'ms)',
    '────────────',
    '主出口 IP：' + info.ip,
    '归属：' + f + ' ' + place,
    '运营商：' + info.isp,
    'ASN：' + info.asn + ' ' + info.asnOrg,
    '类型：' + typeCN(info.type, info.is_datacenter),
    '网络标记：' + netFlags,
    '风险：' + risk.label + ' ' + risk.risk + '/100，纯净度：' + risk.purity + '/100',
    'WARP：' + warp,
    '────────────',
    'IPv4：' + (ipv4 || '不可用'),
    'IPv6：' + (ipv6 || '不可用'),
    '地区一致性：' + (ipv4 && ipv6 ? '双栈可用' : (ipv4 ? '仅 IPv4' : (ipv6 ? '仅 IPv6' : '未知'))),
    'AI 延迟：' + avg + 'ms',
    '────────────',
    'Gemini 检测：Web 半严格',
    '说明：网页可达，不代表登录后一定可对话',
    '策略组：我的节点',
    '更新：' + new Date().toLocaleString('zh-CN', { hour12: false })
  ];

  $done({
    title: '节点体检 Pro Max',
    content: lines.join('\n'),
    style: style,
    icon: 'waveform.path.ecg',
    'icon-color': okCount === 3 ? '#34C759' : (okCount >= 1 ? '#0A84FF' : '#FF9F0A')
  });
})();
