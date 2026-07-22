/**
 * ตารางชีวิตจอย — ตัวรับข้อมูลฝั่ง Google Sheets (ส่งทางเดียว: แอป → ชีต)
 *
 * วิธีติดตั้ง (ทำครั้งเดียว):
 * 1. เปิด Google Sheets ที่ต้องการรับข้อมูล → เมนู Extensions → Apps Script
 * 2. ลบโค้ดเดิม แล้ววางไฟล์นี้ทั้งไฟล์ → กด Save
 * 3. กด Deploy → New deployment → เลือกประเภท "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. กด Deploy → อนุญาตสิทธิ์ → คัดลอก "Web app URL" (ลงท้าย /exec)
 * 5. นำ URL ไปวางในแอป: ตั้งค่า → ข้อมูล → ส่งขึ้น Google Sheets
 *
 * แอปจะ POST JSON: { sheets: [{ name: "Time Table 2026-07", rows: [["..."]] }, ...] }
 * สคริปต์สร้าง/ล้างแท็บตามชื่อแล้วเขียนแถวทับทั้งแท็บ (แท็บอื่นที่ผู้ใช้สร้างเองไม่ถูกแตะ)
 */
/** เปิด URL /exec ใน browser เพื่อทดสอบ — ถ้าเห็น {"ok":true,...} แปลว่าสิทธิ์ตั้งถูกแล้ว */
function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, ping: 'ตารางชีวิตจอย receiver พร้อมใช้งาน' }),
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!data || !Array.isArray(data.sheets)) throw new Error('bad payload');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    data.sheets.forEach(function (s) {
      if (!s || !s.name || !Array.isArray(s.rows)) return;
      var sh = ss.getSheetByName(s.name) || ss.insertSheet(s.name);
      sh.clear(); // ล้างทั้งค่าและสีเดิม — สลับโหมดมีสี/ค่าล้วนแล้วไม่มีสีค้าง
      if (s.rows.length > 0) {
        var range = sh.getRange(1, 1, s.rows.length, s.rows[0].length);
        range.setValues(s.rows);
        // โหมดมีสี: แอปส่ง style arrays ขนาดเดียวกับ rows มาด้วย (ไม่ส่ง = ค่าล้วน)
        if (Array.isArray(s.bg)) range.setBackgrounds(s.bg);
        if (Array.isArray(s.fg)) range.setFontColors(s.fg);
        if (Array.isArray(s.bold)) range.setFontWeights(s.bold);
        if (Array.isArray(s.line)) range.setFontLines(s.line);
      }
    });

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, sheets: data.sheets.length, at: new Date().toISOString() }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(
      ContentService.MimeType.JSON,
    );
  }
}
