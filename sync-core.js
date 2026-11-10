/* ============================================================
   sync-core.js : ตัวช่วยซิงก์ข้อมูลระหว่างเบราว์เซอร์กับเซิร์ฟเวอร์
   - ใช้ร่วมกันทั้งในเบราว์เซอร์ (script.js) และเซิร์ฟเวอร์ (server.js) จึงทำงานตรงกันเสมอ
   - diff(a, b)   : เทียบข้อมูลเก่า a กับใหม่ b แล้วคืน "รายการสิ่งที่เปลี่ยน" (ops)
   - apply(s, ops): เอารายการที่เปลี่ยนไปใช้กับข้อมูล s
   ส่งเฉพาะสิ่งที่เปลี่ยน (ไม่ส่งข้อมูลทั้งก้อน) จึงไม่เขียนทับงานของคนอื่น
   เช่น ผู้ประเมิน 2 คนกรอกคะแนนพร้อมกัน ทั้งสองคนยังอยู่ครบ
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SyncCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ข้อมูลหลักของระบบ (ตรงกับ S ใน script.js)
  const KEYS = ['users', 'roles', 'students', 'groups', 'criteria', 'scores', 'subjects', 'feedback', 'settings'];   // settings = หน้าตาของเว็บที่แอดมินตั้ง
  const BAD = new Set(['__proto__', 'constructor', 'prototype']);   // กันการแก้ prototype ผ่านชื่อกุญแจแปลกๆ

  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  // "อาเรย์ของรายการที่มี id" เช่น users, groups, students  ->  เทียบทีละรายการตาม id
  const hasId = x => isObj(x) && (typeof x.id === 'string' || typeof x.id === 'number');
  const isIdArr = a => Array.isArray(a) && a.length > 0 && a.every(hasId);
  const idish = a => Array.isArray(a) && (a.length === 0 || isIdArr(a));

  function deepEq(a, b) {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
      return true;
    }
    if (typeof a === 'object') {
      if (Array.isArray(b)) return false;
      const ka = Object.keys(a).filter(k => a[k] !== undefined);
      const kb = Object.keys(b).filter(k => b[k] !== undefined);
      if (ka.length !== kb.length) return false;
      for (const k of ka) if (b[k] === undefined || !deepEq(a[k], b[k])) return false;
      return true;
    }
    return a !== a && b !== b;   // NaN
  }

  // ทำให้ข้อมูลมีรูปแบบครบเสมอ (แก้ในที่เดิมแล้วคืนค่ากลับ)
  function normalize(d) {
    if (!isObj(d)) d = {};
    Object.keys(d).forEach(k => { if (!KEYS.includes(k)) delete d[k]; });
    ['users', 'roles', 'students', 'groups', 'criteria', 'subjects'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
    ['scores', 'feedback', 'settings'].forEach(k => { if (!isObj(d[k])) d[k] = {}; });
    d.users.forEach(u => { if (!Array.isArray(u.roleIds)) u.roleIds = []; });
    d.roles.forEach(r => { if (!Array.isArray(r.perms)) r.perms = []; });
    d.groups.forEach(g => { if (!Array.isArray(g.members)) g.members = []; });
    d.subjects.forEach(j => {
      if (!Array.isArray(j.students)) j.students = [];
      if (!Array.isArray(j.works)) j.works = [];
      if (!isObj(j.scores)) j.scores = {};
    });
    return d;
  }

  /* ---------------- diff ---------------- */
  // รูปแบบของแต่ละรายการ (op):
  //   { k:'set', p:[...เส้นทาง], v:ค่า }   ตั้งค่า (หรือเพิ่มรายการใหม่ทั้งก้อน)
  //   { k:'del', p:[...เส้นทาง] }          ลบ
  //   { k:'obj', p:[...เส้นทาง] }          สร้างกล่องว่างถ้ายังไม่มี (ไม่ทับของเดิม)
  //   { k:'ord', p:[...เส้นทาง], o:[id..] } ลำดับของรายการในอาเรย์
  // เส้นทางที่ผ่านอาเรย์ที่มี id จะใช้ id เป็นตัวชี้รายการ (ไม่ใช้ลำดับที่)
  function diff(a, b) {
    const ops = [];
    diffVal(a || {}, b || {}, [], ops);
    return ops;
  }

  function diffVal(a, b, p, ops) {
    if (deepEq(a, b)) return;
    if (isObj(a) && isObj(b)) {
      Object.keys(a).forEach(k => { if (a[k] !== undefined && b[k] === undefined) ops.push({ k: 'del', p: p.concat(k) }); });
      Object.keys(b).forEach(k => {
        if (b[k] === undefined) return;
        if (a[k] === undefined) addVal(b[k], p.concat(k), ops);
        else diffVal(a[k], b[k], p.concat(k), ops);
      });
    } else if (idish(a) && idish(b)) {
      diffIdArr(a, b, p, ops);
    } else {
      ops.push({ k: 'set', p, v: clone(b) });
    }
  }

  // ค่าที่เพิ่มเข้ามาใหม่: ถ้าเป็นกล่อง (object) ให้แตกเป็นรายตัว คนละคนเพิ่มของตัวเองพร้อมกันจะไม่ทับกัน
  function addVal(v, p, ops) {
    if (isObj(v)) {
      const ks = Object.keys(v).filter(k => v[k] !== undefined);
      if (!ks.length) ops.push({ k: 'obj', p });
      else ks.forEach(k => addVal(v[k], p.concat(k), ops));
    } else {
      ops.push({ k: 'set', p, v: clone(v) });
    }
  }

  function diffIdArr(a, b, p, ops) {
    const am = new Map(), bm = new Map();
    a.forEach(x => am.set(String(x.id), x));
    b.forEach(x => bm.set(String(x.id), x));
    am.forEach((_, id) => { if (!bm.has(id)) ops.push({ k: 'del', p: p.concat(id) }); });
    bm.forEach((rec, id) => {
      if (!am.has(id)) ops.push({ k: 'set', p: p.concat(id), v: clone(rec) });
      else diffVal(am.get(id), rec, p.concat(id), ops);
    });
    // ลำดับ: ปกติรายการใหม่ต่อท้าย ถ้าไม่ใช่ (หรือสลับที่) ให้ส่งลำดับไปด้วย
    const bIds = Array.from(bm.keys());
    const expected = Array.from(am.keys()).filter(id => bm.has(id)).concat(bIds.filter(id => !am.has(id)));
    if (expected.some((id, i) => id !== bIds[i])) ops.push({ k: 'ord', p, o: bIds });
  }

  /* ---------------- apply ---------------- */
  const okSeg = s => typeof s === 'string' && s.length > 0 && s.length < 200 && !BAD.has(s);

  function child(c, seg) {
    if (Array.isArray(c)) return c.find(x => hasId(x) && String(x.id) === seg);
    if (isObj(c)) return Object.prototype.hasOwnProperty.call(c, seg) ? c[seg] : undefined;
    return undefined;
  }

  // เดินตามเส้นทาง ถ้า create=true จะสร้างกล่องที่ขาดให้ระหว่างทาง
  function walk(state, segs, create) {
    let cur = state;
    for (const s of segs) {
      let nxt = child(cur, s);
      if (nxt === undefined) {
        if (!create || !isObj(cur)) return undefined;
        nxt = s === 'works' ? [] : {};
        cur[s] = nxt;
      }
      cur = nxt;
    }
    return cur;
  }

  function applyOp(state, op) {
    if (!op || !Array.isArray(op.p) || !op.p.length || op.p.length > 10 || !op.p.every(okSeg)) return false;
    const p = op.p;

    if (op.k === 'ord') {
      const arr = walk(state, p, false);
      if (!Array.isArray(arr) || !Array.isArray(op.o)) return false;
      const pos = new Map(op.o.map((id, i) => [String(id), i]));
      const known = arr.filter(x => hasId(x) && pos.has(String(x.id))).sort((x, y) => pos.get(String(x.id)) - pos.get(String(y.id)));
      const rest = arr.filter(x => !(hasId(x) && pos.has(String(x.id))));   // รายการที่คนอื่นเพิ่งเพิ่ม ต่อท้ายไว้
      arr.length = 0;
      known.concat(rest).forEach(x => arr.push(x));
      return true;
    }
    if (op.k !== 'set' && op.k !== 'del' && op.k !== 'obj') return false;

    const parent = walk(state, p.slice(0, -1), op.k !== 'del');
    if (parent === undefined || parent === null || typeof parent !== 'object') return false;
    const last = p[p.length - 1];

    if (Array.isArray(parent)) {
      const i = parent.findIndex(x => hasId(x) && String(x.id) === last);
      if (op.k === 'del') { if (i < 0) return false; parent.splice(i, 1); return true; }
      if (op.k !== 'set') return false;
      const rec = clone(op.v);
      if (!hasId(rec) || String(rec.id) !== last) return false;
      if (i >= 0) parent[i] = rec; else parent.push(rec);
      return true;
    }
    if (op.k === 'del') {
      if (!Object.prototype.hasOwnProperty.call(parent, last)) return false;
      delete parent[last];
      return true;
    }
    if (op.k === 'set') {
      if (op.v === undefined) return false;
      parent[last] = clone(op.v);
      return true;
    }
    if (parent[last] === undefined) parent[last] = {};   // 'obj'
    return true;
  }

  function apply(state, ops) {
    let n = 0;
    (ops || []).forEach(op => { if (applyOp(state, op)) n++; });
    return n;
  }

  return { KEYS, diff, apply, normalize, clone, deepEq, isObj, hasId };
});