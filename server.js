/* ============================================================
   server.js : เซิร์ฟเวอร์ของระบบประเมินโปรเจกต์และคะแนนรายวิชา
   1) ส่งไฟล์เว็บ (index.html / style.css / script.js ...) ให้เบราว์เซอร์
   2) เก็บข้อมูลของระบบไว้ที่เซิร์ฟเวอร์ (ไฟล์ data/db.json) ทุกเครื่องจึงเห็นข้อมูลชุดเดียวกัน
      - ต้องล็อกอินก่อนจึงจะอ่าน/แก้ข้อมูลได้ และเซิร์ฟเวอร์ตรวจสิทธิ์ของทุกการแก้ไขอีกชั้น
      - ไม่ส่งรหัสผ่าน (แม้เข้ารหัสแล้ว) ออกไปให้เบราว์เซอร์
      - สำรองไฟล์ข้อมูลอัตโนมัติไว้ใน data/backups
   - ใช้ Node.js ล้วน ไม่ต้อง npm install อะไรเลย
   - วิธีใช้:   node server.js            (เปิดที่พอร์ต 3000)
               node server.js 8080       (เลือกพอร์ตเอง)  หรือ  PORT=8080 node server.js
   - ประวัติการแก้ไข (data/audit.jsonl) · สถานะออนไลน์ของผู้ใช้ · กู้ข้อมูลจากไฟล์สำรอง (เฉพาะแอดมิน)
   - ให้คนนอกเข้าได้ผ่าน Cloudflare:  cloudflared tunnel --url http://localhost:3000
     (อ่านขั้นตอนเต็มใน "วิธีใช้.txt")

   ตั้งค่าเพิ่มได้ด้วยตัวแปร: DATA_DIR (โฟลเดอร์เก็บข้อมูล) · ALLOW_REMOTE_SETUP=1 (ยอมให้ตั้งแอดมินครั้งแรกจากเครื่องอื่น)
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const Core = require('./sync-core.js');

const ROOT = __dirname;                                   // โฟลเดอร์ที่มี index.html
const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';               // 0.0.0.0 = เครื่องอื่นในวงเดียวกัน (Wi-Fi) เข้าได้ด้วย
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
const ALLOW_REMOTE_SETUP = process.env.ALLOW_REMOTE_SETUP === '1';

const TOKEN_TTL = 7 * 24 * 3600 * 1000;                   // ล็อกอินอยู่ได้ 7 วัน (ปิดแท็บแล้วต้องเข้าใหม่อยู่ดี)
const MAX_BODY = 10 * 1024 * 1024;                        // ข้อมูลที่รับได้ต่อครั้ง 10 MB
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,20}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/* ------------------------------------------------------------
   1. ฐานข้อมูล (ไฟล์ JSON) : data/db.json = { v, rev, data }
      rev = เลขรุ่น เพิ่มทุกครั้งที่ข้อมูลเปลี่ยน ให้เบราว์เซอร์ถามว่ามีของใหม่ไหม
   ------------------------------------------------------------ */
function fatal(msg) { console.error('\n  ' + msg.split('\n').join('\n  ') + '\n'); process.exit(1); }

try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); }
catch (e) { fatal('สร้างโฟลเดอร์เก็บข้อมูลไม่ได้: ' + DATA_DIR + '\n' + e.message); }

const emptyData = () => Core.normalize({});

function loadDb() {
  if (!fs.existsSync(DB_FILE)) return { v: 1, rev: 0, data: emptyData() };
  let raw;
  try { raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { raw = null; }
  if (!raw || typeof raw !== 'object' || !raw.data || typeof raw.data !== 'object') {
    // ไม่เริ่มต้นด้วยข้อมูลว่างเงียบๆ เพราะจะไปทับไฟล์เดิมที่อาจกู้ได้
    fatal('อ่านไฟล์ข้อมูลไม่ได้: ' + DB_FILE + '\nไฟล์อาจเสียหาย ให้ปิดโปรแกรมนี้ แล้วคัดลอกไฟล์ล่าสุดจากโฟลเดอร์ data/backups มาแทนที่ db.json');
  }
  return { v: 1, rev: Number(raw.rev) || 0, data: Core.normalize(raw.data) };
}

let db = loadDb();
let lastBackup = 0;

function backupNow(tag) {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, 'db-' + ts + (tag || '') + '.json'));
    lastBackup = Date.now();
    const auto = fs.readdirSync(BACKUP_DIR).filter(f => /^db-.*\.json$/.test(f) && !f.includes('before-reset') && !f.includes('before-restore')).sort();
    auto.slice(0, Math.max(0, auto.length - 40)).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (e) {} });   // เก็บ 40 ไฟล์ล่าสุด
  } catch (e) { console.error('สำรองไฟล์ไม่สำเร็จ:', e.message); }
}

// เขียนลงดิสก์ทันทีทุกครั้งที่ข้อมูลเปลี่ยน (เขียนไฟล์ชั่วคราวก่อนแล้วค่อยเปลี่ยนชื่อ ไฟล์จะไม่เสียถ้าไฟดับกลางคัน)
function persist() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  try { fs.renameSync(tmp, DB_FILE); }
  catch (e) { fs.copyFileSync(tmp, DB_FILE); try { fs.unlinkSync(tmp); } catch (e2) {} }   // Windows บางครั้ง rename ทับไม่ได้ (โปรแกรมสแกนไวรัส)
  if (Date.now() - lastBackup > 30 * 60 * 1000) backupNow('');
}
function commit() { db.rev++; persist(); }

/* ------------------------------------------------------------
   1b. ประวัติการแก้ไข (audit log): เก็บเป็นไฟล์ data/audit.jsonl บรรทัดละ 1 เหตุการณ์
       { t: เวลา, uid, who: ชื่อผู้ทำ, kind: ประเภท, text: ข้อความ }  (ไม่เก็บรหัสผ่านหรือค่าคะแนนจริงลงในประวัติ)
   ------------------------------------------------------------ */
const AUDIT_FILE = path.join(DATA_DIR, 'audit.jsonl');
const AUDIT_MAX = 3000;
let auditLog = [];
try {
  const lines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean);
  auditLog = lines.slice(-AUDIT_MAX).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  if (lines.length > AUDIT_MAX * 2) fs.writeFileSync(AUDIT_FILE, auditLog.map(e => JSON.stringify(e)).join('\n') + '\n');   // ไฟล์โตเกินไป: ตัดเหลือรายการล่าสุด
} catch (e) {}
function audit(u, kind, text, extra) {
  try {
    const e = { t: Date.now(), uid: u ? u.id : 0, who: u ? (u.name || u.username) : '-', kind, text: String(text).slice(0, 300) };
    if (extra && extra.key) { e.key = String(extra.key).slice(0, 120); e.tpl = String(extra.tpl || '').slice(0, 300); e.n = extra.n || 1; }   // ใช้รวมรายการที่ซ้ำติดกันตอนแสดงผล
    auditLog.push(e);
    if (auditLog.length > AUDIT_MAX + 500) auditLog = auditLog.slice(-AUDIT_MAX);
    fs.appendFile(AUDIT_FILE, JSON.stringify(e) + '\n', () => {});
  } catch (e) {}
}

// รวมรายการที่ซ้ำกันติดกัน (คนเดิม เรื่องเดิม ห่างกันไม่เกิน 2 นาที) เป็นบรรทัดเดียว เช่น เลื่อนแถบคะแนนหลายครั้ง
function mergedAudit() {
  const out = [];
  for (const e of auditLog) {
    const p = out[out.length - 1];
    if (p && e.key && p.key === e.key && p.uid === e.uid && p.kind === e.kind && e.t - p.t < 120000) {
      p.t = e.t; p.c++; p.n = (p.n || 0) + (e.n || 0);
      p.text = p.tpl && p.tpl.indexOf('{n}') >= 0 ? p.tpl.replace('{n}', p.n) : p.base + ' (×' + p.c + ')';
    } else out.push({ t: e.t, uid: e.uid, who: e.who, kind: e.kind, text: e.text, key: e.key || '', tpl: e.tpl || '', n: e.n || 1, c: 1, base: e.text });
  }
  return out;
}

// แปลง "สิ่งที่เปลี่ยน" (ops) เป็นข้อความอ่านง่าย รวมรายการที่ซ้ำกันเป็นบรรทัดเดียว  prev/next = ข้อมูลก่อน/หลังแก้
function describeOps(ops, prev, next, actor) {
  const buckets = new Map();
  const put = (key, kind, build, item) => {
    let b = buckets.get(key);
    if (!b) { b = { kind, n: 0, items: new Set(), build }; buckets.set(key, b); }
    b.n++;
    if (item) b.items.add(item);
  };
  const find = (arr, id) => (arr || []).find(x => String(x.id) === String(id));
  const nm = (key, id, fallback, f) => { const x = find(next[key], id) || find(prev[key], id); return x ? f(x) : fallback; };
  const gname = id => nm('groups', id, '(โปรเจกต์ที่ถูกลบ)', g => g.name);
  const sname = id => nm('students', id, '(นักเรียน)', s => (s.prefix ? s.prefix + ' ' : '') + s.name);
  const uname = id => nm('users', id, '(ผู้ใช้)', x => x.name || x.username);
  const jname = id => nm('subjects', id, '(วิชาที่ถูกลบ)', j => j.name);
  const rname = id => nm('roles', id, '(ยศ)', r => r.name);
  const cname = id => nm('criteria', id, '(เกณฑ์)', c => c.name);
  const join = (set, max) => { const a = [...set]; return a.slice(0, max || 3).join(', ') + (a.length > (max || 3) ? ' และอีก ' + (a.length - (max || 3)) + ' รายการ' : ''); };
  const verbOf = (op, existed) => (op.k === 'del' ? 'ลบ' : existed ? 'แก้ไข' : 'เพิ่ม');
  const fieldTh = { name: 'ชื่อ', nameEn: 'ชื่ออังกฤษ', advisorId: 'ครูที่ปรึกษา', members: 'สมาชิก', max: 'คะแนนเต็ม', topic: 'หัวข้อ', color: 'สี', perms: 'สิทธิ์', dept: 'แผนก', roleIds: 'ยศ', username: 'ชื่อผู้ใช้' };

  for (const op of ops) {
    if (!op || op.k === 'ord' || op.k === 'obj') continue;
    const c = op.p[0], a = op.p[1], b = op.p[2], len = op.p.length;
    if (c === 'scores') {
      if (len < 3) { if (op.k === 'del') put('sc-del:' + a, 'score', () => 'ลบคะแนนทั้งหมดของ ' + uname(a)); continue; }
      const who = String(a) === String(actor.id) ? '' : ' (ของ ' + uname(a) + ')';
      const slot = String(b), at = slot.indexOf('@');
      const verb = op.k === 'del' ? 'ลบคะแนน' : 'ให้คะแนน';
      const label = at > 0 ? 'รายบุคคล "' + sname(slot.slice(at + 1)) + '" ในโปรเจกต์ "' + gname(slot.slice(0, at)) + '"' : 'ทั้งกลุ่มโปรเจกต์ "' + gname(slot) + '"';
      put('sc:' + a + ':' + slot + ':' + op.k, 'score', n => verb + label + who + ' (' + n + ' รายการ)');
    } else if (c === 'feedback') {
      const gn = gname(a);
      put('fb:' + a + ':' + (op.k === 'del'), 'feedback', () => (op.k === 'del' ? 'ลบข้อเสนอแนะของโปรเจกต์ "' : 'เขียนข้อเสนอแนะโปรเจกต์ "') + gn + '"' + (len >= 3 && String(b) !== String(actor.id) ? ' (ของ ' + uname(b) + ')' : ''));
    } else if (c === 'groups' || c === 'criteria' || c === 'roles') {
      const kind = c === 'groups' ? 'project' : c === 'criteria' ? 'criteria' : 'user';
      const noun = c === 'groups' ? 'โปรเจกต์' : c === 'criteria' ? 'เกณฑ์' : 'ยศ';
      const fn = c === 'groups' ? gname : c === 'criteria' ? cname : rname;
      const existed = !!find(prev[c], a);
      if (len === 2) put(c + ':' + a + ':' + op.k, kind, () => verbOf(op, existed) + noun + ' "' + fn(a) + '"');
      else put(c + ':' + a + ':edit', kind, () => 'แก้ไข' + noun + ' "' + fn(a) + '"', fieldTh[b] || '');
    } else if (c === 'students') {
      const existed = !!find(prev.students, a);
      if (len === 2) { const v = verbOf(op, existed); put('st:' + v, 'student', n => v + 'นักเรียน ' + n + ' คน', sname(a)); }
      else put('st:edit:' + a, 'student', () => 'แก้ไขข้อมูลนักเรียน ' + sname(a));
    } else if (c === 'users') {
      const existed = !!find(prev.users, a);
      if (len === 2) put('u:' + a + ':' + op.k, 'user', () => verbOf(op, existed) + 'ผู้ใช้ "' + uname(a) + '"');
      else if (b === 'pass' || b === 'pw') put('u:' + a + ':pw', 'user', () => 'ตั้ง/รีเซ็ตรหัสผ่านของ "' + uname(a) + '"');
      else put('u:' + a + ':edit', 'user', () => 'แก้ไขข้อมูลผู้ใช้ "' + uname(a) + '"', fieldTh[b] || '');
    } else if (c === 'subjects') {
      const jn = jname(a);
      if (len === 2) put('sj:' + a + ':' + op.k, 'subject', () => verbOf(op, !!find(prev.subjects, a)) + 'วิชา "' + jn + '"');
      else if (b === 'scores') put('sj:' + a + ':sc', 'subject', n => 'กรอก/แก้คะแนนวิชา "' + jn + '" (' + n + ' รายการ)');
      else if (b === 'works') put('sj:' + a + ':w', 'subject', () => 'แก้ไขงานในวิชา "' + jn + '"');
      else if (b === 'students') put('sj:' + a + ':s', 'subject', () => 'แก้ไขรายชื่อนักเรียนในวิชา "' + jn + '"');
      else put('sj:' + a + ':e', 'subject', () => 'แก้ไขวิชา "' + jn + '"');
    } else if (c === 'settings') {
      const key = a || '';
      const text = key === 'evalOpen' ? (op.v === false ? 'ปิดรอบการประเมิน' : 'เปิดรอบการประเมิน')
        : key === 'evalDeadline' ? (op.k === 'del' || op.v === null ? 'ยกเลิกวันหมดเขตการประเมิน' : 'ตั้งวันหมดเขตการประเมิน')
        : key === 'publicUrl' ? 'ตั้งลิงก์เว็บสำหรับ QR Code' : 'ปรับหน้าตาเว็บ';
      put('set:' + text, 'system', () => text);
    }
  }
  const out = [];
  buckets.forEach((b, key) => {
    const lst = [...b.items].filter(Boolean);
    const mk = n => {
      let text = b.build(n);
      if (lst.length && !/\(.*\)$/.test(text) && text.length < 200) text += ' (' + join(new Set(lst), 3) + ')';
      return text;
    };
    out.push({ kind: b.kind, text: mk(b.n), tpl: mk('{n}'), n: b.n, key: lst.length ? '' : key });   // รายการที่มีชื่อกำกับไม่รวมกัน
  });
  return out;
}

/* ------------------------------------------------------------
   1c. รอบการประเมิน: แอดมินปิดรอบ หรือเลยวันหมดเขต → ผู้ประเมินแก้คะแนนโปรเจกต์ไม่ได้ (แอดมินยังแก้ได้)
   ------------------------------------------------------------ */
function evalLockReason() {
  const s = db.data.settings || {};
  if (s.evalOpen === false) return 'ปิดรับการประเมินแล้ว';
  if (typeof s.evalDeadline === 'string') {
    const t = Date.parse(s.evalDeadline);
    if (isFinite(t) && Date.now() > t) return 'หมดเขตการประเมินแล้ว';
  }
  return '';
}

/* ------------------------------------------------------------
   1d. สถานะออนไลน์: เบราว์เซอร์ส่งมาทุก ~5 วินาทีว่ากำลังอยู่หน้าไหน (เก็บในหน่วยความจำเท่านั้น)
   ------------------------------------------------------------ */
const presence = new Map();   // id ผู้ใช้ -> { w: อยู่ที่ไหน, t: เวลา }
const PRESENCE_TTL = 20 * 1000;

if (fs.existsSync(DB_FILE)) backupNow('-start');

const hasAdmin = () => db.data.users.some(u => u.admin);
// ข้อมูลที่ส่งให้เบราว์เซอร์: ตัดรหัสผ่านที่เข้ารหัส (pass) ออกเสมอ
// รหัสผ่านที่อ่านได้ (pw) ส่งให้เฉพาะแอดมิน เพื่อแสดงในฟอร์มแก้ไขผู้ใช้
const publicData = viewer => Object.assign({}, db.data, { users: db.data.users.map(u => {
  const c = Object.assign({}, u); delete c.pass;
  if (!(viewer && viewer.admin)) delete c.pw;
  return c;
}) });

/* ------------------------------------------------------------
   2. รหัสผ่าน โทเคนล็อกอิน และสิทธิ์
   ------------------------------------------------------------ */
const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const hashPw = (id, pw) => sha256('ev:' + id + ':' + pw);      // สูตรเดียวกับ script.js เพื่อให้บัญชีเดิมใช้ต่อได้
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function loadSecret() {
  try { const s = fs.readFileSync(SECRET_FILE, 'utf8').trim(); if (s.length >= 32) return s; } catch (e) {}
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

const b64 = s => Buffer.from(s).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const passTag = u => sha256(String(u.pass || '')).slice(0, 12);   // เปลี่ยนรหัสผ่านเมื่อไร โทเคนเก่าใช้ไม่ได้ทันที

function makeToken(u) {
  const body = b64(JSON.stringify({ u: u.id, e: Date.now() + TOKEN_TTL, t: passTag(u) }));
  return body + '.' + sign(body);
}
function userFromToken(tok) {
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig || !safeEq(sig, sign(body))) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!p || p.e < Date.now()) return null;
  const u = db.data.users.find(x => x.id === p.u);
  return u && p.t === passTag(u) ? u : null;
}
function needUser(req) {
  const h = req.headers.authorization || '';
  const u = h.startsWith('Bearer ') ? userFromToken(h.slice(7).trim()) : null;
  if (!u) throw httpErr(401, 'ยังไม่ได้เข้าสู่ระบบ หรือหมดเวลาเข้าสู่ระบบ');
  return u;
}

function permsOf(u) {
  if (u.admin) return ['students', 'project', 'scoreProject', 'viewAll', 'subject', 'scoreSubject'];
  const list = [];
  (u.roleIds || []).forEach(id => { const r = db.data.roles.find(x => x.id === id); if (r) list.push(...r.perms); });
  return list;
}

// กันเดารหัสผ่าน: ผิด 8 ครั้งภายใน 10 นาที (ชื่อผู้ใช้เดียวกัน จาก IP เดียวกัน) ล็อก 5 นาที
const fails = new Map();
function clientIp(req) {
  return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}
function waitSeconds(key) { const f = fails.get(key); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }
function noteFail(key) {
  const now = Date.now();
  let f = fails.get(key);
  if (!f || now - f.first > 10 * 60 * 1000) f = { n: 0, first: now, until: 0 };
  if (++f.n >= 8) { f.until = now + 5 * 60 * 1000; f.n = 0; f.first = now; }
  fails.set(key, f);
}
setInterval(() => { const now = Date.now(); fails.forEach((f, k) => { if (f.until < now && now - f.first > 10 * 60 * 1000) fails.delete(k); }); }, 60 * 1000).unref();

// ตั้งค่าแอดมินครั้งแรก / นำข้อมูลเก่าเข้า ทำได้เฉพาะจากเครื่องที่รันเซิร์ฟเวอร์เอง
// (กันคนแปลกหน้าที่ได้ลิงก์ Cloudflare ชิงเป็นแอดมินก่อนครู)
function canSetup(req) {
  if (ALLOW_REMOTE_SETUP) return true;
  const a = req.socket.remoteAddress || '';
  const loopback = a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  const proxied = ['cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'x-real-ip', 'forwarded'].some(h => req.headers[h]);
  return loopback && !proxied;
}

/* ------------------------------------------------------------
   3. ตรวจสิทธิ์ของแต่ละการแก้ไข (op) ที่เบราว์เซอร์ส่งมา
      แอดมินทำได้ทุกอย่าง · คนอื่นแก้ได้เฉพาะส่วนที่ยศของตัวเองอนุญาต
      คืนค่า op (อาจถูกปรับ) หรือ null ถ้าไม่อนุญาต
   ------------------------------------------------------------ */
function authorize(u, perms, op) {
  if (!op || typeof op !== 'object' || !Array.isArray(op.p) || op.p.length < 1 || !op.p.every(s => typeof s === 'string')) return null;
  if (!Core.KEYS.includes(op.p[0])) return null;
  if (['set', 'del', 'obj', 'ord'].indexOf(op.k) < 0) return null;

  // รหัสผ่านที่เก็บต้องเป็นค่าเข้ารหัสรูปแบบเดียวกับ script.js เท่านั้น
  const bad = v => v && typeof v === 'object' && !Array.isArray(v) && v.pass !== undefined && !(typeof v.pass === 'string' && HEX64.test(v.pass));
  if (op.p[0] === 'users') {
    if (op.p.length === 3 && op.p[2] === 'pass' && !(op.k === 'del' || (typeof op.v === 'string' && HEX64.test(op.v)))) return null;
    if (op.p.length === 2 && op.k === 'set' && bad(op.v)) return null;
    if (op.p.length === 3 && op.p[2] === 'pw' && !(op.k === 'del' || (typeof op.v === 'string' && op.v.length <= 200))) return null;
  }
  // หน้าตาของเว็บ (settings): เฉพาะแอดมิน และต้องเป็นค่าเล็กๆ เท่านั้น
  if (op.p[0] === 'settings') {
    if (!u.admin || op.p.length > 2) return null;
    if (op.k === 'set' && !(op.v === null || ['string', 'number', 'boolean'].includes(typeof op.v)) ) return null;
    const key = op.p[1];
    if (op.k === 'set' && typeof op.v === 'string' && op.v.length > (key === 'publicUrl' ? 200 : 40)) return null;
    if (op.k === 'set' && key === 'evalOpen' && typeof op.v !== 'boolean') return null;
    if (op.k === 'set' && key === 'evalDeadline' && op.v !== null && !(typeof op.v === 'string' && isFinite(Date.parse(op.v)))) return null;
    if (op.k === 'set' && key === 'passPct' && !(typeof op.v === 'number' && op.v >= 0 && op.v <= 100)) return null;
    if (op.k === 'set' && key === 'publicUrl' && op.v !== null && !(typeof op.v === 'string' && /^https?:\/\/[^\s<>"']+$/i.test(op.v))) return null;
    return op;
  }
  if (u.admin) return op;

  const has = x => perms.includes(x);
  const self = String(u.id);
  const [c, a, b] = op.p;
  const len = op.p.length;
  switch (c) {
    case 'users':      // ตัวเองแก้ได้แค่ชื่อกับแผนก
      return op.k === 'set' && len === 3 && a === self && (b === 'name' || b === 'dept') && typeof op.v === 'string' && op.v.length <= 200 ? op : null;
    case 'roles':
      return null;
    case 'students':
      return has('students') ? op : null;
    case 'groups':     // นำนักเรียนออกจากทะเบียนต้องเอาออกจากสมาชิกกลุ่มด้วย
      return has('project') || (has('students') && len === 3 && b === 'members') ? op : null;
    case 'criteria':
      return has('project') ? op : null;
    case 'scores':     // ให้คะแนนได้เฉพาะของตัวเอง · ส่วนการลบคะแนนของกลุ่ม/เกณฑ์ที่ถูกลบ ต้องมีสิทธิ์จัดการโปรเจกต์
      if (a === self) {
        const lock = evalLockReason();
        if (lock && op.k !== 'obj') throw httpErr(403, lock + ' แก้ไขคะแนนไม่ได้ (ติดต่อแอดมินถ้าต้องการเปิดรอบอีกครั้ง)');
        return has('scoreProject') ? op : null;
      }
      if (op.k === 'del' && has('students') && String(b || '').includes('@')) return op;   // นำนักเรียนออก -> ลบคะแนนรายบุคคลของเขา
      return op.k === 'del' && has('project') ? op : null;
    case 'feedback':   // เขียน/ลบข้อเสนอแนะได้เฉพาะของตัวเอง
      if (b === self) return op;
      if (op.k === 'del' && len === 2) return has('project') ? op : { k: 'del', p: ['feedback', a, self] };   // ลบข้อเสนอแนะอันสุดท้ายของกลุ่ม -> ลบเฉพาะของตัวเอง
      return op.k === 'del' && has('project') ? op : null;
    case 'subjects':
      if (has('subject')) return op;
      if (b === 'scores' && has('scoreSubject')) return op;
      if (has('students') && ((b === 'students' && len === 3) || (b === 'scores' && op.k === 'del'))) return op;
      return null;
    default:
      return null;
  }
}

// ตรวจความถูกต้องของข้อมูลหลังแก้ไข (ก่อนจะบันทึกจริง)
function validateData(d, hadAdmin) {
  const names = new Set(), ids = new Set();
  let admins = 0;
  for (const u of d.users) {
    if (!u || typeof u.id !== 'number' || !Number.isInteger(u.id)) return 'ข้อมูลผู้ใช้ไม่ถูกต้อง';
    if (typeof u.username !== 'string' || !USERNAME_RE.test(u.username)) return 'ชื่อผู้ใช้ไม่ถูกต้อง (ภาษาอังกฤษ ตัวเลข . _ - ยาว 3-20 ตัว)';
    const k = u.username.toLowerCase();
    if (names.has(k)) return 'ชื่อผู้ใช้ "' + u.username + '" ซ้ำกัน';
    if (ids.has(u.id)) return 'รหัสผู้ใช้ซ้ำกัน';
    names.add(k); ids.add(u.id);
    if (typeof u.pass !== 'string' || !HEX64.test(u.pass)) return 'ข้อมูลรหัสผ่านของผู้ใช้ไม่ถูกต้อง';
    if (u.admin) admins++;
  }
  if (hadAdmin && admins !== 1) return 'ระบบต้องมีแอดมินเพียง 1 คนเสมอ';
  return '';
}

/* ------------------------------------------------------------
   4. API  (/api/...)
   ------------------------------------------------------------ */
function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }

function json(req, res, code, obj, extra) {
  const body = Buffer.from(JSON.stringify(obj));
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, extra);
  if (body.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    headers['Content-Encoding'] = 'gzip';
    const z = zlib.gzipSync(body);
    res.writeHead(code, Object.assign(headers, { 'Content-Length': z.length }));
    return res.end(z);
  }
  res.writeHead(code, Object.assign(headers, { 'Content-Length': body.length }));
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0, tooBig = false;
    req.on('data', c => { n += c.length; if (n > MAX_BODY) tooBig = true; else chunks.push(c); });
    req.on('end', () => {
      if (tooBig) return reject(httpErr(413, 'ข้อมูลใหญ่เกินไป'));
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(httpErr(400, 'รูปแบบข้อมูลไม่ถูกต้อง')); }
    });
    req.on('error', reject);
  });
}

const str = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const randId = () => crypto.randomBytes(6).toString('hex').slice(0, 8);

const routes = {
  // ใครก็เรียกได้: บอกแค่ว่าตั้งค่าระบบแล้วหรือยัง
  'GET /api/status': (req, res) => json(req, res, 200, { sync: 'eval-v1', hasAdmin: hasAdmin(), canSetup: canSetup(req), rev: db.rev }),

  // ตั้งค่าครั้งแรก: สร้างแอดมิน (เฉพาะจากเครื่องที่รันเซิร์ฟเวอร์)
  'POST /api/setup': async (req, res) => {
    const b = await readJson(req);
    if (hasAdmin() || db.data.users.length) throw httpErr(409, 'ระบบตั้งค่าแล้ว');
    if (!canSetup(req)) throw httpErr(403, 'ตั้งค่าครั้งแรกได้เฉพาะจากเครื่องที่รันเซิร์ฟเวอร์ (เปิด http://localhost:' + PORT + ')');
    if (typeof b.username !== 'string' || !USERNAME_RE.test(b.username.trim())) throw httpErr(400, 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ . _ - ยาว 3-20 ตัว');
    if (!str(b.name, 3, 100)) throw httpErr(400, 'กรุณากรอกชื่อ-นามสกุลอย่างน้อย 3 ตัวอักษร');
    if (b.dept !== undefined && (typeof b.dept !== 'string' || b.dept.length > 100)) throw httpErr(400, 'ชื่อแผนกยาวเกินไป');
    if (typeof b.password !== 'string' || b.password.length < 6 || b.password.length > 200) throw httpErr(400, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว');
    const data = emptyData();
    data.roles = [
      { id: randId(), name: 'กรรมการโปรเจกต์', color: '#3ba55d', perms: ['scoreProject'] },
      { id: randId(), name: 'ผู้ช่วยครู', color: '#faa61a', perms: ['students', 'subject', 'scoreSubject'] }
    ];
    data.users = [{ id: 1, username: b.username.trim(), name: b.name.trim(), dept: (b.dept || '').trim(), admin: true, roleIds: [], mustChange: false, pass: hashPw(1, b.password), pw: b.password }];
    db.data = data;
    commit();
    json(req, res, 200, { token: makeToken(db.data.users[0]), uid: 1, rev: db.rev, data: publicData(db.data.users[0]) });
  },

  // นำข้อมูลเดิมที่เก็บในเบราว์เซอร์ (รุ่นก่อนมีเซิร์ฟเวอร์) ขึ้นมาไว้ที่เซิร์ฟเวอร์ (ทำได้เมื่อเซิร์ฟเวอร์ยังว่าง)
  'POST /api/import': async (req, res) => {
    const b = await readJson(req);
    if (hasAdmin() || db.data.users.length) throw httpErr(409, 'เซิร์ฟเวอร์มีข้อมูลอยู่แล้ว นำเข้าซ้ำไม่ได้');
    if (!canSetup(req)) throw httpErr(403, 'นำข้อมูลเข้าได้เฉพาะจากเครื่องที่รันเซิร์ฟเวอร์ (เปิด http://localhost:' + PORT + ')');
    if (!b.data || !Array.isArray(b.data.users)) throw httpErr(400, 'ไม่พบข้อมูลที่จะนำเข้า');
    const d = Core.normalize(b.data);
    const problem = validateData(d, true);
    if (problem) throw httpErr(400, 'ข้อมูลเดิมใช้ไม่ได้: ' + problem);
    db.data = d;
    commit();
    json(req, res, 200, { ok: true, rev: db.rev });
  },

  'POST /api/login': async (req, res) => {
    const b = await readJson(req);
    const name = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
    const key = clientIp(req) + '|' + name;
    const wait = waitSeconds(key);
    if (wait) throw httpErr(429, 'ลองผิดหลายครั้งเกินไป กรุณารออีก ' + wait + ' วินาที');
    const u = db.data.users.find(x => x.username.toLowerCase() === name);
    const ok = typeof b.password === 'string' && b.password.length < 500 && safeEq(u ? u.pass : '0'.repeat(64), hashPw(u ? u.id : 0, b.password)) && !!u;
    if (!ok) { noteFail(key); throw httpErr(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'); }
    fails.delete(key);
    json(req, res, 200, { token: makeToken(u), uid: u.id, rev: db.rev, data: publicData(u) });
  },

  // ถามข้อมูลล่าสุด: ถ้าเลขรุ่นไม่ต่างจากที่เบราว์เซอร์มี จะตอบสั้นๆ (ไม่ส่งข้อมูลซ้ำ)
  'GET /api/state': (req, res, url) => {
    const u = needUser(req);
    if (url.searchParams.has('since') && Number(url.searchParams.get('since')) === db.rev) return json(req, res, 200, { rev: db.rev, uid: u.id, unchanged: true });
    json(req, res, 200, { rev: db.rev, uid: u.id, data: publicData(u) });
  },

  // รับ "สิ่งที่เปลี่ยน" จากเบราว์เซอร์ ตรวจสิทธิ์ทีละรายการ ถ้าไม่ผ่านแม้ข้อเดียวจะไม่บันทึกอะไรเลย
  'POST /api/ops': async (req, res) => {
    const u = needUser(req);
    const b = await readJson(req);
    if (u.mustChange) throw httpErr(403, 'ต้องตั้งรหัสผ่านใหม่ก่อนจึงจะแก้ข้อมูลได้');
    if (!Array.isArray(b.ops) || b.ops.length > 20000) throw httpErr(400, 'รูปแบบข้อมูลไม่ถูกต้อง');
    const perms = permsOf(u);
    const accepted = [];
    for (const op of b.ops) {
      const ok = authorize(u, perms, op);
      if (!ok) throw httpErr(403, 'คุณไม่มีสิทธิ์แก้ไขรายการนี้ (' + (op && Array.isArray(op.p) ? op.p.slice(0, 2).join('/') : '?') + ')');
      accepted.push(ok);
    }
    const hadAdmin = hasAdmin();
    const next = JSON.parse(JSON.stringify(db.data));      // แก้บนสำเนาก่อน ตรวจผ่านค่อยใช้จริง
    Core.apply(next, accepted);
    Core.normalize(next);
    const problem = validateData(next, hadAdmin);
    if (problem) throw httpErr(400, problem);
    const prev = db.rev;
    if (JSON.stringify(next) !== JSON.stringify(db.data)) {
      const before = db.data;
      db.data = next;
      commit();
      try { describeOps(accepted, before, next, u).forEach(e => audit(u, e.kind, e.text, e)); } catch (e) { console.error('audit:', e.message); }
    }
    json(req, res, 200, { rev: db.rev, prev });
  },

  // ตั้งรหัสผ่านใหม่ (ครั้งแรกที่เข้าใช้ หรือเปลี่ยนเองในหน้าบัญชี) เซิร์ฟเวอร์ตรวจรหัสเดิมให้
  'POST /api/password': async (req, res) => {
    const u = needUser(req);
    const b = await readJson(req);
    if (typeof b.pw !== 'string' || b.pw.length < 6 || b.pw.length > 200) throw httpErr(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัว');
    const key = clientIp(req) + '|pw|' + u.id;
    if (!u.mustChange) {
      const wait = waitSeconds(key);
      if (wait) throw httpErr(429, 'ลองผิดหลายครั้งเกินไป กรุณารออีก ' + wait + ' วินาที');
      if (typeof b.old !== 'string' || !safeEq(u.pass, hashPw(u.id, b.old))) { noteFail(key); throw httpErr(403, 'รหัสผ่านปัจจุบันไม่ถูกต้อง'); }
    }
    if (safeEq(u.pass, hashPw(u.id, b.pw))) throw httpErr(400, u.mustChange ? 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านชั่วคราว' : 'กรุณาตั้งรหัสผ่านที่แตกต่างจากรหัสผ่านเดิม');
    if (b.name !== undefined && !str(b.name, 3, 100)) throw httpErr(400, 'กรุณาพิมพ์ชื่อจริง-นามสกุลของคุณ (อย่างน้อย 3 ตัวอักษร)');
    if (b.dept !== undefined && (typeof b.dept !== 'string' || b.dept.length > 100)) throw httpErr(400, 'ชื่อแผนกยาวเกินไป');
    if (b.name !== undefined) u.name = b.name.trim();
    if (b.dept !== undefined) u.dept = b.dept.trim();
    u.pass = hashPw(u.id, b.pw);
    u.pw = b.pw;
    u.mustChange = false;
    commit();
    audit(u, 'user', 'ตั้ง/เปลี่ยนรหัสผ่านของตัวเอง');
    fails.delete(key);
    json(req, res, 200, { token: makeToken(u), uid: u.id, rev: db.rev, data: publicData(u) });
  },

  // ล้างข้อมูลทั้งระบบ (แอดมินเท่านั้น) ไฟล์เดิมถูกสำรองไว้ก่อนเสมอ
  'POST /api/reset': async (req, res) => {
    const u = needUser(req);
    if (!u.admin) throw httpErr(403, 'เฉพาะแอดมินเท่านั้น');
    backupNow('-before-reset');
    db.data = emptyData();
    commit();
    audit(u, 'system', 'ล้างข้อมูลทั้งระบบ (สำรองไฟล์เดิมไว้ก่อนแล้ว)');
    json(req, res, 200, { ok: true });
  },

  // ดาวน์โหลดไฟล์สำรองข้อมูลทั้งหมด (แอดมินเท่านั้น)
  'GET /api/backup': (req, res) => {
    const u = needUser(req);
    if (!u.admin) throw httpErr(403, 'เฉพาะแอดมินเท่านั้น');
    const body = Buffer.from(JSON.stringify(db, null, 1));
    const d = new Date(), z = n => String(n).padStart(2, '0');
    const name = 'eval-backup-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + '.json';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + name + '"', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    res.end(body);
  },

  // ประวัติการแก้ไข (แอดมินเท่านั้น) ใหม่สุดก่อน  ?limit=200&before=<เวลา>&kind=score
  'GET /api/audit': (req, res, url) => {
    const u = needUser(req);
    if (!u.admin) throw httpErr(403, 'เฉพาะแอดมินเท่านั้น');
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));
    const before = Number(url.searchParams.get('before')) || Infinity;
    const kind = url.searchParams.get('kind') || '';
    const all = mergedAudit(), list = [];
    for (let i = all.length - 1; i >= 0 && list.length < limit; i--) {
      const e = all[i];
      if (e.t < before && (!kind || e.kind === kind)) list.push({ t: e.t, uid: e.uid, who: e.who, kind: e.kind, text: e.text });
    }
    json(req, res, 200, { entries: list, total: all.length });
  },

  // รายการไฟล์สำรองอัตโนมัติบนเซิร์ฟเวอร์ (แอดมินเท่านั้น)
  'GET /api/backups': (req, res) => {
    const u = needUser(req);
    if (!u.admin) throw httpErr(403, 'เฉพาะแอดมินเท่านั้น');
    let files = [];
    try {
      files = fs.readdirSync(BACKUP_DIR).filter(f => /^db-[\w.-]+\.json$/.test(f)).map(f => {
        const st = fs.statSync(path.join(BACKUP_DIR, f));
        return { name: f, size: st.size, t: st.mtimeMs };
      }).sort((x, y) => y.t - x.t).slice(0, 60);
    } catch (e) {}
    json(req, res, 200, { files });
  },

  // กู้ข้อมูล: จากไฟล์สำรองบนเซิร์ฟเวอร์ ({ name }) หรือจากไฟล์ที่อัปโหลด ({ data }) · สำรองข้อมูลปัจจุบันไว้ก่อนเสมอ
  'POST /api/restore': async (req, res) => {
    const u = needUser(req);
    if (!u.admin) throw httpErr(403, 'เฉพาะแอดมินเท่านั้น');
    const b = await readJson(req);
    let src, label;
    if (typeof b.name === 'string') {
      if (!/^db-[\w.-]+\.json$/.test(b.name)) throw httpErr(400, 'ชื่อไฟล์สำรองไม่ถูกต้อง');
      try { src = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, b.name), 'utf8')); }
      catch (e) { throw httpErr(404, 'ไม่พบหรืออ่านไฟล์สำรองนี้ไม่ได้'); }
      label = 'ไฟล์สำรอง ' + b.name;
    } else {
      src = b.data && b.data.data && Array.isArray(b.data.data.users) ? b.data.data : b.data;   // รองรับทั้ง { v, rev, data } และข้อมูลล้วน
      label = 'ไฟล์ที่อัปโหลด';
    }
    const d0 = src && src.data && Array.isArray(src.data.users) ? src.data : src;
    if (!d0 || !Array.isArray(d0.users)) throw httpErr(400, 'ไม่พบข้อมูลของระบบในไฟล์นี้');
    const d = Core.normalize(JSON.parse(JSON.stringify(d0)));
    const problem = validateData(d, true);
    if (problem) throw httpErr(400, 'ข้อมูลในไฟล์ใช้ไม่ได้: ' + problem);
    backupNow('-before-restore');
    db.data = d;
    commit();
    audit(u, 'system', 'กู้ข้อมูลจาก' + label + ' (ข้อมูลก่อนกู้ถูกสำรองไว้แล้ว)');
    json(req, res, 200, { ok: true, rev: db.rev });
  },

  // สถานะออนไลน์: ส่งว่าตัวเองอยู่ไหน แล้วรับรายชื่อคนที่ออนไลน์อยู่กลับไป
  'POST /api/presence': async (req, res) => {
    const u = needUser(req);
    const b = await readJson(req);
    presence.set(u.id, { w: typeof b.w === 'string' ? b.w.slice(0, 80) : '', t: Date.now() });
    const now = Date.now(), list = [];
    presence.forEach((v, k) => {
      if (now - v.t < PRESENCE_TTL) list.push({ uid: k, w: v.w });
      else if (now - v.t > 10 * 60 * 1000) presence.delete(k);
    });
    json(req, res, 200, { list });
  }
};

async function handleApi(req, res, url) {
  const handler = routes[req.method + ' ' + url.pathname];
  if (!handler) return json(req, res, 404, { error: 'ไม่พบ API นี้' });
  try {
    await handler(req, res, url);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('API error:', e);
    if (!res.headersSent) json(req, res, status, { error: status >= 500 ? 'เซิร์ฟเวอร์ผิดพลาด' : e.message });
  }
}

/* ------------------------------------------------------------
   5. ส่งไฟล์เว็บ
   ------------------------------------------------------------ */
// ชนิดไฟล์ที่ยอมให้ส่ง (นอกจากนี้ตอบ 404) กันไม่ให้ส่งไฟล์แปลกๆ ในโฟลเดอร์ออกไป
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm'
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.txt', '.svg']);
const HIDDEN = new Set(['server.js', 'package.json', 'package-lock.json']);   // ไฟล์ฝั่งเซิร์ฟเวอร์ ไม่ส่งให้ใคร

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  }, headers));
  res.end(body);
}

// แปลง URL เป็นที่อยู่ไฟล์จริง และกันการเดาเส้นทางออกนอกโฟลเดอร์ (../)
function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch (e) { return null; }
  if (p.includes('\0')) return null;
  p = p.replace(/\\/g, '/');
  if (p.endsWith('/')) p += 'index.html';
  const abs = path.join(ROOT, path.normalize(p));
  const rel = path.relative(ROOT, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts.some(x => x.startsWith('.') || x === 'node_modules')) return null;   // ไฟล์ซ่อน / node_modules
  if (parts[0].toLowerCase() === 'data') return null;                            // โฟลเดอร์เก็บข้อมูล (db.json, backups) ห้ามส่งออกเด็ดขาด
  if (path.resolve(abs).startsWith(path.resolve(DATA_DIR) + path.sep)) return null;
  if (parts.length === 1 && HIDDEN.has(parts[0].toLowerCase())) return null;
  return abs;
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD')
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });

  const file = resolveFile(url.pathname);
  const ext = file ? path.extname(file).toLowerCase() : '';
  if (!file || !TYPES[ext]) return send(res, 404, 'ไม่พบไฟล์นี้ (404)');

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'ไม่พบไฟล์นี้ (404)');

    const etag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
    const headers = {
      'Content-Type': TYPES[ext],
      'Cache-Control': 'no-cache',               // เบราว์เซอร์ถามเซิร์ฟเวอร์ทุกครั้ง แก้ไฟล์แล้วเห็นผลทันที (ไม่เปลี่ยนก็ได้ 304 ประหยัดเน็ต)
      'ETag': etag,
      'Last-Modified': st.mtime.toUTCString(),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Vary': 'Accept-Encoding'
    };

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }

    const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (gzip) headers['Content-Encoding'] = 'gzip';
    else headers['Content-Length'] = st.size;

    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    if (gzip) stream.pipe(zlib.createGzip()).pipe(res);
    else stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { return send(res, 400, 'Bad Request'); }
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  serveStatic(req, res, url);
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nพอร์ต ${PORT} ถูกใช้อยู่แล้ว (อาจเปิด server.js ค้างไว้ในอีกหน้าต่าง)`);
    console.error(`ลองเลือกพอร์ตอื่น เช่น:  node server.js ${PORT + 1}\n`);
  } else if (e.code === 'EACCES') {
    console.error(`\nไม่มีสิทธิ์ใช้พอร์ต ${PORT} ลองพอร์ตตั้งแต่ 1024 ขึ้นไป เช่น:  node server.js 3000\n`);
  } else {
    console.error('\nเซิร์ฟเวอร์ผิดพลาด:', e.message, '\n');
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const lan = [];
  Object.values(os.networkInterfaces()).forEach(list => (list || []).forEach(i => {
    if (i.family === 'IPv4' && !i.internal) lan.push(i.address);
  }));

  console.log('\n  ระบบประเมินโปรเจกต์และคะแนนรายวิชา : เซิร์ฟเวอร์ทำงานแล้ว');
  console.log('  ------------------------------------------------------------');
  console.log(`  เปิดในเครื่องนี้        http://localhost:${PORT}`);
  lan.forEach(ip => console.log(`  เครื่องอื่นใน Wi-Fi เดียวกัน  http://${ip}:${PORT}`));
  console.log('');
  console.log('  ให้คนนอกเครือข่ายเข้าได้ (เปิดอีกหน้าต่าง Terminal แล้วพิมพ์):');
  console.log(`    cloudflared tunnel --url http://localhost:${PORT}`);
  console.log('  แล้วส่งลิงก์ https://....trycloudflare.com ที่ได้ให้เพื่อน');
  console.log('');
  console.log('  ข้อมูลเก็บที่เซิร์ฟเวอร์นี้: ' + DB_FILE);
  console.log('  (สำรองอัตโนมัติไว้ที่ ' + BACKUP_DIR + ')');
  if (!hasAdmin()) {
    console.log('');
    console.log('  ยังไม่มีแอดมิน: ให้ครูเปิด http://localhost:' + PORT + ' บนเครื่องนี้เพื่อตั้งค่าครั้งแรก');
    console.log('  (ตั้งค่าครั้งแรกทำได้เฉพาะจากเครื่องนี้ ไม่ใช่ผ่านลิงก์ Cloudflare)');
  }
  console.log('');
  console.log('  กด Ctrl+C เพื่อปิดเซิร์ฟเวอร์\n');
});

// ปิดอย่างสุภาพเมื่อกด Ctrl+C (ข้อมูลเขียนลงไฟล์ทุกครั้งที่เปลี่ยนอยู่แล้ว)
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => {
  console.log('\n  ปิดเซิร์ฟเวอร์แล้ว');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}));