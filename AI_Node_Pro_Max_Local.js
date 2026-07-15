function request(url, callback) {
  var start = Date.now();

  $httpClient.get(
    {
      url: url,
      timeout: 12,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      }
    },
    function (error, response, data) {
      callback(error, response, data, Date.now() - start);
    }
  );
}

function testSpeed(url, callback) {
  request(url, function (error, response, data, ms) {
    var status = response ? response.status : 0;

    var ok = !error && (
      status === 200 ||
      status === 301 ||
      status === 302 ||
      status === 307 ||
      status === 308 ||
      status === 403
    );

    callback({
      ok: ok,
      ms: ms
    });
  });
}

function countryFlag(code) {
  if (!code || String(code).length !== 2) {
    return "🏳️";
  }

  code = String(code).toUpperCase();

  return String.fromCodePoint(
    code.charCodeAt(0) + 127397,
    code.charCodeAt(1) + 127397
  );
}

function two(n) {
  return n < 10 ? "0" + n : String(n);
}

function getLocalTime(offset) {
  if (typeof offset !== "number") {
    return "未知";
  }

  var date = new Date(Date.now() + offset * 1000);

  return date.getUTCFullYear() + "-" +
    two(date.getUTCMonth() + 1) + "-" +
    two(date.getUTCDate()) + " " +
    two(date.getUTCHours()) + ":" +
    two(date.getUTCMinutes()) + ":" +
    two(date.getUTCSeconds());
}

function getType(geo) {
  if (geo.mobile) return "移动 IP";
  if (geo.hosting) return "机房 IP";
  return "普通 IP";
}

function getSpeedText(result) {
  return result.ok ? result.ms + "ms" : "不可用";
}

function finish(geo, chatgpt, claude, gemini) {
  $done({
    title: "节点体检 Pro Max",
    content:
      "📍 城市  " + countryFlag(geo.countryCode) + " " +
      geo.city + " · " + geo.timezone + "\n" +
      "🕒 时间  " + getLocalTime(geo.offset) + "\n" +
      "🌐 落地 IP  " + geo.ip + "\n" +
      "🏠 类型  " + getType(geo) + "\n" +
      "🚀 速度  ChatGPT " + getSpeedText(chatgpt) +
      " · Claude " + getSpeedText(claude) +
      " · Gemini " + getSpeedText(gemini),
    style: "info"
  });
}

request(
  "http://ip-api.com/json/?lang=zh-CN&fields=status,query,countryCode,city,timezone,offset,hosting,mobile",
  function (error, response, data) {
    var geo = {
      city: "未知",
      timezone: "未知",
      offset: null,
      ip: "未知",
      countryCode: "",
      hosting: false,
      mobile: false
    };

    try {
      if (!error && response && response.status === 200) {
        var result = JSON.parse(data);

        if (result.status === "success") {
          geo.city = result.city || "未知";
          geo.timezone = result.timezone || "未知";
          geo.offset = result.offset;
          geo.ip = result.query || "未知";
          geo.countryCode = result.countryCode || "";
          geo.hosting = result.hosting === true;
          geo.mobile = result.mobile === true;
        }
      }
    } catch (e) {}

    testSpeed("https://chatgpt.com/", function (chatgpt) {
      testSpeed("https://claude.ai/", function (claude) {
        testSpeed("https://gemini.google.com/", function (gemini) {
          finish(geo, chatgpt, claude, gemini);
        });
      });
    });
  }
);
