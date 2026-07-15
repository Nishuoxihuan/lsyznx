function get(url, callback) {
  var start = Date.now();

  $httpClient.get(
    {
      url: url,
      timeout: 15,
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

function siteSpeed(url, callback) {
  get(url, function (error, response, data, elapsed) {
    var status = response ? response.status : 0;
    var ok = !error && [200, 301, 302, 307, 308, 403].indexOf(status) !== -1;

    callback({
      ok: ok,
      ms: elapsed
    });
  });
}

function pad(number) {
  return number < 10 ? "0" + number : String(number);
}

function localTime(offset) {
  if (typeof offset !== "number") return "未知";

  var date = new Date(Date.now() + offset * 1000);
  return date.getUTCFullYear() + "-" +
    pad(date.getUTCMonth() + 1) + "-" +
    pad(date.getUTCDate()) + " " +
    pad(date.getUTCHours()) + ":" +
    pad(date.getUTCMinutes()) + ":" +
    pad(date.getUTCSeconds());
}

function speedText(result) {
  return result.ok ? result.ms + "ms" : "不可用";
}

function render(geo, chatgpt, claude, gemini) {
  var ipType = "普通 IP";

  if (geo.mobile) {
    ipType = "移动 IP";
  } else if (geo.hosting) {
    ipType = "机房 IP";
  }

  $done({
    title: "节点体检 Pro Max",
    content:
      "📍 城市  " + geo.city + " · " + geo.timezone + "\n" +
      "🕒 时间  " + localTime(geo.offset) + "\n" +
      "🌐 落地 IP  " + geo.ip + "\n" +
      "🏠 类型  " + ipType + "\n" +
      "🚀 速度  ChatGPT " + speedText(chatgpt) +
      " · Claude " + speedText(claude) +
      " · Gemini " + speedText(gemini),
    style: "info",
    icon: "network"
  });
}

get(
  "http://ip-api.com/json/?lang=zh-CN&fields=status,query,city,timezone,offset,hosting,mobile",
  function (error, response, data) {
    var geo = {
      city: "未知",
      timezone: "未知",
      offset: null,
      ip: "未知",
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
          geo.hosting = result.hosting === true;
          geo.mobile = result.mobile === true;
        }
      }
    } catch (e) {}

    siteSpeed("https://chatgpt.com/", function (chatgpt) {
      siteSpeed("https://claude.ai/", function (claude) {
        siteSpeed("https://gemini.google.com/", function (gemini) {
          render(geo, chatgpt, claude, gemini);
        });
      });
    });
  }
);
