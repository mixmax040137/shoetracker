/****************************************************************
 * ShoeTracker — Strava OAuth/API proxy (Google Apps Script)
 *
 * แยกจาก Code.gs ของแบบสอบถาม L'Arts Day โดยสิ้นเชิง — deploy เป็น
 * Apps Script โปรเจกต์ใหม่ต่างหาก (ไม่ต้องมี Google Sheet ก็ได้)
 *
 * ทำหน้าที่เป็นตัวกลางเรียก Strava API แทนเว็บเบราว์เซอร์ เพื่อ:
 *   1) เก็บ STRAVA_CLIENT_SECRET ไว้ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ฝังในหน้าเว็บ
 *   2) เลี่ยงปัญหา CORS จากการเรียก api.strava.com ตรงจากเบราว์เซอร์
 *
 * วิธีใช้:
 *  1) ไปที่ script.google.com → New project → วางโค้ดนี้แทนของเดิม
 *  2) เมนู Project Settings → Script Properties → เพิ่ม
 *       STRAVA_CLIENT_ID     = <client id จาก strava.com/settings/api>
 *       STRAVA_CLIENT_SECRET = <client secret จาก strava.com/settings/api>
 *  3) Deploy → New deployment → ประเภท "Web app"
 *       - Execute as: Me
 *       - Who has access: Anyone
 *  4) คัดลอก Web app URL ไปวางใน web-app/app.js (CONFIG.STRAVA_PROXY_ENDPOINT)
 ****************************************************************/

function doGet() {
  return json_({ status: "ok", message: "ShoeTracker Strava proxy is running" });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    switch (action) {
      case "exchange":
        return json_({ status: "ok", tokens: exchangeCode_(body.code) });
      case "refresh":
        return json_({ status: "ok", tokens: refreshToken_(body.refreshToken) });
      case "gear":
        return json_({ status: "ok", shoes: fetchGear_(body.accessToken) });
      case "activities":
        return json_({ status: "ok", activities: fetchActivities_(body.accessToken, body.after) });
      default:
        return json_({ status: "error", message: "unknown action: " + action });
    }
  } catch (err) {
    return json_({ status: "error", message: String(err) });
  }
}

function props_() {
  var p = PropertiesService.getScriptProperties();
  var clientId = p.getProperty("STRAVA_CLIENT_ID");
  var clientSecret = p.getProperty("STRAVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("ยังไม่ได้ตั้งค่า STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET ใน Script Properties");
  }
  return { clientId: clientId, clientSecret: clientSecret };
}

function exchangeCode_(code) {
  if (!code) throw new Error("missing code");
  var cfg = props_();
  return requestToken_({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code: code,
    grant_type: "authorization_code",
  });
}

function refreshToken_(refreshToken) {
  if (!refreshToken) throw new Error("missing refreshToken");
  var cfg = props_();
  return requestToken_({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

function requestToken_(payload) {
  var res = UrlFetchApp.fetch("https://www.strava.com/oauth/token", {
    method: "post",
    payload: payload,
    muteHttpExceptions: true,
  });
  var data = JSON.parse(res.getContentText());
  if (res.getResponseCode() >= 400) {
    throw new Error(data.message || "strava token request failed");
  }
  var athleteName = "";
  if (data.athlete) {
    athleteName = [data.athlete.firstname, data.athlete.lastname].filter(Boolean).join(" ");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteName: athleteName,
  };
}

function fetchGear_(accessToken) {
  if (!accessToken) throw new Error("missing accessToken");
  var res = UrlFetchApp.fetch("https://www.strava.com/api/v3/athlete", {
    method: "get",
    headers: { Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true,
  });
  var data = JSON.parse(res.getContentText());
  if (res.getResponseCode() >= 400) throw new Error(data.message || "fetch gear failed");
  return data.shoes || [];
}

function fetchActivities_(accessToken, after) {
  if (!accessToken) throw new Error("missing accessToken");
  var url = "https://www.strava.com/api/v3/athlete/activities?per_page=100";
  if (after) url += "&after=" + encodeURIComponent(after);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true,
  });
  var data = JSON.parse(res.getContentText());
  if (res.getResponseCode() >= 400) throw new Error(data.message || "fetch activities failed");

  return data.filter(function (a) {
    return a.type === "Run" || a.sport_type === "Run" || a.sport_type === "TrailRun";
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
