$httpClient.get("https://api.ip.sb/ip", function(error, response, data) {
  const status = response ? response.status : "null";
  const headers = response ? JSON.stringify(response.headers || {}) : "null";
  const body = data === undefined || data === null ? "null" : String(data);

  $done({
    title: "节点体检 Pro Max",
    content:
      "error: " + JSON.stringify(error) + "\n" +
      "status: " + status + "\n" +
      "body: " + body + "\n" +
      "headers: " + headers.slice(0, 300),
    style: error ? "alert" : "info"
  });
});
