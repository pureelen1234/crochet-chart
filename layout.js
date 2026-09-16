/* =====================================================================
   도안 배치 (layout.js)
   ---------------------------------------------------------------------
   parsePattern 결과를 받아 각 요소의 좌표를 계산합니다.

   원형/사각(모티브)은 같은 원리: 매 단을 "위치값 t(도)"로 배치한 뒤
   t → 좌표로 투영합니다. t=0이 12시, 반시계방향으로 증가.
     원형: 반지름 R인 원 위
     사각: 한 변의 절반이 R인 정사각형 테두리 위 (모서리 = 45°, 135°, 225°, 315°)
   평면(왕복)은 x 좌표로 같은 방식.

   앵커(anchor): 전 단이 만든 코(st)와 사슬 공간(sp)의 위치. 이번 단의 요소는
   "무엇에 뜨는지"에 따라 앵커 위치를 물려받습니다.

   결과: { nodes:[{key,row,i,x,y,rot,el}], guides:[], labels:[], startShape, bounds }
   ===================================================================== */
(function () {
  const SYM = window.CROCHET_SYMBOLS;
  const DEG = Math.PI / 180;
  const S = 14;         // 이웃한 코 사이 거리
  const ROW_GAP = 28;   // 단 사이 거리
  const R0 = 7;         // 매직링 반지름
  const FAN = 9;        // 같은 공간에 모여 뜨는 묶음의 기호 끝 간격

  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  function circMean(angles) {
    let x = 0, y = 0;
    angles.forEach(a => { x += Math.cos(a * DEG); y += Math.sin(a * DEG); });
    return Math.atan2(y, x) / DEG;
  }
  const norm360 = (t) => ((t % 360) + 360) % 360;

  /* ---- 투영 ---- */
  function projCircle(t, R) { const a = (-90 - t) * DEG; return { x: R * Math.cos(a), y: R * Math.sin(a) }; }
  function projSquare(t, R) {
    const a = (-90 - t) * DEG;
    const dx = Math.cos(a), dy = Math.sin(a);
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: R * dx / m, y: R * dy / m };
  }

  /* ================================================================
     공통: 이번 단 요소들의 위치값 배정
     prev  : { st:[v...], sp:[{v,n}...] , lastWasChain }  (없으면 null)
     opts  : { circular, dir, spread }   spread = 같은 자리에 겹친 요소를 벌리는 간격(위치값 단위)
     반환  : { v:[...], anchor:[...] }   anchor = 요소가 뜨는 전 단 위치값(없으면 null)
     ================================================================ */
  function assign(els, prev, opts) {
    const m = els.length;
    const v = new Array(m).fill(null);
    const anchor = new Array(m).fill(null);
    const circular = !!opts.circular;
    const usable = prev && ((prev.st && prev.st.length) || (prev.sp && prev.sp.length));

    if (usable) {
      // 공간 순서: 전 단에서 만든 순서(반시계) 그대로 — 첫 공간부터
      const spaces = (prev.sp || []).slice();
      let si = 0, spi = 0;
      const sgV = {};
      els.forEach((e, i) => {
        if (e.kind === "join") return;
        if (e.sg != null) {
          if (!(e.sg in sgV)) { const s = spaces[spi++]; sgV[e.sg] = s ? s.v : null; }
          if (sgV[e.sg] !== null) { v[i] = sgV[e.sg]; anchor[i] = sgV[e.sg]; }
          return;
        }
        if ((e.kind === "st" || e.kind === "standing") && e.consumes > 0 && prev.st && prev.st.length) {
          const slice = prev.st.slice(si, si + e.consumes);
          si += e.consumes;
          if (slice.length) { v[i] = circular ? circMean(slice) : mean(slice); anchor[i] = v[i]; }
        }
      });
      // 기둥사슬(그룹 밖): 첫 코 바로 앞(시계방향 쪽) 반 칸 자리
      const firstV = v.find(x => x !== null);
      els.forEach((e, i) => { if (e.kind === "standing" && v[i] === null && firstV != null) { v[i] = firstV - opts.spread * 0.5 * (circular ? 1 : opts.dir); anchor[i] = firstV; } });
    }

    const placed = v.map((x, i) => x !== null ? i : -1).filter(i => i >= 0);
    if (!placed.length) {
      // 앵커 없음: 고르게. 기둥사슬은 12시(시작점), 나머지는 반 칸씩 밀어서 고르게
      const body = els.map((e, i) => i).filter(i => els[i].kind !== "join" && els[i].kind !== "standing");
      body.forEach((idx, k) => { v[idx] = circular ? 360 * (k + 0.5) / body.length : (k + 0.5) * S * opts.dir; });
      els.forEach((e, i) => { if (e.kind === "standing") v[i] = 0; });
    } else {
      // 빈 자리(사이 사슬 등)는 이웃 사이에 끼움
      let i = 0;
      while (i < m) {
        if (v[i] !== null || els[i].kind === "join") { i++; continue; }
        let j = i; while (j < m && v[j] === null && els[j].kind !== "join") j++;
        const L = j - i;
        const prevIdx = i - 1, nextIdx = j < m && els[j].kind !== "join" ? j : -1;
        let A, B;
        if (circular) {
          A = prevIdx >= 0 && v[prevIdx] !== null ? v[prevIdx] : v[placed[placed.length - 1]] - 360;
          B = nextIdx >= 0 ? v[nextIdx] : v[placed[0]] + 360;
          while (B <= A) B += 360;
        } else {
          const d = opts.dir * S;
          if (prevIdx < 0 || v[prevIdx] === null) { B = v[nextIdx]; A = B - d * (L + 1); }
          else if (nextIdx < 0) { A = v[prevIdx]; B = A + d * (L + 1); }
          else { A = v[prevIdx]; B = v[nextIdx]; }
        }
        for (let k = 0; k < L; k++) v[i + k] = A + (B - A) * (k + 1) / (L + 1);
        i = j;
      }
    }

    // 같은 자리에 겹친 연속 요소(같은 공간에 뜨는 묶음)를 부채꼴로 벌림
    let i = 0;
    while (i < m) {
      if (els[i].kind === "join") { i++; continue; }
      let j = i + 1;
      while (j < m && els[j].kind !== "join" && v[j] === v[i]) j++;
      const L = j - i, base = v[i];
      const fan = opts.fanSpread || opts.spread;
      if (L > 1) for (let k = 0; k < L; k++) v[i + k] = base + (k - (L - 1) / 2) * fan * (circular ? 1 : opts.dir);
      i = j;
    }
    // 이음(join): 첫 요소 바로 옆(시계방향 쪽)
    els.forEach((e, i) => {
      if (e.kind !== "join") return;
      const standing = els.findIndex(x => x.kind === "standing");
      const f = standing >= 0 ? v[standing] : v.find(x => x !== null);
      v[i] = (f || 0) - (circular ? opts.spread * 0.7 : S * 0.6 * opts.dir);
    });
    return { v, anchor };
  }

  /* 사각 1단처럼 앵커가 없을 때: 모서리 사슬 4개를 대각선에 두고 변마다 고르게 */
  function assignSquareSegments(els) {
    const m = els.length;
    const v = new Array(m).fill(null);
    const corners = els.map((e, i) => (e.kind === "chain" && e.n >= 2) ? i : -1).filter(i => i >= 0);
    if (corners.length !== 4) return null;
    corners.forEach((idx, k) => { v[idx] = 45 + 90 * k; });
    // 변: 모서리 k-1 과 k 사이. 첫 모서리 앞 요소와 마지막 모서리 뒤 요소는 같은 변(위쪽)
    const sides = [[], [], [], []];
    let side = 0;
    els.forEach((e, i) => {
      if (e.kind === "join") return;
      if (v[i] !== null) { side++; return; }
      sides[side % 4].push(i);
    });
    sides.forEach((idxs, k) => {
      const a = 45 + 90 * (k - 1);
      idxs.forEach((idx, j) => { v[idx] = a + 90 * (j + 0.5) / idxs.length; });
    });
    els.forEach((e, i) => { if (e.kind === "join") v[i] = v[0] - 8; });
    return v;
  }

  /* ---- 요소 하나가 만드는 앵커 ---- */
  function produce(e, vv, spread, dir) {
    const st = [], sp = [];
    const d = dir || 1;
    if (e.kind === "st") {
      if (e.produces === 1) st.push(vv);
      else for (let j = 0; j < e.produces; j++) st.push(vv + (j - (e.produces - 1) / 2) * spread * d);
    } else if (e.kind === "chain") {
      for (let j = 0; j < e.n; j++) st.push(vv + (j - (e.n - 1) / 2) * spread * 0.8 * d);
      sp.push({ v: vv, n: e.n });
    } else if (e.kind === "standing") {
      if (e.n >= 2) st.push(vv);
    }
    return { st, sp };
  }

  /* ================================================================
     원형 / 사각
     ================================================================ */
  function layoutRing(p, shape) {
    const proj = shape === "square" ? projSquare : projCircle;
    const nodes = [], guides = [], labels = [];
    let startShape = "";
    let prev = null;
    let R;

    if (p.start.kind === "chainring") {
      const n = Math.max(1, p.start.n);
      R = Math.max(12, n * S / (2 * Math.PI));
      prev = { st: [], sp: [{ v: 0, n }], lastWasChain: false };
      for (let j = 0; j < n; j++) {
        const t = 360 * j / n;
        prev.st.push(t);
        const P = projCircle(t, R);
        startShape += `<g transform="translate(${P.x.toFixed(2)} ${P.y.toFixed(2)}) rotate(${(-t).toFixed(1)})"><ellipse rx="6" ry="3.2"/></g>`;
      }
      guides.push({ type: "circle", r: R });
    } else {
      R = R0;
      startShape = SYM.drawMagicRing();
      prev = null;   // 매직링: 1단은 자유 배치
    }

    p.rows.forEach((row) => {
      const els = row.elements;
      if (!els.length) return;
      const count = Math.max(row.producedSt, els.length);
      const perim = shape === "square" ? 8 : 2 * Math.PI;
      R = Math.max(R + ROW_GAP, count * S / perim);
      const Rin = R - ROW_GAP;                       // 전 단 반지름(앵커 위치)
      const spread = (S / R) / DEG;                  // 코 하나 간격을 각도로
      const fanSpread = (FAN / R) / DEG;             // 한 공간에 모여 뜨는 묶음은 촘촘하게

      let v = null, anchor = new Array(els.length).fill(null);
      const usable = prev && (prev.st.length || prev.sp.length);
      if (!usable && shape === "square") v = assignSquareSegments(els);
      if (!v) { const r = assign(els, prev, { circular: true, spread, fanSpread }); v = r.v; anchor = r.anchor; }

      const next = { st: [], sp: [], lastWasChain: false };
      els.forEach((e, i) => {
        const t = v[i];
        const P = proj(t, R);
        let rot;
        const q = norm360(t);
        const dSide = Math.min(q % 90, 90 - q % 90);          // 가장 가까운 변 중앙 방향까지의 각도
        const dCorner = Math.min(norm360(q - 45) % 90, 90 - norm360(q - 45) % 90);   // 가장 가까운 대각선까지
        let ext = 0;
        if (e.kind === "st" || (e.kind === "standing" && anchor[i] !== null)) {
          const A = anchor[i] !== null ? proj(anchor[i], Rin) : { x: 0, y: 0 };
          rot = Math.atan2(P.y - A.y, P.x - A.x) / DEG + 90;   // 뜨는 자리(앵커)에서 바깥으로
          // 같은 공간에 모여 뜨는 묶음(또는 매직링 1단)은 기둥을 앵커까지 늘여 부채꼴로
          if (e.kind === "st" && !e.mod && (e.sg != null || !usable)) {
            const def = SYM.STITCH_BY_ID[e.stitch];
            const D = Math.hypot(P.x - A.x, P.y - A.y);
            if (def && def.h >= 9) ext = Math.max(0, Math.min(40, D - 2 * def.h - (usable ? 4 : R0 + 2)));
          }
        } else {
          rot = -t;                                              // 접선 기준(사슬·기둥사슬·이음)
          if (shape === "square") {
            if (dSide <= 30) rot = -(Math.round(q / 90) * 90);                 // 변 위: 변과 나란히
            else rot = -(Math.round((q - 45) / 90) * 90 + 45);                 // 모서리: 대각선
          }
        }
        const el = { ...e, ext };
        if (shape === "square" && e.kind === "chain" && e.n >= 2 && dCorner < 20) el.corner = true;   // 대각선 근처 = 모서리 사슬
        nodes.push({ key: `${row.index}-${i}`, row: row.index, i, x: P.x, y: P.y, rot, el });
        const pr = produce(e, t, spread, 1);
        next.st.push(...pr.st); next.sp.push(...pr.sp);
      });
      const lastReal = [...els].reverse().find(e => e.kind !== "join");
      next.lastWasChain = !!lastReal && lastReal.kind === "chain";
      prev = next;

      guides.push(shape === "square" ? { type: "square", r: R } : { type: "circle", r: R });
      labels.push({ x: -(R + ROW_GAP / 2), y: 2.2, text: `${row.index}(${row.producedSt})`, anchor: "middle", row: row.index });
    });

    const ext = R + 40;
    return { nodes, guides, labels, startShape, bounds: { x: -ext, y: -ext, w: ext * 2, h: ext * 2 } };
  }

  /* ================================================================
     평면(왕복뜨기)
     ================================================================ */
  function layoutFlat(p) {
    const nodes = [], guides = [], labels = [];
    let startShape = "";
    const n = Math.max(1, p.start.n || 1);
    let prev = { st: [], sp: [{ v: (n - 1) * S / 2, n }], lastWasChain: false };
    for (let j = 0; j < n; j++) {
      const x = j * S;
      prev.st.push(x);
      startShape += `<g transform="translate(${x} 0)"><ellipse rx="6" ry="3.2"/></g>`;
    }
    let minX = 0, maxX = (n - 1) * S;
    prev.st.reverse();   // 1단은 오른쪽→왼쪽

    p.rows.forEach((row) => {
      const els = row.elements;
      if (!els.length) return;
      const dir = row.index % 2 === 1 ? -1 : 1;
      const y = -row.index * ROW_GAP;
      const r = assign(els, prev, { circular: false, dir, spread: S * 0.75, fanSpread: FAN });
      // 앵커 없이 고르게 놓였으면 단 시작 쪽에 맞춤
      if (!(prev.st.length || prev.sp.length)) {
        const startX = dir === -1 ? maxX : minX;
        r.v = r.v.map(x => startX + x);
      }
      const next = { st: [], sp: [], lastWasChain: false };
      els.forEach((e, i) => {
        const x = r.v[i];
        let rot = 0;
        if (e.kind === "st" && r.anchor[i] !== null) rot = Math.atan2(y - (y + ROW_GAP), x - r.anchor[i]) / DEG + 90;
        const yy = e.kind === "standing" ? y + 2 : y;
        nodes.push({ key: `${row.index}-${i}`, row: row.index, i, x, y: yy, rot, el: { ...e } });
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        const pr = produce(e, x, S, dir);
        next.st.push(...pr.st); next.sp.push(...pr.sp);
      });
      // 다음 단은 반대 방향으로 뜨므로 순서 뒤집기
      next.st.reverse(); next.sp.reverse();
      const lastReal = [...els].reverse().find(e => e.kind !== "join");
      next.lastWasChain = !!lastReal && lastReal.kind === "chain";
      prev = next;
      guides.push({ type: "line", x1: minX - S, x2: maxX + S, y: y + ROW_GAP / 2 });
      const lx = dir === -1 ? maxX + 16 : minX - 16;
      labels.push({ x: lx, y: y + 2.5, text: dir === -1 ? `${row.index}(${row.producedSt}) ←` : `→ ${row.index}(${row.producedSt})`, anchor: dir === -1 ? "start" : "end", row: row.index });
    });

    const rows = p.rows.length;
    const x0 = minX - 70, x1 = maxX + 70;
    const y0 = -rows * ROW_GAP - 24, y1 = 24;
    return { nodes, guides, labels, startShape, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  }

  const LAYOUTS = {
    round: { name: "원형", fn: (p) => layoutRing(p, "circle") },
    flat: { name: "왕복 (평면)", fn: layoutFlat },
    square: { name: "모티브 (사각)", fn: (p) => layoutRing(p, "square") }
  };

  window.CROCHET_LAYOUT = { LAYOUTS, layout: (p, format) => (LAYOUTS[format] || LAYOUTS.round).fn(p) };
})();
