# ShoeTracker

บันทึกและติดตามระยะทางวิ่งแยกตามรองเท้าแต่ละคู่ — บันทึกวัน เวลา และระยะทางของแต่ละครั้งที่วิ่ง
พร้อมเชื่อมต่อ **Strava** และ **Apple Health** เพื่อรวมยอดระยะทางสะสมของรองเท้าแต่ละคู่

repo นี้มี 2 เวอร์ชัน:

| เวอร์ชัน | ที่อยู่ | ใช้งาน |
|---|---|---|
| **เว็บ** (ใช้ได้ทุกอุปกรณ์) | ไฟล์ที่ root: `index.html`, `styles.css`, `app.js` | เปิดผ่านเบราว์เซอร์ / GitHub Pages |
| **แอพ iOS** (SwiftUI) | โฟลเดอร์ [`ios-app/`](ios-app/) | build ด้วย Xcode บน Mac |

---

## เวอร์ชันเว็บ

static HTML/CSS/JS ล้วน ๆ เปิดไฟล์ `index.html` ในเบราว์เซอร์ได้ทันที หรือโฮสต์ผ่าน GitHub Pages
เมื่อเปิด Pages ของ repo นี้ (Settings → Pages → branch `main` / โฟลเดอร์ `/root`) จะได้ลิงก์:

```
https://mixmax040137.github.io/shoetracker/
```

### ฟีเจอร์
- เพิ่ม/แก้ไข/ทำเครื่องหมายเลิกใช้/ลบรองเท้า พร้อมยอดระยะทางสะสมต่อคู่
- บันทึกการวิ่งด้วยมือ: วันที่ เวลา ระยะทาง ระยะเวลา หมายเหตุ
- หน้าจอปรับตามขนาดจอ — จอกว้างแสดงรายชื่อ+รายละเอียดคู่กัน มือถือแสดงทีละหน้าจอพร้อมปุ่มย้อนกลับ
- นำเข้าการวิ่งจากไฟล์ CSV
- เชื่อมต่อ Strava (ไม่บังคับ — ดูวิธีด้านล่าง)
- ข้อมูลเก็บใน `localStorage` ของเบราว์เซอร์ ไม่มีเซิร์ฟเวอร์กลาง

> **Apple Health / Apple Fitness ใช้ไม่ได้จากเว็บ** — Apple ไม่เปิด HealthKit ให้เว็บเบราว์เซอร์เข้าถึง
> เชื่อมต่อ Health ได้เฉพาะในแอพ iOS (`ios-app/`) เท่านั้น สำหรับเว็บให้ export ข้อมูลเป็น CSV แล้วนำเข้าแทน

### การเชื่อมต่อ Strava (ไม่บังคับ)
เว็บไม่ควรฝัง Strava Client Secret ไว้ในหน้าเว็บ จึงใช้ **Google Apps Script** เป็นตัวกลาง (proxy)
เก็บ secret ไว้ฝั่งเซิร์ฟเวอร์แทน

1. สมัครแอพที่ https://www.strava.com/settings/api → คัดลอก **Client ID** และ **Client Secret**
   ตั้ง **Authorization Callback Domain** เป็น `mixmax040137.github.io`
2. สร้างโปรเจกต์ใหม่ที่ https://script.google.com วางโค้ดจาก [`apps-script/StravaProxy.gs`](apps-script/StravaProxy.gs)
   ใส่ `STRAVA_CLIENT_ID` และ `STRAVA_CLIENT_SECRET` ใน **Project Settings → Script Properties**
   แล้ว **Deploy → Web app** (Execute as: Me, Who has access: Anyone) คัดลอก Web app URL
3. เปิด [`app.js`](app.js) แก้ค่า `CONFIG` ด้านบนไฟล์:
   ```js
   const CONFIG = {
     STRAVA_CLIENT_ID: "วาง Client ID จาก Strava",
     STRAVA_PROXY_ENDPOINT: "วาง Web app URL จากขั้นตอนที่แล้ว",
   };
   ```
4. ไปที่แท็บ **ตั้งค่า** ในหน้าเว็บ กด "เชื่อมต่อ Strava"

---

## เวอร์ชันแอพ iOS

โปรเจกต์ SwiftUI + SwiftData ต้อง build ด้วย Mac + Xcode 15+ ใช้ [XcodeGen](https://github.com/yonaskolb/XcodeGen) สร้างไฟล์ `.xcodeproj`
ดูวิธีติดตั้งและรันทั้งหมดใน [`ios-app/ShoeTracker/README.md`](ios-app/ShoeTracker/README.md)

แอพ iOS เชื่อมต่อ Apple Health ได้โดยตรง (ต่างจากเว็บ) และเชื่อมต่อ Strava ผ่าน OAuth ในตัว

---

## ข้อจำกัดที่ควรรู้
- ข้อมูลเว็บกับแอพ iOS เป็นคนละชุดกัน ยังไม่ซิงค์ข้ามกัน
- ข้อมูลเว็บเก็บเฉพาะในเบราว์เซอร์ที่ใช้งาน — ล้างแคช/เปลี่ยนเครื่องแล้วข้อมูลหาย เว้นแต่กด "ส่งออกข้อมูล (JSON)" สำรองไว้
- การซิงค์ Strava ดึงกิจกรรมล่าสุดสูงสุด 100 รายการต่อครั้ง
