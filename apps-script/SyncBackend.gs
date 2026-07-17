/****************************************************************
 * ShoeTracker — Sync/Backup backend (Google Apps Script)
 *
 * เก็บข้อมูลของแอพเป็นไฟล์ JSON ใน Google Drive ของคุณเอง 1 ไฟล์ต่อ 1
 * "รหัสซิงค์" (sync code) เพื่อให้เปิดเบราว์เซอร์/เครื่องอื่นแล้วใส่รหัส
 * เดียวกัน ก็ดึงข้อมูลชุดเดียวกันได้
 *
 * แยกจากโปรเจกต์ Strava proxy โดยสิ้นเชิง — deploy เป็นโปรเจกต์ใหม่ต่างหาก
 *
 * วิธีใช้:
 *  1) ไปที่ script.google.com → New project → วางโค้ดนี้แทนของเดิม
 *  2) Deploy → New deployment → ประเภท "Web app"
 *       - Execute as: Me
 *       - Who has access: Anyone
 *  3) ครั้งแรกจะขอสิทธิ์เข้าถึง Google Drive (กด Advanced → Go to ... → Allow)
 *  4) คัดลอก Web app URL (ลงท้าย /exec) ไปใส่ในแอพ ช่อง "Apps Script URL"
 *
 * ความปลอดภัย: ใครมี URL + รหัสซิงค์ของคุณ จะเข้าถึงข้อมูลได้ ให้เก็บรหัส
 * ซิงค์เหมือนรหัสผ่าน (แอพจะสุ่มรหัสยาว ๆ ให้อัตโนมัติ)
 ****************************************************************/

var FOLDER_NAME = "ShoeTracker Backups";

function doGet() {
  return json_({ status: "ok", message: "ShoeTracker sync backend is running" });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    var code = sanitize_(body.syncCode);
    if (!code) return json_({ status: "error", message: "missing syncCode" });

    if (body.action === "save") {
      writeData_(code, body.data);
      return json_({ status: "ok", updatedAt: new Date().toISOString() });
    }
    if (body.action === "load") {
      var r = readData_(code);
      return json_({ status: "ok", data: r.data, updatedAt: r.updatedAt });
    }
    return json_({ status: "error", message: "unknown action: " + body.action });
  } catch (err) {
    return json_({ status: "error", message: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// อนุญาตเฉพาะตัวอักษร/ตัวเลข/-/_ กันไม่ให้รหัสไปยุ่งกับชื่อไฟล์
function sanitize_(code) {
  if (!code) return "";
  return String(code).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

function folder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function fileName_(code) {
  return "shoetracker_" + code + ".json";
}

function writeData_(code, data) {
  var folder = folder_();
  var name = fileName_(code);
  var payload = JSON.stringify({ updatedAt: new Date().toISOString(), data: data });
  var it = folder.getFilesByName(name);
  if (it.hasNext()) {
    it.next().setContent(payload);
  } else {
    folder.createFile(name, payload, "application/json");
  }
}

function readData_(code) {
  var folder = folder_();
  var it = folder.getFilesByName(fileName_(code));
  if (!it.hasNext()) return { data: null, updatedAt: null };
  var content = it.next().getBlob().getDataAsString();
  try {
    var obj = JSON.parse(content);
    return { data: obj.data, updatedAt: obj.updatedAt };
  } catch (e) {
    return { data: null, updatedAt: null };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
