/* ============================================================
   script.js : JavaScript ของระบบประเมินโปรเจกต์และคะแนนรายวิชา
     3.1  ค่าคงที่ และสถานะระบบ (State)
     3.2  การเก็บข้อมูล (บันทึก/โหลด) และการเข้ารหัสรหัสผ่าน
     3.2b เชื่อมต่อเซิร์ฟเวอร์: เก็บข้อมูลกลาง ซิงก์ข้ามเครื่อง (ใช้คู่กับ sync-core.js และ server.js)
     3.3  ฟังก์ชันช่วย (สิทธิ์ นักเรียน คะแนน)
     3.4  หน้าตั้งค่าครั้งแรก, Login และหน้าเข้าใช้ครั้งแรก
     3.5  โครงหน้า (Header + เมนู) และโหมดมืด/สว่าง
     3.6  หน้าบัญชีของฉัน (ทุกคน)
     3.7  แอดมิน: ภาพรวม
     3.8  แอดมิน: จัดการผู้ใช้
     3.9  แอดมิน: ยศและสิทธิ์ (แบบดิสคอร์ด)
     3.10 รายชื่อนักเรียน + นำเข้าจาก PDF / Excel (ข้ามชื่อซ้ำ)
     3.11 กลุ่มโปรเจกต์ (ชื่อไทย/อังกฤษ + ครูที่ปรึกษา + เลือกนักเรียน)
     3.12 เกณฑ์การให้คะแนนโปรเจกต์
     3.13 ประเมินโปรเจกต์
     3.14 คะแนนโปรเจกต์ทั้งหมด
     3.15 รายวิชา (ตารางคะแนนแบบกระดาษเช็คชื่อ)
     3.16 หน้า "โปรเจกต์ที่ปรึกษา" (ของผู้ที่แอดมินเลือกเป็นครูที่ปรึกษาโครงงาน)
     3.17 ปรับแต่งหน้าตา (แอดมิน): สี โหมด ความหนาแน่น ฟอนต์ มุมโค้ง
     3.18 render() ตัวสั่งวาดหน้า และซิงก์เรียลไทม์
     3.19 ช่องเลือก (dropdown) แบบ Liquid Glass
   ============================================================ */


/* ------------------------------------------------------------
   3.1 ค่าคงที่ และสถานะระบบ (State)
   ------------------------------------------------------------ */

// สิทธิ์ทั้งหมดที่แอดมินเลือกใส่ในแต่ละ "ยศ" ได้ [รหัสสิทธิ์, ชื่อ, คำอธิบาย]
// แอดมิน (ครู) มีทุกสิทธิ์อยู่แล้ว และเป็นคนเดียวที่จัดการ "ผู้ใช้" กับ "ยศ" ได้
const PERMS = [
  ['students',     'จัดการรายชื่อนักเรียน',        'นำเข้า PDF · เพิ่ม · แก้ไข · ลบ'],
  ['project',      'จัดการกลุ่มและเกณฑ์โปรเจกต์',   'สร้างกลุ่ม เลือกนักเรียนเข้ากลุ่ม กำหนดเกณฑ์'],
  ['scoreProject', 'ให้คะแนนโปรเจกต์',             'ประเมินนักเรียนรายบุคคลตามเกณฑ์'],
  ['viewAll',      'ดูคะแนนโปรเจกต์ทั้งหมด',       'ดูตารางคะแนนของทุกคนและค่าเฉลี่ย'],
  ['subject',      'จัดการรายวิชา',                'สร้างวิชา เพิ่มงาน เพิ่มนักเรียนเข้าวิชา'],
  ['scoreSubject', 'กรอกคะแนนรายวิชา',             'กรอกคะแนนในตารางเช็คชื่อ/คะแนน']
];

// ชื่อกุญแจที่ใช้เก็บข้อมูลในเบราว์เซอร์
const KEY  = 'eval_system_v2';   // ข้อมูลทั้งระบบ (localStorage: ใช้เฉพาะโหมดเครื่องเดียว / ตอนนำข้อมูลเดิมขึ้นเซิร์ฟเวอร์)
const SKEY = 'eval-session';     // ใครล็อกอินอยู่ (sessionStorage: ปิดแท็บแล้วต้องล็อกอินใหม่)
const TKEY = 'eval-theme';       // โหมดมืด/สว่างที่เลือก (localStorage)

const MIN_PW = 6;                                   // รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัว
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,20}$/;       // ชื่อผู้ใช้: อังกฤษ/ตัวเลข 3-20 ตัว
const PREFIXES = ['นาย', 'นางสาว', 'นาง'];          // คำนำหน้าชื่อนักเรียน
const LEVELS = ['ปวช.1', 'ปวช.2', 'ปวช.3', 'ปวส.1', 'ปวส.2', 'ปวส.3'];

// S (State) = สถานะของระบบทั้งหมด
//   ส่วนบน = สถานะหน้าจอ (ไม่ต้องเก็บถาวร)
//   ส่วนล่าง = ข้อมูลจริง (บันทึกทุกครั้งที่ render: ขึ้นเซิร์ฟเวอร์ หรือ localStorage ถ้าไม่มีเซิร์ฟเวอร์)
//
//   users    = [{ id, username, name, dept, admin, advisor, roleIds, mustChange, pass }]
//   roles    = [{ id, name, color, perms: ['students', ...] }]            (ยศ)
//   students = [{ id, prefix, name, no, sid, level }]                      (ทะเบียนนักเรียนกลาง: เลขที่ เลขประจำตัว ระดับ)
//   groups   = [{ id, name, nameEn, advisorId, members: [idนักเรียน, ...] }]  (กลุ่มโปรเจกต์: ชื่อไทย/อังกฤษ ครูที่ปรึกษา)
//   criteria = [{ id, name, max }]                                        (เกณฑ์โปรเจกต์)
//   scores   = { idผู้ให้คะแนน: { idกลุ่ม: { idเกณฑ์: คะแนน } } }          (ประเมินทั้งกลุ่ม)
//              และคะแนนรายบุคคลใช้กุญแจ 'idกลุ่ม@idนักเรียน' แทน idกลุ่ม (ดู ikey)
//   settings = { mode, swatch, density, font, radius, ... }               (หน้าตาของเว็บ ที่แอดมินตั้ง ทุกคนเห็นเหมือนกัน)
//   subjects = [{ id, name, students: [id...], works: [{ id, name, max }],
//                 scores: { idนักเรียน: { idงาน: คะแนน } } }]             (รายวิชา)
//   feedback = { idกลุ่ม: { idผู้ใช้: { t: ข้อความ, at: เวลา } } }          (ข้อเสนอแนะต่อโครงงาน)
const S = {
  uid: null,           // id ของผู้ใช้ที่ล็อกอินอยู่ (null = ยังไม่ล็อกอิน)
  view: 'home',        // เมนูที่เปิดอยู่
  editUser: null,      // กำลังแก้ไขผู้ใช้คนไหน (id)
  editRole: null,      // กำลังแก้ไขยศไหน (id)
  editAdvisor: null,   // กำลังแก้ไขครูที่ปรึกษาคนไหน (id)
  editGroup: null,     // กำลังแก้ชื่อกลุ่มไหน (id)
  addAdv: null,        // กำลังเลือกครูที่ปรึกษาให้กลุ่มไหน (id)
  navMini: (() => { try { return localStorage.getItem('eval-nav-mini') === '1'; } catch (e) { return false; } })(),   // เมนูด้านข้างย่อเหลือแต่ไอคอน (จำค่าไว้ในเบราว์เซอร์)
  editStudent: null,   // กำลังแก้ไขนักเรียนคนไหน (id)
  editSubject: false,  // กำลังแก้ชื่อวิชาอยู่หรือไม่
  addSubj: false,      // เปิดฟอร์ม "เพิ่มวิชาใหม่" อยู่หรือไม่ (หน้ารายวิชา)
  pick: null,          // ตัวเลือกนักเรียนที่เปิดอยู่: 'g:idกลุ่ม' หรือ 's:idวิชา'
  imp: null,           // ข้อมูลนำเข้ารายชื่อที่กำลังตรวจสอบ (ยังไม่ยืนยัน)
  stuQ: '',            // คำค้นหาในหน้ารายชื่อนักเรียน
  stuLevel: '',        // ตัวกรองระดับชั้นในหน้ารายชื่อนักเรียน
  evalGroup: null,     // หน้าประเมินโปรเจกต์: กลุ่มที่เลือกอยู่
  evalMode: 'group',   // หน้าประเมินโปรเจกต์: 'group' = ประเมินทั้งกลุ่ม · 'person' = ประเมินรายบุคคล
  scoreView: 'all',    // หน้าคะแนนทั้งหมด: ผู้ประเมินที่แอดมินเลือกดู ('all' = ทุกคน)
  subjectId: null,     // หน้ารายวิชา: วิชาที่เลือกอยู่
  loginErr: '',        // ข้อความ error ของหน้า Login
  loginUser: '',       // จำชื่อผู้ใช้ที่พิมพ์ไว้ ถ้าล็อกอินไม่ผ่าน
  showLogin: false,    // false = หน้าต้อนรับ, true = หน้ากรอกชื่อผู้ใช้และรหัสผ่าน
  notice: '',          // ข้อความแจ้งด้านบนหน้าผู้ใช้ (เช่น รหัสผ่านชั่วคราว)

  users: [],
  roles: [],
  students: [],
  groups: [],
  criteria: [],
  scores: {},
  subjects: [],
  feedback: {},
  settings: {}
};


/* ------------------------------------------------------------
   3.2 การเก็บข้อมูล (บันทึก/โหลด) และการเข้ารหัสรหัสผ่าน
   ------------------------------------------------------------ */

// SHA-256: แปลงรหัสผ่านเป็นข้อความยาว 64 ตัวอักษรที่ย้อนกลับไม่ได้
//   เราจะเก็บแค่ค่านี้ ไม่เก็บรหัสผ่านจริง ตอนล็อกอินก็เอารหัสที่พิมพ์มาแปลงแล้วเทียบกัน
function sha256(str) {
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const P = [];                                   // จำนวนเฉพาะ 64 ตัวแรก
  for (let n = 2; P.length < 64; n++) if (P.every(p => n % p)) P.push(n);
  const frac = x => ((x - Math.floor(x)) * 4294967296) >>> 0;
  const H = P.slice(0, 8).map(p => frac(Math.sqrt(p)));
  const K = P.map(p => frac(Math.cbrt(p)));

  const bytes = [...new TextEncoder().encode(str)];
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (const v of [Math.floor(bitLen / 4294967296), bitLen >>> 0])
    bytes.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);

  const W = new Array(64);
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++)
      W[t] = (bytes[i + 4 * t] << 24 | bytes[i + 4 * t + 1] << 16 | bytes[i + 4 * t + 2] << 8 | bytes[i + 4 * t + 3]) >>> 0;
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((x, k) => (H[k] = (H[k] + x) >>> 0));
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}

// เข้ารหัสรหัสผ่าน โดยผสม id ผู้ใช้เข้าไปด้วย (salt)
// ทำให้คน 2 คนที่ใช้รหัสเดียวกัน ได้ค่าที่เก็บไม่เหมือนกัน
const hashPw = (id, pw) => sha256('ev:' + id + ':' + pw);

// บันทึก: จำผู้ใช้ที่ล็อกอิน (sessionStorage) + เก็บข้อมูลทั้งระบบ
//   โหมดเซิร์ฟเวอร์ (เปิดผ่าน server.js)     : ส่งเฉพาะ "สิ่งที่เปลี่ยน" ขึ้นเซิร์ฟเวอร์ (ดู 3.2b ด้านล่าง)
//   โหมดเครื่องเดียว (เปิดไฟล์ตรงๆ / Live Server): เก็บใน localStorage ของเบราว์เซอร์เหมือนเดิม
function save() {
  if (NET.mode !== 'server' && NET.mode !== 'local') return true;   // ยังเชื่อมต่อไม่เสร็จ: ห้ามเขียนทับอะไรทั้งสิ้น
  try { sessionStorage.setItem(SKEY, S.uid === null ? '' : String(S.uid)); } catch (e) {}
  if (NET.mode === 'server') { queueSync(); return true; }
  try {
    localStorage.setItem(KEY, JSON.stringify(dataOf()));
  } catch (e) {
    toast('บันทึกข้อมูลลงเบราว์เซอร์ไม่ได้ (พื้นที่เต็มหรือเบราว์เซอร์ปิดการเก็บข้อมูล)');
    return false;
  }
  return true;
}

// ใส่ข้อมูล d (จาก localStorage หรือจากเซิร์ฟเวอร์) ลงใน S  คืน false ถ้ารูปแบบข้อมูลไม่ถูกต้อง
function adopt(d) {
  if (!d || !Array.isArray(d.users)) return false;
  SyncCore.normalize(d);   // กันข้อมูลเพี้ยน: ใส่ค่าเริ่มต้นให้ฟิลด์ที่ต้องเป็นอาเรย์/ออบเจ็กต์
  DATA_KEYS.forEach(k => { S[k] = d[k]; });
  migrateScores();         // ข้อมูลรุ่นเก่า (ให้คะแนนรายนักเรียน) -> ให้คะแนนต่อกลุ่ม
  return true;
}

// โหลดข้อมูลจากเบราว์เซอร์ (โหมดเครื่องเดียว) ถ้ายังไม่เคยมีข้อมูล ระบบจะว่างและแสดงหน้า "ตั้งค่าระบบครั้งแรก"
function load() {
  try {
    if (!adopt(JSON.parse(localStorage.getItem(KEY) || 'null')))
      Object.assign(S, emptyData());   // ไม่มีข้อมูล (เช่น ถูกล้างจากอีกหน้าต่าง): เริ่มจากว่าง
  } catch (e) {}

  let sid = NaN;
  try { sid = Number(sessionStorage.getItem(SKEY)); } catch (e) {}
  if (S.users.some(u => u.id === sid)) S.uid = sid;   // ล็อกอินค้างไว้ (รีเฟรชแล้วไม่หลุด)
}


/* ------------------------------------------------------------
   3.2b เชื่อมต่อเซิร์ฟเวอร์ : เก็บข้อมูลกลาง และซิงก์ข้ามเครื่อง
   หลักการ: เบราว์เซอร์จำ "ข้อมูลที่เซิร์ฟเวอร์มีล่าสุด" (NET.base) ไว้ ทุกครั้งที่ข้อมูลเปลี่ยน
   จะเทียบกับ NET.base แล้วส่งเฉพาะส่วนที่ต่างไปให้เซิร์ฟเวอร์ (SyncCore.diff)
   และถามเซิร์ฟเวอร์ทุก 2.5 วินาทีว่ามีของใหม่จากเครื่องอื่นไหม ถ้ามีจะรวมเข้ากับของเรา
   ------------------------------------------------------------ */
const TOKKEY = 'eval-token';        // โทเคนล็อกอิน (sessionStorage: ปิดแท็บแล้วต้องเข้าใหม่)
const DATA_KEYS = SyncCore.KEYS;    // ข้อมูลหลักที่ต้องเก็บ
const NET = {
  mode: 'connecting',   // connecting = กำลังตรวจ · server = ใช้ server.js · local = ไม่มีเซิร์ฟเวอร์ (เก็บใน localStorage) · error = ต่อเซิร์ฟเวอร์ไม่ได้
  token: '', rev: 0, base: null,
  hasAdmin: false, canSetup: false,
  busy: false, again: false, timer: 0, poll: 0, lastStr: '', errMsg: ''
};
let syncTimer = 0;
const dataOf = () => { const o = {}; DATA_KEYS.forEach(k => { o[k] = S[k]; }); return o; };
const emptyData = () => ({ users: [], roles: [], students: [], groups: [], criteria: [], scores: {}, subjects: [], feedback: {}, settings: {} });

// เรียก API ของเซิร์ฟเวอร์ (แนบโทเคนให้เอง)
async function api(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (NET.token) headers.Authorization = 'Bearer ' + NET.token;
  let res;
  try {
    res = await fetch(url, { method, headers, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    const err = new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    err.net = true;
    throw err;
  }
  let j = null;
  try { j = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error((j && j.error) || ('เซิร์ฟเวอร์ตอบกลับผิดปกติ (' + res.status + ')'));
    err.status = res.status;
    throw err;
  }
  return j || {};
}

// แถบแจ้งเมื่อติดต่อเซิร์ฟเวอร์ไม่ได้ (การแก้ไขที่ค้างอยู่จะถูกส่งเองเมื่อกลับมาออนไลน์)
function setOnline(on, msg) {
  const el = document.getElementById('net');
  if (!el) return;
  el.hidden = on;
  if (!on) el.textContent = msg || 'ขาดการเชื่อมต่อกับเซิร์ฟเวอร์ กำลังลองใหม่อัตโนมัติ · สิ่งที่แก้ล่าสุดจะบันทึกเมื่อกลับมาออนไลน์';
}

// เริ่มใช้งานหลังล็อกอิน/ตั้งค่าระบบสำเร็จ  r = { token, uid, rev, data }
function startSession(r) {
  NET.token = r.token;
  try { sessionStorage.setItem(TOKKEY, r.token); } catch (e) {}
  adopt(SyncCore.normalize(r.data));
  NET.base = SyncCore.clone(dataOf());
  NET.rev = r.rev;
  NET.hasAdmin = true;
  NET.lastStr = JSON.stringify(dataOf());
  S.uid = r.uid;
  clearInterval(NET.poll);
  NET.poll = setInterval(() => { if (!document.hidden) syncCycle(true); }, 2500);
  FX.played = false;
  presStart();
}

// จบการใช้งาน (ออกจากระบบ/หมดเวลา): ล้างโทเคนและข้อมูลที่ค้างในหน่วยความจำ
function endSession() {
  clearInterval(NET.poll);
  clearTimeout(NET.timer);
  NET.poll = 0; NET.token = ''; NET.base = null; NET.rev = 0; NET.lastStr = '';
  presStop(); clearInterval(HIS.timer);
  try { sessionStorage.removeItem(TOKKEY); } catch (e) {}
  Object.assign(S, emptyData());
  setOnline(true);
}

function forceLogout(msg) {
  endSession();
  Object.assign(S, {
    uid: null, view: 'home', showLogin: true, loginErr: msg || '',
    editUser: null, editRole: null, editGroup: null, editStudent: null, editAdvisor: null, editSubject: false, addSubj: false,
    pick: null, imp: null, evalGroup: null, evalMode: 'group', scoreView: 'all', notice: ''
  });
  render();
}

// มีการแก้ไข → ตั้งเวลาส่งขึ้นเซิร์ฟเวอร์ (รวมการแก้ถี่ๆ เป็นรอบเดียว)
function queueSync() {
  if (NET.mode !== 'server' || !NET.token || !NET.base) return;
  const str = JSON.stringify(dataOf());
  if (str === NET.lastStr) return;     // ไม่มีอะไรเปลี่ยน
  NET.lastStr = str;
  clearTimeout(NET.timer);
  NET.timer = setTimeout(() => syncCycle(false), 150);
}

// รอบซิงก์: ส่งสิ่งที่เราแก้ไปเซิร์ฟเวอร์ และ (ถ้า poll) ถามว่ามีของใหม่จากเครื่องอื่นไหม
async function syncCycle(poll) {
  if (NET.mode !== 'server' || !NET.token || !NET.base) return;
  if (NET.busy) { NET.again = true; return; }
  NET.busy = true;
  try {
    for (let round = 0; round < 6; round++) {
      NET.again = false;
      const mine = dataOf();
      const ops = SyncCore.diff(NET.base, mine);
      if (ops.length) {
        const sent = SyncCore.clone(mine);
        const r = await api('POST', 'api/ops', { ops });
        setOnline(true);
        if (r.prev === NET.rev) {              // ไม่มีเครื่องอื่นแก้แทรก: ฐานใหม่ = สิ่งที่เราเพิ่งส่ง
          NET.base = sent;
          NET.rev = r.rev;
        } else {                               // มีเครื่องอื่นแก้ด้วย: ดึงข้อมูลล่าสุดมารวมกับของเรา
          applyServer(await api('GET', 'api/state?since=0'));
        }
      } else if (poll) {
        const r = await api('GET', 'api/state?since=' + NET.rev);
        setOnline(true);
        if (!r.unchanged) applyServer(r);
        poll = false;
      }
      if (SyncCore.diff(NET.base, dataOf()).length) NET.again = true;   // ระหว่างรอมีการแก้เพิ่ม → ส่งรอบต่อไป
      if (!NET.again) break;
    }
  } catch (e) {
    await handleSyncError(e);
  } finally {
    NET.busy = false;
  }
}

// รวมข้อมูลล่าสุดจากเซิร์ฟเวอร์ (r.data) เข้ากับสิ่งที่เราแก้ค้างอยู่ แล้ววาดหน้าใหม่ถ้าข้อมูลที่เห็นเปลี่ยน
function applyServer(r) {
  const srv = SyncCore.normalize(r.data);
  const before = JSON.stringify(dataOf());
  const pending = SyncCore.diff(NET.base, dataOf());   // สิ่งที่เราแก้แต่เซิร์ฟเวอร์ยังไม่ได้รับ
  const merged = SyncCore.clone(srv);
  SyncCore.apply(merged, pending);
  adopt(merged);
  NET.base = srv;
  NET.rev = r.rev;
  NET.lastStr = JSON.stringify(dataOf());
  if (NET.lastStr !== before) remoteRender();
}

// เซิร์ฟเวอร์ไม่รับการแก้ไข (ไม่มีสิทธิ์ ฯลฯ): แจ้งผู้ใช้ แล้วใช้ข้อมูลจากเซิร์ฟเวอร์แทนสิ่งที่แก้
async function handleSyncError(e) {
  if (e.status === 401) return forceLogout('หมดเวลาเข้าสู่ระบบหรือรหัสผ่านถูกเปลี่ยน กรุณาเข้าสู่ระบบใหม่');
  if (e.status === 400 || e.status === 403 || e.status === 413) {
    toast(e.message || 'บันทึกไม่สำเร็จ');
    clearTimeout(EV.saveT);   // ป้าย "บันทึกอัตโนมัติ" ต้องไม่ขึ้นว่าบันทึกแล้ว ทั้งที่เซิร์ฟเวอร์ปฏิเสธ
    try {
      const r = await api('GET', 'api/state?since=0');
      const srv = SyncCore.normalize(r.data);
      adopt(SyncCore.clone(srv));
      NET.base = srv; NET.rev = r.rev; NET.lastStr = JSON.stringify(dataOf());
      setOnline(true);
      softRender();
    } catch (e2) {
      if (e2.status === 401) forceLogout('หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่'); else setOnline(false);
    }
    return;
  }
  setOnline(false, e.net ? undefined : 'เซิร์ฟเวอร์ตอบกลับผิดปกติ กำลังลองใหม่อัตโนมัติ');
}

// รอให้สิ่งที่ค้างอยู่ถูกส่งขึ้นเซิร์ฟเวอร์ก่อน (ใช้ก่อนออกจากระบบ/เปลี่ยนรหัสผ่าน)
async function flushPending() {
  for (let i = 0; i < 20; i++) {
    if (!NET.busy) {
      if (!NET.base || !SyncCore.diff(NET.base, dataOf()).length) return;
      await syncCycle(false);
    } else {
      await new Promise(res => setTimeout(res, 150));
    }
  }
}

// ตั้งรหัสผ่านใหม่ที่เซิร์ฟเวอร์ (เซิร์ฟเวอร์ตรวจรหัสเดิมและเก็บรหัสให้) แล้วรับโทเคนใหม่
async function submitPassword(payload) {
  await flushPending();
  const r = await api('POST', 'api/password', payload);
  NET.token = r.token;
  try { sessionStorage.setItem(TOKKEY, r.token); } catch (e) {}
  applyServer(r);
}

// ปิดหน้าต่างทันทีหลังแก้ไข: ส่งสิ่งที่ค้างให้ทัน
window.addEventListener('pagehide', () => {
  if (NET.mode !== 'server' || !NET.token || !NET.base) return;
  const ops = SyncCore.diff(NET.base, dataOf());
  if (!ops.length) return;
  try {
    fetch('api/ops', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + NET.token }, body: JSON.stringify({ ops }) });
  } catch (e) {}
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && NET.mode === 'server' && NET.token) syncCycle(true);   // กลับมาที่แท็บนี้: เช็คของใหม่ทันที
});

// ข้อมูลเดิมที่เคยเก็บในเบราว์เซอร์นี้ (รุ่นก่อนมีเซิร์ฟเวอร์) — ใช้เสนอให้นำขึ้นเซิร์ฟเวอร์
function legacyInfo() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || !Array.isArray(d.users) || !d.users.some(u => u.admin)) return null;
    const n = x => (Array.isArray(x) ? x.length : 0);
    return { users: n(d.users), students: n(d.students), groups: n(d.groups), subjects: n(d.subjects) };
  } catch (e) { return null; }
}

// ส่งข้อมูลชุดเก่า d ขึ้นเซิร์ฟเวอร์ (ใช้ได้เฉพาะตอนเซิร์ฟเวอร์ยังว่าง) แล้วให้ล็อกอินด้วยบัญชีเดิม
async function uploadImport(d) {
  if (!adopt(d)) return toast('ไม่พบข้อมูลของระบบในไฟล์นี้');   // adopt แปลงข้อมูลรุ่นเก่า (คะแนนรายนักเรียน -> รายกลุ่ม) ให้ด้วย
  const data = SyncCore.clone(dataOf());
  Object.assign(S, emptyData());
  S.uid = null;
  try {
    await api('POST', 'api/import', { data });
    NET.hasAdmin = true;
    S.showLogin = true;
    toast('นำข้อมูลขึ้นเซิร์ฟเวอร์แล้ว เข้าสู่ระบบด้วยบัญชีเดิมได้เลย');
  } catch (e) {
    toast(e.message || 'นำข้อมูลขึ้นเซิร์ฟเวอร์ไม่สำเร็จ');
  }
  render();
}

// นำข้อมูลที่เคยเก็บในเบราว์เซอร์นี้ (รุ่นก่อนมีเซิร์ฟเวอร์) ขึ้นเซิร์ฟเวอร์
async function importLegacy() {
  if (!confirm('นำข้อมูลที่เก็บไว้ในเบราว์เซอร์เครื่องนี้ขึ้นไปไว้ที่เซิร์ฟเวอร์?\nหลังจากนั้นข้อมูลบนเซิร์ฟเวอร์จะเป็นชุดหลักที่ทุกเครื่องใช้ร่วมกัน')) return;
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  await uploadImport(d);
}

// นำข้อมูลจากไฟล์ .json (ไฟล์สำรองจากเซิร์ฟเวอร์ หรือไฟล์ที่ดาวน์โหลดจากหน้า "บัญชีของฉัน" ในโหมดเครื่องเดียว)
async function importFile(file) {
  if (!file) return;
  let d = null;
  try { d = JSON.parse(await file.text()); } catch (e) {}
  if (d && d.data && Array.isArray(d.data.users)) d = d.data;          // ไฟล์สำรองรูปแบบ { v, rev, data }
  if (!d || !Array.isArray(d.users) || !d.users.some(u => u.admin)) return toast('อ่านไฟล์ไม่ได้ ต้องเป็นไฟล์ข้อมูลสำรอง (.json) ของระบบนี้');
  if (!confirm('นำข้อมูลจากไฟล์นี้ขึ้นเซิร์ฟเวอร์?\nหลังจากนั้นข้อมูลบนเซิร์ฟเวอร์จะเป็นชุดหลักที่ทุกเครื่องใช้ร่วมกัน')) return;
  await uploadImport(d);
}

// เก็บไฟล์ลงเครื่อง (ใช้กับปุ่มดาวน์โหลดไฟล์สำรอง)
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
const stamp = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()); };

// ดาวน์โหลดไฟล์สำรองข้อมูลทั้งหมดจากเซิร์ฟเวอร์ (แอดมิน)
async function downloadBackup() {
  try {
    const res = await fetch('api/backup', { headers: { Authorization: 'Bearer ' + NET.token }, cache: 'no-store' });
    if (!res.ok) throw new Error('x');
    saveBlob(await res.blob(), 'eval-backup-' + stamp() + '.json');
  } catch (e) {
    toast('ดาวน์โหลดไฟล์สำรองไม่สำเร็จ');
  }
}

// โหมดเครื่องเดียว: ดาวน์โหลดข้อมูลในเบราว์เซอร์เป็นไฟล์ (เอาไปนำเข้าขึ้นเซิร์ฟเวอร์ได้ภายหลัง)
function downloadLocal() {
  saveBlob(new Blob([JSON.stringify({ v: 1, data: dataOf() }, null, 1)], { type: 'application/json' }), 'eval-backup-' + stamp() + '.json');
}


/* ------------------------------------------------------------
   3.3 ฟังก์ชันช่วย (สิทธิ์ นักเรียน คะแนน)
   ------------------------------------------------------------ */

// ---- ทางลัดสำหรับหาข้อมูล ----
const cur      = () => S.users.find(u => u.id === S.uid) || null;   // ผู้ใช้ที่ล็อกอินอยู่
const userById = id => S.users.find(u => u.id === id) || null;
const roleById = id => S.roles.find(r => r.id === id) || null;
const stu      = id => S.students.find(s => s.id === id) || null;
const groupBy  = id => S.groups.find(g => g.id === id) || null;
const subjBy   = id => S.subjects.find(j => j.id === id) || null;
const adminUser = () => S.users.find(u => u.admin) || null;         // แอดมินมีคนเดียว
const hasAdmin  = () => NET.hasAdmin || !!adminUser();   // โหมดเซิร์ฟเวอร์: ก่อนล็อกอินยังไม่มีข้อมูล ใช้ค่าที่เซิร์ฟเวอร์บอก
const nextId   = () => Math.max(0, ...S.users.map(u => u.id)) + 1;   // id ผู้ใช้ (ตัวเลข)
const newId    = () => Math.random().toString(36).slice(2, 10);      // id อื่นๆ (ข้อความสุ่ม)
const inp      = id => document.getElementById(id).value;           // อ่านค่าในช่องกรอก
const setErr   = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg; };
const checkedVals = sel => [...document.querySelectorAll(sel + ':checked')].map(x => x.value);

// ---- สิทธิ์: แอดมินมีทุกสิทธิ์ ส่วนคนอื่นได้จากยศที่แอดมินให้ ----
function permsOf(u) {
  if (!u) return [];
  if (u.admin) return PERMS.map(p => p[0]);
  const list = [];
  (u.roleIds || []).forEach(id => { const r = roleById(id); if (r) list.push(...r.perms); });
  return list;
}
const canU = (u, perm) => !!u && permsOf(u).includes(perm);   // ผู้ใช้ u มีสิทธิ์ perm ไหม
const can  = perm => canU(cur(), perm);                        // ผู้ใช้ที่ล็อกอินอยู่มีสิทธิ์ perm ไหม

// ---- ตัวช่วยจัดการข้อความ/ชื่อ ----
const TH_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
// ทำข้อความให้สะอาด: เลขไทย -> เลขอารบิก, แก้สระอำที่ PDF มักแยกเป็น 2 ตัว, ตัดอักขระล่องหน, ยุบช่องว่าง
// ฟอนต์ไทยบางตัวใน PDF (เช่น Loma, Tahoma, Angsana) เก็บวรรณยุกต์/สระลอยที่ขยับตำแหน่ง
// เป็นรหัสพิเศษช่วง U+F700-F71A ต้องแปลงกลับเป็นตัวอักษรปกติ ไม่งั้นชื่อที่มี ่ ้ ์ จะอ่านไม่ออก
const THAI_PUA = [0xE10, 0xE34, 0xE35, 0xE36, 0xE37, 0xE48, 0xE49, 0xE4A, 0xE4B, 0xE4C,
  0xE48, 0xE49, 0xE4A, 0xE4B, 0xE4C, 0xE0D, 0xE31, 0xE4D, 0xE47,
  0xE48, 0xE49, 0xE4A, 0xE4B, 0xE4C, 0xE38, 0xE39, 0xE3A];
const normText = s => String(s == null ? '' : s)
  .replace(/[-]/g, c => String.fromCharCode(THAI_PUA[c.charCodeAt(0) - 0xF700]))
  .replace(/[๐-๙]/g, d => TH_DIGITS.indexOf(d))
  .replace(/ํา/g, 'ำ')
  .replace(/[​-‍﻿]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
// กุญแจเทียบชื่อซ้ำ: ตัดช่องว่างและตัวพิมพ์ใหญ่เล็กทิ้ง
const nameKey = s => normText(s).replace(/\s+/g, '').toLowerCase();
const fullName = s => (s.prefix ? s.prefix + ' ' : '') + s.name;       // "นาย สมชาย ใจดี"
// รายละเอียดนักเรียนบรรทัดเดียว: เลขที่ · เลขประจำตัว · ระดับ
const stuMeta = s => `เลขที่ ${s.no || '-'} · เลขประจำตัว ${s.sid || '-'} · ${s.level || '-'}`;
// กุญแจค้นหานักเรียน (ชื่อ + เลขที่ + เลขประจำตัว)
const stuKey = s => nameKey(fullName(s) + ' ' + (s.no || '') + ' ' + (s.sid || ''));

// ---- ชื่อที่แสดงของผู้ใช้ / โปรเจกต์ / ครูที่ปรึกษา ----
const dn = u => (u && (u.name || u.username)) || '';                          // ยังไม่ตั้งชื่อจริง = ใช้ชื่อผู้ใช้แทน
const advLabel = u => (u.name || (u.username + ' (รอตั้งชื่อ)')) + (u.admin ? ' · แอดมิน' : '');
const gTitle = g => g.name + (g.nameEn ? ' (' + g.nameEn + ')' : '');         // "ชื่อไทย (English name)"
const advisorOf = g => (g.advisorId != null ? userById(g.advisorId) : null);   // ครูที่ปรึกษาของกลุ่ม
// ผู้ใช้คนไหนก็เป็นครูที่ปรึกษาได้ แค่แอดมินเลือกชื่อเขาในกลุ่มโปรเจกต์ (บัญชีเก่าที่เคยสร้างเป็น "ครูที่ปรึกษา" ยังใช้ได้ตามเดิม)
const isAdvisor = u => !!u && !u.admin && (!!u.advisor || S.groups.some(g => g.advisorId === u.id));
const rankText = u => u.admin ? 'แอดมิน'
  : ([isAdvisor(u) ? 'ครูที่ปรึกษา' : ''].concat(u.roleIds.map(roleById).filter(Boolean).map(r => r.name)).filter(Boolean).join(', ') || 'ยังไม่มียศ');

const levelIdx = l => { const i = LEVELS.indexOf(l); return i < 0 ? 99 : i; };
// เรียงนักเรียน: ระดับชั้น -> เลขที่ -> ชื่อ
const sortStudents = list => list.slice().sort((a, b) =>
  levelIdx(a.level) - levelIdx(b.level) ||
  (!a.sid - !b.sid) ||                                                   // คนที่ไม่มีเลขประจำตัวไว้ท้าย
  String(a.sid || '').localeCompare(String(b.sid || ''), 'en', { numeric: true }) ||   // เรียงตามเลขประจำตัว
  (Number(a.no) || 9999) - (Number(b.no) || 9999) ||
  a.name.localeCompare(b.name, 'th'));

const groupsOf   = sid => S.groups.filter(g => g.members.includes(sid));
const subjectsOf = sid => S.subjects.filter(j => j.students.includes(sid));

// ลบนักเรียนออกจากทุกที่ (ทะเบียน กลุ่ม วิชา และคะแนนที่เกี่ยวข้อง)
function removeStudentEverywhere(sid) {
  S.groups.forEach(g => {
    if (g.members.includes(sid)) {
      dropMemberScores(g.id, sid);   // คะแนนรายบุคคลของคนนี้ในกลุ่มถูกลบด้วย (คะแนนทั้งกลุ่มไม่กระทบ)
      g.members = g.members.filter(x => x !== sid);
    }
  });
  S.subjects.forEach(j => {
    j.students = j.students.filter(x => x !== sid);
    delete j.scores[sid];
  });
  S.students = S.students.filter(s => s.id !== sid);
}

// ---- คะแนนโปรเจกต์: S.scores[idผู้ให้คะแนน][ช่อง][idเกณฑ์] ----
// ช่อง (pk) มี 2 แบบ ใช้ฟังก์ชันคิดคะแนนชุดเดียวกัน
//   ประเมินทั้งกลุ่ม : pk = id กลุ่ม                       -> pkey(gid)
//   ประเมินรายบุคคล : pk = 'idกลุ่ม@idนักเรียน'            -> ikey(gid, sid)   (แยกจากคะแนนทั้งกลุ่ม)
const pkey = gid => gid;
const ikey = (gid, sid) => gid + '@' + sid;
const membersOf = g => sortStudents(g.members.map(stu).filter(Boolean));   // สมาชิกกลุ่ม เรียงตามเลขประจำตัว

function getScore(aid, pk, cid) {
  const a = S.scores[aid];
  return a && a[pk] ? a[pk][cid] : undefined;
}

// v = undefined คือลบคะแนนข้อนั้นทิ้ง
function setScore(aid, pk, cid, v) {
  if (v === undefined) {
    if (S.scores[aid] && S.scores[aid][pk]) delete S.scores[aid][pk][cid];
    return;
  }
  if (!S.scores[aid]) S.scores[aid] = {};
  if (!S.scores[aid][pk]) S.scores[aid][pk] = {};
  S.scores[aid][pk][cid] = v;
}

// ข้อมูลรุ่นเก่าให้คะแนนรายนักเรียน (กุญแจ 'idกลุ่ม|idนักเรียน') -> รุ่นใหม่ให้คะแนนต่อกลุ่ม
// เอาค่าเฉลี่ยของสมาชิกในกลุ่มมาเป็นคะแนนของกลุ่ม (ถ้ากลุ่มนั้นมีคะแนนรุ่นใหม่อยู่แล้วจะไม่ทับ)
function migrateScores() {
  Object.keys(S.scores).forEach(aid => {
    const a = S.scores[aid];
    if (!a || typeof a !== 'object') return;
    const old = {};   // idกลุ่ม -> idเกณฑ์ -> [คะแนนของสมาชิกแต่ละคน]
    Object.keys(a).forEach(pk => {
      const i = pk.indexOf('|');
      if (i < 0) return;
      const gid = pk.slice(0, i);
      const row = a[pk] || {};
      Object.keys(row).forEach(cid => {
        const v = row[cid];
        if (typeof v !== 'number' || !isFinite(v)) return;
        const o = old[gid] || (old[gid] = {});
        (o[cid] || (o[cid] = [])).push(v);
      });
      delete a[pk];
    });
    Object.keys(old).forEach(gid => {
      if (!a[gid]) a[gid] = {};
      Object.keys(old[gid]).forEach(cid => {
        if (a[gid][cid] !== undefined) return;
        const list = old[gid][cid];
        a[gid][cid] = Math.round(list.reduce((x, y) => x + y, 0) / list.length * 100) / 100;
      });
    });
  });
}

// ผู้ที่ให้คะแนนโปรเจกต์ได้ (หรือเคยให้ไว้แล้ว แม้ภายหลังถูกถอดยศ)
const scorers = () => S.users.filter(u => canU(u, 'scoreProject') || S.scores[u.id]);
const totalMax = () => S.criteria.reduce((sum, c) => sum + c.max, 0);   // คะแนนเต็มรวมของทุกเกณฑ์
const avgMaxAll = () => (S.criteria.length ? totalMax() / S.criteria.length : 0);   // คะแนนเต็มเฉลี่ยต่อเกณฑ์
const allSlots = () => S.groups.map(g => pkey(g.id));                   // ช่องที่ต้องให้คะแนน = 1 กลุ่มต่อ 1 ช่อง
const groupsNewest = () => S.groups.slice().reverse();                  // กลุ่มที่สร้างใหม่สุดอยู่บนสุดเสมอ

// ผู้ให้คะแนน aid ให้กลุ่ม pk ไปแล้วอย่างน้อย 1 ข้อหรือไม่
const hasAny = (aid, pk) => S.criteria.some(c => getScore(aid, pk, c.id) !== undefined);

// คะแนนเฉลี่ยที่ผู้ให้คะแนน aid ให้กลุ่ม pk = ค่าเฉลี่ยของคะแนนทุกเกณฑ์ที่ให้แล้ว (null = ยังไม่ให้เลย)
//   avg = ค่าเฉลี่ยคะแนน, max = ค่าเฉลี่ยคะแนนเต็มของเกณฑ์ชุดเดียวกัน, n = จำนวนเกณฑ์ที่ให้แล้ว
function givenAvg(aid, pk) {
  const cs = S.criteria.filter(c => getScore(aid, pk, c.id) !== undefined);
  if (!cs.length) return null;
  return {
    avg: cs.reduce((sum, c) => sum + getScore(aid, pk, c.id), 0) / cs.length,
    max: cs.reduce((sum, c) => sum + c.max, 0) / cs.length,
    n: cs.length
  };
}

// ค่าเฉลี่ยของกลุ่ม pk ในเกณฑ์ cid จากผู้ให้คะแนนทุกคนที่ให้แล้ว (null = ยังไม่มีใครให้)
function avgOf(pk, cid) {
  const vals = scorers().map(a => getScore(a.id, pk, cid)).filter(v => v !== undefined);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// คะแนนเฉลี่ยของกลุ่ม pk จากผู้ให้คะแนนทุกคน (เฉลี่ยทีละเกณฑ์ แล้วเฉลี่ยทุกเกณฑ์อีกครั้ง) null = ยังไม่มีใครให้
function groupAvg(pk) {
  const cs = S.criteria.filter(c => avgOf(pk, c.id) !== null);
  if (!cs.length) return null;
  return {
    avg: cs.reduce((sum, c) => sum + avgOf(pk, c.id), 0) / cs.length,
    max: cs.reduce((sum, c) => sum + c.max, 0) / cs.length,
    n: cs.length
  };
}
const scoredBy = pk => scorers().filter(a => hasAny(a.id, pk)).length;   // จำนวนผู้ที่ประเมินกลุ่ม pk แล้ว

// ความคืบหน้าการให้คะแนนโปรเจกต์ของ aid (เป็น %) = ช่องที่ให้แล้ว / ช่องทั้งหมด x 100
function progress(aid) {
  const slots = allSlots();
  const total = slots.length * S.criteria.length;
  if (!total) return 0;   // กันหารด้วยศูนย์ ถ้ายังไม่มีกลุ่มหรือเกณฑ์
  let n = 0;
  slots.forEach(pk => S.criteria.forEach(c => { if (getScore(aid, pk, c.id) !== undefined) n++; }));
  return Math.round(n / total * 100);
}

// ---- ล้างคะแนนที่ผูกกับสิ่งที่ถูกลบ (ไม่ให้เหลือคะแนนลอยๆ) ----
function dropUserScores(aid) { delete S.scores[aid]; }
// ลบคะแนนของกลุ่ม pk (ทั้งกลุ่ม และรายบุคคลของสมาชิกทุกคนในกลุ่มนั้น)
function dropPk(pk) {
  Object.keys(S.scores).forEach(a => {
    Object.keys(S.scores[a] || {}).forEach(k => { if (k === pk || k.startsWith(pk + '@')) delete S.scores[a][k]; });
  });
}
// ลบคะแนนรายบุคคลของนักเรียน sid ในกลุ่ม gid (เมื่อถูกนำออกจากกลุ่มหรือลบจากทะเบียน)
function dropMemberScores(gid, sid) {
  Object.keys(S.scores).forEach(a => { if (S.scores[a]) delete S.scores[a][ikey(gid, sid)]; });
}
const hasMemberScores = (gid, sid) => Object.keys(S.scores).some(a => hasAny(a, ikey(gid, sid)));   // มีใครให้คะแนนรายบุคคลของคนนี้ไว้แล้วหรือยัง
function dropCriterionScores(cid) {
  Object.keys(S.scores).forEach(a =>
    Object.keys(S.scores[a]).forEach(pk => { delete S.scores[a][pk][cid]; }));
}

// ---- คะแนนรายวิชา: subject.scores[idนักเรียน][idงาน] ----
const getWork = (j, sid, wid) => (j.scores[sid] ? j.scores[sid][wid] : undefined);
const workMax = j => j.works.reduce((sum, w) => sum + w.max, 0);
const workTotal = (j, sid) => j.works.reduce((sum, w) => {
  const v = getWork(j, sid, w.id);
  return sum + (v === undefined ? 0 : v);
}, 0);
function avgWork(j, wid) {
  const vals = j.students.map(sid => getWork(j, sid, wid)).filter(v => v !== undefined);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
// ความคืบหน้าการกรอกคะแนนของวิชา (%)
function subjProgress(j) {
  const total = j.students.length * j.works.length;
  if (!total) return 0;
  let n = 0;
  j.students.forEach(sid => j.works.forEach(w => { if (getWork(j, sid, w.id) !== undefined) n++; }));
  return Math.round(n / total * 100);
}

// ---- แสดงผลตัวเลข ----
const num = x => String(Math.round(x * 100) / 100);                  // 8 -> "8", 7.5 -> "7.5"
const fmt = x => (x === null ? '–' : x.toFixed(2));                  // ค่าเฉลี่ย 2 ตำแหน่ง, null = ขีด
const scoreCell = v => (v === undefined ? '<span class="muted">–</span>' : num(v));

// esc = escape ป้องกันโค้ดแปลกปลอม (XSS)
//   ถ้าผู้ใช้พิมพ์ <script>... ลงในช่องกรอก จะถูกแปลงเป็นข้อความธรรมดา
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// ป้ายยศ (มีจุดสีหน้าชื่อ เหมือนยศในดิสคอร์ด) ตรวจสีก่อนใส่ลงในสไตล์เพื่อความปลอดภัย
const safeColor = c => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#5865f2');
const roleChip = r => `<span class="role-chip" style="--c:${safeColor(r.color)}"><i></i>${esc(r.name)}</span>`;

// สุ่มรหัสผ่านชั่วคราว 8 ตัว (ตัดตัวที่สับสนง่ายอย่าง 0 O 1 l ออก)
function genPw() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const r = new Uint32Array(8);
  crypto.getRandomValues(r);
  return [...r].map(x => chars[x % chars.length]).join('');
}

// แสดงข้อความแจ้งเตือนเล็กๆ ด้านล่างจอ แล้วซ่อน
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);                          // ยกเลิกตัวนับเวลาอันเก่า (ถ้ากดซ้ำเร็วๆ)
  toast.t = setTimeout(() => (t.hidden = true), 3200);
}


/* ------------------------------------------------------------
   3.4 หน้าตั้งค่าครั้งแรก, Login และหน้าเข้าใช้ครั้งแรก
   ฟังก์ชันที่ขึ้นต้นด้วย v (view) คืนค่าเป็นข้อความ HTML
   ------------------------------------------------------------ */

// หน้าตั้งค่าระบบครั้งแรก: แสดงเมื่อยังไม่มีแอดมิน (แอดมินคือครู มีคนเดียวเท่านั้น)
function vSetup() {
  // เปิดผ่านลิงก์จากภายนอก (เช่น Cloudflare): ตั้งค่าครั้งแรกไม่ได้ ต้องทำบนเครื่องที่รันเซิร์ฟเวอร์ (กันคนแปลกหน้าชิงเป็นแอดมิน)
  if (NET.mode === 'server' && !NET.canSetup) return `
  <div class="login-wrap">
    <div class="card login">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <h1>ระบบยังไม่ได้ตั้งค่า</h1>${themeBtn()}
      </div>
      <p class="muted" style="margin:0 0 10px">ต้องสร้างบัญชีแอดมิน (ครู) ก่อนจึงจะใช้งานได้ และเพื่อความปลอดภัยทำได้เฉพาะบนเครื่องที่รันเซิร์ฟเวอร์เท่านั้น</p>
      <p style="margin:0">ให้เปิด <b>http://localhost:3000</b> (หรือพอร์ตที่ตั้งไว้) บนเครื่องนั้น แล้วตั้งค่าครั้งแรก จากนั้นหน้านี้จะใช้งานได้ทันที</p>
      <button class="btn" style="width:100%;margin-top:14px" onclick="boot()">ตรวจสอบอีกครั้ง</button>
    </div>
  </div>`;

  // มีข้อมูลเดิมที่เคยเก็บในเบราว์เซอร์นี้ (ก่อนมีเซิร์ฟเวอร์) → เสนอให้นำขึ้นเซิร์ฟเวอร์
  const lg = NET.mode === 'server' ? legacyInfo() : null;
  const legacy = lg ? `
      <div class="notice" role="status" style="display:block">
        <b>พบข้อมูลเดิมที่เก็บไว้ในเบราว์เซอร์เครื่องนี้</b>
        <div class="small" style="margin:4px 0 8px">ผู้ใช้ ${lg.users} · นักเรียน ${lg.students} · กลุ่มโปรเจกต์ ${lg.groups} · รายวิชา ${lg.subjects}</div>
        <button type="button" class="btn" onclick="importLegacy()">นำข้อมูลเดิมขึ้นเซิร์ฟเวอร์</button>
        <div class="small muted" style="margin-top:6px">หรือจะสร้างแอดมินใหม่ด้านล่างเพื่อเริ่มต้นใหม่ก็ได้</div>
      </div>` : '';
  // นำเข้าจากไฟล์สำรอง (.json): กรณีข้อมูลเดิมอยู่ที่อื่น เช่น เปิดด้วย Live Server คนละพอร์ต หรือกู้จากไฟล์สำรอง
  const fromFile = NET.mode === 'server' ? `
      <div class="small muted" style="margin:10px 0 0">
        มีไฟล์ข้อมูลสำรอง (.json) อยู่แล้ว?
        <label class="btn sm" style="cursor:pointer;margin-left:4px">เลือกไฟล์เพื่อนำเข้า<input type="file" accept=".json,application/json" hidden onchange="importFile(this.files[0]);this.value=''"></label>
      </div>` : '';

  return `
  <div class="login-wrap">
    <form class="card login" onsubmit="doSetup(event)" novalidate>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <h1>ตั้งค่าระบบครั้งแรก</h1>${themeBtn()}
      </div>
      <p class="muted" style="margin:0">สร้างบัญชีแอดมิน (ครู) ระบบมีแอดมินได้คนเดียว คนอื่นจะได้สิทธิ์ผ่าน "ยศ" ที่แอดมินให้</p>
      ${legacy}${fromFile}

      <div class="field">
        <label for="s-user">ชื่อผู้ใช้ (ภาษาอังกฤษหรือตัวเลข 3-20 ตัว)</label>
        <input id="s-user" autocomplete="username" placeholder="เช่น teacher1">
      </div>
      <div class="field">
        <label for="s-name">ชื่อ-นามสกุล (ชื่อที่แสดงในระบบ)</label>
        <input id="s-name" autocomplete="name">
      </div>
      <div class="field">
        <label for="s-dept">แผนก / หน่วยงาน</label>
        <input id="s-dept">
      </div>
      <div class="field">
        <label for="s-p1">รหัสผ่าน (อย่างน้อย ${MIN_PW} ตัว)</label>
        <input id="s-p1" type="password" autocomplete="new-password">
      </div>
      <div class="field">
        <label for="s-p2">ยืนยันรหัสผ่าน</label>
        <input id="s-p2" type="password" autocomplete="new-password">
      </div>

      <div class="err" id="sgerr" role="alert"></div>
      <button class="btn primary" style="width:100%">เริ่มใช้งาน →</button>
    </form>
  </div>`;
}

async function doSetup(e) {
  e.preventDefault();
  if (hasAdmin()) return render();   // มีแอดมินแล้ว (เช่น เปิดไว้ 2 แท็บ) ไม่ต้องตั้งซ้ำ

  const username = inp('s-user').trim(), name = inp('s-name').trim(), dept = inp('s-dept').trim();
  const p1 = inp('s-p1'), p2 = inp('s-p2');

  if (!USERNAME_RE.test(username)) return setErr('sgerr', 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ . _ - ยาว 3-20 ตัว');
  if (name.length < 3)             return setErr('sgerr', 'กรุณากรอกชื่อ-นามสกุลอย่างน้อย 3 ตัวอักษร');
  if (p1.length < MIN_PW)          return setErr('sgerr', `รหัสผ่านต้องมีอย่างน้อย ${MIN_PW} ตัว`);
  if (p1 !== p2)                   return setErr('sgerr', 'รหัสผ่านทั้ง 2 ช่องไม่ตรงกัน');

  if (NET.mode === 'server') {   // เซิร์ฟเวอร์สร้างแอดมินและยศตัวอย่างให้
    try {
      startSession(await api('POST', 'api/setup', { username, name, dept, password: p1 }));
      S.view = 'home';
      toast('ตั้งค่าระบบเรียบร้อย ยินดีต้อนรับ');
      render();
    } catch (err) {
      setErr('sgerr', err.message);
    }
    return;
  }

  // ยศตัวอย่าง 2 ยศ (แอดมินแก้ไข/ลบ/เพิ่มเองได้ที่เมนู "ยศและสิทธิ์")
  S.roles = [
    { id: newId(), name: 'กรรมการโปรเจกต์', color: '#3ba55d', perms: ['scoreProject'] },
    { id: newId(), name: 'ผู้ช่วยครู',       color: '#faa61a', perms: ['students', 'subject', 'scoreSubject'] }
  ];
  const id = nextId();
  S.users.push({ id, username, name, dept, admin: true, roleIds: [], mustChange: false, pass: hashPw(id, p1), pw: p1 });
  S.uid = id;            // เข้าสู่ระบบให้ทันที
  S.view = 'home';
  toast('ตั้งค่าระบบเรียบร้อย ยินดีต้อนรับ');
  render();
}

// หน้าต้อนรับ: หน้าแรกที่เห็นก่อนเข้าสู่ระบบ กดปุ่มเพื่อไปหน้ากรอกชื่อผู้ใช้และรหัสผ่าน
function vWelcome() {
  return `
  <div class="login-wrap">
    <div class="card welcome">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span class="logo">เทคโนโลยีสารสนเทศ</span>${themeBtn()}
      </div>
      <h1>ระบบประเมินโปรเจกต์และคะแนนรายวิชา</h1>
      <p class="muted" style="margin:0 0 20px">จัดการรายชื่อนักเรียน ให้คะแนนโปรเจกต์ และบันทึกคะแนนรายวิชา</p>
      <button class="btn primary" id="signin" style="width:100%" onclick="showLogin()">เข้าสู่ระบบ</button>
    </div>
  </div>`;
}

function showLogin() {
  S.showLogin = true;
  render();
  document.getElementById('u').focus();
}

function vLogin() {
  return `
  <div class="login-wrap">
    <form class="card login" onsubmit="doLogin(event)" novalidate>
      <button type="button" class="back" onclick="S.showLogin=false;S.loginErr='';render()">‹ กลับหน้าแรก</button>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <h1>เข้าสู่ระบบ</h1>${themeBtn()}
      </div>
      <p class="muted" style="margin:0 0 4px">ระบบประเมินโปรเจกต์และคะแนนรายวิชา</p>

      <div class="field">
        <label for="u">ชื่อผู้ใช้</label>
        <input id="u" autocomplete="username" value="${esc(S.loginUser)}">
      </div>
      <div class="field">
        <label for="pw">รหัสผ่าน</label>
        <input id="pw" type="password" autocomplete="current-password">
      </div>

      <div class="err" id="lerr" role="alert">${esc(S.loginErr)}</div>
      <button class="btn primary" style="width:100%">เข้าสู่ระบบ</button>

      <div class="demo">
        <p class="small muted" style="margin:0">ยังไม่มีบัญชีให้ติดต่อแอดมิน (ครู) เพื่อสร้างบัญชีและขอรับยศ</p>
      </div>
    </form>
  </div>`;
}

// ทำงานเมื่อกด "เข้าสู่ระบบ"
async function doLogin(e) {
  e.preventDefault();   // ห้ามเบราว์เซอร์โหลดหน้าใหม่ตามนิสัยปกติของฟอร์ม
  const u  = inp('u').trim();
  const pw = inp('pw');
  S.loginUser = u;

  // Validate: ตรวจทีละข้อ ถ้าไม่ผ่านให้แจ้ง error แล้วหยุด
  if (!u || !pw) {
    S.loginErr = !u ? 'กรุณากรอกชื่อผู้ใช้' : 'กรุณากรอกรหัสผ่าน';
    render();
    return;
  }

  if (NET.mode === 'server') {   // เซิร์ฟเวอร์ตรวจชื่อผู้ใช้/รหัสผ่านให้ แล้วส่งโทเคนกับข้อมูลกลับมา
    try {
      startSession(await api('POST', 'api/login', { username: u, password: pw }));
      const me = cur();
      S.loginErr = '';
      S.loginUser = '';
      S.showLogin = false;
      S.view = me ? tabsFor(me)[0][0] : 'home';
      S.evalGroup = null;
      S.scoreView = 'all';
    } catch (err) {
      S.loginErr = err.message;
    }
    render();
    return;
  }

  // หาบัญชีจากชื่อผู้ใช้ (ไม่สนตัวพิมพ์เล็ก/ใหญ่) แล้วเทียบรหัสผ่านที่เข้ารหัสแล้ว
  // ไม่บอกว่าผิดที่ชื่อหรือรหัส เพื่อไม่ให้คนเดาชื่อผู้ใช้ได้
  const user = S.users.find(x => x.username.toLowerCase() === u.toLowerCase());
  if (!user || user.pass !== hashPw(user.id, pw)) {
    S.loginErr = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    render();
    return;
  }

  // ผ่านแล้ว
  S.loginErr = '';
  S.loginUser = '';
  S.uid = user.id;
  S.view = tabsFor(user)[0][0];   // เปิดเมนูแรกที่คนนี้ใช้ได้
  S.evalGroup = null;
  S.scoreView = 'all';
  render();
}

// ผู้ใช้ที่ยังไม่มีชื่อ (แอดมินสร้างบัญชีโดยไม่กรอกชื่อ) ต้องพิมพ์ชื่อของตัวเองก่อนเริ่มใช้งาน
const needsName = u => !!u && !u.admin && !String(u.name || '').trim();
// ยังไม่เคยเข้าใช้ครั้งแรกเสร็จ (ยังไม่ตั้งชื่อ หรือรอตั้งรหัสผ่านใหม่หลังถูกรีเซ็ต)
const waitFirst = u => !!u && !u.admin && (u.mustChange || needsName(u));

// หน้าเข้าใช้ครั้งแรก
//   - บัญชีที่แอดมินสร้างโดยไม่ใส่ชื่อ : ให้พิมพ์ชื่อจริง (+ แผนก) แล้วเข้าใช้งานได้เลย รหัสผ่านใช้ตามที่แอดมินตั้ง
//   - บัญชีที่ถูกรีเซ็ตรหัสผ่าน หรือสร้างจากหน้า "ครูที่ปรึกษา" (mustChange) : ต้องตั้งรหัสผ่านใหม่ด้วย
function vFirst(u) {
  const needPw = !!u.mustChange;
  return `
  <div class="login-wrap">
    <form class="card login" onsubmit="doFirst(event)" novalidate>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <h1>เข้าใช้งานครั้งแรก</h1>${themeBtn()}
      </div>
      <p class="muted" style="margin:0 0 6px;white-space:normal">${u.advisor
        ? 'กรุณาพิมพ์ชื่อจริงของคุณ ชื่อนี้จะไปแสดงเป็น "ครูที่ปรึกษาโครงงาน" ในโปรเจกต์ที่แอดมินเลือกให้' + (needPw ? ' แล้วตั้งรหัสผ่านใหม่' : '')
        : 'กรุณาพิมพ์ชื่อจริง-นามสกุลของคุณ (จะแสดงเป็นชื่อผู้ประเมิน)' + (needPw ? ' และตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน' : ' แล้วเริ่มใช้งานได้ทันที')}</p>

      <div class="field">
        <label for="f-user">ชื่อผู้ใช้</label>
        <input id="f-user" value="${esc(u.username)}" disabled>
      </div>
      <div class="field">
        <label for="f-name">ชื่อจริง-นามสกุล (ชื่อที่แสดงในระบบ)</label>
        <input id="f-name" autocomplete="name" value="${esc(u.name)}">
      </div>
      <div class="field">
        <label for="f-dept">แผนก / หน่วยงาน</label>
        <input id="f-dept" value="${esc(u.dept)}">
      </div>
      ${needPw ? `
      <div class="field">
        <label for="f-p1">รหัสผ่านใหม่ (อย่างน้อย ${MIN_PW} ตัว)</label>
        <input id="f-p1" type="password" autocomplete="new-password">
      </div>
      <div class="field">
        <label for="f-p2">ยืนยันรหัสผ่านใหม่</label>
        <input id="f-p2" type="password" autocomplete="new-password">
      </div>` : ''}

      <div class="err" id="ferr" role="alert"></div>
      <button class="btn primary" style="width:100%" id="f-go">บันทึกและเริ่มใช้งาน</button>
      <button type="button" class="btn" style="width:100%;margin-top:8px" onclick="logout()">ออกจากระบบ</button>
    </form>
  </div>`;
}

// เข้าใช้ครั้งแรกเสร็จแล้ว: พาไปเมนูแรกที่คนนี้ใช้ได้เลย (ผู้ประเมิน = หน้า "ประเมินโปรเจกต์")
function finishFirst() {
  const u = cur();
  if (!u) return render();
  S.evalGroup = null;
  S.evalMode = 'group';
  S.view = tabsFor(u)[0][0];
  toast('ยินดีต้อนรับ ' + dn(u));
  render();
  window.scrollTo(0, 0);
}

function doFirst(e) {
  e.preventDefault();
  const u = cur();
  const name = inp('f-name').trim(), dept = inp('f-dept').trim();
  if (name.length < 3) return setErr('ferr', 'กรุณาพิมพ์ชื่อจริง-นามสกุลของคุณ (อย่างน้อย 3 ตัวอักษร)');

  // แบบที่ 1: แอดมินสร้างบัญชีโดยไม่ใส่ชื่อ -> บันทึกชื่อ แล้วเข้าใช้งานได้เลย (ไม่ต้องเปลี่ยนรหัสผ่าน)
  if (!u.mustChange) {
    u.name = name;
    u.dept = dept;
    save();
    const sent = NET.mode === 'server' ? flushPending() : Promise.resolve();   // รอให้ชื่อขึ้นเซิร์ฟเวอร์ก่อน แอดมินจะเห็นชื่อทันที
    sent.then(() => { if (needsName(cur())) render(); else finishFirst(); });
    return;
  }

  // แบบที่ 2: ถูกรีเซ็ตรหัสผ่าน -> ต้องตั้งรหัสผ่านใหม่ด้วย
  const p1 = inp('f-p1'), p2 = inp('f-p2');
  if (p1.length < MIN_PW)          return setErr('ferr', `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PW} ตัว`);
  if (p1 !== p2)                   return setErr('ferr', 'รหัสผ่านใหม่ทั้ง 2 ช่องไม่ตรงกัน');
  if (NET.mode === 'server') {   // เซิร์ฟเวอร์ตรวจว่าไม่ซ้ำรหัสชั่วคราว และเก็บรหัสผ่านใหม่ให้
    submitPassword({ pw: p1, name, dept })
      .then(finishFirst)
      .catch(err => setErr('ferr', err.message));
    return;
  }
  if (hashPw(u.id, p1) === u.pass) return setErr('ferr', 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านชั่วคราว');

  u.name = name;
  u.dept = dept;
  u.pass = hashPw(u.id, p1);
  u.pw = p1;
  u.mustChange = false;
  finishFirst();
}


/* ------------------------------------------------------------
   3.5 โครงหน้าหลังล็อกอิน (Header + เมนู) และโหมดมืด/สว่าง
   ------------------------------------------------------------ */

// โหมดที่ใช้อยู่ตอนนี้: ถ้าผู้ใช้เคยกดเลือกเองใช้ค่านั้น ถ้าไม่เคยใช้ตามเครื่อง
function effTheme() {
  return document.documentElement.dataset.theme ||
         (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function toggleTheme() {
  const t = effTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;   // CSS จะเปลี่ยนสีตาม data-theme
  try { localStorage.setItem(TKEY, t); } catch (e) {}
  render(true);                                 // render จะเรียก applyLook() ปรับสีหลักให้เข้ากับโหมดใหม่
}
const themeBtn = () => `
  <button type="button" class="btn sm" onclick="toggleTheme()" aria-label="สลับโหมดมืดหรือสว่าง">
    ${effTheme() === 'dark' ? '☀ โหมดสว่าง' : '☾ โหมดมืด'}
  </button>`;

// เมนูของแต่ละคน: ขึ้นอยู่กับสิทธิ์ (แอดมินเห็นครบ) [ชื่อหน้า, ข้อความบนปุ่ม]
function tabsFor(u) {
  const t = [];
  if (u.admin)                  t.push(['home', 'ภาพรวม']);
  if (canU(u, 'students'))      t.push(['students', 'รายชื่อนักเรียน']);
  if (canU(u, 'project'))       t.push(['groups', 'กลุ่มโปรเจกต์'], ['criteria', 'เกณฑ์โปรเจกต์']);
  if (canU(u, 'scoreProject'))  t.push(['evaluate', 'ประเมินโปรเจกต์']);
  if (isAdvisor(u))             t.push(['mine', 'โปรเจกต์ที่ปรึกษา']);
  if (canU(u, 'viewAll'))       t.push(['scores', 'คะแนนโปรเจกต์ทั้งหมด']);
  if (canU(u, 'subject') || canU(u, 'scoreSubject')) t.push(['subjects', 'รายวิชา']);
  if (u.admin)                  t.push(['users', 'ผู้ใช้งาน'], ['roles', 'ยศและสิทธิ์'], ['history', 'ประวัติและสำรอง'], ['appearance', 'ปรับหน้าตา']);
  t.push(['account', 'บัญชีของฉัน']);
  return t;
}

// ไอคอนของเมนู (เส้นบาง 24x24) ใช้ร่วมกับ svg() ด้านล่าง
const ICONS = {
  home:     '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  mine:     '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  students: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.4 0 4 1.8 4 4.5"/>',
  groups:   '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/>',
  criteria: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L6.8 5M3.5 12l1.2 1.2L6.8 11M3.5 18l1.2 1.2L6.8 17"/>',
  evaluate: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/>',
  scores:   '<path d="M5 20v-7M12 20V5M19 20v-10"/><path d="M3 20h18"/>',
  subjects: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  users:    '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
  roles:    '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  appearance: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.6" cy="11.2" r="1"/><circle cx="10.4" cy="7.4" r="1"/><circle cx="15" cy="7.4" r="1"/>',
  account:  '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5c1.2-2.2 3.2-3.2 5.5-3.2s4.3 1 5.5 3.2"/>',
  history:  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  search:   '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  moon:     '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  logout:   '<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m16 8 4 4-4 4M20 12H9"/>',
  menu:     '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevron:  '<path d="m15 6-6 6 6 6"/>',
  logo:     '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4h6v2.5H9z"/><path d="m9 13 2.2 2.2L15.5 11"/>'
};
const svg = name => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

function toggleNav() {   // ย่อ/ขยายเมนูด้านข้าง (คอม)
  S.navMini = !S.navMini;
  try { localStorage.setItem('eval-nav-mini', S.navMini ? '1' : '0'); } catch (e) {}
  render(true);
}

const KEYHINT = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '') ? '⌘K' : 'Ctrl K';
function shell(body) {
  const u = cur();
  const tabs = tabsFor(u);
  const nav = tabs.filter(t => t[0] !== 'account').map(([v, label]) =>
    `<button class="side-item" title="${esc(label)}" onclick="go('${v}')" ${S.view === v ? 'aria-current="page"' : ''}>${svg(v)}<span class="lbl">${esc(label)}</span></button>`).join('');
  const dock = tabs.map(([v, label]) =>
    `<button class="dock-item" title="${esc(label)}" onclick="go('${v}')" ${S.view === v ? 'aria-current="page"' : ''}>${svg(v)}<span class="lbl">${esc(label)}</span></button>`).join('');
  const rank = rankText(u);
  const dark = effTheme() === 'dark';
  const here = (tabs.find(t => t[0] === S.view) || tabs[0])[1];

  return `
  <div class="app${S.navMini ? ' mini' : ''}">
    <aside class="side" aria-label="เมนูหลัก">
      <button class="side-toggle" onclick="toggleNav()" aria-label="ย่อหรือขยายเมนู" title="ย่อ / ขยายเมนู">${svg('chevron')}</button>
      <div class="side-head">
        <span class="side-logo">${svg('logo')}</span>
        <span class="side-title">ระบบประเมินโปรเจกต์<small>และคะแนนรายวิชา</small></span>
      </div>
      <button class="side-search" onclick="openPalette()" title="ค้นหาด่วน (${KEYHINT})" aria-label="ค้นหาด่วน">${svg('search')}<span class="lbl">ค้นหา</span><kbd>${KEYHINT}</kbd></button>
      <div class="side-label">เมนู</div>
      <nav class="side-nav" data-pill="side"><span class="pill" aria-hidden="true"></span>${nav}</nav>
      <div class="side-foot">
        <button class="side-user" title="บัญชีของฉัน: ${esc(dn(u))} · ${esc(rank)}" onclick="go('account')" ${S.view === 'account' ? 'aria-current="page"' : ''}>
          <span class="avatar">${svg('account')}</span>
          <span class="who-txt"><span class="who-name">${esc(dn(u))}</span><span class="who-rank">${esc(rank)}</span></span>
        </button>
        <button class="side-item" title="${dark ? 'โหมดสว่าง' : 'โหมดมืด'}" onclick="toggleTheme()">${svg(dark ? 'sun' : 'moon')}<span class="lbl">${dark ? 'โหมดสว่าง' : 'โหมดมืด'}</span></button>
        <button class="side-item danger" title="ออกจากระบบ" onclick="logout()">${svg('logout')}<span class="lbl">ออกจากระบบ</span></button>
      </div>
    </aside>
    <div class="content">
      <div class="mbar">
        <span class="mbar-title">${esc(here)}</span>
        <button class="mbtn" onclick="openPalette()" aria-label="ค้นหาด่วน">${svg('search')}</button>
        <button class="mbtn" onclick="toggleTheme()" aria-label="สลับโหมดมืดหรือสว่าง">${svg(dark ? 'sun' : 'moon')}</button>
        <button class="mbtn" onclick="logout()" aria-label="ออกจากระบบ">${svg('logout')}</button>
      </div>
      <main>${body}</main>
    </div>
    <nav class="dock" aria-label="เมนูหลัก"><div class="dock-in" data-pill="dock"><span class="pill" aria-hidden="true"></span>${dock}</div></nav>
  </div>`;
}

// แคปซูลกระจกของเมนู: ให้เลื่อนจากตำแหน่งเดิมไปยังเมนูที่เลือกใหม่ (เพราะหน้าถูกวาดใหม่ทุกครั้ง จึงจำตำแหน่งเก่าไว้เอง)
const PILL_LAST = {};
function placePills() {
  document.querySelectorAll('[data-pill]').forEach(box => {
    const pill = box.querySelector('.pill'), on = box.querySelector('[aria-current="page"]');
    if (!pill) return;
    if (!on || box.offsetParent === null) { pill.style.opacity = '0'; return; }   // ไม่มีเมนูที่เลือก หรือกล่องนี้ถูกซ่อน (เช่นแผงข้างบนมือถือ)
    const key = box.dataset.pill;
    const to = { top: on.offsetTop, left: on.offsetLeft, width: on.offsetWidth, height: on.offsetHeight };
    const put = r => { pill.style.top = r.top + 'px'; pill.style.left = r.left + 'px'; pill.style.width = r.width + 'px'; pill.style.height = r.height + 'px'; };
    const from = PILL_LAST[key];
    if (from) {
      pill.style.transition = 'none'; put(from); pill.style.opacity = '1';
      void pill.offsetWidth;                   // บังคับให้เบราว์เซอร์วาดตำแหน่งเก่าก่อน
      pill.style.transition = '';
    }
    put(to); pill.style.opacity = '1';
    PILL_LAST[key] = to;
    if (key === 'dock') {                      // แถบล่างบนมือถือ: เลื่อนให้ตัวที่เลือกอยู่กลางจอ
      const want = Math.max(0, to.left - (box.clientWidth - to.width) / 2);
      if (Math.abs(box.scrollLeft - want) > 4) box.scrollTo({ left: want, behavior: from ? 'smooth' : 'auto' });
    }
  });
}
let pillTimer = 0;
window.addEventListener('resize', () => { clearTimeout(pillTimer); pillTimer = setTimeout(placePills, 120); });

// เปลี่ยนเมนู (ล้างโหมดแก้ไขและตัวเลือกที่เปิดค้างไว้)
function go(v) {
  S.view = v;
  S.editUser = S.editRole = S.editGroup = S.editStudent = S.editAdvisor = null; S.addAdv = null;
  S.editSubject = false; S.addSubj = false;
  S.pick = null;
  S.imp = null;
  S.notice = '';
  FX.played = false;       // เข้าหน้าใหม่ = เล่นแอนิเมชันตัวเลขนับขึ้นอีกครั้ง
  render();
  window.scrollTo(0, 0);
  if (v === 'history') hisEnter();
  presTick();              // บอกเซิร์ฟเวอร์ว่าตอนนี้อยู่หน้าไหน
}

async function logout() {
  if (NET.mode === 'server') {
    try { await flushPending(); } catch (e) {}   // ส่งสิ่งที่แก้ค้างอยู่ขึ้นเซิร์ฟเวอร์ก่อนออก
    endSession();
  }
  S.uid = null;          // ไม่มีผู้ใช้ = กลับไปหน้า Login
  S.showLogin = false;   // กลับไปหน้าต้อนรับ
  S.view = 'home';
  S.editUser = S.editRole = S.editGroup = S.editStudent = S.editAdvisor = null; S.addAdv = null;
  S.editSubject = false;
  S.pick = null;
  S.imp = null;
  S.evalGroup = null;
  S.evalMode = 'group';
  S.scoreView = 'all';
  S.notice = '';
  render();
}


/* ------------------------------------------------------------
   3.6 หน้าบัญชีของฉัน (ทุกคน): แก้ไขโปรไฟล์ + เปลี่ยนรหัสผ่าน
   ------------------------------------------------------------ */
function vAccount(u) {
  const names = u.roleIds.map(roleById).filter(Boolean).map(r => r.name).join(', ');
  const rank = u.admin ? 'แอดมิน (สิทธิ์ทั้งหมด)' : rankText(u);
  const wait = !u.admin && tabsFor(u).length === 1
    ? `<div class="notice" role="status"><span>คุณยังไม่ได้รับยศ รอแอดมิน (ครู) ให้ยศก่อนจึงจะเห็นเมนูอื่น</span></div>` : '';

  // เฉพาะแอดมิน: ล้างข้อมูลทั้งระบบ
  const dataCard = u.admin ? `
  <div class="card">
    <h2>ข้อมูลในระบบ</h2>
    ${NET.mode === 'server' ? `
    <p class="small muted" style="margin:0 0 8px">
      ข้อมูลทั้งหมดเก็บอยู่ที่เซิร์ฟเวอร์ (ไฟล์ data/db.json) ทุกเครื่องที่เข้าสู่ระบบจะเห็นข้อมูลชุดเดียวกัน
      ระบบสำรองไฟล์ไว้ในโฟลเดอร์ data/backups ให้อัตโนมัติ และดาวน์โหลดไฟล์สำรองเก็บไว้เองได้
    </p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" onclick="downloadBackup()">ดาวน์โหลดไฟล์สำรองข้อมูล</button>
      <button class="btn danger" onclick="resetAll()">ล้างข้อมูลทั้งหมด</button>
    </div>` : `
    <p class="small muted" style="margin:0 0 8px">
      ข้อมูลทั้งหมดเก็บอยู่ในเบราว์เซอร์ของเครื่องนี้ (localStorage) ไม่ได้ส่งขึ้นเซิร์ฟเวอร์
      ถ้าล้างข้อมูลของเบราว์เซอร์ ข้อมูลในระบบจะหายไปด้วย
    </p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" onclick="downloadLocal()">ดาวน์โหลดไฟล์ข้อมูล (.json)</button>
      <button class="btn danger" onclick="resetAll()">ล้างข้อมูลทั้งหมด</button>
    </div>`}
  </div>` : '';

  return `
  <div class="page-title"><h1>บัญชีของฉัน</h1></div>
  ${wait}

  <form class="card" onsubmit="saveProfile(event)" novalidate>
    <h2>ข้อมูลส่วนตัว</h2>
    <div class="form-grid">
      <div class="field"><label for="a-user">ชื่อผู้ใช้</label><input id="a-user" value="${esc(u.username)}" disabled></div>
      <div class="field"><label for="a-role">ยศ</label><input id="a-role" value="${esc(rank)}" disabled></div>
      <div class="field"><label for="a-name">ชื่อ-นามสกุล</label><input id="a-name" value="${esc(u.name)}"></div>
      <div class="field"><label for="a-dept">แผนก / หน่วยงาน</label><input id="a-dept" value="${esc(u.dept)}"></div>
    </div>
    <div class="err" id="aerr" role="alert"></div>
    <button class="btn primary">บันทึกข้อมูล</button>
  </form>

  <form class="card" onsubmit="changePw(event)" novalidate>
    <h2>เปลี่ยนรหัสผ่าน</h2>
    <div class="form-grid">
      <div class="field"><label for="c-old">รหัสผ่านปัจจุบัน</label><input id="c-old" type="password" autocomplete="current-password"></div>
      <div></div>
      <div class="field"><label for="c-p1">รหัสผ่านใหม่ (อย่างน้อย ${MIN_PW} ตัว)</label><input id="c-p1" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="c-p2">ยืนยันรหัสผ่านใหม่</label><input id="c-p2" type="password" autocomplete="new-password"></div>
    </div>
    <div class="err" id="cerr" role="alert"></div>
    <button class="btn primary">เปลี่ยนรหัสผ่าน</button>
  </form>

  ${dataCard}`;
}

function saveProfile(e) {
  e.preventDefault();
  const u = cur();
  const name = inp('a-name').trim();
  if (name.length < 3) return setErr('aerr', 'กรุณากรอกชื่อ-นามสกุลอย่างน้อย 3 ตัวอักษร');
  u.name = name;
  u.dept = inp('a-dept').trim();
  toast('บันทึกข้อมูลส่วนตัวแล้ว');
  render();
}

function changePw(e) {
  e.preventDefault();
  const u = cur();
  const old = inp('c-old'), p1 = inp('c-p1'), p2 = inp('c-p2');
  if (NET.mode !== 'server' && hashPw(u.id, old) !== u.pass) return setErr('cerr', 'รหัสผ่านปัจจุบันไม่ถูกต้อง');   // โหมดเซิร์ฟเวอร์: เซิร์ฟเวอร์ตรวจให้
  if (p1.length < MIN_PW)           return setErr('cerr', `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PW} ตัว`);
  if (p1 !== p2)                    return setErr('cerr', 'รหัสผ่านใหม่ทั้ง 2 ช่องไม่ตรงกัน');
  if (p1 === old)                   return setErr('cerr', 'กรุณาตั้งรหัสผ่านที่แตกต่างจากรหัสผ่านเดิม');
  if (NET.mode === 'server') {
    submitPassword({ old, pw: p1 })
      .then(() => { toast('เปลี่ยนรหัสผ่านแล้ว'); render(); })
      .catch(err => setErr('cerr', err.message));
    return;
  }
  u.pass = hashPw(u.id, p1);
  u.pw = p1;
  toast('เปลี่ยนรหัสผ่านแล้ว');
  render();
}

// ล้างข้อมูลทั้งหมด แล้วกลับไปหน้า "ตั้งค่าระบบครั้งแรก"
async function resetAll() {
  const u = cur();
  if (!u || !u.admin) return;
  if (!confirm('ล้างข้อมูลทั้งหมด (ผู้ใช้ ยศ นักเรียน กลุ่ม เกณฑ์ รายวิชา คะแนน และข้อเสนอแนะ) แล้วกลับไปตั้งค่าระบบใหม่?\nการกระทำนี้ย้อนกลับไม่ได้')) return;
  if (NET.mode === 'server') {   // ล้างที่เซิร์ฟเวอร์ (ไฟล์เดิมถูกสำรองไว้ใน data/backups ก่อนเสมอ)
    try {
      await flushPending();
      await api('POST', 'api/reset', {});
    } catch (e) {
      return toast(e.message || 'ล้างข้อมูลไม่สำเร็จ');
    }
    endSession();
    NET.hasAdmin = false;
    try { NET.canSetup = !!(await api('GET', 'api/status')).canSetup; } catch (e) {}
  }
  Object.assign(S, {
    uid: null, view: 'home', editUser: null, editRole: null, editGroup: null, editStudent: null, editAdvisor: null,
    editSubject: false, addSubj: false, pick: null, imp: null, stuQ: '', stuLevel: '',
    evalGroup: null, scoreView: 'all', subjectId: null,
    loginErr: '', loginUser: '', showLogin: false, notice: '',
    users: [], roles: [], students: [], groups: [], criteria: [], scores: {}, subjects: [], feedback: {}
  });
  render();
  toast('ล้างข้อมูลทั้งหมดแล้ว');
}


/* ------------------------------------------------------------
   3.7 แอดมิน: ภาพรวม
   ------------------------------------------------------------ */
// คำทักทายตามช่วงเวลา
function greetWord() {
  const h = new Date().getHours();
  return h < 5 ? 'ดึกแล้ว' : h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : h < 20 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนค่ำ';
}

function vHome() {
  // ขั้นตอนเริ่มต้น: แสดงเมื่อข้อมูลยังไม่ครบ
  const todo = [];
  if (!S.students.length) todo.push('นำเข้ารายชื่อนักเรียน (เมนู "รายชื่อนักเรียน")');
  if (S.users.length < 2) todo.push('สร้างบัญชีผู้ใช้อื่นและให้ยศ (เมนู "ผู้ใช้งาน")');
  if (!S.groups.length && !S.subjects.length) todo.push('สร้างกลุ่มโปรเจกต์หรือรายวิชา');
  const hint = todo.length
    ? `<div class="notice" role="status"><span>ขั้นตอนเริ่มต้น: ${todo.join(' → ')}</span></div>` : '';

  // ความคืบหน้าการให้คะแนนโปรเจกต์ของแต่ละคน
  const rows = scorers().map(a => {
    const pr = progress(a.id);
    const slots = allSlots();
    const done = S.criteria.length
      ? slots.filter(pk => S.criteria.every(c => getScore(a.id, pk, c.id) !== undefined)).length : 0;
    return `
      <tr>
        <td>${esc(dn(a))} ${a.id === S.uid ? '<span class="chip gray">คุณ</span>' : ''}</td>
        <td>
          <div style="display:flex;gap:8px;align-items:center">
            <div class="bar" style="flex:1"><i style="width:${pr}%"></i></div>
            <span class="small">${pr}%</span>
          </div>
        </td>
        <td>${done}/${slots.length}</td>
      </tr>`;
  }).join('') || `<tr><td colspan="3" class="muted">ยังไม่มีผู้ให้คะแนน</td></tr>`;

  const subjRows = S.subjects.map(j => {
    const pr = subjProgress(j);
    return `
      <tr>
        <td>${esc(j.name)}</td>
        <td>${j.students.length} คน</td>
        <td>${j.works.length} งาน</td>
        <td>
          <div style="display:flex;gap:8px;align-items:center">
            <div class="bar" style="flex:1"><i style="width:${pr}%"></i></div>
            <span class="small">${pr}%</span>
          </div>
        </td>
      </tr>`;
  }).join('') || `<tr><td colspan="4" class="muted">ยังไม่มีรายวิชา</td></tr>`;

  return `
  <div class="hello">
    <small>${greetWord()},</small>
    <h1><span>${esc(dn(cur()))}</span></h1>
  </div>
  ${hint}

  <div class="stats">
    <div class="stat"><b data-count="${S.students.length}">${S.students.length}</b><span>นักเรียนในรายชื่อ</span></div>
    <div class="stat"><b data-count="${S.groups.length}">${S.groups.length}</b><span>กลุ่มโปรเจกต์</span></div>
    <div class="stat"><b data-count="${S.criteria.length}">${S.criteria.length}</b><span>เกณฑ์ (รวม ${num(totalMax())} คะแนน)</span></div>
    <div class="stat"><b data-count="${S.subjects.length}">${S.subjects.length}</b><span>รายวิชา</span></div>
    <div class="stat"><b data-count="${S.users.length}">${S.users.length}</b><span>ผู้ใช้ · ${S.roles.length} ยศ</span></div>
  </div>

  <div class="home-grid">${vRoundCard()}${vQrCard()}</div>
  ${vRiskCard()}

  <div class="card">
    <h2>ความคืบหน้าการให้คะแนนโปรเจกต์</h2>
    <div class="tw">
      <table style="min-width:480px">
        <thead><tr><th>ผู้ให้คะแนน</th><th>ให้คะแนนแล้ว</th><th>ประเมินครบ (กลุ่ม)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <h2>ความคืบหน้ารายวิชา</h2>
    <div class="tw">
      <table style="min-width:480px">
        <thead><tr><th>วิชา</th><th>นักเรียน</th><th>งาน</th><th>กรอกคะแนนแล้ว</th></tr></thead>
        <tbody>${subjRows}</tbody>
      </table>
    </div>
  </div>
  ${vLiveCard()}`;
}


/* ------------------------------------------------------------
   3.8 แอดมิน: จัดการผู้ใช้ (สร้างบัญชี + ให้ยศ)
   ------------------------------------------------------------ */

// กล่องติ๊กเลือกยศ (เลือกได้หลายยศ) idp = id ของกล่อง ไว้ให้ฟังก์ชันอ่านค่ากลับ
function roleChecks(selected, idp) {
  if (!S.roles.length) return '<p class="small muted" style="margin:0">ยังไม่มียศ สร้างได้ที่เมนู "ยศและสิทธิ์"</p>';
  return `<div class="checks" id="${idp}">` + S.roles.map(r => `
    <label class="check">
      <input type="checkbox" value="${r.id}" ${selected.includes(r.id) ? 'checked' : ''}>
      <span>${roleChip(r)}<small>${r.perms.map(p => PERMS.find(x => x[0] === p)[1]).join(' · ') || 'ไม่มีสิทธิ์'}</small></span>
    </label>`).join('') + '</div>';
}

function vUsers() {
  const me = cur();
  const notice = S.notice
    ? `<div class="notice" role="status"><span>${esc(S.notice)}</span>
         <button class="btn sm" onclick="S.notice='';render()">ปิด</button></div>` : '';

  // ฟอร์มแก้ไขผู้ใช้ (แสดงเมื่อกดปุ่ม "แก้ไข / ให้ยศ")
  const eu = S.editUser !== null ? userById(S.editUser) : null;
  const editCard = eu ? `
  <form class="card" onsubmit="saveUser(event)" novalidate>
    <h2>แก้ไขข้อมูล / ให้ยศ: ${esc(dn(eu))}</h2>
    <div class="form-grid">
      <div class="field"><label for="e-user">ชื่อผู้ใช้</label><input id="e-user" value="${esc(eu.username)}"></div>
      <div class="field"><label for="e-name">ชื่อ-นามสกุล${eu.admin ? '' : ' (เว้นว่างได้ ให้ผู้ใช้พิมพ์เองตอนเข้าใช้ครั้งแรก)'}</label><input id="e-name" value="${esc(eu.name)}"></div>
      <div class="field"><label for="e-dept">แผนก / หน่วยงาน</label><input id="e-dept" value="${esc(eu.dept)}"></div>
      ${eu.id === me.id ? '' : `<div class="field"><label for="e-pw">รหัสผ่าน (แก้ในช่องนี้เพื่อเปลี่ยน)</label><input id="e-pw" autocomplete="off" value="${esc(eu.pw || '')}" placeholder="${eu.pw ? '' : 'ไม่ทราบรหัสเดิม พิมพ์รหัสใหม่เพื่อเปลี่ยน'}"></div>`}
    </div>
    <div class="field">
      <label>ยศ (ติ๊กได้หลายยศ สิทธิ์จะรวมกัน)</label>
      ${eu.admin ? '<p class="small muted" style="margin:0">แอดมินมีสิทธิ์ทุกอย่างอยู่แล้ว ไม่ต้องให้ยศ</p>' : roleChecks(eu.roleIds, 'e-roles')}
    </div>
    <div class="err" id="eerr" role="alert"></div>
    <div class="actions">
      <button class="btn primary">บันทึก</button>
      <button type="button" class="btn" onclick="S.editUser=null;render()">ยกเลิก</button>
    </div>
  </form>` : '';

  const rows = S.users.map(u => {
    const rank = u.admin
      ? '<span class="chip ok" style="margin-left:0">แอดมิน</span>'
      : ((isAdvisor(u) ? '<span class="chip gray" style="margin-left:0">ครูที่ปรึกษา</span> ' : '') + (u.roleIds.map(roleById).filter(Boolean).map(roleChip).join('') || '<span class="small muted">ยังไม่มียศ</span>'));
    return `
    <tr>
      <td>${esc(u.username)}
        ${u.id === me.id ? '<span class="chip gray">คุณ</span>' : ''}
        ${waitFirst(u) ? '<span class="chip warn">รอเข้าใช้ครั้งแรก</span>' : ''}</td>
      <td>${u.name ? esc(u.name) : '<span class="small muted">รอผู้ใช้พิมพ์ชื่อตอนเข้าใช้ครั้งแรก</span>'}</td>
      <td class="muted">${esc(u.dept)}</td>
      <td>${rank}</td>
      <td class="nowrap">
        <button class="btn sm" onclick="S.editUser=${u.id};render();window.scrollTo(0,0)">${u.admin ? 'แก้ไข' : 'แก้ไข / ให้ยศ'}</button>
        <button class="btn sm" onclick="resetPw(${u.id})" ${u.id === me.id ? 'disabled title="เปลี่ยนรหัสของตัวเองที่เมนูบัญชีของฉัน"' : ''}>รีเซ็ตรหัสผ่าน</button>
        <button class="btn sm danger" onclick="delUser(${u.id})" ${u.admin ? 'disabled title="ลบแอดมินไม่ได้"' : ''}>ลบ</button>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="page-title">
    <h1>จัดการผู้ใช้งาน</h1>
    <span class="small muted">${S.users.length} บัญชี · ${S.roles.length} ยศ</span>
  </div>
  ${notice}
  ${editCard}

  <div class="card">
    <h2>ผู้ใช้ทั้งหมด (${S.users.length})</h2>
    <p class="small muted" style="margin:0 0 8px">
      ระบบมีแอดมินได้คนเดียว (คือคุณ) ถ้าอยากให้คนอื่นทำอะไรได้ ให้กด "แก้ไข / ให้ยศ" แล้วติ๊กยศให้เขา
      สร้างหรือแก้สิทธิ์ของยศได้ที่เมนู "ยศและสิทธิ์"
    </p>
    <div class="tw">
      <table style="min-width:860px">
        <thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ-นามสกุล</th><th>แผนก</th><th>ยศ</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>

  <form class="card" onsubmit="addUser(event)" novalidate>
    <h2>เพิ่มผู้ใช้ใหม่</h2>
    <div class="form-grid">
      <div class="field"><label for="n-user">ชื่อผู้ใช้ (ภาษาอังกฤษหรือตัวเลข 3-20 ตัว)</label><input id="n-user" autocomplete="off"></div>
      <div class="field"><label for="n-pw">รหัสผ่าน</label><input id="n-pw" value="${genPw()}" autocomplete="off"></div>
      <div class="field"><label for="n-dept">แผนก / หน่วยงาน (ไม่กรอกก็ได้)</label><input id="n-dept"></div>
    </div>
    <p class="small muted" style="margin:0 0 12px">ไม่ต้องกรอกชื่อ-นามสกุล ผู้ใช้จะพิมพ์ชื่อของตัวเองตอนเข้าใช้งานครั้งแรก</p>
    <div class="field">
      <label>ให้ยศตั้งแต่เริ่ม (ไม่ติ๊กก็ได้ ให้ภายหลังได้)</label>
      ${roleChecks([], 'n-roles')}
    </div>
    <div class="err" id="nerr" role="alert"></div>
    <button class="btn primary">เพิ่มผู้ใช้</button>
  </form>`;
}

const usernameTaken = (name, exceptId) =>
  S.users.some(u => u.id !== exceptId && u.username.toLowerCase() === name.toLowerCase());

function addUser(e) {
  e.preventDefault();
  const username = inp('n-user').trim();
  const dept = inp('n-dept').trim(), pw = inp('n-pw').trim();

  if (!USERNAME_RE.test(username)) return setErr('nerr', 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ . _ - ยาว 3-20 ตัว');
  if (usernameTaken(username))     return setErr('nerr', 'ชื่อผู้ใช้นี้มีอยู่แล้ว');
  if (pw.length < 6)               return setErr('nerr', 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว');

  // ไม่มีชื่อ-นามสกุล: ผู้ใช้พิมพ์เองตอนเข้าใช้ครั้งแรก (ดู vFirst) ส่วนรหัสผ่านใช้ตามที่แอดมินตั้งได้เลย
  const id = nextId();
  S.users.push({ id, username, name: '', dept, admin: false, roleIds: checkedVals('#n-roles input'),
                 mustChange: false, pass: hashPw(id, pw), pw });
  S.notice = `เพิ่มบัญชี "${username}" แล้ว รหัสผ่านคือ ${pw} · ผู้ใช้จะพิมพ์ชื่อของตัวเองตอนเข้าใช้ครั้งแรก`;
  render();
  window.scrollTo(0, 0);
}

function saveUser(e) {
  e.preventDefault();
  const u = userById(S.editUser);
  const username = inp('e-user').trim(), name = inp('e-name').trim();
  if (!USERNAME_RE.test(username))   return setErr('eerr', 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ . _ - ยาว 3-20 ตัว');
  if (usernameTaken(username, u.id)) return setErr('eerr', 'ชื่อผู้ใช้นี้มีอยู่แล้ว');
  if (name.length < 3 && !(name === '' && !u.admin)) return setErr('eerr', 'กรุณากรอกชื่อ-นามสกุลอย่างน้อย 3 ตัวอักษร');
  const pwEl = document.getElementById('e-pw');
  const pw = pwEl ? pwEl.value.trim() : '';
  if (pw && pw.length < 6)           return setErr('eerr', 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัว');
  u.username = username;
  u.name = name;
  u.dept = inp('e-dept').trim();
  if (!u.admin) u.roleIds = checkedVals('#e-roles input');
  if (pw && pw !== (u.pw || '')) { u.pass = hashPw(u.id, pw); u.pw = pw; u.mustChange = false; }
  S.editUser = null;
  toast('บันทึกข้อมูลผู้ใช้แล้ว');
  render();
}

// รีเซ็ตรหัสผ่าน: สุ่มรหัสชั่วคราว และบังคับให้ตั้งใหม่ตอนเข้าใช้ครั้งถัดไป
function resetPw(id) {
  const u = userById(id);
  if (!confirm(`รีเซ็ตรหัสผ่านของ ${dn(u)}?`)) return;
  const pw = genPw();
  u.pass = hashPw(u.id, pw);
  u.pw = pw;
  u.mustChange = true;
  S.notice = `รหัสผ่านชั่วคราวใหม่ของ "${u.username}" คือ ${pw} (ผู้ใช้ต้องตั้งรหัสผ่านใหม่เมื่อเข้าใช้)`;
  render();
  window.scrollTo(0, 0);
}

function delUser(id) {
  const u = userById(id);
  if (!u || u.admin) return;
  const adv = S.groups.filter(g => g.advisorId === id);
  const extra = adv.length ? ` และจะถูกถอดออกจากการเป็นครูที่ปรึกษาของ ${adv.length} โปรเจกต์` : '';
  if (!confirm(`ลบบัญชี ${dn(u)}? คะแนนโปรเจกต์และข้อเสนอแนะที่คนนี้เคยให้จะถูกลบไปด้วย${extra}`)) return;

  S.users = S.users.filter(x => x.id !== id);
  dropUserScores(id);
  adv.forEach(g => { g.advisorId = null; });
  Object.keys(S.feedback).forEach(gid => setFeedback(gid, id, ''));
  if (S.editUser === id) S.editUser = null;
  if (S.editAdvisor === id) S.editAdvisor = null;
  toast('ลบบัญชีแล้ว');
  render();
}


/* ------------------------------------------------------------
   3.9 แอดมิน: ยศและสิทธิ์ (แบบดิสคอร์ด)
   สร้างยศ ตั้งสี เลือกสิทธิ์ของยศ แล้วค่อยไปให้คนที่เมนู "ผู้ใช้งาน"
   ------------------------------------------------------------ */

// ช่องกรอกของฟอร์มยศ (ใช้ร่วมกันทั้งฟอร์มเพิ่ม/แก้ไข) p = คำนำหน้า id กันซ้ำ
function roleFields(p, r) {
  const perms = r ? r.perms : [];
  return `
    <div class="form-grid">
      <div class="field"><label for="${p}-name">ชื่อยศ</label><input id="${p}-name" value="${esc(r ? r.name : '')}" placeholder="เช่น ครูผู้ช่วย"></div>
      <div class="field"><label for="${p}-color">สีของยศ</label><input id="${p}-color" type="color" value="${safeColor(r ? r.color : '#5865f2')}"></div>
    </div>
    <div class="field">
      <label>สิทธิ์ของยศนี้</label>
      <div class="checks" id="${p}-perms">
        ${PERMS.map(([k, name, desc]) => `
          <label class="check">
            <input type="checkbox" value="${k}" ${perms.includes(k) ? 'checked' : ''}>
            <span><b>${name}</b><small>${desc}</small></span>
          </label>`).join('')}
      </div>
    </div>`;
}

function vRoles() {
  const er = S.editRole ? roleById(S.editRole) : null;
  const editCard = er ? `
  <form class="card" onsubmit="saveRole(event)" novalidate>
    <h2>แก้ไขยศ: ${roleChip(er)}</h2>
    ${roleFields('re', er)}
    <div class="err" id="reerr" role="alert"></div>
    <div class="actions">
      <button class="btn primary">บันทึก</button>
      <button type="button" class="btn" onclick="S.editRole=null;render()">ยกเลิก</button>
    </div>
  </form>` : '';

  const cards = S.roles.map(r => {
    const members = S.users.filter(u => u.roleIds.includes(r.id));
    return `
    <div class="card">
      <div class="role-head">
        <div>${roleChip(r)} <span class="small muted">· ${members.length} คน${members.length ? ': ' + members.map(u => esc(dn(u))).join(', ') : ''}</span></div>
        <div class="nowrap">
          <button class="btn sm" onclick="S.editRole='${r.id}';render();window.scrollTo(0,0)">แก้ไข</button>
          <button class="btn sm danger" onclick="delRole('${r.id}')">ลบยศ</button>
        </div>
      </div>
      <div class="small muted">${r.perms.map(p => PERMS.find(x => x[0] === p)[1]).join(' · ') || 'ยังไม่มีสิทธิ์ใดๆ'}</div>
    </div>`;
  }).join('') || '<div class="card"><p class="muted" style="margin:0">ยังไม่มียศ สร้างได้ด้านล่าง</p></div>';

  return `
  <div class="page-title">
    <h1>ยศและสิทธิ์</h1>
    <span class="small muted">${S.roles.length} ยศ</span>
  </div>
  <p class="small muted">แอดมิน (ครู) มีทุกสิทธิ์อยู่แล้ว ส่วนคนอื่นจะทำอะไรได้ขึ้นอยู่กับยศที่ได้รับ ยศหนึ่งมีได้หลายสิทธิ์ และคนหนึ่งมีได้หลายยศ</p>
  ${editCard}
  ${cards}

  <form class="card" onsubmit="addRole(event)" novalidate>
    <h2>สร้างยศใหม่</h2>
    ${roleFields('ra', null)}
    <div class="err" id="raerr" role="alert"></div>
    <button class="btn primary">+ สร้างยศ</button>
  </form>`;
}

function addRole(e) {
  e.preventDefault();
  const name = inp('ra-name').trim();
  if (!name) return setErr('raerr', 'กรุณากรอกชื่อยศ');
  if (S.roles.some(r => r.name.toLowerCase() === name.toLowerCase())) return setErr('raerr', 'มียศชื่อนี้อยู่แล้ว');
  S.roles.push({ id: newId(), name, color: safeColor(inp('ra-color')), perms: checkedVals('#ra-perms input') });
  toast('สร้างยศแล้ว');
  render();
}

function saveRole(e) {
  e.preventDefault();
  const r = roleById(S.editRole);
  if (!r) { S.editRole = null; return render(); }
  const name = inp('re-name').trim();
  if (!name) return setErr('reerr', 'กรุณากรอกชื่อยศ');
  if (S.roles.some(x => x.id !== r.id && x.name.toLowerCase() === name.toLowerCase())) return setErr('reerr', 'มียศชื่อนี้อยู่แล้ว');
  r.name = name;
  r.color = safeColor(inp('re-color'));
  r.perms = checkedVals('#re-perms input');
  S.editRole = null;
  toast('บันทึกยศแล้ว');
  render();
}

function delRole(id) {
  const r = roleById(id);
  if (!r) return;
  const n = S.users.filter(u => u.roleIds.includes(id)).length;
  if (!confirm(`ลบยศ "${r.name}"?${n ? ` ผู้ใช้ ${n} คนที่มียศนี้จะเสียสิทธิ์ของยศนี้` : ''}`)) return;
  S.roles = S.roles.filter(x => x.id !== id);
  S.users.forEach(u => { u.roleIds = u.roleIds.filter(x => x !== id); });
  if (S.editRole === id) S.editRole = null;
  toast('ลบยศแล้ว');
  render();
}


/* ------------------------------------------------------------
   3.10 รายชื่อนักเรียน + นำเข้าจาก PDF (ข้ามชื่อซ้ำ)
   ทะเบียนนักเรียนกลางอยู่ที่นี่ที่เดียว กลุ่มโปรเจกต์และรายวิชาเลือกคนจากรายชื่อนี้
   ------------------------------------------------------------ */
const prefixOptions = sel => (PREFIXES.includes(sel) || !sel ? PREFIXES : PREFIXES.concat(sel))
  .map(p => `<option ${p === sel ? 'selected' : ''}>${esc(p)}</option>`).join('');
const levelOptions = (sel, blank) =>
  (blank ? `<option value="" ${sel ? '' : 'selected'}>ไม่ระบุ</option>` : '') +
  LEVELS.map(l => `<option ${l === sel ? 'selected' : ''}>${l}</option>`).join('');

// ตัดคำนำหน้าที่พิมพ์ติดมากับชื่อ (ต้องมีเว้นวรรคตามหลัง จะได้ไม่ตัดชื่อที่ขึ้นต้นด้วย "นาย..." โดยบังเอิญ)
const cleanName = s => normText(s).replace(/^(นางสาว|นาย|นาง)\s+/, '');
const findByName = name => S.students.find(s => nameKey(s.name) === nameKey(name)) || null;

// นักเรียนตรงกับตัวกรอง (ค้นหา + ระดับชั้น) ในหน้ารายชื่อไหม
const stuMatch = s => (!S.stuLevel || s.level === S.stuLevel) &&
                      (!S.stuQ || stuKey(s).includes(nameKey(S.stuQ)));

// ---------- 3.10.1 แยกรายชื่อออกจากข้อความ ----------
// รูปแบบแถวที่อ่านได้ (เรียงคอลัมน์ไหนก็ได้): "1 นายสมชาย ใจดี ปวช.1"  "นางสาวสมหญิง รักดี 12 ปวส.2/1"
const PREFIX_RE = /^(นางสาว|นาย|นาง|น\.ส\.?|นส\.?|เด็กชาย|เด็กหญิง|ด\.ช\.?|ด\.ญ\.?|ดช\.?|ดญ\.?)\s*/;
const LEVEL_RE = /(ปวช|ปวส)\s*\.?\s*([1-3])(?:\s*\/\s*\d+)?/;
const HEADER_RE = /(ชื่อ\s*-?\s*(นามสกุล|สกุล)|เลขที่|เลขประจำตัว|รหัสนักเรียน|รหัสนักศึกษา|ลำดับ|ระดับชั้น|รายชื่อ|แผนก|ครูที่ปรึกษา|ครูผู้สอน|ลงชื่อ|ลายมือชื่อ|ปีการศึกษา|ภาคเรียน|จำนวน|หน้า\s*\d)/;
// คำบอกสถานะท้ายแถวในใบรายชื่อ (ไม่ใช่ส่วนของชื่อ)
const STATUS_RE = /(^|\s)(ยังไม่ลงทะเบียน|รอลงทะเบียน|ลงทะเบียนแล้ว|ลงทะเบียน)(?=\s|$)/g;

// บรรทัดที่เหลือแต่คำหัวข้อหลังตัดระดับชั้นออกแล้ว (ไม่มีชื่อคน)
const HEAD_ONLY_RE = /^[\s.\-:]*((ระดับชั้น|ระดับ|ชั้น|ห้อง|กลุ่ม|ประเภท|วิชา)?[\s.\-:\d\/]*)*$/;

function canonPrefix(p) {
  p = p.replace(/\./g, '');
  if (p === 'นส') return 'นางสาว';
  if (p === 'ดช') return 'เด็กชาย';
  if (p === 'ดญ') return 'เด็กหญิง';
  return p;
}

// lines = ข้อความทีละบรรทัด, defLevel = ระดับที่ใช้เมื่อในไฟล์ไม่มี, lenient = รับทุกบรรทัดที่เป็นชื่อไทย (ใช้กับข้อความที่วางเอง)
// คืนค่า { rows: [{ prefix, name, no, level }], unread: [บรรทัดที่อ่านไม่ได้] }
function parseRosterLines(lines, defLevel, lenient) {
  const rows = [], unread = [];
  let headLevel = '';   // ระดับชั้นที่เจอในหัวกระดาษ ใช้กับแถวที่ไม่ได้ระบุระดับ

  for (const raw of lines) {
    let s = normText(raw);
    if (!s) continue;
    const original = s;

    // 0) ชื่อครูผู้สอนที่เซ็นท้ายใบรายชื่อ มักอยู่ในวงเล็บทั้งบรรทัด เช่น "( นางสาวสาริศา ยาดี )" ไม่ใช่นักเรียน
    if (/^\(.*\)$/.test(s)) continue;

    // 1) ระดับชั้น เช่น ปวช.1 / ปวส.2/1
    let level = '';
    const lm = s.match(LEVEL_RE);
    if (lm) { level = lm[1] + '.' + lm[2]; s = s.replace(LEVEL_RE, ' ').replace(/\s+/g, ' ').trim(); }

    // 2) หัวตาราง/หัวกระดาษ ข้ามไป แต่จำระดับชั้นไว้
    //    รวมถึงบรรทัดที่มีแต่ระดับชั้น เช่น "ระดับ ปวช.2" "ชั้น ปวส.1" "ปวช.3 ห้อง 1"
    if (HEADER_RE.test(s) || (level && HEAD_ONLY_RE.test(s))) {
      if (level) headLevel = level;
      continue;
    }

    // 3) เลขประจำตัว = ตัวเลขยาว 6 หลักขึ้นไป (เช่น 67219010001) เก็บไว้ ส่วนรหัสยาวอื่นๆ (4 หลักขึ้นไป) ทิ้ง
    //    แล้วหา "เลขที่" (1-3 หลัก) ถ้าตารางมีเลขหลายคอลัมน์ (ลำดับ + เลขที่) ใช้ตัวแรกเป็นเลขที่ ที่เหลือทิ้ง
    let sid = '';
    const sm = s.match(/(?:^|\s)(\d{6,})(?=\s|$)/);
    if (sm) sid = sm[1];
    s = s.replace(/(^|\s)\d{4,}(?=\s|$)/g, ' ');
    s = s.replace(STATUS_RE, ' ');   // คำสถานะท้ายแถว เช่น "ลงทะเบียน" ไม่ใช่ส่วนของชื่อ
    let no = '';
    const nm = s.match(/(?:^|\s)(\d{1,3})(?=[\s.)]|$)/);
    if (nm) { no = nm[1]; s = s.slice(0, nm.index) + ' ' + s.slice(nm.index + nm[0].length); }
    s = s.replace(/(^|\s)\d{1,3}(?=[\s.)]|$)/g, ' ');
    s = s.replace(/[|,;:()\[\]\\\/_]+/g, ' ').replace(/(^|\s)[.\-)]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();

    // 4) คำนำหน้า แล้วที่เหลือคือชื่อ-นามสกุล
    let prefix = '';
    const pm = s.match(PREFIX_RE);
    if (pm) { prefix = canonPrefix(pm[1]); s = s.slice(pm[0].length).trim(); }
    const name = s;

    // 5) ตรวจว่าเป็นชื่อคนจริงไหม: ต้องเป็นตัวอักษรไทยล้วน และมีสัญญาณว่าเป็นแถวรายชื่อ
    const thaiOnly = /^[฀-๿\s'\-]+$/.test(name) && /[ก-ฮ]/.test(name);
    const words = name.split(' ').filter(Boolean).length;
    const ok = thaiOnly && name.replace(/\s/g, '').length >= 3 &&
               (prefix || ((no || sid) && words >= 2) || (level && words >= 2) || lenient);

    if (ok) rows.push({ prefix, name, no, sid, level: level || headLevel || defLevel || '' });
    else if (/[฀-๿]/.test(original)) unread.push(original);
  }
  return { rows, unread };
}

// ---------- 3.10.2 อ่านไฟล์ (PDF / Excel / CSV / TXT) ----------
// PDF: ดึงข้อความจากทุกหน้า แล้วจัดเป็นบรรทัดตามตำแหน่งแนวตั้ง (แถวของตาราง)
async function pdfToLines(file) {
  if (typeof pdfjsLib === 'undefined')
    throw new Error('ไม่พบไลบรารีอ่าน PDF ต้องมีโฟลเดอร์ vendor อยู่ข้าง index.html');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const lines = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();

    // จัดกลุ่มข้อความที่อยู่ระดับความสูงใกล้กัน = แถวเดียวกัน
    const rows = [];
    for (const it of tc.items) {
      if (!it.str) continue;
      const y = it.transform[5];
      const tol = Math.max(3, (it.height || 10) * 0.4);
      let r = rows.find(x => Math.abs(x.y - y) < tol);
      if (!r) { r = { y, items: [] }; rows.push(r); }
      r.items.push(it);
    }
    rows.sort((a, b) => b.y - a.y);   // บนลงล่าง

    for (const r of rows) {
      let s = '', prevEnd = null;
      for (const it of r.items) {
        const x = it.transform[4];
        const gap = prevEnd === null ? 0 : x - prevEnd;
        // ช่องว่างกว้างพอ = คนละคอลัมน์/คนละคำ ใส่ช่องว่างให้ (สระและวรรณยุกต์ติดกันจึงไม่ถูกแยก)
        if (prevEnd !== null && gap > Math.max(1.2, (it.height || 10) * 0.12) && !/\s$/.test(s) && !/^\s/.test(it.str)) s += ' ';
        s += it.str;
        prevEnd = x + it.width;
      }
      lines.push(s);
    }
  }
  return lines;
}

// Excel (.xlsx) = ไฟล์ zip ที่ข้างในเป็น XML เราอ่านเองโดยไม่ต้องใช้ไลบรารี (ใช้ DecompressionStream ของเบราว์เซอร์แตกไฟล์)
async function xlsxToLines(file) {
  if (typeof DecompressionStream === 'undefined')
    throw new Error('เบราว์เซอร์นี้อ่านไฟล์ .xlsx ไม่ได้ ให้ใช้ Chrome / Edge รุ่นใหม่ หรือบันทึกไฟล์เป็น .csv แล้วนำเข้าแทน');

  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf), dv = new DataView(buf);

  // หาสารบัญของ zip (End of central directory) จากท้ายไฟล์
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ไฟล์นี้ไม่ใช่ .xlsx ที่ถูกต้อง');
  const total = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const entries = {};
  for (let i = 0; i < total && dv.getUint32(p, true) === 0x02014b50; i++) {
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    entries[name] = { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
    p += 46 + nlen + elen + clen;
  }

  // อ่านไฟล์ข้างใน zip ออกมาเป็นข้อความ
  const readText = async name => {
    const en = entries[name];
    if (!en) return '';
    const start = en.off + 30 + dv.getUint16(en.off + 26, true) + dv.getUint16(en.off + 28, true);
    let data = u8.subarray(start, start + en.size);
    if (en.method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (en.method !== 0) throw new Error('ไฟล์ .xlsx นี้ใช้การบีบอัดที่ระบบไม่รองรับ');
    return new TextDecoder('utf-8').decode(data);
  };
  const xml = async name => new DOMParser().parseFromString(await readText(name), 'application/xml');
  const textOf = el => [...el.getElementsByTagName('t')].map(t => t.textContent).join('');

  // ข้อความที่ Excel เก็บรวมไว้ที่เดียว (shared strings)
  const shared = [];
  if (entries['xl/sharedStrings.xml']) {
    const ss = await xml('xl/sharedStrings.xml');
    [...ss.getElementsByTagName('si')].forEach(si => {
      // ข้ามตัวช่วยอ่านออกเสียง (rPh) ที่ไม่ใช่ข้อความจริง
      const parts = [...si.childNodes].filter(n => n.localName === 't' || n.localName === 'r');
      shared.push(parts.map(n => (n.localName === 't' ? n.textContent : textOf(n))).join(''));
    });
  }

  // อ่านทุกชีต เรียงตามเลขชีต
  const sheets = Object.keys(entries).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  if (!sheets.length) throw new Error('ไม่พบชีตข้อมูลในไฟล์ .xlsx');

  const colIdx = ref => ref.replace(/\d+/g, '').split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const lines = [];
  for (const name of sheets) {
    const doc = await xml(name);
    for (const row of doc.getElementsByTagName('row')) {
      const cells = [];
      for (const c of row.getElementsByTagName('c')) {
        const t = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0];
        let val = '';
        if (t === 's') val = v ? shared[Number(v.textContent)] || '' : '';
        else if (t === 'inlineStr') val = textOf(c);
        else val = v ? v.textContent : '';
        val = String(val).trim();
        if (val) cells[colIdx(c.getAttribute('r') || 'A1')] = val;   // เรียงตามคอลัมน์ ช่องว่างข้ามไป
      }
      const line = cells.filter(x => x !== undefined).join(' ');
      if (line) lines.push(line);
    }
  }
  return lines;
}

async function readRosterFile(file, target) {
  if (!file) return;
  try {
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    const isXlsx = /\.xlsx$/i.test(file.name) || /spreadsheetml/.test(file.type);
    if (/\.xls$/i.test(file.name)) {
      toast('ไฟล์ .xls (Excel รุ่นเก่า) อ่านไม่ได้ ให้เปิดใน Excel แล้วบันทึกเป็น .xlsx หรือ .csv ก่อน');
      return;
    }
    const lines = isPdf ? await pdfToLines(file) : isXlsx ? await xlsxToLines(file) : (await file.text()).split(/\r?\n/);
    if (!lines.some(l => l.trim())) {
      toast('ไม่พบข้อความในไฟล์ (ถ้าเป็น PDF สแกนเป็นรูปภาพ อ่านไม่ได้) ลองวางรายชื่อเป็นข้อความแทน');
      return;
    }
    // PDF และ Excel เป็นตารางที่มีโครงสร้าง ใช้กติกาเข้มงวด ส่วน CSV/TXT/ข้อความที่วางรับทุกบรรทัดที่เป็นชื่อไทย
    startImport(target, file.name, lines, !(isPdf || isXlsx));
  } catch (e) {
    console.error(e);
    toast('อ่านไฟล์ไม่ได้: ' + (e && e.message ? e.message : e));
  }
}

function readPasted(target) {
  const text = inp('imp-text');
  if (!text.trim()) return toast('กรุณาวางรายชื่อในกล่องข้อความก่อน');
  startImport(target, 'ข้อความที่วาง', text.split(/\r?\n/), true);
}

function dragOver(e) { e.preventDefault(); e.currentTarget.classList.add('over'); }
function dragLeave(e) { e.currentTarget.classList.remove('over'); }
function dropFile(e, target) {
  e.preventDefault();
  e.currentTarget.classList.remove('over');
  readRosterFile(e.dataTransfer.files[0], target);
}

// ---------- 3.10.3 ตรวจรายชื่อก่อนนำเข้า (preview) ----------
// หาคนเดิมในทะเบียน: ใช้เลขประจำตัวก่อน (แม่นที่สุด) ถ้าไม่มีค่อยเทียบจากชื่อ
const findBySid = sid => (sid ? S.students.find(s => s.sid === sid) || null : null);
const findExisting = r => findBySid(r.sid) || findByName(r.name);

// target = 'roster' (ใส่ทะเบียนนักเรียน) หรือ 's:idวิชา' (ใส่ทะเบียน + เพิ่มเข้าวิชานั้นด้วย)
function buildImport(target, fileName, lines, defLevel, lenient) {
  const { rows, unread } = parseRosterLines(lines, defLevel, lenient);
  const j = target.startsWith('s:') ? subjBy(target.slice(2)) : null;
  const seen = new Set();
  rows.forEach(r => {
    const k = r.sid || nameKey(r.name);
    const ex = findExisting(r);
    r.exist = ex ? ex.id : null;                           // มีคนนี้ในทะเบียนแล้ว
    // เลขประจำตัวตรงกัน แต่สะกดชื่อไม่เหมือนกัน (เช่น PDF ทำสระ ำ หาย) ให้แก้ชื่อตามไฟล์ได้
    r.fix = !!(ex && r.sid && ex.sid === r.sid && nameKey(ex.name) !== nameKey(r.name));
    r.dupFile = seen.has(k);                               // ซ้ำกับบรรทัดก่อนหน้าในไฟล์เดียวกัน
    seen.add(k);
    r.inTarget = !!(ex && j && j.students.includes(ex.id)); // อยู่ในวิชานี้แล้ว
    r.locked = r.dupFile || (target === 'roster' ? !!ex && !r.fix : r.inTarget && !r.fix);   // locked = ข้าม ติ๊กไม่ได้
  });
  S.imp = { target, fileName, lines, defLevel, lenient, rows, unread };
}

function startImport(target, fileName, lines, lenient) {
  const keep = S.imp && S.imp.target === target ? S.imp.defLevel : '';
  buildImport(target, fileName, lines, keep, lenient);
  render();
  const el = document.getElementById('imp-preview');
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
}

function setImpLevel(v) {
  const i = S.imp;
  if (!i) return;
  buildImport(i.target, i.fileName, i.lines, v, i.lenient);
  render();
}

function impAll(on) {
  document.querySelectorAll('.imp-cb:not(:disabled)').forEach(c => { c.checked = on; });
}

function cancelImport() {
  S.imp = null;
  render();
}

// ยืนยันนำเข้า: เพิ่มเฉพาะคนที่ติ๊กไว้ ชื่อ/เลขประจำตัวซ้ำไม่เพิ่มใหม่ (ใช้คนเดิม)
function confirmImport() {
  const imp = S.imp;
  if (!imp) return;
  const j = imp.target.startsWith('s:') ? subjBy(imp.target.slice(2)) : null;
  if (imp.target !== 'roster' && !j) { S.imp = null; return render(); }

  const checked = new Set(checkedVals('.imp-cb').map(Number));
  let added = 0, skipped = 0, joined = 0, fixed = 0;
  imp.rows.forEach((r, i) => {
    if (!checked.has(i)) return;
    let st = findExisting(r);                  // เช็คซ้ำอีกรอบ ณ ตอนกดยืนยัน
    if (st && !j && !r.fix) { skipped++; return; }   // นำเข้าทะเบียน: ซ้ำ = ข้าม
    if (!st) {
      st = { id: newId(), prefix: r.prefix, name: r.name, no: r.no, sid: r.sid || '', level: r.level };
      S.students.push(st);
      added++;
    } else {
      if (r.fix) { st.prefix = r.prefix; st.name = r.name; fixed++; }
      // คนเดิมที่ยังไม่มีเลขที่/เลขประจำตัว/ระดับ ให้เติมจากไฟล์ (ไม่ทับของเดิม)
      if (!st.sid && r.sid) st.sid = r.sid;
      if (!st.no && r.no) st.no = r.no;
      if (!st.level && r.level) st.level = r.level;
    }
    if (j && !j.students.includes(st.id)) { j.students.push(st.id); joined++; }
  });

  S.imp = null;
  const fx = fixed ? ` · แก้ชื่อตามไฟล์ ${fixed} คน` : '';
  toast(j
    ? `เพิ่มเข้าวิชา "${j.name}" ${joined} คน (เป็นนักเรียนใหม่ ${added} คน)${fx}`
    : `เพิ่มนักเรียนใหม่ ${added} คน · ข้ามชื่อซ้ำ ${skipped} คน${fx}`);
  render();
}

// สถานะของแต่ละแถวในตัวอย่าง [ข้อความ, สีป้าย]
function impStatus(imp, r) {
  if (r.dupFile) return ['ซ้ำในไฟล์ · ข้าม', 'gray'];
  if (r.fix) return ['มีแล้ว · แก้ชื่อตามไฟล์', 'warn'];
  if (imp.target === 'roster') return r.exist ? ['มีในรายชื่อแล้ว · ข้าม', 'gray'] : ['ใหม่', 'ok'];
  if (r.inTarget) return ['อยู่ในวิชานี้แล้ว · ข้าม', 'gray'];
  return r.exist ? ['มีในรายชื่อ · เพิ่มเข้าวิชา', 'warn'] : ['ใหม่ · เพิ่มเข้าวิชา', 'ok'];
}

function vImportPreview(imp) {
  const unread = imp.unread.length ? `
    <details class="paste">
      <summary class="small">บรรทัดที่อ่านเป็นรายชื่อไม่ได้ (${imp.unread.length})</summary>
      <div class="small muted" style="white-space:pre-wrap;max-height:160px;overflow:auto;margin-top:6px">${esc(imp.unread.slice(0, 60).join('\n'))}</div>
    </details>` : '';

  if (!imp.rows.length) return `
    <div id="imp-preview" class="notice" style="margin-top:14px" role="status">
      <span>อ่านรายชื่อจาก "${esc(imp.fileName)}" ไม่ได้ ลองวางรายชื่อเป็นข้อความแทน (กล่องด้านบน)</span>
      <button class="btn sm" onclick="cancelImport()">ปิด</button>
    </div>${unread}`;

  const usable = imp.rows.filter(r => !r.locked).length;
  const rows = imp.rows.map((r, i) => {
    const [text, color] = impStatus(imp, r);
    return `
      <tr>
        <td><input type="checkbox" class="imp-cb" value="${i}" ${r.locked ? 'disabled' : 'checked'} aria-label="เลือก ${esc(r.name)}"></td>
        <td>${esc(r.no || '-')}</td>
        <td>${esc(r.sid || '-')}</td>
        <td>${esc((r.prefix ? r.prefix + ' ' : '') + r.name)}</td>
        <td>${esc(r.level || '-')}</td>
        <td><span class="chip ${color}" style="margin-left:0">${text}</span></td>
      </tr>`;
  }).join('');

  return `
  <div id="imp-preview" style="margin-top:16px">
    <div class="role-head">
      <div><b>ตรวจรายชื่อจาก "${esc(imp.fileName)}"</b>
        <span class="small muted">· อ่านได้ ${imp.rows.length} รายการ · เพิ่มได้ ${usable} · ข้าม ${imp.rows.length - usable}</span></div>
      <div style="display:flex;align-items:center;gap:8px">
        <label class="small muted" for="imp-level" style="margin:0">ถ้าไม่มีระดับชั้นในไฟล์ ให้ใช้</label>
        <select id="imp-level" class="input sm" style="width:auto" onchange="setImpLevel(this.value)">${levelOptions(imp.defLevel, true)}</select>
      </div>
    </div>
    <div class="scroll">
      <table style="min-width:640px">
        <thead><tr><th></th><th>เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ-นามสกุล</th><th>ระดับ</th><th>สถานะ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${unread}
    <div class="actions">
      <button class="btn primary" onclick="confirmImport()">นำเข้ารายชื่อที่ติ๊กไว้</button>
      <button class="btn" onclick="impAll(true)">เลือกทั้งหมด</button>
      <button class="btn" onclick="impAll(false)">ไม่เลือกเลย</button>
      <button class="btn" onclick="cancelImport()">ยกเลิก</button>
    </div>
  </div>`;
}

// กล่องนำเข้ารายชื่อ (ใช้ซ้ำทั้งหน้ารายชื่อนักเรียนและหน้ารายวิชา)
function vImportBox(target) {
  const imp = S.imp && S.imp.target === target ? S.imp : null;
  const what = target === 'roster'
    ? 'ชื่อหรือเลขประจำตัวที่ซ้ำกับที่มีอยู่แล้วจะไม่ถูกเพิ่มใหม่'
    : 'นักเรียนทุกคนในไฟล์จะถูกเพิ่มเข้าวิชานี้ (ถ้ายังไม่มีในรายชื่อจะเพิ่มให้ ถ้ามีแล้วจะใช้คนเดิม ไม่เพิ่มซ้ำ)';
  return `
  <div class="card no-print">
    <h2>${target === 'roster' ? 'นำเข้ารายชื่อนักเรียนจากไฟล์' : 'โยนไฟล์รายชื่อนักเรียนเข้าวิชานี้'}</h2>
    <p class="small muted" style="margin:0 0 10px">ไฟล์ PDF หรือ Excel ที่มี เลขที่ · เลขประจำตัว · ชื่อ-สกุล (· ปวช./ปวส. ถ้ามี) · ${what}</p>
    <div class="drop" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropFile(event,'${target}')">
      <b>ลากไฟล์มาวางที่นี่</b>
      <span class="small muted">รองรับ PDF · Excel (.xlsx) · CSV · TXT</span>
      <button type="button" class="btn sm primary" onclick="document.getElementById('imp-file').click()">เลือกไฟล์</button>
      <input type="file" id="imp-file" hidden
             accept=".pdf,.xlsx,.csv,.txt,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
             onchange="readRosterFile(this.files[0],'${target}');this.value=''">
    </div>
    <p class="small muted" style="margin:8px 0 0">💡 ถ้ามีทั้ง Excel และ PDF แนะนำให้ใช้ Excel เพราะ PDF บางไฟล์ทำสระ "ำ" ในชื่อหาย (เช่น สำราญ กลายเป็น สาราญ) ถ้านำเข้าไปแล้ว ให้นำเข้า Excel ซ้ำ ระบบจะแก้ชื่อให้ตามเลขประจำตัว</p>
    <details class="paste">
      <summary class="small">อ่านไฟล์ไม่ได้? วางรายชื่อเป็นข้อความแทน</summary>
      <textarea id="imp-text" rows="5" placeholder="1 67219010001 นายสมชาย ใจดี ปวช.1&#10;2 67219010002 นางสาวสมหญิง รักดี ปวช.1"></textarea>
      <button type="button" class="btn sm" onclick="readPasted('${target}')">อ่านรายชื่อ</button>
    </details>
    ${imp ? vImportPreview(imp) : ''}
  </div>`;
}

// ---------- 3.10.4 หน้ารายชื่อนักเรียน ----------
function vStudents() {
  const es = S.editStudent ? stu(S.editStudent) : null;
  const editCard = es ? `
  <form class="card" onsubmit="saveStudent(event)" novalidate>
    <h2>แก้ไขข้อมูลนักเรียน</h2>
    <div class="form-grid">
      <div class="field"><label for="es-prefix">คำนำหน้า</label><select id="es-prefix">${prefixOptions(es.prefix)}</select></div>
      <div class="field"><label for="es-name">ชื่อ-นามสกุล</label><input id="es-name" value="${esc(es.name)}"></div>
      <div class="field"><label for="es-no">เลขที่</label><input id="es-no" value="${esc(es.no)}"></div>
      <div class="field"><label for="es-sid">เลขประจำตัว</label><input id="es-sid" inputmode="numeric" value="${esc(es.sid || '')}"></div>
      <div class="field"><label for="es-level">ระดับชั้น</label><select id="es-level">${levelOptions(es.level, true)}</select></div>
    </div>
    <div class="err" id="eserr" role="alert"></div>
    <div class="actions">
      <button class="btn primary">บันทึก</button>
      <button type="button" class="btn" onclick="S.editStudent=null;render()">ยกเลิก</button>
    </div>
  </form>` : '';

  const list = sortStudents(S.students);
  const shown = list.filter(stuMatch).length;
  const rows = list.map(s => {
    const use = groupsOf(s.id).map(g => 'กลุ่ม: ' + g.name).concat(subjectsOf(s.id).map(j => 'วิชา: ' + j.name)).join(' · ');
    return `
    <tr data-q="${esc(stuKey(s))}" data-level="${esc(s.level)}" ${stuMatch(s) ? '' : 'hidden'}>
      <td>${esc(s.no || '-')}</td>
      <td>${esc(s.sid || '-')}</td>
      <td>${esc(fullName(s))}</td>
      <td>${esc(s.level || '-')}</td>
      <td class="small muted">${esc(use) || '-'}</td>
      <td class="nowrap">
        <button class="btn sm" onclick="S.editStudent='${s.id}';render();window.scrollTo(0,0)">แก้ไข</button>
        <button class="btn sm danger" onclick="delStudent('${s.id}')">ลบ</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="muted">ยังไม่มีรายชื่อนักเรียน นำเข้าจากไฟล์ด้านบน หรือเพิ่มทีละคนด้านล่าง</td></tr>`;

  return `
  <div class="page-title">
    <h1>รายชื่อนักเรียน</h1>
    <span class="small muted">ทะเบียนกลาง ใช้เลือกเข้ากลุ่มโปรเจกต์และรายวิชา</span>
  </div>
  ${editCard}
  ${vImportBox('roster')}

  <div class="card">
    <div class="role-head">
      <h2 style="margin:0">นักเรียนทั้งหมด <span class="small muted" id="stu-count">${shown} / ${S.students.length} คน</span></h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input id="stu-q" class="input sm" style="width:220px" placeholder="ค้นหาชื่อ / เลขที่ / เลขประจำตัว" value="${esc(S.stuQ)}" oninput="filterStudents()">
        <select id="stu-l" class="input sm" style="width:auto" onchange="filterStudents()">
          <option value="">ทุกระดับ</option>
          ${LEVELS.map(l => `<option ${S.stuLevel === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="btn sm danger" onclick="clearStudents()" ${S.students.length ? '' : 'disabled'}>ล้างรายชื่อทั้งหมด</button>
      </div>
    </div>
    <div class="tw">
      <table style="min-width:760px">
        <thead><tr><th>เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ-นามสกุล</th><th>ระดับ</th><th>ใช้อยู่ใน</th><th></th></tr></thead>
        <tbody id="stu-body">${rows}</tbody>
      </table>
    </div>
  </div>

  <form class="card" onsubmit="addStudent(event)" novalidate>
    <h2>เพิ่มนักเรียนทีละคน</h2>
    <div class="row2">
      <div><label class="small muted" for="sa-prefix">คำนำหน้า</label><select id="sa-prefix" class="input">${prefixOptions('')}</select></div>
      <div><label class="small muted" for="sa-name">ชื่อ-นามสกุล</label><input id="sa-name" class="input" placeholder="ชื่อ-นามสกุล"></div>
      <div><label class="small muted" for="sa-no">เลขที่</label><input id="sa-no" class="input" placeholder="เช่น 5"></div>
      <div><label class="small muted" for="sa-sid">เลขประจำตัว</label><input id="sa-sid" class="input" inputmode="numeric" placeholder="เช่น 67219010001"></div>
      <div><label class="small muted" for="sa-level">ระดับชั้น</label><select id="sa-level" class="input">${levelOptions('', true)}</select></div>
      <button class="btn primary">+ เพิ่มนักเรียน</button>
    </div>
    <div class="err" id="saerr" role="alert"></div>
  </form>`;
}

// กรองรายชื่อทันทีที่พิมพ์ โดยไม่วาดหน้าใหม่ (เคอร์เซอร์จะได้ไม่หลุด)
function filterStudents() {
  S.stuQ = inp('stu-q');
  S.stuLevel = inp('stu-l');
  let n = 0;
  document.querySelectorAll('#stu-body tr[data-q]').forEach(tr => {
    const show = (!S.stuLevel || tr.dataset.level === S.stuLevel) &&
                 (!S.stuQ || tr.dataset.q.includes(nameKey(S.stuQ)));
    tr.hidden = !show;
    if (show) n++;
  });
  document.getElementById('stu-count').textContent = n + ' / ' + S.students.length + ' คน';
}

// เลขประจำตัวเก็บเฉพาะตัวเลข (ตัดช่องว่างและขีดทิ้ง)
const cleanSid = v => String(v || '').replace(/[^0-9]/g, '');

function addStudent(e) {
  e.preventDefault();
  const name = cleanName(inp('sa-name')), sid = cleanSid(inp('sa-sid'));
  if (name.length < 3) return setErr('saerr', 'กรุณากรอกชื่อ-นามสกุลอย่างน้อย 3 ตัวอักษร');
  if (findByName(name)) return setErr('saerr', 'มีชื่อนี้ในรายชื่อแล้ว (ระบบไม่เพิ่มซ้ำ)');
  if (sid && findBySid(sid)) return setErr('saerr', 'มีเลขประจำตัวนี้ในรายชื่อแล้ว (ระบบไม่เพิ่มซ้ำ)');
  S.students.push({ id: newId(), prefix: inp('sa-prefix'), name, no: inp('sa-no').trim(), sid, level: inp('sa-level') });
  toast('เพิ่มนักเรียนแล้ว');
  render();
}

function saveStudent(e) {
  e.preventDefault();
  const s = stu(S.editStudent);
  if (!s) { S.editStudent = null; return render(); }
  const name = cleanName(inp('es-name')), sid = cleanSid(inp('es-sid'));
  if (name.length < 3) return setErr('eserr', 'กรุณากรอกชื่อ-นามสกุลอย่างน้อย 3 ตัวอักษร');
  const dup = findByName(name);
  if (dup && dup.id !== s.id) return setErr('eserr', 'มีชื่อนี้ในรายชื่อแล้ว');
  const dupSid = sid ? findBySid(sid) : null;
  if (dupSid && dupSid.id !== s.id) return setErr('eserr', 'มีเลขประจำตัวนี้ในรายชื่อแล้ว');
  Object.assign(s, { prefix: inp('es-prefix'), name, no: inp('es-no').trim(), sid, level: inp('es-level') });
  S.editStudent = null;
  toast('บันทึกข้อมูลนักเรียนแล้ว');
  render();
}

function delStudent(id) {
  const s = stu(id);
  if (!s) return;
  const g = groupsOf(id).length, j = subjectsOf(id).length;
  const use = g || j ? ` เขาอยู่ใน ${g} กลุ่ม ${j} วิชา และคะแนนทั้งหมดของเขาจะถูกลบไปด้วย` : '';
  if (!confirm(`ลบ ${fullName(s)} ออกจากรายชื่อ?${use}`)) return;
  removeStudentEverywhere(id);
  if (S.editStudent === id) S.editStudent = null;
  toast('ลบนักเรียนแล้ว');
  render();
}

function clearStudents() {
  if (!S.students.length) return;
  if (!confirm(`ล้างรายชื่อนักเรียนทั้งหมด ${S.students.length} คน? สมาชิกกลุ่ม นักเรียนในวิชา และคะแนนของพวกเขาจะถูกลบทั้งหมด`)) return;
  S.students.map(s => s.id).forEach(removeStudentEverywhere);
  S.editStudent = null;
  toast('ล้างรายชื่อนักเรียนแล้ว');
  render();
}


/* ------------------------------------------------------------
   3.11 กลุ่มโปรเจกต์ (เลือกนักเรียนจากรายชื่อ)
   ------------------------------------------------------------ */

// รายการนักเรียนให้ติ๊กเลือก (ใช้ทั้งหน้ากลุ่มและหน้ารายวิชา)
//   pid = id ของกล่อง, list = นักเรียนที่เลือกได้, tagFn = ข้อความกำกับท้ายแถว, addFn = ชื่อฟังก์ชันที่เพิ่ม, ownerId = id กลุ่ม/วิชา
function vPicker(pid, list, tagFn, addFn, ownerId, emptyMsg) {
  if (!S.students.length)
    return '<p class="small muted" style="margin:10px 0 0">ยังไม่มีรายชื่อนักเรียน ไปนำเข้าที่เมนู "รายชื่อนักเรียน" ก่อน</p>';
  if (!list.length)
    return `<p class="small muted" style="margin:10px 0 0">${emptyMsg || 'นักเรียนทุกคนในรายชื่ออยู่ที่นี่แล้ว'}</p>`;
  return `
  <div id="pk-${pid}" style="margin-top:12px">
    <div class="row2">
      <div><input class="input pk-q" placeholder="ค้นหาชื่อ / เลขที่ / เลขประจำตัว" oninput="filterPick('${pid}')" onkeydown="if(event.key==='Enter')event.preventDefault()" aria-label="ค้นหานักเรียน"></div>
      <div><select class="input pk-l" onchange="filterPick('${pid}')" aria-label="กรองระดับชั้น">
        <option value="">ทุกระดับ</option>${LEVELS.map(l => `<option>${l}</option>`).join('')}</select></div>
      <div style="display:flex;gap:6px">
        <button type="button" class="btn sm" onclick="pickAll('${pid}',true)">เลือกทั้งหมดที่แสดง</button>
        <button type="button" class="btn sm" onclick="pickAll('${pid}',false)">ไม่เลือก</button>
      </div>
    </div>
    <div class="pick-list">
      ${list.map(s => `
        <label class="pick-row" data-q="${esc(stuKey(s))}" data-level="${esc(s.level)}">
          <input type="checkbox" value="${s.id}">
          <span>${esc(fullName(s))}</span>
          <span class="small muted">${esc(stuMeta(s))}${tagFn(s) ? ' · ' + esc(tagFn(s)) : ''}</span>
        </label>`).join('')}
    </div>
    ${addFn ? `<button type="button" class="btn primary" onclick="${addFn}('${ownerId}')">เพิ่มที่เลือก</button>` : ''}
  </div>`;
}

// กรองรายการติ๊กเลือกทันทีที่พิมพ์ (ไม่วาดหน้าใหม่ เพื่อไม่ให้ที่ติ๊กไว้หาย)
function filterPick(pid) {
  const box = document.getElementById('pk-' + pid);
  const q = nameKey(box.querySelector('.pk-q').value), lv = box.querySelector('.pk-l').value;
  box.querySelectorAll('.pick-row').forEach(r => {
    r.hidden = !((!lv || r.dataset.level === lv) && (!q || r.dataset.q.includes(q)));
  });
}
function pickAll(pid, on) {
  document.querySelectorAll('#pk-' + pid + ' .pick-row:not([hidden]) input').forEach(c => { c.checked = on; });
}
const pickedIds = pid => checkedVals('#pk-' + pid + ' input');
function togglePick(key) {
  S.pick = S.pick === key ? null : key;
  render();
}

// ตัวเลือกครูที่ปรึกษา: ใช้รายชื่อผู้ใช้ทั้งหมดในระบบ (แอดมิน + ผู้ประเมิน) ไม่ต้องสร้างบัญชีครูที่ปรึกษาแยก
// เก็บเป็น id ของบัญชี ดังนั้นชื่อจริงที่ผู้ใช้ตั้งตอนเข้าใช้ครั้งแรกจะมาแสดงที่นี่เองโดยอัตโนมัติ
function advisorOptions(sel) {
  const list = S.users.slice().sort((a, b) => (!!b.admin - !!a.admin) || dn(a).localeCompare(dn(b), 'th'));
  return '<option value="">— ยังไม่เลือก —</option>' + list.map(u =>
    `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(advLabel(u))}</option>`).join('');
}
const readAdvisor = id => { const v = inp(id); return v === '' ? null : Number(v); };

function vGroups() {
  const noAdv = S.users.length < 2;   // มีแต่แอดมินคนเดียว
  const cards = groupsNewest().map(g => {   // กลุ่มที่เพิ่งสร้างอยู่บนสุดเสมอ
    const members = sortStudents(g.members.map(stu).filter(Boolean));
    const adv = advisorOf(g);
    const editing = S.editGroup === g.id;

    const head = editing ? `
      <form onsubmit="saveGroup(event,'${g.id}')" style="flex:1" novalidate>
        <div class="form-grid">
          <div class="field"><label for="gn-${g.id}">ชื่อโปรเจกต์ (ภาษาไทย)</label><input id="gn-${g.id}" value="${esc(g.name)}"></div>
          <div class="field"><label for="ge-${g.id}">ชื่อโปรเจกต์ (ภาษาอังกฤษ)</label><input id="ge-${g.id}" value="${esc(g.nameEn || '')}"></div>
          <div class="field"><label for="ga-${g.id}">ครูที่ปรึกษาโครงงาน</label><select id="ga-${g.id}">${advisorOptions(g.advisorId)}</select></div>
        </div>
        <div class="err" id="gerr-${g.id}" role="alert"></div>
        <div class="actions">
          <button class="btn sm primary">บันทึก</button>
          <button type="button" class="btn sm" onclick="S.editGroup=null;render()">ยกเลิก</button>
        </div>
      </form>` : `
      <div class="proj-title">
        <h2>${esc(g.name)}</h2>
        ${g.nameEn ? `<div class="proj-en">${esc(g.nameEn)}</div>` : ''}
        <div class="proj-meta small muted">ครูที่ปรึกษา: ${adv ? `<b>${esc(advLabel(adv))}</b>` : '<span class="chip warn" style="margin-left:0">ยังไม่เลือก</span>'} · ${members.length} คน
          ${!adv && S.addAdv !== g.id ? `<button class="btn sm" style="margin-left:6px" onclick="S.addAdv='${g.id}';render()">+ เพิ่มครูที่ปรึกษา</button>` : ''}</div>
        ${!adv && S.addAdv === g.id ? `
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <select id="aa-${g.id}" class="input" style="width:auto;min-width:200px" aria-label="เลือกครูที่ปรึกษา">${advisorOptions(null)}</select>
          <button class="btn sm primary" onclick="setAdvisor('${g.id}')">บันทึก</button>
          <button class="btn sm" onclick="S.addAdv=null;render()">ยกเลิก</button>
        </div>` : ''}
      </div>
      <div class="nowrap">
        <button class="btn sm" onclick="S.editGroup='${g.id}';render()">แก้ไขข้อมูลโปรเจกต์</button>
        <button class="btn sm danger" onclick="delGroup('${g.id}')">ลบกลุ่ม</button>
      </div>`;

    const rows = members.map(m => `
      <tr>
        <td>${esc(m.no || '-')}</td>
        <td>${esc(m.sid || '-')}</td>
        <td>${esc(fullName(m))}</td>
        <td>${esc(m.level || '-')}</td>
        <td class="nowrap"><button class="btn sm danger" onclick="removeFromGroup('${g.id}','${m.id}')">นำออก</button></td>
      </tr>`).join('') || `<tr><td colspan="5" class="muted">ยังไม่มีสมาชิก กด "เลือกนักเรียนเข้ากลุ่ม" ด้านล่าง</td></tr>`;

    const key = 'g:' + g.id;
    const open = S.pick === key;
    const candidates = sortStudents(S.students.filter(s => !groupsOf(s.id).length));   // คนที่อยู่ในกลุ่มใดแล้ว ไม่ขึ้นให้เลือก
    const tag = () => '';

    return `
    <div class="card">
      <div class="role-head">${head}</div>
      <div class="tw">
        <table style="min-width:560px">
          <thead><tr><th>เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ-นามสกุล</th><th>ระดับ</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:12px">
        <button class="btn" onclick="togglePick('${key}')">${open ? 'ซ่อนรายชื่อ' : '+ เลือกนักเรียนเข้ากลุ่ม'}</button>
        ${open ? vPicker('g-' + g.id, candidates, tag, 'addToGroup', g.id, 'นักเรียนทุกคนมีกลุ่มแล้ว') : ''}
      </div>
    </div>`;
  }).join('') || '<div class="card"><p class="muted" style="margin:0">ยังไม่มีกลุ่ม ตั้งชื่อโปรเจกต์แล้วกด "+ เพิ่มกลุ่ม" ด้านบน</p></div>';

  return `
  <div class="page-title">
    <h1>กลุ่มโปรเจกต์</h1>
    <span class="small muted">${S.groups.length} กลุ่ม · ${S.groups.reduce((n, g) => n + g.members.length, 0)} คน</span>
  </div>

  <form class="card" onsubmit="addGroup(event)" novalidate>
    <h2>เพิ่มกลุ่มใหม่</h2>
    <div class="form-grid">
      <div class="field"><label for="g-name">ชื่อโปรเจกต์ (ภาษาไทย)</label><input id="g-name" placeholder="เช่น ระบบแจ้งเตือนฝนอัตโนมัติ"></div>
      <div class="field"><label for="g-en">ชื่อโปรเจกต์ (ภาษาอังกฤษ)</label><input id="g-en" placeholder="e.g. Automatic Rain Alert System"></div>
      <div class="field"><label for="g-adv">ครูที่ปรึกษาโครงงาน</label><select id="g-adv">${advisorOptions(null)}</select></div>
    </div>
    ${noAdv ? '<p class="small muted" style="margin:0 0 8px">ครูที่ปรึกษาเลือกจากรายชื่อผู้ใช้ ตอนนี้มีแค่แอดมิน เพิ่มบัญชีผู้ประเมินได้ที่เมนู "ผู้ใช้งาน" แล้วจะมาให้เลือกที่นี่</p>' : ''}
    <div class="field" style="margin-top:6px">
      <label>สมาชิกในกลุ่ม (ติ๊กเลือกนักเรียนได้เลย ไม่เลือกก็ได้ เพิ่มภายหลังได้)</label>
      ${vPicker('g-new', sortStudents(S.students.filter(s => !groupsOf(s.id).length)), () => '', null, '', 'นักเรียนทุกคนมีกลุ่มแล้ว')}
    </div>
    <div class="err" id="gerr" role="alert"></div>
    <button class="btn primary">+ เพิ่มกลุ่ม</button>
  </form>

  ${cards}`;
}

function addGroup(e) {
  e.preventDefault();
  const name = inp('g-name').trim(), nameEn = inp('g-en').trim();
  if (!name) return setErr('gerr', 'กรุณากรอกชื่อโปรเจกต์ภาษาไทย');
  if (S.groups.some(x => x.name.toLowerCase() === name.toLowerCase())) return setErr('gerr', 'มีโปรเจกต์ชื่อนี้อยู่แล้ว');
  const members = pickedIds('g-new').filter(id => stu(id) && !groupsOf(id).length);
  const g = { id: newId(), name, nameEn, advisorId: readAdvisor('g-adv'), members };
  S.groups.push(g);
  toast(members.length ? `เพิ่มกลุ่มแล้ว (สมาชิก ${members.length} คน)` : 'เพิ่มกลุ่มแล้ว');
  render();
}

function saveGroup(e, gid) {
  e.preventDefault();
  const g = groupBy(gid);
  if (!g) return;
  const name = inp('gn-' + gid).trim();
  if (!name) return setErr('gerr-' + gid, 'กรุณากรอกชื่อโปรเจกต์ภาษาไทย');
  if (S.groups.some(x => x.id !== gid && x.name.toLowerCase() === name.toLowerCase())) return setErr('gerr-' + gid, 'มีโปรเจกต์ชื่อนี้อยู่แล้ว');
  g.name = name;
  g.nameEn = inp('ge-' + gid).trim();
  g.advisorId = readAdvisor('ga-' + gid);
  S.editGroup = null;
  toast('บันทึกข้อมูลโปรเจกต์แล้ว');
  render();
}

function delGroup(gid) {
  const g = groupBy(gid);
  if (!g) return;
  if (!confirm(`ลบ "${g.name}"? คะแนนโปรเจกต์และข้อเสนอแนะของกลุ่มนี้จะถูกลบไปด้วย (รายชื่อนักเรียนยังอยู่)`)) return;
  dropPk(pkey(gid));
  delete S.feedback[gid];
  S.groups = S.groups.filter(x => x.id !== gid);
  if (S.editGroup === gid) S.editGroup = null;
  if (S.pick === 'g:' + gid) S.pick = null;
  toast('ลบกลุ่มแล้ว');
  render();
}

function addToGroup(gid) {
  const g = groupBy(gid);
  if (!g) return;
  const ids = pickedIds('g-' + gid).filter(id => stu(id) && !groupsOf(id).length);
  if (!ids.length) return toast('ยังไม่ได้ติ๊กเลือกนักเรียน');
  g.members.push(...ids);
  S.pick = null;
  toast(`เพิ่ม ${ids.length} คนเข้า "${g.name}" แล้ว`);
  render();
}

function setAdvisor(gid) {
  const g = groupBy(gid);
  if (!g) return;
  const id = readAdvisor('aa-' + gid);
  if (id === null) return toast('ยังไม่ได้เลือกครูที่ปรึกษา');
  g.advisorId = id;
  S.addAdv = null;
  toast('เพิ่มครูที่ปรึกษาแล้ว');
  render();
}

function removeFromGroup(gid, sid) {
  const g = groupBy(gid), s = stu(sid);
  if (!g || !s) return;
  if (hasMemberScores(gid, sid) && !confirm(`นำ ${fullName(s)} ออกจากกลุ่ม? คะแนนรายบุคคลที่ผู้ประเมินเคยให้คนนี้ในกลุ่มนี้จะถูกลบด้วย (คะแนนทั้งกลุ่มไม่เปลี่ยน)`)) return;
  g.members = g.members.filter(x => x !== sid);
  dropMemberScores(gid, sid);
  toast('นำออกจากกลุ่มแล้ว');
  render();
}


/* ------------------------------------------------------------
   3.12 เกณฑ์การให้คะแนนโปรเจกต์
   ------------------------------------------------------------ */
function vCriteria() {
  const list = S.criteria.map(c => `
      <div class="ind-row small">
        <span>${esc(c.name)} <span class="muted">· เต็ม ${num(c.max)} คะแนน</span></span>
        <button class="btn sm danger" onclick="delCrit('${c.id}')" aria-label="ลบเกณฑ์ ${esc(c.name)}">ลบ</button>
      </div>`).join('') || '<p class="muted">ยังไม่มีเกณฑ์</p>';

  return `
  <div class="page-title">
    <h1>เกณฑ์โปรเจกต์</h1>
    <span class="small muted">${S.criteria.length} ข้อ · รวม ${num(totalMax())} คะแนน</span>
  </div>

  <div class="card">
    <h2>เกณฑ์ทั้งหมด (${S.criteria.length})</h2>
    ${list}

    <form onsubmit="addCrit(event)" class="row2" style="margin-top:16px" novalidate>
      <div>
        <label class="small muted" for="cr-name">ชื่อเกณฑ์ใหม่</label>
        <input id="cr-name" class="input" placeholder="เช่น ความคิดสร้างสรรค์">
      </div>
      <div>
        <label class="small muted" for="cr-max">คะแนนเต็ม</label>
        <input id="cr-max" class="input" type="number" min="1" step="any" value="10">
      </div>
      <button class="btn primary">+ เพิ่มเกณฑ์</button>
    </form>
    <div class="err" id="crerr" role="alert"></div>
  </div>`;
}

function addCrit(e) {
  e.preventDefault();
  const name = inp('cr-name').trim(), max = Number(inp('cr-max'));
  if (!name)                            return setErr('crerr', 'กรุณากรอกชื่อเกณฑ์');
  if (!Number.isFinite(max) || max < 1) return setErr('crerr', 'คะแนนเต็มต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป');
  S.criteria.push({ id: newId(), name, max });
  toast('เพิ่มเกณฑ์แล้ว');
  render();
}

function delCrit(id) {
  const c = S.criteria.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`ลบเกณฑ์ "${c.name}"? คะแนนที่เคยให้ในข้อนี้จะถูกลบไปด้วย`)) return;
  S.criteria = S.criteria.filter(x => x.id !== id);
  dropCriterionScores(id);
  toast('ลบเกณฑ์แล้ว');
  render();
}


/* ------------------------------------------------------------
   3.13 ประเมินโปรเจกต์
   เลือกกลุ่ม -> กรอกคะแนนทีละเกณฑ์ (ให้ทั้งกลุ่ม ไม่ใช่รายบุคคล) -> บันทึก
   ------------------------------------------------------------ */
function setEvalGroup(gid) {
  S.evalGroup = gid;
  S.indSid = null;
  render();
  presTick();
}

// รายชื่อสมาชิกของกลุ่มแบบป้าย / หัวข้อโปรเจกต์ (ใช้ซ้ำในหลายหน้า)
function memberChips(g) {
  const ms = sortStudents(g.members.map(stu).filter(Boolean));
  return ms.length
    ? `<div class="chips">${ms.map(x => `<span class="chip gray" style="margin-left:0" title="${esc(stuMeta(x))}">${esc(fullName(x))}</span>`).join('')}</div>`
    : '<div class="small muted" style="margin-top:8px">กลุ่มนี้ยังไม่มีสมาชิก</div>';
}
function projHead(g) {
  const adv = advisorOf(g);
  return `
  <div class="proj-title">
    <h2>${esc(g.name)}</h2>
    ${g.nameEn ? `<div class="proj-en">${esc(g.nameEn)}</div>` : ''}
    <div class="proj-meta small muted">ครูที่ปรึกษา: ${adv ? `<b>${esc(advLabel(adv))}</b>` : 'ยังไม่ระบุ'} · ${g.members.length} คน</div>
  </div>`;
}

/* หน้าประเมินโปรเจกต์: ดู 3.26 (vScore ถูกย้ายไปอยู่ที่นั่น) */

// ---- ข้อเสนอแนะ: S.feedback[idกลุ่ม][idผู้ใช้] = { t: ข้อความ, at: เวลา } ----
const FB_MAX = 1000;
function setFeedback(gid, uid, t) {
  if (t) {
    if (!S.feedback[gid]) S.feedback[gid] = {};
    S.feedback[gid][uid] = { t, at: Date.now() };
  } else if (S.feedback[gid]) {
    delete S.feedback[gid][uid];
    if (!Object.keys(S.feedback[gid]).length) delete S.feedback[gid];
  }
}
function saveFeedback(e, gid, boxId) {
  e.preventDefault();
  if (!groupBy(gid)) return;
  const t = inp(boxId).trim().slice(0, FB_MAX);
  setFeedback(gid, S.uid, t);
  toast(t ? 'บันทึกข้อเสนอแนะแล้ว' : 'ลบข้อเสนอแนะของคุณแล้ว');
  render();
}
// ข้อเสนอแนะทั้งหมดของโปรเจกต์ เรียงใหม่สุดก่อน (ข้ามของบัญชีที่ถูกลบไปแล้ว)
function feedbackOf(gid) {
  const m = S.feedback[gid] || {};
  return Object.keys(m).map(k => ({ u: userById(Number(k)), t: m[k].t, at: m[k].at }))
    .filter(x => x.u && x.t).sort((a, b) => b.at - a.at);
}
function fmtTime(at) {
  try { return new Date(at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch (e) { return ''; }
}
function vFeedbackBox(gid) {
  const items = feedbackOf(gid);
  const list = items.map(it => `
    <div class="fb-item">
      <div class="fb-who"><b>${esc(dn(it.u))}</b>${(groupBy(gid) || {}).advisorId === it.u.id ? '<span class="chip gray">ครูที่ปรึกษา</span>' : it.u.admin ? '<span class="chip ok">แอดมิน</span>' : ''}
        <span class="small muted">${esc(fmtTime(it.at))}</span></div>
      <div class="fb-text">${esc(it.t)}</div>
    </div>`).join('') || '<p class="small muted" style="margin:0">ยังไม่มีข้อเสนอแนะ</p>';
  return `
  <div class="fb-box">
    <div class="topic">ข้อเสนอแนะ <span class="small muted">· ${items.length} รายการ</span></div>
    ${list}
  </div>`;
}


/* ------------------------------------------------------------
   3.14 คะแนนโปรเจกต์ทั้งหมด
   แอดมินเลือกดูได้ 2 แบบ: ทุกคน (รายกลุ่ม -> คะแนนของผู้ให้คะแนนแต่ละคน + ค่าเฉลี่ย)
   หรือเลือกผู้ประเมินทีละคน (โปรเจกต์ที่คนนั้นประเมิน + คะแนนเฉลี่ย + กลุ่ม)
   ------------------------------------------------------------ */
function setScoreView(v) {
  S.scoreView = v === 'all' ? 'all' : Number(v);
  render();
}

// ผู้ประเมิน a เคยให้คะแนนโปรเจกต์ g ไว้บ้างไหม (ทั้งกลุ่ม หรือรายบุคคลของสมาชิกคนใดคนหนึ่ง)
const touched = (aid, g) => hasAny(aid, pkey(g.id)) || g.members.some(sid => hasAny(aid, ikey(g.id, sid)));

function vScores() {
  const title = '<div class="page-title"><h1>คะแนนโปรเจกต์ทั้งหมด</h1></div>';
  if (!S.groups.length || !S.criteria.length)
    return `${title}<div class="card"><p class="muted" style="margin:0">ต้องมีกลุ่มและเกณฑ์การให้คะแนนก่อน</p></div>`;

  const assessors = scorers();
  if (S.scoreView !== 'all' && !assessors.some(a => a.id === S.scoreView)) S.scoreView = 'all';
  const who = S.scoreView === 'all' ? null : userById(S.scoreView);

  // ตัวเลือกด้านบน: ดูของทุกคน หรือเลือกดูทีละผู้ประเมิน
  const picker = `
  <div class="card">
    <label for="sv-sel">เลือกดูคะแนนของผู้ประเมิน</label>
    <select id="sv-sel" onchange="setScoreView(this.value)">
      <option value="all" ${who ? '' : 'selected'}>ทุกคน · ภาพรวมค่าเฉลี่ยของแต่ละกลุ่ม</option>
      ${assessors.map(a => {
        const n = S.groups.filter(g => touched(a.id, g)).length;
        return `<option value="${a.id}" ${who && who.id === a.id ? 'selected' : ''}>${esc(dn(a))} · ประเมินแล้ว ${n}/${S.groups.length} กลุ่ม</option>`;
      }).join('')}
    </select>
  </div>`;

  return title + picker + vSummary(who) + (who ? vScoresOf(who) : vScoresAll(assessors));
}

const critHeads = cls => S.criteria.map(c => `<th${cls ? ` class="${cls}"` : ''}>${esc(c.name)}<div class="small muted">/${num(c.max)}</div></th>`).join('');

// เลื่อนไปที่การ์ดรายละเอียดของโปรเจกต์ (กดจากแถวในตารางสรุป) แล้วให้การ์ดเรืองแสงครู่หนึ่ง
const calmMotion = () => document.documentElement.dataset.motion === 'reduced' || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function jumpToProject(gid) {
  const el = document.getElementById('prj-' + gid);
  if (!el) return toast('ยังไม่มีรายละเอียดของโปรเจกต์นี้');
  el.scrollIntoView({ behavior: calmMotion() ? 'auto' : 'smooth', block: 'start' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1900);
}
function jumpToSummary() {
  const el = document.getElementById('sum-card');
  if (el) el.scrollIntoView({ behavior: calmMotion() ? 'auto' : 'smooth', block: 'start' });
}
const ARROW_DOWN = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
const projBtns = gid => `<span class="card-btns no-print"><button type="button" class="btn sm" onclick="printProjects('${gid}')">พิมพ์ใบสรุป</button>${backBtn()}</span>`;
const backBtn = () => `<button type="button" class="btn sm sum-back" onclick="jumpToSummary()">↑ ตารางสรุป</button>`;

// ตารางสรุป: 1 โปรเจกต์ = 1 บรรทัด  [ชื่อโปรเจกต์ · ชื่อภาษาอังกฤษ · ผู้จัดทำ (พร้อมคะแนนเฉลี่ยรายบุคคล) · คะแนนเฉลี่ยของกลุ่ม]
// กดที่แถวเพื่อเลื่อนไปดูรายละเอียดของโปรเจกต์นั้นด้านล่าง
// a = ผู้ประเมินคนเดียว (null = เฉลี่ยจากผู้ประเมินทุกคน)
function vSummary(a) {
  const stat = pk => (a ? givenAvg(a.id, pk) : groupAvg(pk));
  const rows = groupsNewest().map((g, i) => {
    const pk = pkey(g.id), r = stat(pk);
    const ms = membersOf(g);
    const mem = ms.length
      ? ms.map(m => {
          const x = stat(ikey(g.id, m.id)), mr = x ? riskOf(pctOfAvg(x)) : '';
          return `<span class="chip gray mem${mr ? ' rk-' + mr : ''}" title="${esc(stuMeta(m))}${mr ? ' · ' + RISK_TXT[mr] : ''}">${esc(fullName(m))}${x ? ` · <b>${fmt(x.avg)}</b>` : ''}</span>`;
        }).join('')
      : '<span class="small muted">ยังไม่มีสมาชิก</span>';
    const rk = riskOf(pctOfAvg(r));
    const note = a ? (r && r.n < S.criteria.length ? `ให้แล้ว ${r.n}/${S.criteria.length} ข้อ` : '') : `ประเมินแล้ว ${scoredBy(pk)} คน`;
    const go = a ? touched(a.id, g) : true;   // มีการ์ดรายละเอียดให้เลื่อนไปหาไหม
    const rc = rk ? ' risk-' + rk : '';
    const attrs = go
      ? ` class="sum-row${rc}" tabindex="0" role="link" aria-label="ไปที่โปรเจกต์ ${esc(g.name)}" onclick="jumpToProject('${g.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();jumpToProject('${g.id}')}"`
      : (rc ? ` class="${rc.trim()}"` : '');
    return `
      <tr${attrs}>
        <td class="c sum-no">${i + 1}</td>
        <td class="sum-name"><b>${esc(g.name)}</b></td>
        <td class="sum-en">${g.nameEn ? esc(g.nameEn) : '<span class="muted">–</span>'}</td>
        <td><div class="chips sum-mem">${mem}</div></td>
        <td class="c nowrap sum-avgcell">
          ${r ? `<b class="sum-avg">${fmt(r.avg)}</b><div class="small muted">เต็ม ${num(r.max)}</div>${rk ? `<div>${riskTag(rk)}</div>` : ''}` : '<span class="muted">–</span>'}
          ${note ? `<div class="small muted">${note}</div>` : ''}
        </td>
        <td class="sum-goc">${go ? `<span class="sum-go">${ARROW_DOWN}</span>` : ''}</td>
      </tr>`;
  }).join('');

  return `
  <div class="card" id="sum-card">
    <div class="role-head no-print">
      <h2 style="margin:0">สรุปทุกโปรเจกต์${a ? ` · คะแนนที่ ${esc(dn(a))} ให้` : ''}</h2>
      <div class="card-btns">
        <button type="button" class="btn sm" onclick="exportSummary('${a ? a.id : 'all'}')">ดาวน์โหลด Excel</button>
        <button type="button" class="btn sm" onclick="printProjects()">พิมพ์ใบสรุปคะแนนรายโปรเจกต์</button>
      </div>
    </div>
    <p class="small muted" style="margin:0 0 10px">สีส้ม/แดง = ใกล้เกณฑ์/ต่ำกว่าเกณฑ์ผ่าน ${passPct()}% · 1 โปรเจกต์ต่อ 1 บรรทัด · กดที่แถวเพื่อเลื่อนไปดูรายละเอียดของโปรเจกต์นั้น · "คะแนนเฉลี่ยกลุ่ม" คือคะแนนที่ให้ทั้งกลุ่ม · ตัวเลขหลังชื่อสมาชิกคือคะแนนเฉลี่ยรายบุคคล (แสดงเมื่อมีการประเมินรายบุคคลแล้ว)</p>
    <div class="tw">
      <table class="sum" style="min-width:780px">
        <thead><tr><th class="c">#</th><th>โปรเจกต์</th><th>ชื่อภาษาอังกฤษ</th><th>ผู้จัดทำ</th><th class="c">คะแนนเฉลี่ยกลุ่ม</th><th class="sum-goc"></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ตารางคะแนนรายบุคคลของโปรเจกต์ g  (a = ผู้ประเมินคนเดียว / null = เฉลี่ยจากทุกคน)
function vIndTable(g, a) {
  const ms = membersOf(g);
  if (!ms.length || !S.criteria.length) return '';
  const stat = pk => (a ? givenAvg(a.id, pk) : groupAvg(pk));
  const head = `<div class="topic" style="margin-top:18px">คะแนนรายบุคคล${a ? '' : ' <span class="small muted">· เฉลี่ยจากผู้ประเมินทุกคน</span>'}</div>`;
  if (!ms.some(m => stat(ikey(g.id, m.id))))
    return `${head}<p class="small muted" style="margin:0">ยังไม่มี${a ? 'การ' : 'ผู้'}ประเมินรายบุคคล</p>`;

  const rows = ms.map(m => {
    const pk = ikey(g.id, m.id), r = stat(pk);
    const cells = S.criteria.map(c => a
      ? `<td class="c" data-label="${esc(c.name)}">${scoreCell(getScore(a.id, pk, c.id))}</td>`
      : `<td class="c" data-label="${esc(c.name)}"><i>${fmt(avgOf(pk, c.id))}</i></td>`).join('');
    const rk = riskOf(pctOfAvg(r));
    return `
      <tr${rk ? ` class="risk-${rk}"` : ''}>
        <td class="nm">${esc(fullName(m))}${riskTag(rk)}<div class="small muted">${esc(m.sid || '-')}</div></td>
        ${cells}
        <td class="c" data-label="เฉลี่ย">${r ? `<b>${fmt(r.avg)}</b>` : '<span class="muted">–</span>'}</td>
        ${a ? '' : `<td class="c small muted" data-label="ประเมินแล้ว">${scoredBy(pk)} คน</td>`}
      </tr>`;
  }).join('');
  return `
  ${head}
  <div class="tw">
    <table class="stack" style="min-width:560px">
      <thead><tr><th>สมาชิก</th>${critHeads('c')}<th class="c">เฉลี่ย<div class="small muted">/${num(avgMaxAll())}</div></th>${a ? '' : '<th class="c">ประเมินแล้ว</th>'}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// มุมมอง "ทุกคน": รายกลุ่ม (ใหม่สุดอยู่บน) -> คะแนนของผู้ให้คะแนนแต่ละคน + ค่าเฉลี่ยของกลุ่ม + คะแนนรายบุคคล
function vScoresAll(assessors) {
  return groupsNewest().map(g => {
    const pk = pkey(g.id);
    const rows = assessors.map(a => {
      const r = givenAvg(a.id, pk);
      return `
      <tr>
        <td>${esc(dn(a))}</td>
        ${S.criteria.map(c => `<td>${scoreCell(getScore(a.id, pk, c.id))}</td>`).join('')}
        <td>${r ? `<b>${fmt(r.avg)}</b>` : '<span class="muted">–</span>'}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="${S.criteria.length + 2}" class="muted">ยังไม่มีผู้ให้คะแนน</td></tr>`;

    // แถวค่าเฉลี่ย: รวมเฉพาะคนที่ให้คะแนนข้อนั้นแล้ว
    const avgCells = S.criteria.map(c => `<td><i>${fmt(avgOf(pk, c.id))}</i></td>`).join('');
    const ga = groupAvg(pk);

    return `
    <div class="card" id="prj-${g.id}">
      <div class="card-top">${projHead(g)}${projBtns(g.id)}</div>
      ${memberChips(g)}
      <div class="topic" style="margin-top:18px">คะแนนทั้งกลุ่ม</div>
      <div class="tw">
        <table style="min-width:560px">
          <thead><tr><th>ผู้ให้คะแนน</th>${critHeads()}<th>เฉลี่ย<div class="small muted">/${num(avgMaxAll())}</div></th></tr></thead>
          <tbody>
            ${rows}
            <tr><td><b>ค่าเฉลี่ยทุกคน</b></td>${avgCells}<td><b>${fmt(ga ? ga.avg : null)}</b></td></tr>
          </tbody>
        </table>
      </div>
      <div class="sumbox">
        <div><b>${fmt(ga ? ga.avg : null)}</b><span class="small muted">คะแนนเฉลี่ยของกลุ่ม (เต็ม ${num(avgMaxAll())}) · ประเมินแล้ว ${scoredBy(pk)} คน</span></div>
      </div>
      ${vIndTable(g, null)}
      ${vFeedbackBox(g.id)}
    </div>`;
  }).join('');
}

// มุมมอง "ผู้ประเมินคนเดียว": โปรเจกต์ที่คนนั้นประเมิน + คะแนนเฉลี่ยที่เขาให้ + กลุ่ม (สมาชิก) + คะแนนรายบุคคลที่เขาให้
function vScoresOf(a) {
  const groups = groupsNewest();
  const done = groups.filter(g => touched(a.id, g));
  const todo = groups.filter(g => !touched(a.id, g));
  const avgs = done.map(g => givenAvg(a.id, pkey(g.id))).filter(Boolean);
  const mean = avgs.length ? avgs.reduce((sum, r) => sum + r.avg, 0) / avgs.length : null;

  const head = `
  <div class="card proj-card">
    <div class="proj-label">ผู้ประเมิน</div>
    <h2 class="proj-name">${esc(dn(a))}${a.id === S.uid ? ' <span class="chip gray">คุณ</span>' : ''}</h2>
    <div class="proj-meta small muted">${esc(rankText(a))}</div>
    <div class="sumbox">
      <div><b>${done.length}/${groups.length}</b><span class="small muted">โปรเจกต์ที่ประเมินแล้ว</span></div>
      <div><b>${fmt(mean)}</b><span class="small muted">คะแนนเฉลี่ยที่ ${esc(dn(a))} ให้ทั้งกลุ่ม (เต็ม ${num(avgMaxAll())})</span></div>
    </div>
  </div>`;

  const cards = done.map(g => {
    const pk = pkey(g.id), r = givenAvg(a.id, pk);
    const fb = (S.feedback[g.id] || {})[a.id];
    const groupPart = r ? `
      <div class="topic" style="margin-top:18px">คะแนนทั้งกลุ่ม</div>
      <div class="tw">
        <table style="min-width:520px">
          <thead><tr><th>ผู้ให้คะแนน</th>${critHeads()}<th>เฉลี่ย<div class="small muted">/${num(r.max)}</div></th></tr></thead>
          <tbody><tr>
            <td>${esc(dn(a))}</td>
            ${S.criteria.map(c => `<td>${scoreCell(getScore(a.id, pk, c.id))}</td>`).join('')}
            <td><b>${fmt(r.avg)}</b></td>
          </tr></tbody>
        </table>
      </div>
      <div class="sumbox">
        <div><b>${fmt(r.avg)}</b><span class="small muted">คะแนนเฉลี่ยที่ ${esc(dn(a))} ให้โปรเจกต์นี้ (เต็ม ${num(r.max)})${r.n < S.criteria.length ? ` · ให้แล้ว ${r.n}/${S.criteria.length} ข้อ` : ''}</span></div>
      </div>`
      : `<p class="small muted" style="margin:14px 0 0">${esc(dn(a))} ยังไม่ได้ประเมินทั้งกลุ่ม (ประเมินเฉพาะรายบุคคล)</p>`;
    return `
    <div class="card" id="prj-${g.id}">
      <div class="card-top">${projHead(g)}${projBtns(g.id)}</div>
      ${memberChips(g)}
      ${groupPart}
      ${vIndTable(g, a)}
      ${fb && fb.t ? `
      <div class="fb-box">
        <div class="topic">ข้อเสนอแนะของ ${esc(dn(a))}</div>
        <div class="fb-item">
          <div class="fb-who"><span class="small muted">${esc(fmtTime(fb.at))}</span></div>
          <div class="fb-text">${esc(fb.t)}</div>
        </div>
      </div>` : ''}
    </div>`;
  }).join('') || `<div class="card"><p class="muted" style="margin:0">${esc(dn(a))} ยังไม่ได้ประเมินโปรเจกต์ใดเลย</p></div>`;

  const rest = todo.length ? `
  <div class="card">
    <h2>ยังไม่ได้ประเมิน (${todo.length})</h2>
    <div class="chips">${todo.map(g => `<span class="chip gray" style="margin-left:0">${esc(gTitle(g))}</span>`).join('')}</div>
  </div>` : '';

  return head + cards + rest;
}

/* ------------------------------------------------------------
   3.15 รายวิชา (ตารางคะแนนแบบกระดาษเช็คชื่อ)
   แถว = นักเรียน, คอลัมน์ = งานแต่ละชิ้น, ช่อง = คะแนน (พิมพ์แล้วบันทึกอัตโนมัติ)
   ------------------------------------------------------------ */
function vSubjects() {
  const manage = can('subject'), enter = can('scoreSubject');
  const title = '<div class="page-title no-print"><h1>รายวิชา</h1></div>';

  const addCard = manage ? `
  <form class="card no-print" onsubmit="addSubject(event)" novalidate>
    <h2>เพิ่มวิชาใหม่</h2>
    <div class="row-add">
      <div><label class="small muted" for="sj-name">ชื่อวิชา</label><input id="sj-name" class="input" placeholder="เช่น การเขียนโปรแกรมเบื้องต้น"></div>
      <div class="actions" style="margin:0">
        <button class="btn primary">+ เพิ่มวิชา</button>
        ${S.subjects.length ? '<button type="button" class="btn" onclick="S.addSubj=false;render()">ยกเลิก</button>' : ''}
      </div>
    </div>
    <div class="err" id="sjerr" role="alert"></div>
  </form>` : '';

  if (!S.subjects.length)
    return title + addCard + `<div class="card no-print"><p class="muted" style="margin:0">ยังไม่มีรายวิชา${manage ? '' : ' รอผู้ที่มีสิทธิ์จัดการรายวิชาสร้างวิชาก่อน'}</p></div>`;

  if (!subjBy(S.subjectId)) S.subjectId = S.subjects[0].id;
  const j = subjBy(S.subjectId);

  // เลือกวิชา + ปุ่มจัดการวิชา
  const selector = `
  <div class="card no-print">
    <div class="role-head subj-bar">
      <div style="flex:1;min-width:220px">
        <label for="sj-sel">เลือกวิชา</label>
        <select id="sj-sel" onchange="setSubject(this.value)">
          ${S.subjects.map(x => `<option value="${x.id}" ${x.id === j.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
        </select>
      </div>
      ${manage ? `<div class="nowrap subj-actions">
        <button class="btn sm primary" onclick="openAddSubject()">+ เพิ่มวิชา</button>
        <button class="btn sm" onclick="S.editSubject=true;S.addSubj=false;render()">แก้ไขชื่อวิชา</button>
        <button class="btn sm danger" onclick="delSubject('${j.id}')">ลบวิชา</button>
      </div>` : ''}
    </div>
    ${S.editSubject && manage ? `
    <form onsubmit="saveSubjectName(event)" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px" novalidate>
      <input id="sjn" class="input" value="${esc(j.name)}" aria-label="ชื่อวิชา" style="flex:1;min-width:200px">
      <button class="btn sm primary">บันทึก</button>
      <button type="button" class="btn sm" onclick="S.editSubject=false;render()">ยกเลิก</button>
    </form>` : ''}
  </div>`;

  // ส่วนจัดการ (เฉพาะผู้มีสิทธิ์จัดการรายวิชา): นำเข้ารายชื่อ / เลือกจากทะเบียน / เพิ่มงาน
  const key = 's:' + j.id;
  const open = S.pick === key;
  const candidates = sortStudents(S.students.filter(s => !j.students.includes(s.id)));
  const manageCards = manage ? `
  ${vImportBox(key)}
  <div class="card no-print">
    <h2>หรือเลือกนักเรียนเข้าวิชาจากรายชื่อที่มีอยู่</h2>
    <button class="btn" onclick="togglePick('${key}')">${open ? 'ซ่อนรายชื่อ' : '+ เลือกจากรายชื่อนักเรียน'}</button>
    ${open ? vPicker('s-' + j.id, candidates, () => '', 'addToSubject', j.id) : ''}
  </div>
  <form class="card no-print" onsubmit="addWork(event)" novalidate>
    <h2>เพิ่มงาน / ช่องคะแนน</h2>
    <div class="row2">
      <div><label class="small muted" for="wk-name">ชื่องาน</label><input id="wk-name" class="input" placeholder="เช่น ใบงานที่ 1, สอบกลางภาค"></div>
      <div><label class="small muted" for="wk-max">คะแนนเต็ม</label><input id="wk-max" class="input" type="number" min="1" step="any" value="10"></div>
      <button class="btn primary">+ เพิ่มงาน</button>
    </div>
    <div class="err" id="wkerr" role="alert"></div>
    <div class="topic" style="margin-top:6px">งานที่เพิ่มแล้ว <span class="small muted">· ${j.works.length} งาน${j.works.length ? ' · รวม ' + num(workMax(j)) + ' คะแนน' : ''}</span></div>
    ${j.works.length ? `<div class="work-list">${j.works.map(w => `
      <div class="work-item">
        <span class="nm">${esc(w.name)}</span>
        <span class="mx">เต็ม ${num(w.max)}</span>
        <button type="button" class="btn sm danger" aria-label="ลบงาน ${esc(w.name)}" onclick="delWork('${w.id}')">ลบ</button>
      </div>`).join('')}</div>`
      : '<p class="small muted" style="margin:0">ยังไม่มีงาน กรอกชื่องานกับคะแนนเต็มด้านบนแล้วกด "+ เพิ่มงาน"</p>'}
  </form>` : '';

  // ตารางคะแนน
  const students = sortStudents(j.students.map(stu).filter(Boolean));
  const works = j.works;
  const head = works.map(w => `
    <th>${esc(w.name)}<div class="small muted">/${num(w.max)}</div>
      ${enter && students.length ? `<button type="button" class="colfill no-print" title="เติมคะแนนเดียวกันให้ทุกคนที่ช่องยังว่างในงานนี้" aria-label="เติมคะแนนทั้งคอลัมน์ ${esc(w.name)}" onclick="fillWork('${w.id}')">เติม</button>` : ''}
      ${manage ? `<button class="x no-print" title="ลบงานนี้" aria-label="ลบงาน ${esc(w.name)}" onclick="delWork('${w.id}')">×</button>` : ''}</th>`).join('');

  const rows = students.map((s, i) => { const rk = subjRisk(j, s.id); return `
    <tr id="sr-${s.id}"${rk ? ` class="risk-${rk}"` : ''}>
      <td class="c">${i + 1}</td>
      <td class="c">${esc(s.no || '')}</td>
      <td class="c">${esc(s.sid || '')}</td>
      <td>${esc(fullName(s))}<span id="rk-${s.id}">${riskTag(rk)}</span></td>
      <td class="c">${esc(s.level || '')}</td>
      ${works.map(w => {
        const v = getWork(j, s.id, w.id);
        return `<td class="c"><input class="cell" type="number" min="0" max="${w.max}" step="any" inputmode="decimal"
                  data-s="${s.id}" data-w="${w.id}" value="${v === undefined ? '' : v}" ${enter ? '' : 'disabled'}
                  aria-label="คะแนน ${esc(fullName(s))} ${esc(w.name)}"
                  onfocus="this.dataset.o=this.value;this.select();this.dataset.fs=1" onmouseup="if(this.dataset.fs){event.preventDefault();this.dataset.fs=''}" oninput="liveWork(this)" onchange="setWork(this)" onkeydown="cellKey(event,this)" onpaste="pasteWork(event,this)"></td>`;
      }).join('')}
      <td class="c"><b id="tot-${s.id}">${num(workTotal(j, s.id))}</b></td>
      ${manage ? `<td class="c no-print"><button class="x" title="นำออกจากวิชา" aria-label="นำ ${esc(fullName(s))} ออกจากวิชา" onclick="removeFromSubject('${s.id}')">×</button></td>` : ''}
    </tr>`; }).join('');

  const riskN = students.filter(s => subjRisk(j, s.id) === 'bad').length, nearN = students.filter(s => subjRisk(j, s.id) === 'warn').length;
  const riskNote = `<div id="sj-risk">${riskNoteHtml(riskN, nearN, students.length && works.length)}</div>`;

  const foot = students.length && works.length ? `
    <tfoot><tr>
      <td colspan="5">ค่าเฉลี่ย</td>
      ${works.map(w => `<td id="avg-${w.id}">${fmt(avgWork(j, w.id))}</td>`).join('')}
      <td>–</td>${manage ? '<td class="no-print"></td>' : ''}
    </tr></tfoot>` : '';

  const printed = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  let sheet;
  if (!students.length) {
    sheet = `<p class="muted" style="margin:0">ยังไม่มีนักเรียนในวิชานี้${manage ? ' โยนไฟล์รายชื่อหรือเลือกจากรายชื่อด้านบนได้เลย' : ''}</p>`;
  } else {
    sheet = `
    ${!works.length ? `<p class="muted no-print" style="margin:0 0 10px">ยังไม่มีงาน${manage ? ' เพิ่มงานได้ที่ช่อง "เพิ่มงาน / ช่องคะแนน" ด้านบน' : ''}</p>` : ''}
    <div class="tw sheet-wrap">
      <table class="sheet">
        <thead><tr>
          <th style="width:44px">ที่</th><th style="width:60px">เลขที่</th><th style="width:116px">เลขประจำตัว</th><th style="text-align:left">ชื่อ-นามสกุล</th><th style="width:70px">ระดับ</th>
          ${head}
          <th>รวม<div class="small muted">/${num(workMax(j))}</div></th>${manage ? '<th class="no-print"></th>' : ''}
        </tr></thead>
        <tbody>${rows}</tbody>
        ${foot}
      </table>
    </div>`;
  }

  return `
  ${title}
  ${selector}
  ${S.addSubj && manage ? addCard : ''}
  ${manageCards}
  <div class="card">
    <div class="print-only"><h2 style="margin:0">ตารางคะแนนวิชา ${esc(j.name)}</h2><div class="small">พิมพ์เมื่อ ${printed}</div></div>
    <div class="role-head no-print">
      <h2 style="margin:0">ตารางคะแนน: ${esc(j.name)} <span class="small muted">· ${students.length} คน · ${works.length} งาน</span></h2>
      <div class="card-btns"><button class="btn sm" onclick="exportSubject()">ดาวน์โหลด Excel</button><button class="btn sm" onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div>
    </div>
    <p class="small muted no-print" style="margin:0 0 10px">${enter ? 'พิมพ์แล้วบันทึกและคิดรวมให้ทันที · Enter/↓ ลงแถวถัดไป · ←→ ไปงานข้างๆ · Esc ยกเลิก · วางคะแนนที่ก๊อปจาก Excel ได้ทั้งคอลัมน์ · ปุ่ม "เติม" ใส่คะแนนเดียวกันให้ทุกคนที่ยังว่าง' : 'คุณดูได้อย่างเดียว ถ้าต้องการกรอกคะแนนให้ขอยศที่มีสิทธิ์ "กรอกคะแนนรายวิชา" จากแอดมิน'}</p>
    ${riskNote}
    ${sheet}
  </div>`;
}

function addSubject(e) {
  e.preventDefault();
  const name = inp('sj-name').trim();
  if (!name) return setErr('sjerr', 'กรุณากรอกชื่อวิชา');
  if (S.subjects.some(x => x.name.toLowerCase() === name.toLowerCase())) return setErr('sjerr', 'มีวิชาชื่อนี้อยู่แล้ว');
  const j = { id: newId(), name, students: [], works: [], scores: {} };
  S.subjects.push(j);
  S.subjectId = j.id;
  S.addSubj = false;
  S.pick = null;
  S.imp = null;
  toast('เพิ่มวิชาแล้ว โยนไฟล์รายชื่อนักเรียนเข้าวิชาได้เลย');
  render();
}

// กดปุ่ม "+ เพิ่มวิชา" ที่ตัวเลือกวิชา: เปิดฟอร์มเพิ่มวิชาใหม่ แล้วให้เคอร์เซอร์ไปรออยู่ที่ช่องชื่อวิชา
function openAddSubject() {
  S.addSubj = true; S.editSubject = false;
  render();
  const el = document.getElementById('sj-name');
  if (el) el.focus({ preventScroll: true });
}

function setSubject(id) {
  S.subjectId = id;
  S.editSubject = false; S.addSubj = false;
  S.pick = null;
  S.imp = null;
  render();
}

function saveSubjectName(e) {
  e.preventDefault();
  const j = subjBy(S.subjectId);
  const name = inp('sjn').trim();
  if (!j) return;
  if (!name) return toast('กรุณากรอกชื่อวิชา');
  j.name = name;
  S.editSubject = false;
  toast('แก้ไขชื่อวิชาแล้ว');
  render();
}

function delSubject(id) {
  const j = subjBy(id);
  if (!j) return;
  if (!confirm(`ลบวิชา "${j.name}"? รายชื่อนักเรียนในวิชา งาน และคะแนนทั้งหมดของวิชานี้จะถูกลบ (ทะเบียนนักเรียนยังอยู่)`)) return;
  S.subjects = S.subjects.filter(x => x.id !== id);
  S.subjectId = null;
  S.editSubject = false; S.addSubj = false;
  S.pick = null;
  S.imp = null;
  toast('ลบวิชาแล้ว');
  render();
}

function addWork(e) {
  e.preventDefault();
  const j = subjBy(S.subjectId);
  if (!j) return;
  const name = inp('wk-name').trim(), max = Number(inp('wk-max'));
  if (!name)                            return setErr('wkerr', 'กรุณากรอกชื่องาน');
  if (!Number.isFinite(max) || max < 1) return setErr('wkerr', 'คะแนนเต็มต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป');
  j.works.push({ id: newId(), name, max });
  toast('เพิ่มงานแล้ว');
  render();
  const nx = document.getElementById('wk-name');   // เคอร์เซอร์กลับไปรอที่ช่องชื่องาน จะได้เพิ่มงานต่อเนื่องได้เลย
  if (nx) nx.focus({ preventScroll: true });
}

function delWork(wid) {
  const j = subjBy(S.subjectId);
  const w = j && j.works.find(x => x.id === wid);
  if (!w) return;
  if (!confirm(`ลบงาน "${w.name}"? คะแนนของงานนี้ทุกคนจะถูกลบ`)) return;
  j.works = j.works.filter(x => x.id !== wid);
  Object.keys(j.scores).forEach(sid => { delete j.scores[sid][wid]; });
  toast('ลบงานแล้ว');
  render();
}

function addToSubject(jid) {
  const j = subjBy(jid);
  if (!j) return;
  const ids = pickedIds('s-' + jid).filter(id => stu(id) && !j.students.includes(id));
  if (!ids.length) return toast('ยังไม่ได้ติ๊กเลือกนักเรียน');
  j.students.push(...ids);
  S.pick = null;
  toast(`เพิ่ม ${ids.length} คนเข้าวิชา "${j.name}" แล้ว`);
  render();
}

function removeFromSubject(sid) {
  const j = subjBy(S.subjectId), s = stu(sid);
  if (!j || !s) return;
  const scored = j.scores[sid] && Object.keys(j.scores[sid]).length;
  if (scored && !confirm(`นำ ${fullName(s)} ออกจากวิชานี้? คะแนนของเขาในวิชานี้จะถูกลบ`)) return;
  j.students = j.students.filter(x => x !== sid);
  delete j.scores[sid];
  toast('นำออกจากวิชาแล้ว');
  render();
}

// พิมพ์คะแนนในช่องแล้วออกจากช่อง = บันทึกเลย (ไม่วาดหน้าใหม่ เพื่อไม่ให้เคอร์เซอร์หลุดจากตาราง)
// ใส่คะแนน 1 ช่อง (ไม่บันทึก/ไม่วาดใหม่) คืน true ถ้าค่าใช้ได้
function putWork(j, sid, w, raw) {
  raw = String(raw).trim();
  if (raw === '') { if (j.scores[sid]) delete j.scores[sid][w.id]; return true; }
  const v = Number(raw.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0 || v > w.max) return false;
  if (!j.scores[sid]) j.scores[sid] = {};
  j.scores[sid][w.id] = round2(v);
  return true;
}
const cellCtx = el => { const j = subjBy(S.subjectId), w = j && j.works.find(x => x.id === el.dataset.w); return j && w ? { j, w, sid: el.dataset.s } : null; };
// ขณะพิมพ์: ค่าถูกต้อง = บันทึกและอัปเดตรวม/เกณฑ์ทันที · ค่าเกินคะแนนเต็ม = ช่องเป็นสีแดง (ยังไม่บันทึก)
function liveWork(el) {
  const x = cellCtx(el);
  if (!x || !can('scoreSubject')) return;
  if (el.validity && el.validity.badInput) return;   // กำลังพิมพ์ค้าง เช่น "7." ยังไม่ต้องทำอะไร
  const ok = putWork(x.j, x.sid, x.w, el.value);
  el.classList.toggle('bad', !ok);
  el.title = ok ? '' : `ต้องอยู่ระหว่าง 0 ถึง ${num(x.w.max)}`;
  if (!ok) return;
  save();
  refreshSheet(x.j);
}
// ออกจากช่อง: ค่าผิดให้คืนค่าเดิมและเตือน
function setWork(el) {
  const x = cellCtx(el);
  if (!x || !can('scoreSubject')) return;
  if ((el.validity && el.validity.badInput) || !putWork(x.j, x.sid, x.w, el.value)) {
    toast(`คะแนน "${x.w.name}" ต้องอยู่ระหว่าง 0 ถึง ${num(x.w.max)}`);
    cellUndo(el, x);   // คืนค่าก่อนเริ่มพิมพ์ช่องนี้
  }
  el.classList.remove('bad'); el.title = '';
  save();
  refreshSheet(x.j);
}
// คืนค่าของช่องกลับเป็นค่าตอนเริ่มกดเข้าช่อง (ใช้ตอนพิมพ์ค่าผิด หรือกด Esc)
function cellUndo(el, x) {
  const o = el.dataset.o !== undefined ? el.dataset.o : (getWork(x.j, x.sid, x.w.id) ?? '');
  putWork(x.j, x.sid, x.w, o);
  el.value = o;
  el.classList.remove('bad'); el.title = '';
}
// วางคะแนนจาก Excel / Google Sheets: หลายบรรทัด = ลงแถวถัดไป · คั่นด้วย Tab = งานถัดไปทางขวา
function pasteWork(e, el) {
  const txt = (e.clipboardData || window.clipboardData).getData('text');
  if (!/[\t\n]/.test(txt.trim())) return;   // ค่าเดียว ให้เบราว์เซอร์วางตามปกติ
  e.preventDefault();
  const x = cellCtx(el);
  if (!x || !can('scoreSubject')) return;
  const rows = txt.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(r => r.split('\t'));
  const sids = [...document.querySelectorAll('input.cell[data-w="' + el.dataset.w + '"]')].map(c => c.dataset.s);
  const wids = x.j.works.map(w => w.id);
  const r0 = sids.indexOf(x.sid), c0 = wids.indexOf(x.w.id);
  let n = 0, bad = 0, cut = 0;
  rows.forEach((cols, ri) => cols.forEach((val, ci) => {
    const sid = sids[r0 + ri], w = x.j.works[c0 + ci];
    if (!sid || !w) { if (val.trim() !== '') cut++; return; }
    if (putWork(x.j, sid, w, val)) n++; else bad++;
  }));
  save();
  render();
  toast(`วางคะแนนแล้ว ${n} ช่อง` + (bad ? ` · ข้าม ${bad} ช่องที่ไม่ใช่ตัวเลขหรือเกินคะแนนเต็ม` : '') + (cut ? ` · เกินตาราง ${cut} ช่อง` : ''));
}
// ปุ่ม "เติม" ที่หัวคอลัมน์: ใส่คะแนนเดียวกันให้ทุกคนที่ช่องยังว่าง
function fillWork(wid) {
  const j = subjBy(S.subjectId), w = j && j.works.find(x => x.id === wid);
  if (!j || !w || !can('scoreSubject')) return;
  const empty = j.students.filter(sid => stu(sid) && getWork(j, sid, wid) === undefined);
  if (!empty.length) return toast(`ทุกคนมีคะแนน "${w.name}" แล้ว`);
  const raw = prompt(`เติมคะแนน "${w.name}" (เต็ม ${num(w.max)}) ให้ ${empty.length} คนที่ช่องยังว่าง\nใส่คะแนนที่ต้องการ:`, String(w.max));
  if (raw === null) return;
  if (String(raw).trim() === '' || !putWork(j, empty[0], w, raw)) return toast(`คะแนนต้องอยู่ระหว่าง 0 ถึง ${num(w.max)}`);
  empty.forEach(sid => putWork(j, sid, w, raw));
  save();
  render();
  toast(`เติมคะแนน "${w.name}" ให้ ${empty.length} คนแล้ว`);
}

// อัปเดตช่อง "รวม" และ "ค่าเฉลี่ย" ในตารางโดยไม่วาดหน้าใหม่
function refreshSheet(j) {
  j.students.forEach(sid => {
    const el = document.getElementById('tot-' + sid);
    if (el) el.textContent = num(workTotal(j, sid));
  });
  j.works.forEach(w => {
    const el = document.getElementById('avg-' + w.id);
    if (el) el.textContent = fmt(avgWork(j, w.id));
  });
  // สีเตือนและป้าย "ต่ำกว่าเกณฑ์ / ใกล้เกณฑ์" อัปเดตทันที
  let bad = 0, warn = 0;
  j.students.forEach(sid => {
    if (!stu(sid)) return;
    const r = subjRisk(j, sid);
    if (r === 'bad') bad++; else if (r === 'warn') warn++;
    const tr = document.getElementById('sr-' + sid);
    if (tr) { tr.classList.toggle('risk-bad', r === 'bad'); tr.classList.toggle('risk-warn', r === 'warn'); }
    const tg = document.getElementById('rk-' + sid);
    if (tg) { const h = riskTag(r); if (tg.innerHTML !== h) tg.innerHTML = h; }
  });
  const note = document.getElementById('sj-risk');
  if (note) { const h = riskNoteHtml(bad, warn, j.students.length && j.works.length); if (note.innerHTML !== h) note.innerHTML = h; }
}
function riskNoteHtml(bad, warn, has) {
  return has && (bad || warn) ? `<div class="risk-note small no-print">${bad ? `<span class="rk bad" style="margin:0">ต่ำกว่าเกณฑ์ ${bad} คน</span>` : ''}${warn ? `<span class="rk warn" style="margin:0">ใกล้เกณฑ์ ${warn} คน</span>` : ''}<span class="muted">เกณฑ์ผ่าน ${passPct()}% · คิดจากงานที่กรอกแล้ว (แอดมินปรับเกณฑ์ได้ที่หน้าภาพรวม)</span></div>` : '';
}

// Enter / ลูกศรขึ้นลง = ย้ายไปช่องแถวถัดไป/ก่อนหน้าในคอลัมน์เดียวกัน (กรอกคะแนนได้เร็วเหมือนกรอกกระดาษ)
function cellKey(e, el) {
  const k = e.key;
  if (k === 'Escape') {   // ยกเลิกสิ่งที่เพิ่งพิมพ์ในช่องนี้
    const x = cellCtx(el);
    if (x && el.dataset.o !== undefined && el.value !== el.dataset.o) { e.preventDefault(); cellUndo(el, x); el.select(); save(); refreshSheet(x.j); }
    return;
  }
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    e.preventDefault();
    const row = [...el.closest('tr').querySelectorAll('input.cell')];
    const nx = row[row.indexOf(el) + (k === 'ArrowLeft' ? -1 : 1)];
    if (nx) { nx.focus(); nx.select(); }
    return;
  }
  if (k !== 'Enter' && k !== 'ArrowDown' && k !== 'ArrowUp') return;
  e.preventDefault();
  const col = [...document.querySelectorAll('input.cell[data-w="' + el.dataset.w + '"]')];
  const next = col[col.indexOf(el) + (k === 'ArrowUp' ? -1 : 1)];
  if (next) { next.focus(); next.select(); }
}


/* ------------------------------------------------------------
   3.16 หน้า "โปรเจกต์ที่ปรึกษา"
   ไม่มีหน้าสร้างบัญชีครูที่ปรึกษาแยกแล้ว: แอดมินเลือกชื่อผู้ใช้คนไหนเป็นที่ปรึกษาก็ได้ในหน้า "กลุ่มโปรเจกต์"
   คนนั้นจะมีเมนู "โปรเจกต์ที่ปรึกษา" ขึ้นมาเอง
   ------------------------------------------------------------ */
// หน้าของครูที่ปรึกษา: เห็นเฉพาะโปรเจกต์ที่แอดมินเลือกตัวเองเป็นที่ปรึกษา (คะแนนเฉลี่ย + ข้อเสนอแนะ + เขียนข้อเสนอแนะเองได้)
function vMine() {
  const u = cur();
  const title = '<div class="page-title"><h1>โปรเจกต์ที่ปรึกษา</h1></div>';
  const mine = groupsNewest().filter(g => g.advisorId === u.id);
  if (!mine.length)
    return `${title}<div class="card"><p class="muted" style="margin:0">ตอนนี้แอดมินยังไม่ได้เลือกคุณเป็นครูที่ปรึกษาของโปรเจกต์ใด เมื่อแอดมินเลือกแล้ว โปรเจกต์จะขึ้นที่หน้านี้ทันที</p></div>`;

  const cards = mine.map(g => {
    const members = sortStudents(g.members.map(stu).filter(Boolean));
    const pk = pkey(g.id), ga = groupAvg(pk);
    const rows = members.map(m => `
      <tr>
        <td>${esc(m.no || '-')}</td>
        <td>${esc(m.sid || '-')}</td>
        <td>${esc(fullName(m))}</td>
        <td>${esc(m.level || '-')}</td>
        <td class="c">${(() => { const x = groupAvg(ikey(g.id, m.id)); return x ? `<b>${fmt(x.avg)}</b>` : '<span class="muted">–</span>'; })()}</td>
      </tr>`).join('') || `<tr><td colspan="5" class="muted">กลุ่มนี้ยังไม่มีสมาชิก</td></tr>`;
    const avgCells = S.criteria.map(c => `<td><i>${fmt(avgOf(pk, c.id))}</i></td>`).join('');
    const my = (S.feedback[g.id] || {})[u.id];

    return `
    <div class="card">
      <div class="proj-title">
        <h2>${esc(g.name)}</h2>
        ${g.nameEn ? `<div class="proj-en">${esc(g.nameEn)}</div>` : ''}
        <div class="proj-meta small muted">สมาชิก ${members.length} คน</div>
      </div>
      <div class="sumbox">
        <div><b>${fmt(ga ? ga.avg : null)}</b><span class="small muted">คะแนนเฉลี่ยของกลุ่ม (เต็ม ${num(avgMaxAll())}) · ประเมินแล้ว ${scoredBy(pk)} คน</span></div>
      </div>
      ${S.criteria.length ? `
      <div class="tw" style="margin-top:12px">
        <table style="min-width:420px">
          <thead><tr><th></th>${critHeads()}</tr></thead>
          <tbody><tr><td><b>ค่าเฉลี่ยทุกผู้ประเมิน</b></td>${avgCells}</tr></tbody>
        </table>
      </div>` : ''}
      <div class="topic" style="margin-top:18px">สมาชิกกลุ่ม</div>
      <div class="tw">
        <table style="min-width:520px">
          <thead><tr><th>เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ-นามสกุล</th><th>ระดับ</th><th class="c">คะแนนเฉลี่ยรายบุคคล<div class="small muted">/${num(avgMaxAll())}</div></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${vFeedbackBox(g.id)}
      <form onsubmit="saveFeedback(event,'${g.id}','fbm-${g.id}')" style="margin-top:14px" novalidate>
        <div class="role-head"><label class="small muted" for="fbm-${g.id}">ข้อเสนอแนะของครูที่ปรึกษา · กดข้อความสำเร็จรูปเพื่อเติมลงช่อง</label>${badgeHtml('fbm-' + g.id + '-badge')}</div>
        ${fbPresets('fbm-' + g.id, g.id)}
        <textarea id="fbm-${g.id}" class="input" rows="4" maxlength="${FB_MAX}" oninput="fbAuto('fbm-${g.id}','${g.id}')" placeholder="เขียนข้อเสนอแนะต่อโครงงานนี้">${esc(my ? my.t : '')}</textarea>
        <div class="small muted" style="margin:6px 0 0" id="fbm-${g.id}-when">${my ? 'บันทึกล่าสุด ' + esc(fmtTime(my.at)) : 'ยังไม่ได้เขียนข้อเสนอแนะ'}</div>
        <div class="actions"><button class="btn primary">บันทึกข้อเสนอแนะ</button></div>
      </form>
    </div>`;
  }).join('');

  return title + cards;
}


/* ------------------------------------------------------------
   3.17 ปรับแต่งหน้าตา (แอดมิน)
   ค่าทั้งหมดเก็บใน S.settings (ซิงก์ขึ้นเซิร์ฟเวอร์) ทุกคนที่เข้าระบบจะเห็นหน้าตาเดียวกัน
   - โหมด ระบบ/สว่าง/มืด = ค่าเริ่มต้นของทุกคน (ใครกดสลับโหมดเองที่เมนูก็ใช้ของตัวเอง)
   - สีหลัก ความหนาแน่น ฟอนต์ มุมโค้ง และสวิตช์ต่างๆ ใช้กับทุกคน
   ------------------------------------------------------------ */
const SWATCHES = [   // l = สีโหมดสว่าง [สีหลัก, สีรอง] · d = สีโหมดมืด (สว่างขึ้นให้อ่านง่ายบนพื้นเข้ม)
  { id: 'iris',   name: 'รุ้ง',          l: ['#5b6cf0', '#c05cf0'], d: ['#8e9bff', '#e48bff'] },
  { id: 'ocean',  name: 'มหาสมุทร',     l: ['#3b69e8', '#178aa6'], d: ['#7aa8ff', '#5ee6d4'] },
  { id: 'mint',   name: 'มิ้นต์',        l: ['#0f9a76', '#2bb6c4'], d: ['#4fe0b5', '#6fd6ff'] },
  { id: 'forest', name: 'ป่าเขียว',      l: ['#2f8a4d', '#86a82f'], d: ['#6fdc8f', '#c7e06a'] },
  { id: 'violet', name: 'ม่วง',          l: ['#7550e0', '#b05ce8'], d: ['#a68bff', '#d99bff'] },
  { id: 'rose',   name: 'ชมพู',          l: ['#d9437a', '#f0788f'], d: ['#ff7fae', '#ffb199'] },
  { id: 'sunset', name: 'ตะวันลับฟ้า',   l: ['#e8602a', '#e8a21c'], d: ['#ff9a62', '#ffd166'] },
  { id: 'gold',   name: 'ทอง',           l: ['#b98200', '#d9a321'], d: ['#f3c64a', '#ffe08a'] },
  { id: 'coffee', name: 'กาแฟ',          l: ['#946239', '#c18a5a'], d: ['#d9a878', '#f0cda8'] },
  { id: 'slate',  name: 'เทาหินชนวน',    l: ['#46566f', '#7488a6'], d: ['#9fb2d0', '#c6d3e8'] }
];
const FONT_TAIL = ', "Noto Sans Thai", "Leelawadee UI", Tahoma, system-ui, sans-serif';
const FONTS = [      // gf = ชื่อที่ใช้โหลดจาก Google Fonts (เฉพาะตอนที่ถูกเลือก) · ฟอนต์แรกสองแบบโหลดไว้ใน index.html แล้ว
  { id: 'prompt',  name: 'Prompt + Sarabun (ค่าเริ่มต้น)', head: '"Prompt", "Sarabun"', body: '"Sarabun"', gf: '' },
  { id: 'sarabun', name: 'Sarabun',                        head: '"Sarabun"', body: '"Sarabun"', gf: '' },
  { id: 'kanit',   name: 'Kanit',                          head: '"Kanit"', body: '"Kanit"', gf: 'Kanit:wght@400;500;600' },
  { id: 'noto',    name: 'Noto Sans Thai',                 head: '"Noto Sans Thai"', body: '"Noto Sans Thai"', gf: 'Noto+Sans+Thai:wght@400;500;600;700' },
  { id: 'plex',    name: 'IBM Plex Sans Thai',             head: '"IBM Plex Sans Thai"', body: '"IBM Plex Sans Thai"', gf: 'IBM+Plex+Sans+Thai:wght@400;500;600' },
  { id: 'bai',     name: 'Bai Jamjuree',                   head: '"Bai Jamjuree"', body: '"Bai Jamjuree"', gf: 'Bai+Jamjuree:wght@400;500;600' },
  { id: 'system',  name: 'ฟอนต์ของเครื่อง',                 head: '"Leelawadee UI"', body: '"Leelawadee UI"', gf: '' }
];
const DENSITY = [0.82, 1, 1.16];                       // ความหนาแน่น: แน่น / ปกติ / โปร่ง (ตัวคูณระยะห่าง)
const DENSITY_NAME = ['แน่น', 'ปกติ', 'โปร่ง'];
const LOOK_KEY = 'eval-look';                          // สำเนาค่าล่าสุดในเบราว์เซอร์ (ให้หน้า Login ใช้สีเดียวกับระบบ)
const LOOK_DEFAULT = {
  mode: 'system', swatch: 'ocean', c1: '#3b69e8', c2: '#17a2b8',
  density: 1, font: 'prompt', radius: 16,
  motion: false, contrast: false, dividers: true, bigIcons: false, glass: true
};
let LOOK = Object.assign({}, LOOK_DEFAULT);

// ตรวจค่าให้อยู่ในช่วงที่ถูกต้องเสมอ (ค่ามาจากเซิร์ฟเวอร์/ไฟล์ จึงไม่เชื่อทุกอย่าง)
function normLook(o) {
  const d = LOOK_DEFAULT, x = Object.assign({}, d, o && typeof o === 'object' ? o : {});
  const hex = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  x.mode = ['system', 'light', 'dark'].includes(x.mode) ? x.mode : d.mode;
  x.swatch = x.swatch === 'custom' || SWATCHES.some(w => w.id === x.swatch) ? x.swatch : d.swatch;
  x.c1 = hex(x.c1) ? x.c1 : d.c1;
  x.c2 = hex(x.c2) ? x.c2 : d.c2;
  x.density = [0, 1, 2].includes(Number(x.density)) ? Number(x.density) : 1;
  x.font = FONTS.some(f => f.id === x.font) ? x.font : d.font;
  const r = Number(x.radius);
  x.radius = Number.isFinite(r) ? Math.min(28, Math.max(0, Math.round(r))) : d.radius;
  x.motion = x.motion === true;
  x.contrast = x.contrast === true;
  x.dividers = x.dividers !== false;
  x.bigIcons = x.bigIcons === true;
  x.glass = x.glass !== false;
  return x;
}

// ทำสีให้สว่างขึ้น (ผสมขาว) ใช้กับสีกำหนดเองในโหมดมืด · และเลือกสีตัวอักษรบนปุ่มสี
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lighten = (h, t) => rgbHex(hexRgb(h).map(v => v + (255 - v) * t));
function lum(h) {
  const [r, g, b] = hexRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const onColor = (a, b) => ((lum(a) + lum(b)) / 2 > 0.34 ? '#0b1020' : '#ffffff');

function swatchColors(L, dark) {
  if (L.swatch === 'custom') return dark ? [lighten(L.c1, 0.3), lighten(L.c2, 0.3)] : [L.c1, L.c2];
  const w = SWATCHES.find(x => x.id === L.swatch) || SWATCHES[1];
  return dark ? w.d : w.l;
}

function ensureFont(f) {   // ฟอนต์ที่ไม่ได้โหลดไว้ใน index.html: โหลดจาก Google Fonts ตอนถูกเลือกเท่านั้น
  if (!f.gf || document.getElementById('gf-' + f.id)) return;
  const l = document.createElement('link');
  l.id = 'gf-' + f.id; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=' + f.gf + '&display=swap';
  document.head.appendChild(l);
}

function cachedLook() {
  try { return JSON.parse(localStorage.getItem(LOOK_KEY) || 'null'); } catch (e) { return null; }
}

// ใส่ค่าหน้าตาลงหน้าเว็บ: ล็อกอินแล้วใช้ S.settings (ที่แอดมินตั้ง) · ยังไม่ล็อกอินใช้สำเนาล่าสุดในเบราว์เซอร์
function applyLook() {
  const root = document.documentElement;
  const loggedIn = S.uid !== null;
  const L = LOOK = normLook(loggedIn ? S.settings : cachedLook());
  if (loggedIn) {
    try {
      const str = JSON.stringify(L);
      if (localStorage.getItem(LOOK_KEY) !== str) localStorage.setItem(LOOK_KEY, str);
    } catch (e) {}
  }

  // โหมดสว่าง/มืด: ที่ผู้ใช้เลือกเอง > ค่าเริ่มต้นที่แอดมินตั้ง > ตามเครื่อง
  let personal = '';
  try { personal = localStorage.getItem(TKEY) || ''; } catch (e) {}
  const t = personal === 'dark' || personal === 'light' ? personal : (L.mode !== 'system' ? L.mode : '');
  if (t) root.dataset.theme = t; else delete root.dataset.theme;

  const dark = effTheme() === 'dark';
  const [a1, a2] = swatchColors(L, dark);
  const st = root.style, f = FONTS.find(x => x.id === L.font) || FONTS[0];
  ensureFont(f);
  st.setProperty('--accent', a1);
  st.setProperty('--accent2', a2);
  st.setProperty('--on-accent', onColor(a1, a2));
  st.setProperty('--r', L.radius + 'px');
  st.setProperty('--dens', String(DENSITY[L.density]));
  st.setProperty('--font-body', f.body + FONT_TAIL);
  st.setProperty('--font-head', f.head + FONT_TAIL);
  const flag = (name, on, val) => { if (on) root.setAttribute(name, val); else root.removeAttribute(name); };
  flag('data-motion', L.motion, 'reduced');
  flag('data-contrast', L.contrast, 'high');
  flag('data-dividers', !L.dividers, 'off');
  flag('data-bigicons', L.bigIcons, '1');
  flag('data-glass', !L.glass, 'off');
}
// เปลี่ยนโหมดสว่าง/มืดของเครื่อง (ตอนตั้งเป็น "ตามระบบ") -> ปรับสีหลักให้เข้ากับโหมดใหม่
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyLook(); if (S.uid !== null) render(true); }); } catch (e) {}

// แอดมินแก้ค่า (ทุกค่าบันทึกทันที และทุกคนเห็นภายในไม่กี่วินาที)
function setLook(k, v) {
  const u = cur();
  if (!u || !u.admin) return;
  if (k === 'swatch' && v === 'custom' && !S.settings.c1) {   // เลือก "กำหนดเอง" ครั้งแรก: เริ่มจากสีที่ใช้อยู่ตอนนี้
    const c = swatchColors(normLook(S.settings), false);
    S.settings.c1 = c[0]; S.settings.c2 = c[1];
  }
  S.settings[k] = v;
  if (k === 'mode') {   // เลือกโหมดแล้วให้แอดมินเห็นผลทันที (ล้างโหมดที่เคยกดสลับเองในเครื่องนี้)
    try { localStorage.removeItem(TKEY); } catch (e) {}
  }
  toast('บันทึกแล้ว ทุกคนจะเห็นหน้าตานี้ภายในไม่กี่วินาที');
  render();
}
// ตัวเลื่อน: ปรับแล้วเห็นผลทันทีโดยไม่วาดหน้าใหม่ (ไม่งั้นตัวเลื่อนจะหลุดมือ)
function setLookLive(k, v) {
  const u = cur();
  if (!u || !u.admin) return;
  S.settings[k] = Number(v);
  if (k === 'radius') {
    const n = document.getElementById('lk-r-num'), r = document.getElementById('lk-r');
    if (n && n !== document.activeElement) n.value = v;
    if (r && r !== document.activeElement) r.value = v;
  }
  if (k === 'density') {
    const n = document.getElementById('lk-d-name');
    if (n) n.textContent = DENSITY_NAME[Number(v)] || '';
  }
  applyLook();
  placePills();   // ความหนาแน่นเปลี่ยนขนาดเมนู จึงต้องวางแคปซูลที่เมนูที่เลือกใหม่
  save();
}
function setLookRadiusNum(el) {
  let v = Number(el.value);
  if (!Number.isFinite(v)) return;
  v = Math.min(28, Math.max(0, Math.round(v)));
  setLookLive('radius', v);
}
function resetLook() {
  const u = cur();
  if (!u || !u.admin) return;
  if (!confirm('คืนค่าหน้าตาทั้งหมดเป็นค่าเริ่มต้น? (ทุกคนจะเห็นหน้าตาเดิมของระบบ)')) return;
  Object.keys(S.settings).forEach(k => { if (k in LOOK_DEFAULT) delete S.settings[k]; });   // ลบเฉพาะค่าหน้าตา (รอบประเมิน/เกณฑ์ผ่าน/ลิงก์ QR ยังอยู่)
  try { localStorage.removeItem(TKEY); } catch (e) {}
  toast('คืนค่าเริ่มต้นแล้ว');
  render();
}

function vLook() {
  const L = normLook(S.settings), dark = effTheme() === 'dark';
  const seg = (k, v, label) => `<button type="button" role="radio" aria-checked="${L[k] === v}" class="${L[k] === v ? 'on' : ''}" onclick="setLook('${k}','${v}')">${label}</button>`;

  const swatches = SWATCHES.map(w => {
    const c = dark ? w.d : w.l, on = L.swatch === w.id;
    return `<button type="button" class="swatch${on ? ' on' : ''}" style="--s1:${c[0]};--s2:${c[1]}" role="radio" aria-checked="${on}" aria-label="${esc(w.name)}" title="${esc(w.name)}" onclick="setLook('swatch','${w.id}')"></button>`;
  }).join('');
  const customOn = L.swatch === 'custom';
  const swName = customOn ? 'กำหนดเอง' : (SWATCHES.find(w => w.id === L.swatch) || SWATCHES[1]).name;
  const customBtn = `<button type="button" class="swatch custom${customOn ? ' on' : ''}" ${customOn ? `style="--s1:${L.c1};--s2:${L.c2}"` : ''} role="radio" aria-checked="${customOn}" aria-label="กำหนดสีเอง" title="กำหนดสีเอง" onclick="setLook('swatch','custom')"></button>`;

  const sw = (k, title, desc) => `
    <label class="switch-row">
      <span class="sw-txt"><b>${title}</b><small>${desc}</small></span>
      <input type="checkbox" role="switch" ${L[k] ? 'checked' : ''} onchange="setLook('${k}', this.checked)">
    </label>`;

  return `
  <div class="page-title">
    <h1>ปรับหน้าตา</h1>
    <button class="btn sm" onclick="resetLook()">คืนค่าเริ่มต้น</button>
  </div>
  <div class="look-grid">
    <div class="card look-form">
      <p class="small muted" style="margin:0 0 6px">เฉพาะแอดมินปรับได้ · บันทึกทันที และทุกคนที่เข้าระบบจะเห็นหน้าตาเดียวกันภายในไม่กี่วินาที</p>

      <div class="look-sec">
        <h3>โหมด</h3>
        <div class="seg" role="radiogroup" aria-label="โหมด">${seg('mode', 'system', 'ตามเครื่อง')}${seg('mode', 'light', 'สว่าง')}${seg('mode', 'dark', 'มืด')}</div>
        <div class="small muted" style="margin-top:6px">เป็นค่าเริ่มต้นของทุกคน (ใครกดสลับโหมดเองที่เมนู จะใช้โหมดของตัวเอง)</div>
      </div>

      <div class="look-sec">
        <h3>สีหลัก <span class="small muted">· ${esc(swName)}</span></h3>
        <div class="swatches" role="radiogroup" aria-label="สีหลัก">${swatches}${customBtn}</div>
        ${customOn ? `
        <div class="look-custom">
          <label>สีหลัก <input type="color" value="${L.c1}" oninput="setLookColor('c1', this.value)"></label>
          <label>สีรอง <input type="color" value="${L.c2}" oninput="setLookColor('c2', this.value)"></label>
          <span class="small muted">สีของปุ่ม แถบเมนู แถบความคืบหน้า และแสงเรือง จะไล่จากสีหลักไปสีรอง</span>
        </div>` : ''}
      </div>

      <div class="look-sec">
        <h3>ความหนาแน่น <span class="small muted">· <span id="lk-d-name">${DENSITY_NAME[L.density]}</span></span></h3>
        <input type="range" class="range" min="0" max="2" step="1" value="${L.density}" aria-label="ความหนาแน่น" oninput="setLookLive('density', this.value)">
        <div class="range-labels small muted"><span>แน่น</span><span>ปกติ</span><span>โปร่ง</span></div>
      </div>

      <div class="look-sec">
        <h3>ฟอนต์</h3>
        <select aria-label="ฟอนต์" onchange="setLook('font', this.value)">
          ${FONTS.map(f => `<option value="${f.id}" ${L.font === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
        </select>
        <div class="small muted" style="margin-top:6px">ฟอนต์อื่นนอกจาก Prompt/Sarabun โหลดจาก Google Fonts ต้องต่ออินเทอร์เน็ต ถ้าออฟไลน์จะใช้ฟอนต์ไทยของเครื่องแทน</div>
      </div>

      <div class="look-sec">
        <h3>มุมโค้ง</h3>
        <div class="range-row">
          <input id="lk-r" type="range" class="range" min="0" max="28" step="1" value="${L.radius}" aria-label="มุมโค้ง" oninput="setLookLive('radius', this.value)">
          <input id="lk-r-num" class="range-num" type="number" min="0" max="28" step="1" value="${L.radius}" aria-label="ค่ามุมโค้ง (พิกเซล)" oninput="setLookRadiusNum(this)">
        </div>
      </div>

      <div class="look-sec look-switches">
        ${sw('motion', 'ลดการเคลื่อนไหว', 'ปิดแอนิเมชันและการเลื่อนนุ่มๆ ของเมนู')}
        ${sw('contrast', 'ขอบคมชัดสูง', 'เพิ่มความเข้มของเส้นขอบและช่องกรอก')}
        ${sw('dividers', 'แสดงเส้นแบ่งแถว', 'เส้นคั่นระหว่างแถวในตารางและรายการ')}
        ${sw('bigIcons', 'ไอคอนเมนูขนาดใหญ่', 'ขยายไอคอนและปุ่มในเมนูด้านข้างและแถบล่างบนมือถือ')}
        ${sw('glass', 'เบลอพื้นหลังแบบกระจก', 'ปิดได้ถ้าเครื่องช้า (การ์ดจะทึบขึ้นแทน)')}
      </div>
    </div>

    <div class="look-preview">
      <div class="card">
        <h2>ตัวอย่าง</h2>
        <div class="stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:12px">
          <div class="stat"><b>12</b><span>โปรเจกต์</span></div>
          <div class="stat"><b>8.75</b><span>คะแนนเฉลี่ย</span></div>
        </div>
        <div class="bar" style="margin-bottom:12px"><i style="width:68%"></i></div>
        <div class="field"><label>ช่องกรอก</label><input placeholder="พิมพ์ตัวอย่าง" tabindex="-1"></div>
        <div class="actions" style="margin:0 0 12px">
          <button type="button" class="btn primary" tabindex="-1">ปุ่มหลัก</button>
          <button type="button" class="btn" tabindex="-1">ปุ่มรอง</button>
          <span class="chip ok">เสร็จแล้ว</span><span class="chip warn">รอดำเนินการ</span>
        </div>
        <table style="min-width:0">
          <thead><tr><th>ชื่อ</th><th>คะแนน</th></tr></thead>
          <tbody><tr><td>แถวที่ 1</td><td>9.00</td></tr><tr><td>แถวที่ 2</td><td>8.50</td></tr></tbody>
        </table>
      </div>
    </div>
  </div>`;
}
function setLookColor(k, v) {   // ตัวเลือกสีแบบกำหนดเอง: เห็นผลทันทีโดยไม่วาดหน้าใหม่ (ไม่งั้นหน้าต่างเลือกสีจะปิด)
  const u = cur();
  if (!u || !u.admin || !/^#[0-9a-fA-F]{6}$/.test(v)) return;
  S.settings[k] = v;
  applyLook();
  save();
}


/* ------------------------------------------------------------
   3.18 render() = ตัวสั่งวาดหน้าจอ (หัวใจของโค้ดทั้งหมด) และการซิงก์ข้อมูลแบบเรียลไทม์
   ------------------------------------------------------------ */
// noSave = true ใช้ตอนวาดใหม่เพราะข้อมูลถูกแก้จากอีกหน้าต่าง (ไม่ต้องเขียนข้อมูลกลับลงเบราว์เซอร์)
// หน้าระหว่างเชื่อมต่อเซิร์ฟเวอร์ตอนเปิดเว็บ / เมื่อเชื่อมต่อไม่ได้
function vConnect(failed) {
  return `
  <div class="login-wrap">
    <div class="card welcome" style="text-align:center">
      <h1>ระบบประเมินโปรเจกต์และคะแนนรายวิชา</h1>
      ${failed
        ? `<p class="muted">${esc(NET.errMsg || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')}</p>
           <button class="btn primary" style="width:100%" onclick="boot()">ลองใหม่</button>`
        : '<p class="muted" role="status">กำลังเชื่อมต่อเซิร์ฟเวอร์…</p>'}
    </div>
  </div>`;
}

/* ------------------------------------------------------------
   3.19 ช่องเลือก (dropdown) แบบ Liquid Glass
   แทน <select> ของเบราว์เซอร์ทุกตัวด้วย "ปุ่มกระจก + รายการกระจกที่ลอยลงมา"
   <select> เดิมยังอยู่ในหน้า (ซ่อนไว้) จึงอ่านค่าด้วย id และใช้ onchange ได้เหมือนเดิมทุกอย่าง
   enhanceSelects() ถูกเรียกท้าย render() ทุกครั้ง · ใช้คีย์บอร์ดได้ (ลูกศร / Enter / Esc / พิมพ์ตัวอักษรแรก)
   ------------------------------------------------------------ */
const GS = { open: null, typed: '', typedAt: 0 };
const GS_CHEV = '<svg class="gs-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const GS_TICK = '<svg class="gs-tick" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const gsBtnOf = sel => (sel.parentNode ? sel.parentNode.querySelector(':scope > .gs-btn') : null);
const gsIsPh = o => !!o && o.value === '' && /^\s*[—–-]/.test(o.textContent);   // ตัวเลือกแบบ "— ยังไม่เลือก —" แสดงเป็นสีจาง

// ใส่ข้อความของตัวเลือกที่เลือกอยู่ลงบนปุ่ม
function gsSync(sel) {
  const btn = gsBtnOf(sel);
  if (!btn) return;
  const o = sel.options[sel.selectedIndex];
  const text = o ? o.textContent.trim() : '';
  btn.querySelector('.gs-val').textContent = text;
  if (gsIsPh(o)) btn.setAttribute('data-empty', ''); else btn.removeAttribute('data-empty');
  btn.setAttribute('aria-label', btn.dataset.lab ? btn.dataset.lab + ': ' + text : text);
}

function enhanceSelects() {
  document.querySelectorAll('#app select:not([data-gs])').forEach(sel => {
    sel.dataset.gs = '1';
    const wrap = document.createElement('div');
    wrap.className = 'gs' + (sel.classList.contains('sm') ? ' sm' : '');
    const st = sel.getAttribute('style');
    if (st) {   // ความกว้างที่เคยกำหนดไว้ที่ select (เช่น width:auto) ย้ายมาที่กล่องแทน
      wrap.style.cssText = st;
      if (wrap.style.width === 'auto') wrap.style.display = 'inline-block';
    }
    const lab = sel.id ? document.querySelector('label[for="' + sel.id + '"]') : null;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'gs-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    btn.dataset.lab = (lab && lab.textContent.trim()) || sel.getAttribute('aria-label') || '';
    btn.disabled = sel.disabled;
    btn.innerHTML = '<span class="gs-val"></span>' + GS_CHEV;
    sel.classList.add('gs-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel); wrap.appendChild(btn);
    gsSync(sel);
    btn.addEventListener('click', () => { if (GS.open && GS.open.sel === sel) gsClose(); else gsOpen(sel, btn); });
    btn.addEventListener('keydown', e => gsKey(e, sel, btn));
    if (lab) lab.addEventListener('click', e => { e.preventDefault(); btn.focus(); });
  });
}

function gsOpen(sel, btn) {
  gsClose();
  if (sel.disabled) return;
  const pop = document.createElement('div');
  pop.className = 'gs-pop'; pop.setAttribute('role', 'listbox');
  pop.innerHTML = Array.from(sel.options).map((o, i) => {
    const on = i === sel.selectedIndex;
    return `<div class="gs-opt${on ? ' on' : ''}${o.disabled ? ' dis' : ''}${gsIsPh(o) ? ' ph' : ''}" role="option" data-i="${i}" aria-selected="${on}"><span>${esc(o.textContent.trim())}</span>${GS_TICK}</div>`;
  }).join('');
  document.body.appendChild(pop);

  // วางรายการใต้ปุ่ม (ถ้าข้างล่างไม่พอก็เปิดขึ้นด้านบน) และไม่ให้ล้นจอ
  const r0 = btn.getBoundingClientRect();
  const up = innerHeight - r0.bottom - 12 < Math.min(pop.scrollHeight, 240) && r0.top - 12 > innerHeight - r0.bottom - 12;
  pop.style.transformOrigin = up ? 'bottom' : 'top';
  GS.open = { sel, btn, pop, hl: -1, up };
  gsPlace();
  btn.setAttribute('aria-expanded', 'true');
  btn.parentNode.classList.add('open');
  const cur0 = sel.selectedIndex >= 0 ? sel.selectedIndex : 0;
  gsHl(cur0, false);
  const el = pop.querySelector('.gs-opt.hl');
  if (el) pop.scrollTop = Math.max(0, el.offsetTop - (pop.clientHeight - el.offsetHeight) / 2);

  pop.addEventListener('mousedown', e => e.preventDefault());   // ไม่ให้ปุ่มเสียโฟกัสตอนคลิกรายการ
  pop.addEventListener('click', e => { const o = e.target.closest('.gs-opt'); if (o) gsChoose(Number(o.dataset.i)); });
  pop.addEventListener('pointermove', e => { const o = e.target.closest('.gs-opt'); if (o && !o.classList.contains('dis')) gsHl(Number(o.dataset.i), false); });
}

// วางตำแหน่งรายการให้ตามปุ่ม (เรียกตอนเปิด และตอนเลื่อนหน้า/ย่อขยายหน้าต่าง) ถ้าปุ่มเลื่อนพ้นจอไปแล้วก็ปิด
function gsPlace() {
  const o = GS.open;
  if (!o) return;
  const r = o.btn.getBoundingClientRect(), pop = o.pop;
  if (!o.btn.isConnected || r.bottom < 0 || r.top > innerHeight) return gsClose();
  pop.style.minWidth = r.width + 'px';
  pop.style.maxWidth = Math.max(r.width, Math.min(480, innerWidth - 16)) + 'px';
  const room = o.up ? r.top - 12 : innerHeight - r.bottom - 12;
  pop.style.maxHeight = Math.max(120, Math.min(360, room)) + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + 'px';
  if (o.up) { pop.style.top = ''; pop.style.bottom = (innerHeight - r.top + 6) + 'px'; }
  else      { pop.style.bottom = ''; pop.style.top = (r.bottom + 6) + 'px'; }
}

function gsHl(i, scroll) {
  const o = GS.open;
  if (!o) return;
  const el = o.pop.querySelector('.gs-opt[data-i="' + i + '"]');
  if (!el) return;
  o.pop.querySelectorAll('.gs-opt.hl').forEach(x => x.classList.remove('hl'));
  el.classList.add('hl'); o.hl = i;
  if (scroll) {
    const top = el.offsetTop, bot = top + el.offsetHeight, p = o.pop;
    if (top < p.scrollTop) p.scrollTop = Math.max(0, top - 6);
    else if (bot > p.scrollTop + p.clientHeight) p.scrollTop = bot - p.clientHeight + 6;
  }
}

function gsClose() {
  const o = GS.open;
  if (!o) return;
  GS.open = null;
  const pop = o.pop;
  pop.classList.add('out');
  pop.addEventListener('animationend', () => pop.remove(), { once: true });
  setTimeout(() => pop.remove(), 260);   // กันกรณีปิดแอนิเมชันไว้ (animationend ไม่ยิง)
  if (o.btn.isConnected) { o.btn.setAttribute('aria-expanded', 'false'); o.btn.parentNode.classList.remove('open'); }
}

function gsChoose(i) {
  const o = GS.open;
  if (!o) return;
  const sel = o.sel, opt = sel.options[i];
  if (!opt || opt.disabled) return;
  const id = sel.id, changed = sel.selectedIndex !== i;
  gsClose();
  if (changed) {
    sel.selectedIndex = i;
    gsSync(sel);
    sel.dispatchEvent(new Event('change', { bubbles: true }));   // onchange="..." เดิมทำงานตามปกติ (มักวาดหน้าใหม่)
  }
  setTimeout(() => {   // คืนโฟกัสให้ปุ่ม (หน้าอาจถูกวาดใหม่ จึงหาใหม่ด้วย id)
    const s = id ? document.getElementById(id) : sel;
    const b = s && s.isConnected ? gsBtnOf(s) : null;
    if (b) b.focus({ preventScroll: true });
  }, 0);
}

function gsKey(e, sel, btn) {
  const k = e.key, o = GS.open && GS.open.sel === sel ? GS.open : null;
  if (!o) {
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); gsOpen(sel, btn); }
    return;
  }
  const ok = Array.from(sel.options).map((x, i) => (x.disabled ? -1 : i)).filter(i => i >= 0);
  const at = ok.indexOf(o.hl);
  if (k === 'ArrowDown')      { e.preventDefault(); gsHl(ok[Math.min(ok.length - 1, at + 1)], true); }
  else if (k === 'ArrowUp')   { e.preventDefault(); gsHl(ok[Math.max(0, at - 1)], true); }
  else if (k === 'Home')      { e.preventDefault(); gsHl(ok[0], true); }
  else if (k === 'End')       { e.preventDefault(); gsHl(ok[ok.length - 1], true); }
  else if (k === 'Enter' || k === ' ') { e.preventDefault(); gsChoose(o.hl); }
  else if (k === 'Escape')    { e.preventDefault(); e.stopPropagation(); gsClose(); }
  else if (k === 'Tab')       { gsClose(); }
  else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {   // พิมพ์ตัวอักษรแรกเพื่อกระโดดไปตัวเลือกนั้น
    const now = Date.now();
    GS.typed = (now - GS.typedAt > 700 ? '' : GS.typed) + k.toLowerCase(); GS.typedAt = now;
    const hit = ok.find(i => sel.options[i].textContent.trim().toLowerCase().startsWith(GS.typed));
    if (hit !== undefined) gsHl(hit, true);
  }
}

// ปิดรายการเมื่อคลิกที่อื่น · เลื่อนหน้าหรือย่อขยายหน้าต่าง = ให้รายการตามปุ่มไป
document.addEventListener('pointerdown', e => {
  const o = GS.open;
  if (o && !o.pop.contains(e.target) && !o.btn.contains(e.target)) gsClose();
}, true);
window.addEventListener('scroll', e => { const o = GS.open; if (o && !o.pop.contains(e.target)) gsPlace(); }, true);
window.addEventListener('resize', gsPlace);


/* ------------------------------------------------------------
   3.20 สร้างไฟล์ Excel (.xlsx) เอง ไม่ต้องใช้ไลบรารีนอก
   sheets = [{ name, widths:[…], freeze: จำนวนแถวหัวตารางที่ตรึงไว้, rows:[[เซลล์…]…] }]
   เซลล์ = ข้อความ | ตัวเลข | null | { v: ค่า, s: ชื่อสไตล์ }   สไตล์: head, title, num, int, text, ctr, warn, bold
   ------------------------------------------------------------ */
const XL_STYLE = { def: 0, head: 1, num: 2, bold: 3, title: 4, ctr: 5, text: 6, int: 7, warn: 8, warnNum: 9, note: 10 };
const XL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function xlCrc(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = XL_CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

// รวมไฟล์ [{ name, data: Uint8Array }] เป็น ZIP แบบไม่บีบอัด (Excel อ่านได้ปกติ)
function xlZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const d = new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosD = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  files.forEach(f => {
    const name = enc.encode(f.name), crc = xlCrc(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosT, true); lh.setUint16(12, dosD, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosT, true); ch.setUint16(14, dosD, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + size;
  });
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const xlEsc = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function xlCol(i) { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; }
const xlSheetName = (s, used) => {
  let n = String(s || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Sheet';
  let k = 2, base = n;
  while (used.includes(n.toLowerCase())) n = base.slice(0, 28) + ' ' + k++;
  used.push(n.toLowerCase());
  return n;
};

function xlsxBlob(sheets) {
  const enc = new TextEncoder(), used = [];
  const names = sheets.map(sh => xlSheetName(sh.name, used));
  const sheetXml = sheets.map(sh => {
    const rows = sh.rows || [];
    const maxC = rows.reduce((m, r) => Math.max(m, r.length), 1);
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    x += `<dimension ref="A1:${xlCol(maxC - 1)}${Math.max(1, rows.length)}"/>`;
    x += '<sheetViews><sheetView workbookViewId="0"' + (sh.freeze ? '' : ' tabSelected="0"') + '>';
    if (sh.freeze) x += `<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freeze + 1}" sqref="A${sh.freeze + 1}"/>`;
    x += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>';
    if (sh.widths && sh.widths.length) x += '<cols>' + sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    x += '<sheetData>';
    rows.forEach((r, ri) => {
      x += `<row r="${ri + 1}">`;
      r.forEach((c, ci) => {
        if (c === null || c === undefined || c === '') return;
        let v = c, st = 0;
        if (typeof c === 'object') { v = c.v; st = XL_STYLE[c.s] || 0; if (v === null || v === undefined || v === '') { if (st) x += `<c r="${xlCol(ci)}${ri + 1}" s="${st}"/>`; return; } }
        const ref = `${xlCol(ci)}${ri + 1}`;
        if (typeof v === 'number' && isFinite(v)) x += `<c r="${ref}"${st ? ` s="${st}"` : ''}><v>${v}</v></c>`;
        else x += `<c r="${ref}"${st ? ` s="${st}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xlEsc(v)}</t></is></c>`;
      });
      x += '</row>';
    });
    x += '</sheetData>';
    if (sh.merges && sh.merges.length) x += `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
    x += '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
    x += '<pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>';
    x += '</worksheet>';
    return x;
  });
  // ฟอนต์ 0 ปกติ · 1 หนา · 2 หนาใหญ่ · 3 ตัวเอียงเทา   ·  fills 2 = หัวตาราง, 3 = เตือน (ส้มอ่อน)
  const border = '<border><left style="thin"><color rgb="FFB8BFD0"/></left><right style="thin"><color rgb="FFB8BFD0"/></right><top style="thin"><color rgb="FFB8BFD0"/></top><bottom style="thin"><color rgb="FFB8BFD0"/></bottom><diagonal/></border>';
  const xf = (num, font, fill, bd, align) => `<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="${bd}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${align ? ' applyAlignment="1"' : ''}>${align || ''}</xf>`;
  const L = '<alignment vertical="center" wrapText="1"/>', C = '<alignment horizontal="center" vertical="center" wrapText="1"/>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="4"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="15"/><name val="Tahoma"/></font><font><i/><sz val="10"/><color rgb="FF666C80"/><name val="Tahoma"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3E8FA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE1CC"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="11">' +
      xf(0, 0, 0, 0) +                 // 0 def
      xf(0, 1, 2, 1, C) +              // 1 head
      xf(2, 0, 0, 1, C) +              // 2 num 0.00
      xf(0, 1, 0, 0) +                 // 3 bold
      xf(0, 2, 0, 0) +                 // 4 title
      xf(0, 0, 0, 1, C) +              // 5 ctr (มีกรอบ)
      xf(0, 0, 0, 1, L) +              // 6 text (มีกรอบ)
      xf(1, 0, 0, 1, C) +              // 7 int
      xf(0, 0, 3, 1, L) +              // 8 warn text
      xf(2, 1, 3, 1, C) +              // 9 warn num
      xf(0, 3, 0, 0) +                 // 10 note
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' +
    names.map((n, i) => `<sheet name="${xlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>';
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const files = [
    { name: '[Content_Types].xml', data: enc.encode(ct) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'xl/workbook.xml', data: enc.encode(wb) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
    { name: 'xl/styles.xml', data: enc.encode(styles) }
  ].concat(sheetXml.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(x) })));
  return xlZip(files);
}


/* ------------------------------------------------------------
   3.21 สร้าง QR Code เอง (โหมดไบต์ UTF-8, แก้ไขข้อผิดพลาดระดับ M ถ้าไม่พอใช้ L, รุ่น 1–10)
   qrMatrix(text) -> { n, dark(x,y) } หรือ null ถ้าข้อความยาวเกิน · qrSvg(text) -> ข้อความ SVG หรือ ''
   ------------------------------------------------------------ */
const QR_EC = {   // [ไบต์แก้ไขต่อบล็อก, จำนวนบล็อก] ของรุ่น 1..10
  L: { bit: 1, ec: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18], nb: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4] },
  M: { bit: 0, ec: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26], nb: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] }
};
const QR_ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const QR_RAW = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const a = Math.floor(v / 7) + 2; r -= (25 * a - 10) * a - 55; if (v >= 7) r -= 36; } return r; };
const gfMul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; };
function rsDivisor(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
function rsRemainder(data, div) {
  const r = new Array(div.length).fill(0);
  data.forEach(b => { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); });
  return r;
}
function bchBits(v, poly, top) {   // เติมบิตตรวจสอบ BCH ต่อท้ายค่า v
  let r = v;
  const deg = 31 - Math.clz32(poly);
  r <<= deg;
  for (let i = 31 - Math.clz32(r); i >= deg; i--) if ((r >>> i) & 1) r ^= poly << (i - deg);
  return (v << deg) | r;
}

function qrBuild(bytes, ver, lvl) {
  const E = QR_EC[lvl], n = ver * 4 + 17;
  const total = Math.floor(QR_RAW(ver) / 8), nb = E.nb[ver - 1], ecl = E.ec[ver - 1], dataCw = total - ecl * nb;
  // ---- ข้อมูล: โหมด + ความยาว + ไบต์ + ตัวปิด + ตัวเติม
  const bits = [];
  const put = (v, len) => { for (let i = len - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver >= 10 ? 16 : 8); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, dataCw * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xEC; data.length < dataCw; pad ^= 0xEC ^ 0x11) data.push(pad);
  // ---- แบ่งบล็อก + Reed-Solomon + สลับข้อมูล
  const div = rsDivisor(ecl), blocks = [], shortN = nb - total % nb, shortLen = Math.floor(total / nb);
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - ecl + (i < shortN ? 0 : 1)); k += dat.length;
    const ec = rsRemainder(dat, div);
    if (i < shortN) dat.push(0);
    blocks.push(dat.concat(ec));
  }
  const all = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= shortN) all.push(b[i]); });

  // ---- วาดลวดลายคงที่
  const m = [], fn = [];
  for (let i = 0; i < n; i++) { m.push(new Array(n).fill(false)); fn.push(new Array(n).fill(false)); }
  const setFn = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
  for (let i = 0; i < n; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < n && y >= 0 && y < n) setFn(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
  const al = QR_ALIGN[ver];
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = mask => {
    const f = bchBits((E.bit << 3) | mask, 0x537) ^ 0x5412, g = i => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFn(8, i, g(i));
    setFn(8, 7, g(6)); setFn(8, 8, g(7)); setFn(7, 8, g(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) setFn(n - 1 - i, 8, g(i));
    for (let i = 8; i < 15; i++) setFn(8, n - 15 + i, g(i));
    setFn(8, n - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    const v = bchBits(ver, 0x1F25);
    for (let i = 0; i < 18; i++) { const b = ((v >>> i) & 1) !== 0, a = n - 11 + i % 3, c = Math.floor(i / 3); setFn(a, c, b); setFn(c, a, b); }
  }
  // ---- วางข้อมูลแบบซิกแซก
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
      if (!fn[y][x] && i < all.length * 8) { m[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
    }
  }
  // ---- เลือกมาสก์ที่คะแนนปรับต่ำสุด
  const MASK = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
  const apply = k => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y][x] && MASK[k](x, y)) m[y][x] = !m[y][x]; };
  const penalty = () => {
    let p = 0;
    const lines = [];
    for (let a = 0; a < n; a++) { const r = [], c = []; for (let b = 0; b < n; b++) { r.push(m[a][b]); c.push(m[b][a]); } lines.push(r, c); }
    lines.forEach(L => {
      let run = 1;
      for (let k = 1; k <= L.length; k++) {
        if (k < L.length && L[k] === L[k - 1]) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; }
      }
      const s = L.map(v => (v ? '1' : '0')).join('');
      let at = -1;
      while ((at = s.indexOf('10111010000', at + 1)) >= 0) p += 40;
      at = -1;
      while ((at = s.indexOf('00001011101', at + 1)) >= 0) p += 40;
    });
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    let dark = 0; m.forEach(r => r.forEach(v => { if (v) dark++; }));
    p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for (let k = 0; k < 8; k++) { apply(k); drawFormat(k); const p = penalty(); if (p < bestP) { bestP = p; best = k; } apply(k); }
  apply(best); drawFormat(best);
  return { n, dark: (x, y) => x >= 0 && y >= 0 && x < n && y < n && m[y][x] };
}

function qrMatrix(text, minLevel) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  for (const lvl of minLevel === 'L' ? ['L'] : ['M', 'L']) {
    for (let ver = 1; ver <= 10; ver++) {
      const cap = Math.floor(QR_RAW(ver) / 8) - QR_EC[lvl].ec[ver - 1] * QR_EC[lvl].nb[ver - 1];
      const need = 4 + (ver >= 10 ? 16 : 8) + bytes.length * 8;
      if (need <= cap * 8) return qrBuild(bytes, ver, lvl);
    }
  }
  return null;
}
// SVG ขาว-ดำ มีขอบเงียบ 4 ช่อง (ต้องเป็นขาวดำเสมอ แม้อยู่ในโหมดมืด เพื่อให้มือถือสแกนติด)
function qrSvg(text, px) {
  const q = qrMatrix(text);
  if (!q) return '';
  const pad = 4, size = q.n + pad * 2;
  let d = '';
  for (let y = 0; y < q.n; y++) {
    for (let x = 0; x < q.n; x++) {
      if (!q.dark(x, y)) continue;
      let e = x; while (e + 1 < q.n && q.dark(e + 1, y)) e++;
      d += `M${x + pad} ${y + pad}h${e - x + 1}v1h-${e - x + 1}z`;
      x = e;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${px || 192}" height="${px || 192}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}


/* ------------------------------------------------------------
   3.22 ค่าตั้งของระบบ: รอบการประเมิน · เกณฑ์ผ่าน · ลิงก์เว็บ
   เก็บใน S.settings (ซิงก์ขึ้นเซิร์ฟเวอร์เหมือนหน้าตาเว็บ) แก้ได้เฉพาะแอดมิน
   ------------------------------------------------------------ */
const setting = (k, d) => (S.settings && S.settings[k] !== undefined && S.settings[k] !== null ? S.settings[k] : d);
function putSetting(k, v) {
  const u = cur();
  if (!u || !u.admin) return false;
  if (v === undefined || v === null || v === '') delete S.settings[k]; else S.settings[k] = v;
  save();
  return true;
}
const round2 = x => Math.round(x * 100) / 100;
const safeFile = s => String(s == null ? '' : s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 60) || 'file';
const fmtDate = (t, long) => { try { return new Date(t).toLocaleString('th-TH', { dateStyle: long ? 'long' : 'medium', timeStyle: 'short' }); } catch (e) { return ''; } };

// ---- รอบการประเมิน: แอดมินปิดรอบ หรือเลยวันหมดเขต -> ผู้ประเมินแก้คะแนนโปรเจกต์ไม่ได้ (แอดมินยังแก้ได้ · ข้อเสนอแนะยังเขียนได้) ----
function evalLockText() {
  if (setting('evalOpen', true) === false) return 'ปิดรับการประเมินแล้ว';
  const t = Date.parse(setting('evalDeadline', ''));
  if (Number.isFinite(t) && Date.now() > t) return 'หมดเขตการประเมินแล้ว';
  return '';
}
const evalLocked = () => { const u = cur(); return !!u && !u.admin && !!evalLockText(); };
function leftText(ms) {
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  return d ? `${d} วัน ${h} ชม.` : h ? `${h} ชม. ${mi} นาที` : `${Math.max(1, mi)} นาที`;
}
// ป้ายบอกสถานะรอบประเมิน (หน้าประเมิน + การ์ดแอดมิน)
function roundBanner(admin) {
  const lock = evalLockText(), dl = Date.parse(setting('evalDeadline', ''));
  const hasDl = Number.isFinite(dl);
  if (lock) return `<div class="rb lock" role="status"><b>${lock}</b><span>${admin ? 'ผู้ประเมินแก้คะแนนโปรเจกต์ไม่ได้ (แอดมินยังแก้ได้)' : 'ดูคะแนนที่ให้ไว้ได้อย่างเดียว ติดต่อแอดมินถ้าต้องการเปิดรอบอีกครั้ง'}</span></div>`;
  if (hasDl) {
    const left = dl - Date.now();
    return `<div class="rb ${left < 24 * 3600e3 ? 'soon' : 'ok'}" role="status"><b>เปิดรับการประเมิน</b><span>หมดเขต ${esc(fmtDate(dl, true))} · เหลือ ${leftText(left)}</span></div>`;
  }
  return admin ? '<div class="rb ok" role="status"><b>เปิดรับการประเมิน</b><span>ยังไม่ได้ตั้งวันหมดเขต</span></div>' : '';
}
// เช็คทุก 15 วินาที: ถ้าเลยเวลาหมดเขต ให้หน้าที่เปิดอยู่เปลี่ยนเป็นโหมดดูอย่างเดียวทันที
let roundLast = null;
setInterval(() => {
  const now = evalLockText();
  if (roundLast === null) { roundLast = now; return; }
  if (now !== roundLast) {
    roundLast = now;
    if (cur() && (S.view === 'evaluate' || S.view === 'home')) { if (now && !cur().admin) toast(now + ' แก้ไขคะแนนไม่ได้แล้ว'); softRender(); }
  }
}, 15000);

// ---- เกณฑ์ผ่าน (ร้อยละ) และระดับความเสี่ยง ----
const PASS_DEFAULT = 50;
function passPct() { const n = Number(setting('passPct', PASS_DEFAULT)); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : PASS_DEFAULT; }
// 'bad' = ต่ำกว่าเกณฑ์ (แดง) · 'warn' = ใกล้เกณฑ์ คือสูงกว่าเกณฑ์ไม่เกิน 10 จุด (ส้ม) · '' = ปกติ หรือยังไม่มีข้อมูล
function riskOf(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '';
  const p = passPct();
  return pct < p ? 'bad' : pct < p + 10 ? 'warn' : '';
}
const RISK_TXT = { bad: 'ต่ำกว่าเกณฑ์', warn: 'ใกล้เกณฑ์' };
const riskTag = r => (r ? `<span class="rk ${r}">${RISK_TXT[r]}</span>` : '');
// ร้อยละของนักเรียนในวิชา: เทียบเฉพาะงานที่กรอกแล้ว (งานที่ยังไม่กรอกไม่นับ จะได้ไม่เตือนผิดตอนกรอกไม่ครบ)
function subjPct(j, sid) {
  let got = 0, max = 0;
  j.works.forEach(w => { const v = getWork(j, sid, w.id); if (v !== undefined) { got += v; max += w.max; } });
  return max ? got / max * 100 : null;
}
const subjRisk = (j, sid) => riskOf(subjPct(j, sid));
const pctOfAvg = r => (r && r.max ? r.avg / r.max * 100 : null);
// รายการที่ต้องจับตาทั้งระบบ (หน้าภาพรวม)
function riskList() {
  const out = [];
  S.subjects.forEach(j => j.students.map(stu).filter(Boolean).forEach(s => {
    const pct = subjPct(j, s.id), r = riskOf(pct);
    if (r) out.push({ kind: 'วิชา', where: j.name, who: fullName(s), pct, r, jid: j.id });
  }));
  S.groups.forEach(g => {
    const ga = groupAvg(pkey(g.id)), pct = pctOfAvg(ga), r = riskOf(pct);
    if (r) out.push({ kind: 'โปรเจกต์', where: g.name, who: g.name, pct, r, gid: g.id });
  });
  return out.sort((a, b) => (a.r === b.r ? a.pct - b.pct : a.r === 'bad' ? -1 : 1));
}
function setPassPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return toast('เกณฑ์ผ่านต้องเป็นตัวเลข 0 ถึง 100');
  if (putSetting('passPct', Math.round(n))) { toast('บันทึกเกณฑ์ผ่านแล้ว'); render(); }
}


/* ------------------------------------------------------------
   3.23 ส่งออก Excel และพิมพ์ใบสรุป
   ------------------------------------------------------------ */
const H_ = v => ({ v, s: 'head' });
const noteRow = text => [{ v: text, s: 'note' }];
const exportedAt = () => 'ส่งออกเมื่อ ' + new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' });

// ตารางสรุปโปรเจกต์ (aid = 'all' เฉลี่ยทุกผู้ประเมิน · หรือ id ผู้ประเมินคนเดียว)
function exportSummary(aid) {
  const a = aid === 'all' || aid === undefined || aid === null ? null : userById(Number(aid));
  if (!S.groups.length || !S.criteria.length) return toast('ยังไม่มีโปรเจกต์หรือเกณฑ์ให้ส่งออก');
  const cc = S.criteria, groups = groupsNewest();
  const stat = pk => (a ? givenAvg(a.id, pk) : groupAvg(pk));
  const cv = (pk, c) => { const v = a ? getScore(a.id, pk, c.id) : avgOf(pk, c.id); return v === undefined || v === null ? null : round2(v); };
  const critH = cc.map(c => H_(`${c.name} (เต็ม ${num(c.max)})`));
  const title = 'สรุปคะแนนโปรเจกต์' + (a ? ' · คะแนนที่ ' + dn(a) + ' ให้' : ' · เฉลี่ยจากผู้ประเมินทุกคน');

  // แผ่น 1: 1 โปรเจกต์ 1 บรรทัด
  const r1 = [[{ v: title, s: 'title' }], noteRow(exportedAt() + ' · เกณฑ์ผ่าน ' + passPct() + '%'), [],
    [H_('ที่'), H_('โปรเจกต์'), H_('ชื่อภาษาอังกฤษ'), H_('ครูที่ปรึกษา'), H_('ผู้จัดทำ')].concat(critH, [H_('คะแนนเฉลี่ย'), H_('คะแนนเต็ม'), H_('ร้อยละ'), H_(a ? 'ให้แล้ว (ข้อ)' : 'ผู้ประเมิน (คน)'), H_('สถานะ')])];
  groups.forEach((g, i) => {
    const pk = pkey(g.id), r = stat(pk), pct = pctOfAvg(r), rk = riskOf(pct), adv = advisorOf(g);
    const sty = rk ? ['warn', 'warnNum'] : ['text', 'num'];
    r1.push([{ v: i + 1, s: 'ctr' }, { v: g.name, s: sty[0] }, { v: g.nameEn || '', s: 'text' }, { v: adv ? dn(adv) : '', s: 'text' },
      { v: membersOf(g).map(fullName).join(', '), s: 'text' }]
      .concat(cc.map(c => ({ v: cv(pk, c), s: 'num' })),
        [{ v: r ? round2(r.avg) : null, s: sty[1] }, { v: r ? round2(r.max) : null, s: 'num' }, { v: pct === null ? null : round2(pct), s: 'num' },
         { v: a ? (r ? r.n : 0) : scoredBy(pk), s: 'int' }, { v: rk ? RISK_TXT[rk] : '', s: rk ? 'warn' : 'text' }]));
  });
  const sheets = [{ name: 'สรุปรายโปรเจกต์', freeze: 4, widths: [6, 34, 30, 20, 40].concat(cc.map(() => 15), [13, 11, 10, 13, 14]), rows: r1 }];

  // แผ่น 2: รายบุคคล (ทุกสมาชิกของทุกโปรเจกต์)
  const r2 = [[{ v: 'คะแนนรายบุคคลในโปรเจกต์' + (a ? ' · ที่ ' + dn(a) + ' ให้' : ' · เฉลี่ยจากผู้ประเมินทุกคน'), s: 'title' }], noteRow(exportedAt()), [],
    [H_('โปรเจกต์'), H_('เลขที่'), H_('เลขประจำตัว'), H_('ชื่อ-นามสกุล'), H_('ระดับ')].concat(critH, [H_('เฉลี่ยรายบุคคล'), H_('ร้อยละ'), H_(a ? 'ให้แล้ว (ข้อ)' : 'ผู้ประเมิน (คน)')])];
  groups.forEach(g => membersOf(g).forEach(m => {
    const pk = ikey(g.id, m.id), r = stat(pk), pct = pctOfAvg(r), rk = riskOf(pct);
    r2.push([{ v: g.name, s: 'text' }, { v: m.no || '', s: 'ctr' }, { v: m.sid || '', s: 'ctr' }, { v: fullName(m), s: rk ? 'warn' : 'text' }, { v: m.level || '', s: 'ctr' }]
      .concat(cc.map(c => ({ v: cv(pk, c), s: 'num' })),
        [{ v: r ? round2(r.avg) : null, s: rk ? 'warnNum' : 'num' }, { v: pct === null ? null : round2(pct), s: 'num' }, { v: a ? (r ? r.n : 0) : scoredBy(pk), s: 'int' }]));
  }));
  if (r2.length > 4) sheets.push({ name: 'คะแนนรายบุคคล', freeze: 4, widths: [34, 9, 16, 30, 10].concat(cc.map(() => 15), [14, 10, 13]), rows: r2 });

  // แผ่น 3: คะแนนที่ผู้ประเมินแต่ละคนให้ (เฉพาะส่งออกภาพรวม)
  if (!a) {
    const r3 = [[{ v: 'คะแนนทั้งกลุ่มจากผู้ประเมินแต่ละคน', s: 'title' }], noteRow(exportedAt()), [], [H_('โปรเจกต์'), H_('ผู้ประเมิน')].concat(critH, [H_('เฉลี่ย')])];
    groups.forEach(g => scorers().forEach(ev => {
      const r = givenAvg(ev.id, pkey(g.id));
      if (!r) return;
      r3.push([{ v: g.name, s: 'text' }, { v: dn(ev), s: 'text' }].concat(cc.map(c => { const v = getScore(ev.id, pkey(g.id), c.id); return { v: v === undefined ? null : round2(v), s: 'num' }; }), [{ v: round2(r.avg), s: 'num' }]));
    }));
    if (r3.length > 4) sheets.push({ name: 'คะแนนรายผู้ประเมิน', freeze: 4, widths: [34, 24].concat(cc.map(() => 15), [12]), rows: r3 });
  }

  // แผ่น 4: ข้อเสนอแนะ
  const r4 = [[{ v: 'ข้อเสนอแนะต่อโปรเจกต์', s: 'title' }], noteRow(exportedAt()), [], [H_('โปรเจกต์'), H_('ผู้เขียน'), H_('เวลา'), H_('ข้อเสนอแนะ')]];
  groups.forEach(g => feedbackOf(g.id).filter(f => !a || f.u.id === a.id).forEach(f => r4.push([{ v: g.name, s: 'text' }, { v: dn(f.u), s: 'text' }, { v: fmtDate(f.at), s: 'text' }, { v: f.t, s: 'text' }])));
  if (r4.length > 4) sheets.push({ name: 'ข้อเสนอแนะ', freeze: 4, widths: [34, 24, 22, 80], rows: r4 });

  saveBlob(xlsxBlob(sheets), 'สรุปคะแนนโปรเจกต์' + (a ? '-' + safeFile(dn(a)) : '') + '-' + stamp() + '.xlsx');
  toast('ดาวน์โหลดไฟล์ Excel แล้ว');
}

// ตารางคะแนนของวิชาที่เลือกอยู่
function exportSubject() {
  const j = subjBy(S.subjectId);
  if (!j) return;
  const students = sortStudents(j.students.map(stu).filter(Boolean));
  if (!students.length) return toast('ยังไม่มีนักเรียนในวิชานี้');
  const mx = workMax(j);
  const rows = [[{ v: 'ตารางคะแนนวิชา ' + j.name, s: 'title' }],
    noteRow(`${students.length} คน · ${j.works.length} งาน · รวม ${num(mx)} คะแนน · เกณฑ์ผ่าน ${passPct()}% (ดูจากงานที่กรอกแล้ว) · ${exportedAt()}`), [],
    [H_('ที่'), H_('เลขที่'), H_('เลขประจำตัว'), H_('ชื่อ-นามสกุล'), H_('ระดับ')].concat(j.works.map(w => H_(`${w.name} (เต็ม ${num(w.max)})`)), [H_(`รวม (เต็ม ${num(mx)})`), H_('ร้อยละ'), H_('สถานะ')])];
  students.forEach((s, i) => {
    const rk = subjRisk(j, s.id), tot = workTotal(j, s.id);
    rows.push([{ v: i + 1, s: 'ctr' }, { v: s.no || '', s: 'ctr' }, { v: s.sid || '', s: 'ctr' }, { v: fullName(s), s: rk ? 'warn' : 'text' }, { v: s.level || '', s: 'ctr' }]
      .concat(j.works.map(w => { const v = getWork(j, s.id, w.id); return { v: v === undefined ? null : v, s: 'num' }; }),
        [{ v: round2(tot), s: rk ? 'warnNum' : 'num' }, { v: mx ? round2(tot / mx * 100) : null, s: 'num' }, { v: rk ? RISK_TXT[rk] : '', s: rk ? 'warn' : 'text' }]));
  });
  rows.push([{ v: 'ค่าเฉลี่ย', s: 'bold' }, null, null, null, null].concat(j.works.map(w => { const v = avgWork(j, w.id); return { v: v === null ? null : round2(v), s: 'num' }; })));
  saveBlob(xlsxBlob([{ name: j.name, freeze: 4, widths: [6, 9, 16, 32, 10].concat(j.works.map(() => 16), [14, 10, 14]), rows }]), 'คะแนนวิชา-' + safeFile(j.name) + '-' + stamp() + '.xlsx');
  toast('ดาวน์โหลดไฟล์ Excel แล้ว');
}

// ---- พิมพ์ใบสรุป: ใส่เนื้อหาลงกล่อง #psheet (ซ่อนบนจอ แสดงเฉพาะตอนพิมพ์) แล้วสั่งพิมพ์ ----
const PS = { timer: 0 };
function printHtml(html) {
  let box = document.getElementById('psheet');
  if (!box) { box = document.createElement('div'); box.id = 'psheet'; document.body.appendChild(box); }
  box.innerHTML = html;
  document.body.classList.add('printing-sheets');
  const done = () => { document.body.classList.remove('printing-sheets'); box.innerHTML = ''; clearTimeout(PS.timer); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  clearTimeout(PS.timer);
  PS.timer = setTimeout(done, 180000);   // กันค้าง: บางเบราว์เซอร์ไม่ส่ง afterprint
  setTimeout(() => window.print(), 80);
}
function projSheet(g) {
  const pk = pkey(g.id), ga = groupAvg(pk), adv = advisorOf(g), pct = pctOfAvg(ga), rk = riskOf(pct);
  const ms = membersOf(g), fbs = feedbackOf(g.id);
  const crit = S.criteria.map(c => {
    const v = avgOf(pk, c.id);
    return `<tr><td>${esc(c.name)}</td><td class="c">${num(c.max)}</td><td class="c"><b>${v === null ? '–' : fmt(v)}</b></td><td class="c">${v === null ? '–' : num(Math.round(v / c.max * 1000) / 10) + '%'}</td></tr>`;
  }).join('');
  const evals = scorers().map(ev => ({ ev, r: givenAvg(ev.id, pk) })).filter(x => x.r);
  const evalRows = evals.map(({ ev, r }) => `<tr><td>${esc(dn(ev))}</td>${S.criteria.map(c => { const v = getScore(ev.id, pk, c.id); return `<td class="c">${v === undefined ? '–' : num(v)}</td>`; }).join('')}<td class="c"><b>${fmt(r.avg)}</b></td></tr>`).join('');
  const anyInd = ms.some(m => groupAvg(ikey(g.id, m.id)));
  const memRows = ms.map(m => { const x = groupAvg(ikey(g.id, m.id)); return `<tr><td class="c">${esc(m.no || '-')}</td><td class="c">${esc(m.sid || '-')}</td><td>${esc(fullName(m))}</td><td class="c">${esc(m.level || '-')}</td>${anyInd ? `<td class="c">${x ? '<b>' + fmt(x.avg) + '</b>' : '–'}</td>` : ''}</tr>`; }).join('');
  return `
  <section class="psheet">
    <div class="ps-kicker">ใบสรุปคะแนนโปรเจกต์</div>
    <h1>${esc(g.name)}</h1>
    ${g.nameEn ? `<div class="ps-en">${esc(g.nameEn)}</div>` : ''}
    <div class="ps-meta">ครูที่ปรึกษา: ${adv ? esc(advLabel(adv)) : 'ยังไม่ระบุ'} · สมาชิก ${ms.length} คน · ผู้ประเมินทั้งกลุ่ม ${scoredBy(pk)} คน</div>
    <div class="ps-score">
      <div class="ps-big">${ga ? fmt(ga.avg) : '–'}<small> / ${ga ? num(round2(ga.max)) : num(avgMaxAll())}</small></div>
      <div class="ps-side">${pct === null ? 'ยังไม่มีผลการประเมิน' : `คิดเป็น <b>${num(Math.round(pct * 10) / 10)}%</b> ของคะแนนเต็ม`}</div>
    </div>
    <h2>คะแนนตามเกณฑ์ (เฉลี่ยจากผู้ประเมินทุกคน)</h2>
    <table><thead><tr><th>เกณฑ์</th><th class="c">คะแนนเต็ม</th><th class="c">คะแนนเฉลี่ย</th><th class="c">ร้อยละ</th></tr></thead><tbody>${crit || '<tr><td colspan="4">ยังไม่มีเกณฑ์</td></tr>'}</tbody></table>
    ${evalRows ? `<h2>คะแนนจากผู้ประเมินแต่ละคน</h2><table><thead><tr><th>ผู้ประเมิน</th>${S.criteria.map(c => `<th class="c">${esc(c.name)}</th>`).join('')}<th class="c">เฉลี่ย</th></tr></thead><tbody>${evalRows}</tbody></table>` : ''}
    <h2>ผู้จัดทำ</h2>
    <table><thead><tr><th class="c">เลขที่</th><th class="c">เลขประจำตัว</th><th>ชื่อ-นามสกุล</th><th class="c">ระดับ</th>${anyInd ? '<th class="c">คะแนนเฉลี่ยรายบุคคล</th>' : ''}</tr></thead><tbody>${memRows || '<tr><td colspan="5">ยังไม่มีสมาชิก</td></tr>'}</tbody></table>
    ${fbs.length ? `<h2>ข้อเสนอแนะ</h2>${fbs.map(f => `<div class="ps-fb"><b>${esc(dn(f.u))}</b><span> · ${esc(fmtDate(f.at))}</span><div>${esc(f.t)}</div></div>`).join('')}` : ''}
    <div class="ps-sign"><div><i></i>ครูที่ปรึกษา</div><div><i></i>ผู้ประเมิน</div><div><i></i>วันที่ ${esc(new Date().toLocaleDateString('th-TH', { dateStyle: 'long' }))}</div></div>
  </section>`;
}
// gid = พิมพ์โปรเจกต์เดียว · ไม่ใส่ = พิมพ์ทุกโปรเจกต์ (โปรเจกต์ละ 1 หน้า)
function printProjects(gid) {
  const list = gid ? [groupBy(gid)].filter(Boolean) : groupsNewest();
  if (!list.length) return toast('ยังไม่มีโปรเจกต์ให้พิมพ์');
  printHtml(list.map(projSheet).join(''));
}


/* ------------------------------------------------------------
   3.24 QR Code ลิงก์เว็บ (หน้าภาพรวมของแอดมิน)
   ใช้ลิงก์ของเว็บที่เปิดอยู่จริง จึงตรงกับ host ที่ใช้งานเสมอ · ใส่ลิงก์เองได้ถ้าแอดมินเปิดจากอีกที่อยู่
   ------------------------------------------------------------ */
function siteUrl() {
  const custom = String(setting('publicUrl', '')).trim();
  if (custom) return custom;
  try { const u = new URL(location.href); u.hash = ''; u.search = ''; u.pathname = u.pathname.replace(/[^/]*$/, ''); return u.toString(); }
  catch (e) { return String(location.href); }
}
function urlWarn(url) {
  let u; try { u = new URL(url); } catch (e) { return 'ลิงก์นี้ใช้ไม่ได้'; }
  if (!/^https?:$/.test(u.protocol)) return 'เว็บถูกเปิดจากไฟล์ในเครื่อง มือถือเครื่องอื่นเข้าไม่ได้ ให้เปิดผ่านลิงก์จริงของเว็บ หรือใส่ลิงก์จริงในช่องด้านล่าง';
  const h = u.hostname;
  if (h === 'localhost' || h === '::1' || h === '[::1]' || /^127\./.test(h)) return 'ลิงก์นี้ใช้ได้เฉพาะในเครื่องนี้ ให้ใส่ลิงก์จริงของเว็บ (โดเมนที่ host ให้) ในช่องด้านล่าง';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return 'ลิงก์นี้ใช้ได้เฉพาะคนที่ต่อ Wi-Fi/เครือข่ายเดียวกัน ถ้าจะให้เข้าจากข้างนอกให้ใส่ลิงก์จริงของเว็บในช่องด้านล่าง';
  return '';
}
function vQrCard() {
  const url = siteUrl(), svgTxt = qrSvg(url, 220), warn = urlWarn(url), custom = String(setting('publicUrl', ''));
  return `
  <div class="card qr-card no-print">
    <h2>QR Code เข้าเว็บ</h2>
    <div class="qr-body">
      <div class="qr-img" id="qr-img">${svgTxt || '<div class="small muted" style="padding:20px">ลิงก์ยาวเกินกว่าจะสร้าง QR ได้</div>'}</div>
      <div class="qr-info">
        <p class="small muted" style="margin:0 0 8px">ให้ผู้ประเมินสแกนด้วยกล้องมือถือเพื่อเข้าเว็บ แล้วเข้าสู่ระบบด้วยบัญชีของตัวเอง</p>
        <div class="qr-url"><code id="qr-url">${esc(url)}</code><button type="button" class="btn sm" onclick="copySiteUrl()">คัดลอก</button></div>
        ${warn ? `<div class="notice" role="status" style="margin:10px 0"><span>${esc(warn)}</span></div>` : ''}
        <label class="small muted" for="qr-custom">ลิงก์ที่ใช้สร้าง QR (เว้นว่าง = ใช้ลิงก์ของเว็บที่เปิดอยู่ตอนนี้)</label>
        <div class="qr-edit"><input id="qr-custom" class="input" inputmode="url" placeholder="https://ชื่อเว็บของคุณ" value="${esc(custom)}" maxlength="200"><button type="button" class="btn sm" onclick="saveQrUrl()">ใช้ลิงก์นี้</button></div>
        <div class="err" id="qr-err" role="alert"></div>
        <div class="actions" style="margin-top:6px"><button type="button" class="btn sm" onclick="downloadQr()" ${svgTxt ? '' : 'disabled'}>ดาวน์โหลด PNG</button><button type="button" class="btn sm" onclick="printQr()" ${svgTxt ? '' : 'disabled'}>พิมพ์ป้าย QR</button></div>
      </div>
    </div>
  </div>`;
}
function saveQrUrl() {
  const v = inp('qr-custom').trim();
  if (v && !/^https?:\/\/[^\s<>"']+$/i.test(v)) return setErr('qr-err', 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https:// และไม่มีช่องว่าง');
  if (v.length > 200) return setErr('qr-err', 'ลิงก์ยาวเกินไป (ไม่เกิน 200 ตัวอักษร)');
  if (v && !qrMatrix(v)) return setErr('qr-err', 'ลิงก์ยาวเกินกว่าจะสร้าง QR ได้');
  putSetting('publicUrl', v);
  toast(v ? 'บันทึกลิงก์แล้ว' : 'ใช้ลิงก์ของเว็บที่เปิดอยู่แล้ว');
  render();
}
async function copySiteUrl() {
  const url = siteUrl();
  try { await navigator.clipboard.writeText(url); toast('คัดลอกลิงก์แล้ว'); }
  catch (e) {
    const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); toast('คัดลอกลิงก์แล้ว'); } catch (e2) { toast('คัดลอกไม่ได้ ลองกดค้างที่ลิงก์แล้วคัดลอกเอง'); }
    t.remove();
  }
}
function downloadQr() {
  const s = qrSvg(siteUrl(), 1024);
  if (!s) return;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1024, 1024); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, 1024, 1024);
    c.toBlob(b => { if (b) saveBlob(b, 'qr-code-เข้าเว็บ.png'); else toast('สร้างไฟล์ PNG ไม่สำเร็จ'); }, 'image/png');
  };
  img.onerror = () => toast('สร้างไฟล์ PNG ไม่สำเร็จ');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}
function printQr() {
  const url = siteUrl(), s = qrSvg(url, 420);
  if (!s) return;
  printHtml(`<section class="psheet qr-sign"><div class="ps-kicker">ระบบประเมินโปรเจกต์และคะแนนรายวิชา</div><h1>สแกนเพื่อเข้าระบบประเมิน</h1><div class="qr-sign-img">${s}</div><div class="ps-meta">เปิดกล้องมือถือสแกน แล้วเข้าสู่ระบบด้วยชื่อผู้ใช้ของคุณ</div><div class="qr-sign-url">${esc(url)}</div></section>`);
}


/* ------------------------------------------------------------
   3.25 ค้นหาด่วน (Ctrl+K / ⌘K): พิมพ์ชื่อนักเรียน โปรเจกต์ วิชา หรือชื่อหน้า แล้วกระโดดไปทันที
   ------------------------------------------------------------ */
const PAL = { open: false, q: '', items: [], hl: 0 };
const palKey = s => nameKey(s);
function palItems(q) {
  const u = cur();
  if (!u) return [];
  const out = [];
  const add = (kind, title, sub, run, hay) => out.push({ kind, title, sub, run, k: palKey(title + ' ' + (sub || '') + ' ' + (hay || '')), t: palKey(title) });
  tabsFor(u).forEach(([v, label]) => add('หน้า', label, '', () => go(v)));
  S.groups.forEach(g => {
    const names = membersOf(g).map(fullName).join(' ');
    const sub = 'โปรเจกต์ · ' + (g.nameEn || '') + ((g.members.length) ? ' · ' + g.members.length + ' คน' : '');
    if (canU(u, 'scoreProject')) add('โปรเจกต์', g.name, 'ประเมิน' + (g.nameEn ? ' · ' + g.nameEn : ''), () => { S.evalGroup = g.id; S.indSid = null; go('evaluate'); presTick(); }, (g.nameEn || '') + ' ' + names);
    if (canU(u, 'viewAll')) add('โปรเจกต์', g.name, 'ดูคะแนน' + (g.nameEn ? ' · ' + g.nameEn : ''), () => { S.scoreView = 'all'; go('scores'); setTimeout(() => jumpToProject(g.id), 80); }, (g.nameEn || '') + ' ' + names);
    if (isAdvisor(u) && g.advisorId === u.id) add('โปรเจกต์', g.name, 'โปรเจกต์ที่ปรึกษา', () => go('mine'), (g.nameEn || '') + ' ' + names);
    if (canU(u, 'project') && !canU(u, 'viewAll') && !canU(u, 'scoreProject')) add('โปรเจกต์', g.name, sub, () => go('groups'), (g.nameEn || '') + ' ' + names);
  });
  S.subjects.forEach(j => { if (canU(u, 'subject') || canU(u, 'scoreSubject')) add('วิชา', j.name, j.students.length + ' คน · ' + j.works.length + ' งาน', () => { S.subjectId = j.id; go('subjects'); }); });
  S.students.forEach(s => {
    const gs = groupsOf(s.id), js = subjectsOf(s.id);
    const sub = stuMeta(s) + (gs.length ? ' · โปรเจกต์: ' + gs.map(g => g.name).join(', ') : '') + (js.length ? ' · วิชา: ' + js.map(j => j.name).join(', ') : '');
    if (canU(u, 'students')) add('นักเรียน', fullName(s), sub, () => { S.stuQ = s.name; S.stuLevel = ''; go('students'); }, (s.sid || '') + ' ' + (s.no || ''));
    else if (gs.length) {
      const g = gs[0];
      const run = canU(u, 'scoreProject') ? () => { S.evalGroup = g.id; go('evaluate'); } : canU(u, 'viewAll') ? () => { S.scoreView = 'all'; go('scores'); setTimeout(() => jumpToProject(g.id), 80); } : null;
      if (run) add('นักเรียน', fullName(s), 'โปรเจกต์: ' + g.name, run, s.sid || '');
    }
  });
  const key = palKey(q);
  if (!key) return out.filter(x => x.kind === 'หน้า').concat(out.filter(x => x.kind !== 'หน้า').slice(0, 5));
  const parts = String(q).trim().split(/\s+/).map(palKey).filter(Boolean);
  return out.filter(x => parts.every(p => x.k.includes(p)))
    .sort((a, b) => (b.t.startsWith(key) - a.t.startsWith(key)) || (b.t.includes(key) - a.t.includes(key)))
    .slice(0, 40);
}
const PAL_KIND = { 'หน้า': 'p', 'โปรเจกต์': 'g', 'วิชา': 'j', 'นักเรียน': 's' };
function palPaint() {
  const list = document.getElementById('pal-list');
  if (!list) return;
  PAL.items = palItems(PAL.q);
  if (PAL.hl >= PAL.items.length) PAL.hl = Math.max(0, PAL.items.length - 1);
  list.innerHTML = PAL.items.length ? PAL.items.map((it, i) => `
    <div class="pal-it${i === PAL.hl ? ' hl' : ''}" role="option" aria-selected="${i === PAL.hl}" data-i="${i}">
      <span class="pal-k ${PAL_KIND[it.kind] || ''}">${esc(it.kind)}</span>
      <span class="pal-t"><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>
      <span class="pal-go">↵</span>
    </div>`).join('') : '<div class="pal-empty">ไม่พบรายการที่ตรงกับคำค้น</div>';
  const hl = list.querySelector('.pal-it.hl');
  if (hl) { const t = hl.offsetTop, b = t + hl.offsetHeight; if (t < list.scrollTop) list.scrollTop = t; else if (b > list.scrollTop + list.clientHeight) list.scrollTop = b - list.clientHeight; }
}
function openPalette() {
  if (!cur() || PAL.open) return;
  const u = cur();
  if (u.mustChange || needsName(u)) return;
  PAL.open = true; PAL.q = ''; PAL.hl = 0;
  gsClose();
  const el = document.createElement('div');
  el.id = 'pal'; el.className = 'pal'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'ค้นหาด่วน');
  el.innerHTML = `
    <div class="pal-box">
      <div class="pal-in">${svg('search')}<input id="pal-q" type="search" autocomplete="off" spellcheck="false" placeholder="ค้นหานักเรียน โปรเจกต์ วิชา หรือชื่อหน้า" aria-label="ค้นหา"><kbd>Esc</kbd></div>
      <div class="pal-list" id="pal-list" role="listbox"></div>
      <div class="pal-foot"><span>↑ ↓ เลือก</span><span>Enter เปิด</span><span>Esc ปิด</span></div>
    </div>`;
  document.body.appendChild(el);
  const q = el.querySelector('#pal-q');
  q.addEventListener('input', () => { PAL.q = q.value; PAL.hl = 0; palPaint(); });
  el.addEventListener('mousedown', e => { if (e.target === el) closePalette(); });
  el.querySelector('#pal-list').addEventListener('click', e => { const it = e.target.closest('.pal-it'); if (it) palRun(Number(it.dataset.i)); });
  el.querySelector('#pal-list').addEventListener('pointermove', e => { const it = e.target.closest('.pal-it'); if (it && Number(it.dataset.i) !== PAL.hl) { PAL.hl = Number(it.dataset.i); el.querySelectorAll('.pal-it.hl').forEach(x => x.classList.remove('hl')); it.classList.add('hl'); } });
  palPaint();
  q.focus();
}
function closePalette() {
  const el = document.getElementById('pal');
  PAL.open = false;
  if (el) el.remove();
}
function palRun(i) {
  const it = PAL.items[i];
  if (!it) return;
  closePalette();
  it.run();
  window.scrollTo(0, 0);
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
    if (!cur()) return;
    e.preventDefault();
    if (PAL.open) closePalette(); else openPalette();
    return;
  }
  if (!PAL.open) return;
  if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); PAL.hl = Math.min(PAL.items.length - 1, PAL.hl + 1); palPaint(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); PAL.hl = Math.max(0, PAL.hl - 1); palPaint(); }
  else if (e.key === 'Enter') { e.preventDefault(); palRun(PAL.hl); }
  else if (e.key === 'Tab') { e.preventDefault(); }
}, true);


/* ------------------------------------------------------------
   3.26 หน้าประเมินโปรเจกต์ (แบบใหม่)
   วงแหวนความคืบหน้า · แถบเลื่อน · บันทึกอัตโนมัติ + ปุ่มบันทึก · ข้อเสนอแนะสำเร็จรูป · พลุเมื่อประเมินครบ
   ------------------------------------------------------------ */
const EV = { lastDone: -1, saveT: 0, fbT: 0 };

// ประเมินครบโปรเจกต์ = ให้ครบทุกเกณฑ์ทั้งกลุ่ม หรือให้ครบทุกเกณฑ์ของสมาชิกทุกคน
const evFull = (aid, slot) => S.criteria.length > 0 && S.criteria.every(c => getScore(aid, slot, c.id) !== undefined);
function evDone(aid, g) {
  if (evFull(aid, pkey(g.id))) return true;
  const ms = membersOf(g);
  return ms.length > 0 && ms.every(m => evFull(aid, ikey(g.id, m.id)));
}
const evPart = (aid, g) => !evDone(aid, g) && touched(aid, g);
const evMark = (aid, g) => (evDone(aid, g) ? '✓ ' : evPart(aid, g) ? '◐ ' : '');
function evCount(aid) {
  let done = 0, part = 0;
  S.groups.forEach(g => { if (evDone(aid, g)) done++; else if (evPart(aid, g)) part++; });
  return { done, part, total: S.groups.length };
}
function nextTodo(aid, gid) {
  const list = groupsNewest(), i = list.findIndex(g => g.id === gid);
  for (let k = 1; k <= list.length; k++) {
    const g = list[(Math.max(0, i) + k) % list.length];
    if (g.id !== gid && !evDone(aid, g)) return g;
  }
  return null;
}
function evNext() {
  const u = cur(), g = nextTodo(u.id, S.evalGroup);
  if (!g) return toast('ไม่มีโปรเจกต์ที่ยังไม่ได้ประเมินแล้ว');
  S.evalGroup = g.id; S.indSid = null;
  render();
  window.scrollTo(0, 0);
  presTick();
}

function ringHtml(c) {
  const R = 40, C = 2 * Math.PI * R, p = c.total ? c.done / c.total : 0;
  return `<div class="ring" role="img" aria-label="ประเมินแล้ว ${c.done} จาก ${c.total} โปรเจกต์">
    <svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="rgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent2)"/></linearGradient></defs>
      <circle class="trk" cx="50" cy="50" r="${R}" fill="none" stroke-width="9"/>
      <circle class="val" cx="50" cy="50" r="${R}" fill="none" stroke-width="9" stroke-linecap="round" stroke="url(#rgrad)" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - p)).toFixed(2)}"/></svg>
    <b>${c.done}<small>/${c.total}</small></b></div>`;
}
function evTopHtml(u, g) {
  const c = evCount(u.id), all = c.total > 0 && c.done === c.total, next = nextTodo(u.id, g.id);
  return `${ringHtml(c)}
    <div class="ev-top-txt">
      <div class="ev-top-h">ประเมินแล้ว <b>${c.done}/${c.total}</b> โปรเจกต์${c.part ? ` <span class="small muted">· กำลังประเมิน ${c.part}</span>` : ''}</div>
      <div class="small muted">${all ? 'ประเมินครบทุกโปรเจกต์แล้ว ขอบคุณครับ' : `เหลืออีก ${c.total - c.done} โปรเจกต์`}</div>
      <div><button type="button" class="btn sm primary" onclick="evNext()" ${next ? '' : 'disabled'}>${next ? 'โปรเจกต์ถัดไปที่ยังไม่ได้ประเมิน →' : 'ไม่มีโปรเจกต์ที่ค้างอยู่'}</button></div>
    </div>`;
}

// ตำแหน่งที่คะแนนจะถูกบันทึกลง: ทั้งกลุ่ม หรือสมาชิกที่เลือกอยู่ (โหมดรายบุคคล แบบทีละคน)
function evMember(g) { const ms = membersOf(g); return ms.find(m => m.id === S.indSid) || ms[0] || null; }
function evSlot() {
  const g = groupBy(S.evalGroup);
  if (!g) return null;
  if (S.evalMode === 'person') { const m = evMember(g); return m ? ikey(g.id, m.id) : null; }
  return pkey(g.id);
}
const stepOf = max => (Number.isInteger(max) ? (max <= 10 ? 0.5 : 1) : (Math.round(max * 10) === max * 10 ? 0.1 : 'any'));
function critRow(c, v, locked) {
  const unset = v === undefined;
  const ctl = `<input type="range" class="range ev-range" min="0" max="${c.max}" step="${stepOf(c.max)}" value="${unset ? 0 : v}" style="--p:${unset ? 0 : Math.min(100, v / c.max * 100)}%" ${locked ? 'disabled' : ''} aria-label="คะแนน ${esc(c.name)} (เต็ม ${num(c.max)})" oninput="evLive('${c.id}',this)" onchange="evSet('${c.id}',this.value)">`;
  return `
  <div class="ev-row${unset ? ' unset' : ''}" id="cr-${c.id}">
    <div class="ev-head"><span class="ind-name">${esc(c.name)}</span><span class="ev-hint">ยังไม่ให้คะแนน</span><span class="small muted">เต็ม ${num(c.max)}</span></div>
    <div class="ev-ctl">
      <div class="ev-main">${ctl}</div>
      <div class="ev-box">
        <input class="input ev-num" type="number" min="0" max="${c.max}" step="any" inputmode="decimal" placeholder="–" value="${unset ? '' : v}" ${locked ? 'disabled' : ''} aria-label="พิมพ์คะแนน ${esc(c.name)}" onchange="evSet('${c.id}',this.value)">
        <span class="ev-of">/ ${num(c.max)}</span>
        <button type="button" class="ev-x" ${locked ? 'disabled' : ''} title="ล้างคะแนนข้อนี้" aria-label="ล้างคะแนน ${esc(c.name)}" onclick="evSet('${c.id}','')">×</button>
      </div>
    </div>
  </div>`;
}
// ลากแถบเลื่อนอยู่ (ยังไม่บันทึก จนกว่าจะปล่อย): อัปเดตตัวเลขและสีของแถบให้เห็นทันที
function evLive(cid, el) {
  const row = document.getElementById('cr-' + cid);
  if (!row) return;
  row.classList.remove('unset');
  el.style.setProperty('--p', (Number(el.max) ? Number(el.value) / Number(el.max) * 100 : 0) + '%');
  const n = row.querySelector('.ev-num');
  if (n) n.value = el.value;
}
// ปรับหน้าตาของแถวเกณฑ์ให้ตรงกับคะแนนที่บันทึกจริง (แก้ที่เดิม ไม่วาดใหม่ ไม่งั้นแถบเลื่อนจะหลุดโฟกัส)
function evPaint(cid) {
  const row = document.getElementById('cr-' + cid), c = S.criteria.find(x => x.id === cid), slot = evSlot();
  if (!row || !c || !slot) return;
  const v = getScore(S.uid, slot, cid);
  row.classList.toggle('unset', v === undefined);
  const sl = row.querySelector('.ev-range');
  if (sl) { sl.value = v === undefined ? 0 : v; sl.style.setProperty('--p', (v === undefined ? 0 : Math.min(100, v / c.max * 100)) + '%'); }
  const n = row.querySelector('.ev-num');
  if (n) n.value = v === undefined ? '' : v;
}
function evSet(cid, raw) {
  const u = cur(), c = S.criteria.find(x => x.id === cid), slot = evSlot();
  if (!u || !c || !slot) return;
  if (evalLocked()) { toast(evalLockText() + ' แก้ไขคะแนนไม่ได้'); return evPaint(cid); }
  const old = getScore(u.id, slot, cid), s = String(raw).trim();
  let v;
  if (s === '') v = undefined;
  else {
    v = Number(s);
    if (!Number.isFinite(v) || v < 0 || v > c.max) { toast(`คะแนนข้อ "${c.name}" ต้องอยู่ระหว่าง 0 ถึง ${num(c.max)}`); return evPaint(cid); }
    v = round2(v);
  }
  if (v === old) return evPaint(cid);
  setScore(u.id, slot, cid, v);
  evPaint(cid);
  evAfter();
}
function evAfter() { save(); autoBadge('ev-badge'); evRefresh(); }
// ปุ่ม "บันทึกคะแนน": ส่งสิ่งที่ค้างอยู่ขึ้นเซิร์ฟเวอร์ทันทีและบอกผลให้ชัด (ระบบยังบันทึกอัตโนมัติทุกครั้งที่แก้อยู่แล้ว)
async function evSaveNow() {
  const u = cur(), g = groupBy(S.evalGroup);
  if (!u || !g) return;
  if (evalLocked()) return toast(evalLockText() + ' แก้ไขคะแนนไม่ได้');
  document.activeElement && document.activeElement.blur && document.activeElement.blur();   // ให้ช่องที่ยังพิมพ์ค้างอยู่ถูกบันทึกก่อน
  await new Promise(r => setTimeout(r, 60));
  save();
  try { if (NET.mode === 'server') await flushPending(); } catch (e) {}
  const synced = NET.mode !== 'server' || (NET.base && !SyncCore.diff(NET.base, dataOf()).length);
  autoBadge('ev-badge');
  const who = S.evalMode === 'person' ? ' ของ ' + fullName(evMember(g) || {}) : '';
  toast(synced ? `บันทึกคะแนน${who} โปรเจกต์ "${g.name}" แล้ว` : 'ส่งขึ้นเซิร์ฟเวอร์ยังไม่ได้ ระบบจะลองใหม่ให้เอง');
}

function evSumHtml(u) {
  const slot = evSlot(), r = slot ? givenAvg(u.id, slot) : null;
  return `<div><b>${r ? fmt(r.avg) : '–'}</b><span class="small muted">คะแนนเฉลี่ยที่บันทึกไว้ (เต็ม ${num(round2(r ? r.max : avgMaxAll()))})${r && r.n < S.criteria.length ? ` · ให้แล้ว ${r.n}/${S.criteria.length} ข้อ` : ''}</span></div>`;
}
function peopleHtml(u, g) {
  const ms = membersOf(g), cm = evMember(g);
  return ms.map(m => {
    const slot = ikey(g.id, m.id), done = evFull(u.id, slot), part = !done && hasAny(u.id, slot);
    return `<button type="button" class="pp${cm && cm.id === m.id ? ' on' : ''}${done ? ' done' : part ? ' part' : ''}" title="${esc(stuMeta(m))}" onclick="evPick('${m.id}')"><i></i>${esc(fullName(m))}</button>`;
  }).join('');
}
function evPick(sid) { S.indSid = sid; render(); }
function evStep(d) {
  const g = groupBy(S.evalGroup), ms = g ? membersOf(g) : [];
  const cm = g ? evMember(g) : null;
  if (!cm) return;
  const n = ms[(ms.findIndex(m => m.id === cm.id) + d + ms.length) % ms.length];
  S.indSid = n.id; render();
}
// อัปเดตส่วนที่ขึ้นกับคะแนนรวม (วงแหวน ค่าเฉลี่ย รายชื่อสมาชิก ป้ายในตัวเลือกโปรเจกต์) โดยไม่วาดหน้าใหม่ · และยิงพลุเมื่อประเมินครบ
function evRefresh() {
  const u = cur(), g = groupBy(S.evalGroup);
  if (!u || !g) return;
  const top = document.getElementById('ev-top'); if (top) top.innerHTML = evTopHtml(u, g);
  const sum = document.getElementById('ev-sum'); if (sum) sum.innerHTML = evSumHtml(u);
  const pp = document.getElementById('ev-people'); if (pp) pp.innerHTML = peopleHtml(u, g);
  const sel = document.getElementById('ev-g');
  if (sel) { Array.from(sel.options).forEach(o => { const x = groupBy(o.value); if (x) o.textContent = evMark(u.id, x) + gTitle(x); }); gsSync(sel); }
  const c = evCount(u.id);
  if (EV.lastDone >= 0 && EV.lastDone < c.total && c.done === c.total && c.total > 0) celebrate();
  EV.lastDone = c.done;
}
function evClearAll() {
  const slot = evSlot();
  if (!slot || evalLocked()) return;
  if (!confirm('ล้างคะแนนทุกข้อของ' + (S.evalMode === 'person' ? 'สมาชิกคนนี้' : 'กลุ่มนี้') + '?')) return;
  S.criteria.forEach(c => setScore(S.uid, slot, c.id, undefined));
  save(); render();
}

// ป้าย "บันทึกอัตโนมัติ": กำลังบันทึก… -> ✓ บันทึกอัตโนมัติแล้ว (โหมดเซิร์ฟเวอร์รอจนเซิร์ฟเวอร์รับแล้วจริง)
function autoBadge(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'autosave saving'; el.textContent = 'กำลังบันทึก…';
  clearTimeout(EV.saveT);
  const t0 = Date.now();
  const check = () => {
    const e2 = document.getElementById(id);
    if (!e2) return;
    const ok = NET.mode !== 'server' || (!NET.busy && NET.base && !SyncCore.diff(NET.base, dataOf()).length);
    if (ok) { e2.className = 'autosave saved'; e2.textContent = '✓ บันทึกอัตโนมัติแล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); return; }
    if (Date.now() - t0 > 8000) { e2.className = 'autosave err'; e2.textContent = 'ส่งขึ้นเซิร์ฟเวอร์ยังไม่ได้ จะลองใหม่อัตโนมัติ'; return; }
    EV.saveT = setTimeout(check, 250);
  };
  EV.saveT = setTimeout(check, 200);
}
const badgeHtml = (id, txt) => `<span class="autosave" id="${id}" role="status">${txt || 'บันทึกอัตโนมัติ'}</span>`;

// พลุเล็กๆ ตอนประเมินครบทุกโปรเจกต์ (ปิดให้เองเมื่อผู้ใช้ตั้ง "ลดการเคลื่อนไหว")
function celebrate() {
  toast('ประเมินครบทุกโปรเจกต์แล้ว ขอบคุณครับ');
  if (calmMotion()) return;
  const cv = document.createElement('canvas');
  cv.className = 'fx'; cv.width = innerWidth; cv.height = innerHeight; cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d'), parts = [], colors = ['#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9f1c'], start = performance.now();
  const burst = (x, y) => { for (let i = 0; i < 48; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5.5; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, d: .011 + Math.random() * .013, c: colors[(Math.random() * colors.length) | 0], r: 1.8 + Math.random() * 2.2 }); } };
  [[.22, .38, 0], [.74, .3, 280], [.5, .5, 560]].forEach(([fx, fy, t]) => setTimeout(() => burst(innerWidth * fx, innerHeight * fy), t));
  (function tick(now) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .09; p.vx *= .985; p.life -= p.d; ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); });
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
    if (now - start < 3300 || parts.length) requestAnimationFrame(tick); else cv.remove();
  })(start);
  setTimeout(() => cv.remove(), 7000);
}

// ---- ข้อเสนอแนะสำเร็จรูป ----
const FB_GOOD = ['อธิบายได้ชัดเจน', 'ผลงานมีความคิดสร้างสรรค์', 'ทำงานร่วมกันได้ดี', 'นำเสนอได้น่าสนใจ', 'ใช้งานได้จริงและครบถ้วน'];
const FB_IMP = ['ควรเพิ่มรายละเอียด', 'ควรปรับปรุงการนำเสนอ', 'ควรทดสอบให้รอบคอบกว่านี้', 'ควรเพิ่มข้อมูลอ้างอิง', 'ควรแบ่งหน้าที่ในกลุ่มให้ชัดเจน'];
function fbPresets(boxId, gid) {
  const chip = (t, k) => `<button type="button" class="pre ${k}" data-t="${esc(t)}" onclick="fbAdd('${boxId}','${gid}',this.dataset.t)">+ ${esc(t)}</button>`;
  return `<div class="fb-presets" role="group" aria-label="ข้อเสนอแนะสำเร็จรูป (กดเพื่อเติมลงช่อง)">${FB_GOOD.map(t => chip(t, 'good')).join('')}${FB_IMP.map(t => chip(t, 'imp')).join('')}</div>`;
}
function fbAdd(boxId, gid, text) {
  const el = document.getElementById(boxId);
  if (!el) return;
  if (el.value.split('\n').map(s => s.trim()).includes(text)) return toast('มีข้อความนี้อยู่ในช่องแล้ว');
  const next = (el.value.trim() ? el.value.replace(/\s+$/, '') + '\n' : '') + text;
  if (next.length > FB_MAX) return toast('ข้อความยาวเกินกำหนด');
  el.value = next;
  el.focus();
  try { el.setSelectionRange(next.length, next.length); } catch (e) {}
  fbAuto(boxId, gid);
}
// พิมพ์ข้อเสนอแนะค้างไว้ครู่หนึ่งแล้วบันทึกให้เอง (ข้อความว่าง = ไม่ลบอัตโนมัติ ต้องกดปุ่มบันทึกเอง)
function fbAuto(boxId, gid) {
  clearTimeout(EV.fbT);
  EV.fbT = setTimeout(() => {
    const el = document.getElementById(boxId);
    if (!el || !groupBy(gid)) return;
    const t = el.value.trim().slice(0, FB_MAX), old = (S.feedback[gid] || {})[S.uid];
    if (!t || (old && old.t === t)) return;
    setFeedback(gid, S.uid, t);
    save();
    autoBadge(boxId + '-badge');
    const w = document.getElementById(boxId + '-when');
    if (w) w.textContent = 'บันทึกล่าสุด ' + fmtTime(Date.now());
  }, 1200);
}

function vScore() {
  const u = cur();
  const mgr = can('project');   // มีสิทธิ์จัดการกลุ่ม/เกณฑ์ = พาไปเพิ่มเองได้
  const title = '<div class="page-title"><h1>ประเมินโปรเจกต์</h1></div>';

  // ยังไม่พร้อมให้คะแนน: แจ้งว่าขาดอะไร
  let wait = '';
  if (!S.groups.length)        wait = mgr ? 'ยังไม่มีกลุ่ม ไปเพิ่มได้ที่เมนู "กลุ่มโปรเจกต์"' : 'รอแอดมินเพิ่มโปรเจกต์ก่อน';
  else if (!S.criteria.length) wait = mgr ? 'ยังไม่มีเกณฑ์ ไปเพิ่มได้ที่เมนู "เกณฑ์โปรเจกต์"' : 'รอแอดมินกำหนดเกณฑ์การให้คะแนน';
  if (wait) return `${title}<div class="card"><p class="muted" style="margin:0">${wait}</p></div>`;

  // กลุ่มที่เลือกไว้หายไป (เช่น ถูกลบ) ให้ใช้กลุ่มใหม่สุดแทน
  if (!groupBy(S.evalGroup)) S.evalGroup = groupsNewest()[0].id;
  const g = groupBy(S.evalGroup), pk = pkey(g.id), adv = advisorOf(g);
  const locked = evalLocked(), person = S.evalMode === 'person';
  const members = membersOf(g);
  const rg = givenAvg(u.id, pk);
  const indDone = members.filter(m => hasAny(u.id, ikey(g.id, m.id))).length;
  EV.lastDone = evCount(u.id).done;

  const picker = `
  <div class="card">
    <div class="field" style="margin:0">
      <label for="ev-g">เลือกโปรเจกต์ (กลุ่ม) ที่จะให้คะแนน <span class="small muted">· ✓ ประเมินครบ · ◐ กำลังประเมิน</span></label>
      <select id="ev-g" onchange="setEvalGroup(this.value)">
        ${groupsNewest().map(x => `<option value="${x.id}" ${x.id === g.id ? 'selected' : ''}>${evMark(u.id, x)}${esc(gTitle(x))}</option>`).join('')}
      </select>
    </div>
  </div>

  <div class="card proj-card">
    <div class="proj-label">โครงงานที่กำลังประเมิน</div>
    <h2 class="proj-name">${esc(g.name)}</h2>
    ${g.nameEn ? `<div class="proj-en">${esc(g.nameEn)}</div>` : ''}
    <div class="proj-meta small muted">ครูที่ปรึกษา: ${adv ? `<b>${esc(advLabel(adv))}</b>` : 'ยังไม่ระบุ'} · สมาชิก ${g.members.length} คน</div>
    ${memberChips(g)}
    <div class="live-box" id="live-box" aria-live="polite">${liveHtml(g.id)}</div>
  </div>`;

  // สลับรูปแบบการประเมิน: ทั้งกลุ่ม / รายบุคคล (คะแนน 2 แบบแยกจากกัน)
  const modeCard = `
  <div class="card">
    <div class="seg" role="tablist" aria-label="รูปแบบการประเมิน">
      <button type="button" role="tab" class="${person ? '' : 'on'}" aria-selected="${!person}" onclick="setEvalMode('group')">ประเมินทั้งกลุ่ม</button>
      <button type="button" role="tab" class="${person ? 'on' : ''}" aria-selected="${person}" onclick="setEvalMode('person')">ประเมินรายบุคคล</button>
    </div>
    <div class="small muted" style="margin-top:10px">
      ทั้งกลุ่ม: ${rg ? `ให้แล้ว ${rg.n}/${S.criteria.length} ข้อ · เฉลี่ย ${fmt(rg.avg)}` : 'ยังไม่ได้ให้คะแนน'}
      &nbsp;·&nbsp; รายบุคคล: ให้แล้ว ${indDone}/${members.length} คน
    </div>
  </div>`;

  const hint = locked ? `${esc(evalLockText())} · ดูได้อย่างเดียว`
    : 'ปรับแถบเลื่อนแล้วระบบบันทึกให้ทันที (กด "บันทึกคะแนน" เพื่อยืนยันอีกครั้งก็ได้) · พิมพ์ตัวเลขเองได้ที่ช่องด้านขวา';

  let form;
  if (!person) {
    form = `
  <div class="card" id="ev-form">
    <div class="role-head"><h2 style="margin:0">แบบประเมินโปรเจกต์ (ประเมินทั้งกลุ่ม)</h2>${badgeHtml('ev-badge')}</div>
    <div class="small muted" style="margin:6px 0 10px">ผู้ประเมิน ${esc(dn(u))} · ${hint}</div>
    ${S.criteria.map(c => critRow(c, getScore(u.id, pk, c.id), locked)).join('')}
    <div class="sumbox" id="ev-sum">${evSumHtml(u)}</div>
    ${locked ? '' : '<div class="actions"><button type="button" class="btn primary" onclick="evSaveNow()">บันทึกคะแนน</button><button type="button" class="btn sm danger" onclick="evClearAll()">ล้างคะแนนกลุ่มนี้</button></div>'}
  </div>`;
  } else if (!members.length) {
    form = `<div class="card"><p class="muted" style="margin:0">กลุ่มนี้ยังไม่มีสมาชิก ${mgr ? 'ไปเพิ่มสมาชิกได้ที่เมนู "กลุ่มโปรเจกต์"' : 'รอแอดมินเพิ่มสมาชิกก่อนจึงจะประเมินรายบุคคลได้'}</p></div>`;
  } else {
    const view = S.indView === 'table' ? 'table' : 'one', cm = evMember(g);
    const viewSeg = `<div class="seg sm" role="radiogroup" aria-label="มุมมองการประเมินรายบุคคล">
      <button type="button" role="radio" aria-checked="${view === 'one'}" class="${view === 'one' ? 'on' : ''}" onclick="S.indView='one';render()">ทีละคน</button>
      <button type="button" role="radio" aria-checked="${view === 'table'}" class="${view === 'table' ? 'on' : ''}" onclick="S.indView='table';render()">ตาราง</button>
    </div>`;
    const body = view === 'table' ? `
    <div class="tw sheet-wrap" style="margin-top:12px">
      <table class="sheet stack">
        <thead><tr><th>เลขที่</th><th style="text-align:left">ชื่อ-นามสกุล</th>${critHeads()}<th>เฉลี่ย<div class="small muted">/${num(avgMaxAll())}</div></th></tr></thead>
        <tbody>
          ${members.map(m => {
            const ra = givenAvg(u.id, ikey(g.id, m.id));
            return `
          <tr>
            <td class="c no">${esc(m.no || '-')}</td>
            <td class="nm" style="min-width:170px">${esc(fullName(m))}<div class="small muted">เลขที่ ${esc(m.no || '-')} · ${esc(m.sid || '-')}</div></td>
            ${S.criteria.map(c => {
              const v = getScore(u.id, ikey(g.id, m.id), c.id);
              return `<td class="c" data-label="${esc(c.name)} (เต็ม ${num(c.max)})"><input class="cell" type="number" min="0" max="${c.max}" step="any" inputmode="decimal" data-s="${esc(m.id)}" data-c="${esc(c.id)}" ${locked ? 'disabled' : ''} aria-label="คะแนน ${esc(fullName(m))} ข้อ ${esc(c.name)}" value="${v === undefined ? '' : v}" onchange="evCell(this)"></td>`;
            }).join('')}
            <td class="c" data-label="เฉลี่ย" id="ia-${esc(m.id)}">${ra ? `<b>${fmt(ra.avg)}</b>` : '<span class="muted">–</span>'}</td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : `
    <div class="small muted" style="margin:12px 0 6px">เลือกสมาชิกที่จะให้คะแนน <span class="small">· จุดเขียว = ครบ · จุดส้ม = ให้บางข้อ</span></div>
    <div class="pp-chips" id="ev-people">${peopleHtml(u, g)}</div>
    <div class="ev-who">กำลังให้คะแนน <b>${esc(fullName(cm))}</b> <span class="small muted">${esc(stuMeta(cm))}</span></div>
    ${S.criteria.map(c => critRow(c, getScore(u.id, ikey(g.id, cm.id), c.id), locked)).join('')}
    <div class="sumbox" id="ev-sum">${evSumHtml(u)}</div>
    <div class="actions"><button type="button" class="btn sm" onclick="evStep(-1)">← คนก่อนหน้า</button><button type="button" class="btn sm" onclick="evStep(1)">คนถัดไป →</button>
      ${locked ? '' : '<button type="button" class="btn sm primary" onclick="evSaveNow()">บันทึกคะแนน</button><button type="button" class="btn sm danger" onclick="evClearAll()">ล้างคะแนนคนนี้</button>'}</div>`;
    form = `
  <div class="card" id="ev-form">
    <div class="role-head"><h2 style="margin:0">แบบประเมินรายบุคคล</h2>${badgeHtml('ev-badge')}</div>
    <div class="small muted" style="margin:6px 0 10px">ผู้ประเมิน ${esc(dn(u))} · ${hint} · คะแนนรายบุคคลแยกจากคะแนนทั้งกลุ่ม</div>
    ${viewSeg}
    ${body}
    <div class="err" id="icerr" role="alert"></div>
    ${locked ? '' : `<div class="actions">${view === 'table' ? '<button type="button" class="btn primary" onclick="evSaveNow()">บันทึกคะแนน</button>' : ''}<button type="button" class="btn" onclick="fillFromGroup()">เติมคะแนนทั้งกลุ่มในช่องที่ว่างของทุกคน</button></div>`}
  </div>`;
  }

  // ข้อเสนอแนะ (เขียนต่อโครงงาน แอดมินและครูที่ปรึกษาเห็นทันที) + ปุ่มข้อความสำเร็จรูป + บันทึกให้เอง
  const mine = (S.feedback[g.id] || {})[u.id];
  const fb = `
  <form class="card" onsubmit="saveFeedback(event,'${g.id}','fb-text')" novalidate>
    <div class="role-head"><h2 style="margin:0">ข้อเสนอแนะ</h2>${badgeHtml('fb-text-badge')}</div>
    <p class="small muted" style="margin:6px 0 10px">เขียนข้อเสนอแนะต่อโครงงาน "${esc(g.name)}" แอดมินและครูที่ปรึกษาจะเห็นข้อความนี้ในหน้าของตัวเอง · กดข้อความสำเร็จรูปเพื่อเติมลงช่อง</p>
    ${fbPresets('fb-text', g.id)}
    <textarea id="fb-text" class="input" rows="5" maxlength="${FB_MAX}" oninput="fbAuto('fb-text','${g.id}')" placeholder="เช่น จุดเด่นของงาน สิ่งที่ควรปรับปรุง คำแนะนำสำหรับการพัฒนาต่อ">${esc(mine ? mine.t : '')}</textarea>
    <div class="small muted" style="margin:6px 0 0" id="fb-text-when">${mine ? 'บันทึกล่าสุด ' + esc(fmtTime(mine.at)) : 'ยังไม่ได้เขียนข้อเสนอแนะ'}</div>
    <div class="err" id="fb-err" role="alert"></div>
    <button class="btn primary">บันทึกข้อเสนอแนะ</button>
  </form>`;

  return `${title}${roundBanner(false)}<div class="card ev-top" id="ev-top">${evTopHtml(u, g)}</div>${picker}${modeCard}${form}${fb}`;
}

function setEvalMode(m) {
  S.evalMode = m === 'person' ? 'person' : 'group';
  render();
}

// ช่องในตารางรายบุคคล: พิมพ์แล้วออกจากช่อง = บันทึกเลย
function evCell(el) {
  const u = cur(), g = groupBy(S.evalGroup), c = S.criteria.find(x => x.id === el.dataset.c), m = stu(el.dataset.s);
  if (!u || !g || !c || !m) return;
  const slot = ikey(g.id, m.id), old = getScore(u.id, slot, c.id);
  const back = () => { el.value = old === undefined ? '' : old; };
  if (evalLocked()) { toast(evalLockText() + ' แก้ไขคะแนนไม่ได้'); return back(); }
  const s = el.value.trim();
  let v;
  if (s === '') v = undefined;
  else {
    v = Number(s);
    if (!Number.isFinite(v) || v < 0 || v > c.max) { toast(`คะแนนของ ${fullName(m)} ข้อ "${c.name}" ต้องอยู่ระหว่าง 0 ถึง ${num(c.max)}`); return back(); }
    v = round2(v);
  }
  if (v === old) return;
  setScore(u.id, slot, c.id, v);
  const ra = givenAvg(u.id, slot), cell = document.getElementById('ia-' + m.id);
  if (cell) cell.innerHTML = ra ? `<b>${fmt(ra.avg)}</b>` : '<span class="muted">–</span>';
  evAfter();
}

// ช่วยกรอก: เอาคะแนนทั้งกลุ่มที่ให้ไว้ มาใส่ในช่องรายบุคคลที่ยังว่างของทุกคน (บันทึกทันที)
function fillFromGroup() {
  const g = groupBy(S.evalGroup);
  if (!g) return;
  if (evalLocked()) return toast(evalLockText() + ' แก้ไขคะแนนไม่ได้');
  let any = false, n = 0;
  S.criteria.forEach(c => {
    const v = getScore(S.uid, pkey(g.id), c.id);
    if (v === undefined) return;
    any = true;
    membersOf(g).forEach(m => { if (getScore(S.uid, ikey(g.id, m.id), c.id) === undefined) { setScore(S.uid, ikey(g.id, m.id), c.id, v); n++; } });
  });
  if (n) { toast(`เติมคะแนนทั้งกลุ่มให้สมาชิก ${n} ช่องแล้ว`); render(); }
  else toast(!any ? 'ยังไม่มีคะแนนทั้งกลุ่มให้เติม ให้คะแนนทั้งกลุ่มก่อน' : 'ไม่มีช่องว่างให้เติม');
}


/* ------------------------------------------------------------
   3.27 สถานะออนไลน์: "ผู้ประเมิน X กำลังประเมินโปรเจกต์นี้" (ต้องรันกับ server.js)
   เบราว์เซอร์รายงานตำแหน่งตัวเองทุก 5 วินาทีเฉพาะตอนที่แท็บเปิดอยู่ เซิร์ฟเวอร์จำไว้ในหน่วยความจำ 20 วินาที
   ------------------------------------------------------------ */
const PRES = { list: [], timer: 0, busy: false };
const presWhere = () => (S.view === 'evaluate' && S.evalGroup ? 'eval:' + S.evalGroup : S.view);
async function presTick() {
  if (NET.mode !== 'server' || !NET.token || document.hidden || !cur() || PRES.busy) return;
  PRES.busy = true;
  try { const r = await api('POST', 'api/presence', { w: presWhere() }); PRES.list = Array.isArray(r.list) ? r.list : []; presPaint(); }
  catch (e) { /* ไม่สำคัญ: รอบหน้าลองใหม่ */ }
  finally { PRES.busy = false; }
}
function presStart() { clearInterval(PRES.timer); PRES.list = []; PRES.timer = setInterval(presTick, 5000); presTick(); }
function presStop() { clearInterval(PRES.timer); PRES.timer = 0; PRES.list = []; }
function liveHtml(gid) {
  const names = PRES.list.filter(x => x.uid !== S.uid && x.w === 'eval:' + gid).map(x => userById(x.uid)).filter(Boolean).map(dn);
  return names.length ? `<span class="live-dot"></span><span>ผู้ประเมิน <b>${esc(names.join(', '))}</b> กำลังประเมินโปรเจกต์นี้อยู่</span>` : '';
}
function whereText(w) {
  if (w.startsWith('eval:')) { const g = groupBy(w.slice(5)); return g ? 'กำลังประเมิน "' + g.name + '"' : 'หน้าประเมินโปรเจกต์'; }
  const t = (tabsFor(cur()).find(x => x[0] === w) || [])[1];
  return t ? 'อยู่หน้า ' + t : 'ออนไลน์';
}
function liveHome() {
  const on = PRES.list.map(x => ({ u: userById(x.uid), w: x.w })).filter(x => x.u);
  if (!on.length) return '<p class="small muted" style="margin:0">ยังไม่มีใครออนไลน์ (ข้อมูลอัปเดตทุก 5 วินาที)</p>';
  return `<div class="live-list">${on.map(x => `<div class="live-it"><span class="live-dot"></span><b>${esc(dn(x.u))}</b>${x.u.id === S.uid ? ' <span class="chip gray">คุณ</span>' : ''}<span class="small muted">${esc(whereText(x.w))}</span></div>`).join('')}</div>`;
}
function presPaint() {
  const lb = document.getElementById('live-box');
  if (lb && S.evalGroup) { const h = liveHtml(S.evalGroup); if (lb.innerHTML !== h) lb.innerHTML = h; }
  const lh = document.getElementById('live-home');
  if (lh) { const h = liveHome(); if (lh.innerHTML !== h) lh.innerHTML = h; }
  const lc = document.getElementById('live-count');
  if (lc) lc.textContent = PRES.list.length ? '· ' + PRES.list.length + ' คน' : '';
}


/* ------------------------------------------------------------
   3.28 ตัวเลขนับขึ้นเมื่อเปิดหน้าภาพรวม + สกีมเมอร์ตอนโหลด
   ------------------------------------------------------------ */
const FX = { played: false };
function countUp(el) {
  const to = Number(el.dataset.count);
  if (!Number.isFinite(to) || to <= 0) return;
  const t0 = performance.now(), dur = 850 + Math.min(500, to * 2);
  el.textContent = '0';
  (function step(now) {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(to * e));
    if (p < 1) requestAnimationFrame(step); else el.textContent = String(to);
  })(t0);
}
function runFx() {
  const fresh = !FX.played;
  FX.played = true;
  if (!fresh || calmMotion()) return;
  document.querySelectorAll('[data-count]').forEach(countUp);
  const app = document.getElementById('app');
  app.classList.add('fresh');
  setTimeout(() => app.classList.remove('fresh'), 1400);
}
const skel = (w, h, extra) => `<div class="sk" style="width:${w};height:${h};${extra || ''}"></div>`;
function vSkeleton() {
  return `
  <div class="login-wrap"><div class="skel-page" role="status" aria-label="กำลังเชื่อมต่อเซิร์ฟเวอร์">
    ${skel('46%', '22px')}${skel('72%', '14px', 'margin:10px 0 18px')}
    <div class="skel-stats">${skel('100%', '74px')}${skel('100%', '74px')}${skel('100%', '74px')}</div>
    ${skel('100%', '120px', 'margin-top:14px')}${skel('100%', '90px', 'margin-top:14px')}
    <p class="muted" style="text-align:center;margin:16px 0 0">กำลังเชื่อมต่อเซิร์ฟเวอร์…</p>
  </div></div>`;
}


/* ------------------------------------------------------------
   3.29 ประวัติการแก้ไข + สำรอง/กู้ข้อมูล (หน้าแอดมิน)
   ------------------------------------------------------------ */
const HIS = { kind: '', entries: [], total: 0, loading: false, err: '', more: false, backups: null, bErr: '', timer: 0 };
const HIS_KINDS = [['', 'ทั้งหมด'], ['score', 'คะแนน'], ['feedback', 'ข้อเสนอแนะ'], ['project', 'โปรเจกต์'], ['criteria', 'เกณฑ์'], ['student', 'นักเรียน'], ['subject', 'วิชา'], ['user', 'ผู้ใช้'], ['system', 'ระบบ']];
async function hisLoad(more) {
  if (NET.mode !== 'server' || HIS.loading) return;
  HIS.loading = true;
  try {
    const q = 'limit=150' + (HIS.kind ? '&kind=' + encodeURIComponent(HIS.kind) : '') + (more && HIS.entries.length ? '&before=' + HIS.entries[HIS.entries.length - 1].t : '');
    const r = await api('GET', 'api/audit?' + q);
    HIS.entries = more ? HIS.entries.concat(r.entries) : r.entries;
    HIS.more = r.entries.length >= 150;
    HIS.total = r.total; HIS.err = '';
  } catch (e) { HIS.err = e.message || 'โหลดประวัติไม่สำเร็จ'; }
  HIS.loading = false;
  hisPaint();
}
async function hisLoadBackups() {
  if (NET.mode !== 'server') return;
  try { const r = await api('GET', 'api/backups'); HIS.backups = r.files || []; HIS.bErr = ''; } catch (e) { HIS.bErr = e.message || 'โหลดรายการไฟล์สำรองไม่สำเร็จ'; }
  const el = document.getElementById('bk-list');
  if (el) el.innerHTML = backupListHtml();
}
function hisEnter() {
  clearInterval(HIS.timer);
  if (NET.mode !== 'server') return;
  hisLoad(); hisLoadBackups();
  HIS.timer = setInterval(() => { if (S.view !== 'history') { clearInterval(HIS.timer); return; } if (!document.hidden) hisLoad(); }, 8000);
}
function setHisKind(k) { HIS.kind = k; HIS.entries = []; HIS.more = false; render(); hisLoad(); }
const dayLabel = t => {
  const d = new Date(t), n = new Date(), z = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((z(n) - z(d)) / 86400000);
  return diff === 0 ? 'วันนี้' : diff === 1 ? 'เมื่อวาน' : d.toLocaleDateString('th-TH', { dateStyle: 'long' });
};
function auditHtml() {
  if (HIS.err) return `<div class="notice" role="alert"><span>${esc(HIS.err)}</span></div>`;
  if (!HIS.entries.length) return HIS.loading ? `<div class="skel-list">${skel('100%', '18px')}${skel('90%', '18px')}${skel('96%', '18px')}${skel('80%', '18px')}</div>` : '<p class="small muted" style="margin:0">ยังไม่มีประวัติการแก้ไข (จะเริ่มบันทึกตั้งแต่ตอนนี้)</p>';
  let day = '', h = '';
  HIS.entries.forEach(e => {
    const dl = dayLabel(e.t);
    if (dl !== day) { day = dl; h += `<div class="au-day">${esc(dl)}</div>`; }
    h += `<div class="au-it" data-k="${esc(e.kind)}"><span class="au-time">${esc(new Date(e.t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))}</span><span class="au-body"><i class="au-dot"></i><b>${esc(e.who)}</b> ${esc(e.text)}</span></div>`;
  });
  return h + (HIS.more ? '<div style="text-align:center;margin-top:12px"><button type="button" class="btn sm" onclick="hisLoad(true)">โหลดรายการที่เก่ากว่า</button></div>' : '');
}
function hisPaint() {
  const el = document.getElementById('audit-list');
  if (el) { const h = auditHtml(); if (el.innerHTML !== h) el.innerHTML = h; }
  const c = document.getElementById('audit-total');
  if (c) c.textContent = HIS.total ? HIS.total + ' รายการ' : '';
}
function bkLabel(f) {
  const tag = /-(start|before-reset|before-restore)\.json$/.exec(f.name);
  return fmtDate(f.t, true) + (tag ? ' · ' + ({ start: 'สำรองตอนเปิดเซิร์ฟเวอร์', 'before-reset': 'ก่อนล้างข้อมูลทั้งหมด', 'before-restore': 'ก่อนกู้ข้อมูล' }[tag[1]]) : ' · สำรองอัตโนมัติ');
}
function backupListHtml() {
  if (HIS.bErr) return `<p class="small muted" style="margin:0">${esc(HIS.bErr)}</p>`;
  if (HIS.backups === null) return `<div class="skel-list">${skel('100%', '18px')}${skel('84%', '18px')}</div>`;
  if (!HIS.backups.length) return '<p class="small muted" style="margin:0">ยังไม่มีไฟล์สำรองบนเซิร์ฟเวอร์</p>';
  return HIS.backups.slice(0, 20).map(f => `
    <div class="bk-it"><span><b>${esc(bkLabel(f))}</b><span class="small muted"> · ${Math.max(1, Math.round(f.size / 1024))} KB</span></span>
      <button type="button" class="btn sm" data-n="${esc(f.name)}" onclick="restoreBackup(this.dataset.n)">กู้คืนจากไฟล์นี้</button></div>`).join('');
}
function vHistory() {
  const title = '<div class="page-title"><h1>ประวัติและสำรองข้อมูล</h1></div>';
  const server = NET.mode === 'server';
  const log = server ? `
  <div class="card">
    <div class="role-head"><h2 style="margin:0">ประวัติการแก้ไข <span class="small muted" id="audit-total">${HIS.total ? HIS.total + ' รายการ' : ''}</span></h2><button type="button" class="btn sm" onclick="hisLoad()">รีเฟรช</button></div>
    <p class="small muted" style="margin:6px 0 10px">ใครแก้อะไรเมื่อไหร่ (ใหม่สุดอยู่บน) · ไม่เก็บรหัสผ่าน · แสดงจำนวนรายการที่แก้ ไม่ใช่ค่าคะแนนจริง · การแก้ซ้ำๆ ติดกันภายใน 2 นาทีรวมเป็นบรรทัดเดียว</p>
    <div class="chips" style="margin:0 0 12px">${HIS_KINDS.map(([k, l]) => `<button type="button" class="chip fil${HIS.kind === k ? ' on' : ''}" onclick="setHisKind('${k}')">${l}</button>`).join('')}</div>
    <div id="audit-list" aria-live="polite">${auditHtml()}</div>
  </div>` : `
  <div class="card"><h2>ประวัติการแก้ไข</h2><p class="muted" style="margin:0">ประวัติการแก้ไขใช้ได้เมื่อเปิดเว็บผ่าน server.js (ตอนนี้ใช้โหมดเครื่องเดียว ข้อมูลเก็บในเบราว์เซอร์)</p></div>`;
  const bk = `
  <div class="card">
    <h2>สำรองและกู้คืนข้อมูล</h2>
    <p class="small muted" style="margin:0 0 10px">${server ? 'เซิร์ฟเวอร์สำรองข้อมูลให้อัตโนมัติ (ล่าสุด 40 ไฟล์ + ไฟล์ก่อนล้าง/กู้ข้อมูลทุกครั้ง) · ก่อนกู้ข้อมูลทุกครั้งระบบจะสำรองข้อมูลปัจจุบันไว้ก่อนเสมอ' : 'ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้ ดาวน์โหลดไฟล์เก็บไว้เป็นระยะ และกู้คืนจากไฟล์ได้'}</p>
    <div class="actions" style="margin-top:0">
      <button type="button" class="btn primary" onclick="${server ? 'downloadBackup()' : 'downloadLocal()'}">ดาวน์โหลดไฟล์สำรองตอนนี้</button>
      <label class="btn" style="cursor:pointer">กู้คืนจากไฟล์ (.json)<input type="file" accept=".json,application/json" hidden onchange="restoreFile(this.files[0]);this.value=''"></label>
    </div>
    ${server ? `<div class="topic" style="margin-top:18px">ไฟล์สำรองบนเซิร์ฟเวอร์</div><div id="bk-list">${backupListHtml()}</div>` : ''}
  </div>`;
  return title + log + bk;
}
async function afterRestore(msg) {
  for (let i = 0; i < 30 && NET.busy; i++) await new Promise(r => setTimeout(r, 100));
  try {
    const r = await api('GET', 'api/state?since=0');
    const srv = SyncCore.normalize(r.data);
    adopt(SyncCore.clone(srv));
    NET.base = srv; NET.rev = r.rev; NET.lastStr = JSON.stringify(dataOf());
    if (!cur()) { forceLogout('กู้ข้อมูลแล้ว กรุณาเข้าสู่ระบบใหม่ด้วยบัญชีในไฟล์สำรอง'); return; }
    toast(msg || 'กู้ข้อมูลแล้ว');
    render();
    hisLoad(); hisLoadBackups();
  } catch (e) {
    if (e.status === 401) forceLogout('กู้ข้อมูลแล้ว กรุณาเข้าสู่ระบบใหม่ด้วยบัญชีในไฟล์สำรอง'); else toast(e.message || 'โหลดข้อมูลหลังกู้ไม่สำเร็จ');
  }
}
async function restoreBackup(name) {
  const f = (HIS.backups || []).find(x => x.name === name);
  if (!confirm(`กู้ข้อมูลกลับไปเป็นไฟล์สำรอง${f ? ' ' + bkLabel(f) : ''}?\n\nข้อมูลปัจจุบันจะถูกสำรองไว้ก่อน และทุกเครื่องจะเห็นข้อมูลชุดที่กู้ทันที`)) return;
  try { await flushPending(); await api('POST', 'api/restore', { name }); await afterRestore('กู้ข้อมูลจากไฟล์สำรองแล้ว'); }
  catch (e) { toast(e.message || 'กู้ข้อมูลไม่สำเร็จ'); }
}
async function restoreFile(file) {
  if (!file) return;
  let d = null;
  try { d = JSON.parse(await file.text()); } catch (e) {}
  const inner = d && d.data && Array.isArray(d.data.users) ? d.data : d;
  if (!inner || !Array.isArray(inner.users) || !inner.users.some(u => u.admin)) return toast('อ่านไฟล์ไม่ได้ ต้องเป็นไฟล์สำรอง (.json) ของระบบนี้');
  const n = x => (Array.isArray(x) ? x.length : 0);
  if (!confirm(`กู้ข้อมูลจากไฟล์ "${file.name}"?\n(ผู้ใช้ ${n(inner.users)} · นักเรียน ${n(inner.students)} · โปรเจกต์ ${n(inner.groups)} · วิชา ${n(inner.subjects)})\n\nข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด${NET.mode === 'server' ? ' (สำรองข้อมูลปัจจุบันไว้ก่อนให้อัตโนมัติ)' : ''}`)) return;
  if (NET.mode === 'server') {
    try { await flushPending(); await api('POST', 'api/restore', { data: inner }); await afterRestore('กู้ข้อมูลจากไฟล์แล้ว'); }
    catch (e) { toast(e.message || 'กู้ข้อมูลไม่สำเร็จ'); }
    return;
  }
  if (!adopt(JSON.parse(JSON.stringify(inner)))) return toast('อ่านไฟล์ไม่ได้');
  if (!S.users.some(u => u.id === S.uid)) { S.uid = null; S.showLogin = true; }
  save(); toast('กู้ข้อมูลจากไฟล์แล้ว'); render();
}


/* ------------------------------------------------------------
   3.30 การ์ดของแอดมินบนหน้าภาพรวม: รอบการประเมิน · ต้องจับตา · ออนไลน์ตอนนี้
   ------------------------------------------------------------ */
const toLocalInput = t => { const d = new Date(t), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
function vRoundCard() {
  const open = setting('evalOpen', true) !== false, dl = Date.parse(setting('evalDeadline', ''));
  return `
  <div class="card round-card no-print">
    <h2>รอบการประเมิน</h2>
    ${roundBanner(true)}
    <div class="actions" style="margin:12px 0 0">
      <button type="button" class="btn ${open ? 'danger' : 'primary'}" onclick="setRoundOpen(${open ? 'false' : 'true'})">${open ? 'ปิดรอบการประเมิน' : 'เปิดรอบการประเมินอีกครั้ง'}</button>
    </div>
    <div class="topic" style="margin-top:16px">วันหมดเขต <span class="small muted">(ไม่บังคับ)</span></div>
    <div class="qr-edit"><input id="dl-in" class="input" type="datetime-local" value="${Number.isFinite(dl) ? toLocalInput(dl) : ''}" aria-label="วันและเวลาหมดเขตการประเมิน"><button type="button" class="btn sm" onclick="setDeadline()">ตั้งวันหมดเขต</button>${Number.isFinite(dl) ? '<button type="button" class="btn sm" onclick="clearDeadline()">ล้าง</button>' : ''}</div>
    <div class="err" id="dl-err" role="alert"></div>
    <p class="small muted" style="margin:6px 0 0">เมื่อปิดรอบหรือเลยวันหมดเขต ผู้ประเมินจะแก้คะแนนโปรเจกต์ไม่ได้ · แอดมินแก้ได้เสมอ · เขียนข้อเสนอแนะได้ตามปกติ</p>
  </div>`;
}
function setRoundOpen(on) {
  if (!on && !confirm('ปิดรอบการประเมิน? ผู้ประเมินจะแก้คะแนนโปรเจกต์ไม่ได้ทันที (เปิดใหม่ได้ทุกเมื่อ)')) return;
  if (putSetting('evalOpen', on ? null : false)) { toast(on ? 'เปิดรอบการประเมินแล้ว' : 'ปิดรอบการประเมินแล้ว'); render(); }
}
function setDeadline() {
  const v = inp('dl-in');
  if (!v) return setErr('dl-err', 'เลือกวันและเวลาหมดเขตก่อน');
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return setErr('dl-err', 'วันที่ไม่ถูกต้อง');
  if (t <= Date.now() && !confirm('เวลานี้ผ่านไปแล้ว ผู้ประเมินจะแก้คะแนนไม่ได้ทันที ตั้งต่อไหม?')) return;
  if (putSetting('evalDeadline', new Date(t).toISOString())) { toast('ตั้งวันหมดเขตแล้ว'); render(); }
}
function clearDeadline() { if (putSetting('evalDeadline', null)) { toast('ล้างวันหมดเขตแล้ว'); render(); } }

function vRiskCard() {
  const list = riskList(), bad = list.filter(x => x.r === 'bad').length;
  const rows = list.slice(0, 14).map(x => `
    <tr class="risk-${x.r}${x.jid || x.gid ? ' sum-row' : ''}" ${x.jid ? `tabindex="0" onclick="S.subjectId='${x.jid}';go('subjects')"` : x.gid ? `tabindex="0" onclick="S.scoreView='all';go('scores');setTimeout(()=>jumpToProject('${x.gid}'),80)"` : ''}>
      <td>${riskTag(x.r).replace('margin-left', 'margin-left')}</td><td>${esc(x.who)}</td><td class="small muted">${x.kind}${x.kind === 'วิชา' ? ': ' + esc(x.where) : ''}</td><td class="c"><b>${num(Math.round(x.pct * 10) / 10)}%</b></td>
    </tr>`).join('');
  return `
  <div class="card no-print">
    <div class="role-head">
      <h2 style="margin:0">ต้องจับตา <span class="small muted">· ต่ำกว่าเกณฑ์ ${bad} · ใกล้เกณฑ์ ${list.length - bad}</span></h2>
      <div class="pass-set"><label for="pass-in" class="small muted">เกณฑ์ผ่าน</label><input id="pass-in" class="input sm" type="number" min="0" max="100" step="1" value="${passPct()}" onchange="setPassPct(this.value)" aria-label="เกณฑ์ผ่าน (ร้อยละ)"><span class="small muted">%</span></div>
    </div>
    <p class="small muted" style="margin:6px 0 10px">นักเรียนในรายวิชา และโปรเจกต์ที่ได้คะแนนต่ำกว่าเกณฑ์ผ่าน (แดง) หรือสูงกว่าเกณฑ์ไม่เกิน 10 จุด (ส้ม) · รายวิชาคิดจากงานที่กรอกคะแนนแล้วเท่านั้น</p>
    ${list.length ? `<div class="tw"><table style="min-width:420px"><tbody>${rows}</tbody></table></div>${list.length > 14 ? `<p class="small muted" style="margin:8px 0 0">และอีก ${list.length - 14} รายการ ดูทั้งหมดในหน้ารายวิชาและคะแนนโปรเจกต์</p>` : ''}`
      : '<p class="muted" style="margin:0">ตอนนี้ไม่มีรายการที่ต่ำกว่าหรือใกล้เกณฑ์ผ่าน</p>'}
  </div>`;
}
const vLiveCard = () => (NET.mode === 'server' ? `
  <div class="card no-print">
    <h2>ออนไลน์ตอนนี้ <span class="small muted" id="live-count">${PRES.list.length ? '· ' + PRES.list.length + ' คน' : ''}</span></h2>
    <div id="live-home" aria-live="polite">${liveHome()}</div>
  </div>` : '');


function render(noSave) {
  gsClose();                                 // ปิดรายการเลือก (dropdown) ที่เปิดค้างไว้ เพราะหน้าจะถูกวาดใหม่
  if (noSave !== true) save();               // บันทึกข้อมูลล่าสุด (ขึ้นเซิร์ฟเวอร์ หรือลงเบราว์เซอร์) ทุกครั้ง
  applyLook();                               // ใส่สี/ฟอนต์/มุมโค้งตามที่แอดมินตั้ง (ดู 3.17)
  const y = window.scrollY;                  // จำตำแหน่งที่เลื่อนอยู่ไว้ก่อน
  const sn = document.querySelector('.side-nav'), sy = sn ? sn.scrollTop : 0;   // และตำแหน่งเลื่อนของเมนูด้านข้าง
  const dk = document.querySelector('.dock-in'), dx = dk ? dk.scrollLeft : 0;     // และของแถบแท็บด้านล่าง (มือถือ)
  const app = document.getElementById('app');

  // กำลังเชื่อมต่อเซิร์ฟเวอร์ / เชื่อมต่อไม่ได้
  if (NET.mode === 'connecting') { app.innerHTML = vSkeleton(); return; }
  if (NET.mode === 'error')      { app.innerHTML = vConnect(true); return; }

  // ยังไม่มีแอดมินเลย -> หน้าตั้งค่าครั้งแรก
  if (!hasAdmin()) {
    app.innerHTML = vSetup();
    return;
  }

  // ยังไม่ล็อกอิน -> หน้าต้อนรับ หรือหน้า Login
  const u = cur();
  if (!u) {
    app.innerHTML = S.showLogin ? vLogin() : vWelcome();
    return;
  }
  // เข้าใช้ครั้งแรก (ยังไม่มีชื่อ) / ถูกรีเซ็ตรหัส -> หน้าเข้าใช้ครั้งแรก
  if (u.mustChange || needsName(u)) {
    app.innerHTML = vFirst(u);
    return;
  }

  // เมนูที่ค้างไว้ใช้ไม่ได้แล้ว (เช่น ถูกถอดยศ) -> ไปเมนูแรกที่ใช้ได้
  const tabs = tabsFor(u);
  if (!tabs.some(t => t[0] === S.view) && S.view !== 'account') S.view = tabs[0][0];

  const pages = {
    home: vHome, students: vStudents, groups: vGroups, criteria: vCriteria, evaluate: vScore,
    scores: vScores, subjects: vSubjects, mine: vMine, users: vUsers, roles: vRoles, history: vHistory, appearance: vLook
  };
  const page = S.view === 'account' ? vAccount(u) : pages[S.view]();

  app.innerHTML = shell(page);   // เอา HTML ที่ได้ ไปใส่ในกรอบ #app (ของเก่าถูกแทนที่หมด)
  const sn2 = document.querySelector('.side-nav'); if (sn2) sn2.scrollTop = sy;
  const dk2 = document.querySelector('.dock-in'); if (dk2) dk2.scrollLeft = dx;
  enhanceSelects();              // เปลี่ยน <select> ทุกตัวเป็นช่องเลือกแบบกระจก (ดู 3.19)
  placePills();
  window.scrollTo(0, y);         // เลื่อนกลับไปตำแหน่งเดิม จะได้ไม่กระโดดขึ้นบนสุดทุกครั้งที่กดปุ่ม
  runFx();                       // ตัวเลขนับขึ้น + แอนิเมชันเข้าหน้า (เล่นครั้งเดียวตอนเปิดหน้า ไม่เล่นซ้ำทุกครั้งที่วาดใหม่)
}

// ---- ซิงก์แบบเรียลไทม์ ----
// โหมดเซิร์ฟเวอร์: ถามเซิร์ฟเวอร์ทุก 2.5 วินาที (ดู 3.2b) ได้ข้อมูลใหม่จากเครื่องอื่นก็วาดหน้าใหม่ทันที
// โหมดเครื่องเดียว: เมื่อเปิดหลายแท็บในเบราว์เซอร์เดียวกัน เบราว์เซอร์ส่งเหตุการณ์ "storage" มาเมื่ออีกแท็บบันทึกข้อมูล

// วาดหน้าใหม่โดยเก็บสิ่งที่ผู้ใช้กำลังพิมพ์ค้างไว้ (ช่องที่มี id) แล้วใส่กลับ พร้อมคืนตำแหน่งเคอร์เซอร์
function softRender() {
  const app = document.getElementById('app');
  const typed = {};
  app.querySelectorAll('input[id], textarea[id]').forEach(el => {
    if (el.type === 'file' || el.type === 'button' || el.type === 'submit') return;
    const changed = el.type === 'checkbox' || el.type === 'radio' ? el.checked !== el.defaultChecked : el.value !== el.defaultValue;
    if (changed) typed[el.id] = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value;
  });
  const act = document.activeElement;
  const fid = act && app.contains(act) ? act.id : '';
  let selStart = null, selEnd = null;
  try { selStart = act.selectionStart; selEnd = act.selectionEnd; } catch (e) {}

  render(true);

  Object.keys(typed).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = typed[id]; else el.value = typed[id];
  });
  const back = fid ? document.getElementById(fid) : null;
  if (back) {
    back.focus();
    try { if (selStart !== null) back.setSelectionRange(selStart, selEnd); } catch (e) {}
  }
}

// วาดหน้าใหม่หลังได้ข้อมูลใหม่จากอีกหน้าต่าง/อีกเครื่อง (ถ้าผู้ใช้กำลังทำรายการค้างอยู่ ให้รอก่อน ไม่วาดทับ)
function remoteRender() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    // กำลังติ๊กเลือกนักเรียน/ตรวจรายชื่อนำเข้าอยู่ (ที่ติ๊กไว้เก็บกลับไม่ได้) ให้รอ ไม่วาดทับ
    const a = document.activeElement;
    const typingCell = a && a.classList && a.classList.contains('cell') && a.value !== a.defaultValue;   // กำลังพิมพ์คะแนนในตาราง
    if (GS.open) { remoteRender(); return; }     // กำลังเลือกจาก dropdown อยู่ รอก่อน
    if (S.pick || S.imp || typingCell) { toast('มีข้อมูลใหม่จากอีกเครื่อง จะแสดงเมื่อคุณทำรายการนี้เสร็จ'); return; }
    softRender();
  }, 120);
}

window.addEventListener('storage', e => {
  if (NET.mode !== 'local') return;              // โหมดเซิร์ฟเวอร์ซิงก์ผ่านเซิร์ฟเวอร์แทน
  if (e.key !== null && e.key !== KEY) return;   // key เป็น null = มีการล้างข้อมูลของเว็บทั้งหมด
  load();                                        // อัปเดตข้อมูลในหน่วยความจำทันที ไม่งั้นการบันทึกครั้งต่อไปจะเขียนทับของใหม่
  remoteRender();
});

// กันเบราว์เซอร์เปิดไฟล์ PDF ทับหน้าเว็บ ถ้าลากไฟล์ไปปล่อยนอกกรอบนำเข้า
['dragover', 'drop'].forEach(ev => window.addEventListener(ev, e => e.preventDefault()));

// เริ่มทำงานตอนเปิดเว็บ
applyLook();   // ใส่โหมด/สีล่าสุดที่จำไว้ในเบราว์เซอร์ก่อน (หน้า Login จะได้ไม่กระพริบเป็นสีเดิม) · ล็อกอินแล้วใช้ค่าจากเซิร์ฟเวอร์

// ตรวจว่ามีเซิร์ฟเวอร์ (server.js) ไหม
//   มี   -> โหมดเซิร์ฟเวอร์: ข้อมูลอยู่ที่เซิร์ฟเวอร์ ต้องล็อกอินก่อนจึงจะได้ข้อมูล
//   ไม่มี (เปิดไฟล์ตรงๆ / Live Server) -> โหมดเครื่องเดียว: เก็บใน localStorage เหมือนเดิม
async function boot() {
  NET.mode = 'connecting';
  render();

  let st = null;
  if (location.protocol !== 'file:') {
    try {
      const res = await fetch('api/status', { cache: 'no-store' });
      if ((res.headers.get('content-type') || '').includes('json')) {
        const j = await res.json();
        if (j && j.sync === 'eval-v1') st = j;
      }
      if (!st && res.status >= 500) throw new Error('HTTP ' + res.status);
    } catch (e) {
      NET.mode = 'error';
      NET.errMsg = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบว่าเปิด start-server.bat ค้างไว้อยู่ และอินเทอร์เน็ตปกติ แล้วกดลองใหม่';
      render();
      return;
    }
  }
  if (!st) {                                  // ไม่มีเซิร์ฟเวอร์ -> โหมดเครื่องเดียว
    NET.mode = 'local';
    load();
    render();
    return;
  }

  NET.mode = 'server';
  NET.hasAdmin = !!st.hasAdmin;
  NET.canSetup = !!st.canSetup;

  let tok = '';
  try { tok = sessionStorage.getItem(TOKKEY) || ''; } catch (e) {}
  if (tok && NET.hasAdmin) {                  // ล็อกอินค้างไว้ในแท็บนี้ (รีเฟรชแล้วไม่หลุด)
    NET.token = tok;
    try {
      const r = await api('GET', 'api/state?since=0');
      startSession({ token: tok, uid: r.uid, rev: r.rev, data: r.data });
    } catch (e) {
      NET.token = '';
      try { sessionStorage.removeItem(TOKKEY); } catch (e2) {}
      if (e.net || e.status >= 500) {
        NET.mode = 'error';
        NET.errMsg = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่';
        render();
        return;
      }
    }
  }
  render();
}
boot();