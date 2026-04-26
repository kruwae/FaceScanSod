# 🏢 Face Scan Attendance (Updated 2026)

> ระบบบันทึกเวลาเข้างานด้วยการสแกนใบหน้า + GPS Geofencing + QR Code
> รองรับระบบ Login Required / No-Login และ QR-Only Flow

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![face-api.js](https://img.shields.io/badge/face--api.js-v0.22.2-blueviolet)
![Vercel](https://img.shields.io/badge/deploy-Vercel-000000)
![Google Sheets](https://img.shields.io/badge/database-Google%20Sheets-34A853)

---

## ✨ คุณสมบัติหลัก (Key Features)

| Feature | รายละเอียด |
|---------|-----------|
| 📷 **Face AI** | จดจำใบหน้าด้วย face-api.js (SSD MobileNet) ความแม่นยำสูง ปรับ Threshold ได้ |
| 📍 **GPS Geofencing** | ตรวจสอบตำแหน่งด้วยสูตร Haversine กำหนดรัศมีแยกรายหน่วยบริการ |
| 🤳 **QR-Only Flow** | เลือกได้ว่าจะสแกนหน้าต่อ หรือบันทึกทันทีหลังสแกน QR Code (QR Require Face) |
| 🔐 **Scan Mode** | ตั้งค่า "Login Required" หรือ "No-Login (Fast)" แยกตาม context ของแต่ละจุดบริการ |
| 📊 **Smart Report** | คำนวณสถานะ ตรงเวลา/สาย/สายมาก/ไม่สแกนออก ให้อัตโนมัติในหน้ารายงาน |
| 🖼️ **Dynamic QR** | ระบบ QR Code ที่เปลี่ยนรหัสอัตโนมัติป้องกันการแชร์รูปภาพ QR |
| 📱 **Responsive UI** | ดีไซน์ Modern Dark Theme รองรับทุกขนาดหน้าจอสมาร์ทโฟน |

---

## 🏗️ สถาปัตยกรรมระบบ

```
┌─────────────────────────┐   REST API (JSON)   ┌──────────────────────────┐   R/W   ┌──────────────────┐
│     Frontend (Vercel)   │ ──────────────────▶ │  Google Apps Script      │ ──────▶ │  Google Sheets   │
│                         │                     │  Web App (Backend)       │         │                  │
│  scan.html (บันทึกเวลา)  │   GET / POST        │  doGet()  → read config  │         │  📋 Users        │
│  config.html (ตั้งค่า)   │   (JWT/Token Auth)  │  doPost() → save data    │         │  📋 Attendance   │
│  report.html (รายงาน)    │                     │                          │         │  📋 Config (15 Col)│
└─────────────────────────┘                     └──────────────────────────┘         └──────────────────┘
```

---

## 📁 โครงสร้างไฟล์สำคัญ

- **`index.html`**: เมนูหลักพร้อมระบบ Login/Logout และสถานะผู้ใช้
- **`scan.html`**: หัวใจของระบบ จัดการ GPS, QR Scan และ AI Face Matching (มีโหมด Auto-Submit)
- **`config.html`**: แผงควบคุมสำหรับ Admin จัดการจุดบริการ พิกัด และโหมดความปลอดภัย
- **`report.html`**: ระบบสรุปผลการลงเวลา พร้อม Badge สถานะตามเงื่อนไขเวลา
- **`staff.html`**: จัดการฐานข้อมูลพนักงาน แก้ไขชื่อ/รหัสผ่าน และสิทธิ์การใช้งาน
- **`config.gs`**: จัดการ Schema ข้อมูลใน Google Sheets (รองรับ Column O: Scan Mode)

---

## 🚀 วิธีตั้งค่า Google Sheet (Config)

ในชีท **Config** ข้อมูลจะถูกจัดเก็บทั้งหมด 15 คอลัมน์ (A-O) ดังนี้:

| Column | Name | Description |
|--------|------|-------------|
| A | ID | ลำดับ |
| B | Name | ชื่อหน่วยบริการ |
| C-D | Lat/Lng | พิกัดจุดเช็คอิน |
| E | Radius | รัศมี (เมตร) |
| F | QR Enabled | เปิด/ปิด ระบบ QR (TRUE/FALSE) |
| ... | ... | ... |
| N | QR Require Face | ต้องสแกนหน้าต่อหรือไม่ (TRUE/FALSE) |
| O | Scan Mode | โหมดการเข้าถึง (login / no-login) |

---

## 🌐 Browser Compatibility & Security

- **HTTPS Required**: เพื่อใช้งาน `getUserMedia()` (กล้อง) และ `Geolocation API` (GPS)
- **CORS Support**: ตั้งค่า Deploy GAS เป็น "Anyone" เพื่อให้ Frontend เรียกใช้ได้
- **Session Management**: ระบบจะล้าง Session เมื่อปิด Tab (สำหรับ Admin) เพื่อความปลอดภัย

---

## 📄 License

MIT License — ใช้งานได้อิสระเพื่อสาธารณประโยชน์

---

<div align="center">
  <sub>พัฒนาโดย AI Coding Assistant · 2026</sub>
</div>
