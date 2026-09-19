/* =====================================================================
   도안 배치 (layout.js)
   ---------------------------------------------------------------------
   parsePattern 결과를 받아 각 요소의 좌표를 계산합니다.

   원형/사각(모티브)은 같은 원리: 매 단을 "둘레 위치 f(0~1)"로 배치한 뒤
   f → 좌표로 투영합니다. f=0이 12시, 반시계방향으로 증가, f=1이 한 바퀴.
     원형: 반지름 R인 원 둘레
     사각: 한 변의 절반이 R인 정사각형 둘레 (모서리 = f 1/8, 3/8, 5/8, 7/8)
   둘레 길이 기준이라 변 위 간격이 균등합니다.
   평면(왕복)은 x 좌표로 같은 방식.

   앵커(anchor): 전 단이 만든 코(st)와 사슬 공간(sp)의 위치(f). 이번 단의 요소는
   "무엇에 뜨는지"에 따라 앵커 위치를 물려받습니다.

   결과: { nodes:[{key,row,i,x,y,rot,el}], guides:[], labels:[], startShape, bounds }
   ===================================================================== */
(function () {
  const SYM = window.CROCHET_SYMBOLS;
  const DEG = Math.PI / 180;
  const S = 11;         // 이웃한 코 사이 거리
  const ROW_GAP = 36;   // 단 사이 거리(기준). 실제로는 단의 가장 긴 기호에 맞춰 26~40 — 기둥이 길수록 묶음이 평행에 가까워짐
  /* 단 높이: 그 단에서 가장 큰 기호 기준 */
  function rowGap(row) {
    let h = 5;
    row.elements.forEach(e => {
      if (e.kind === "st") { const d = SYM.STITCH_BY_ID[e.stitch]; if (d) h = Math.max(h, d.h); }
      else if (e.kind === "standing") h = Math.max(h, e.n * 3.25);
    });
    return Math.max(26, Math.min(40, 2 * h + 16));
  }
  /* 원형에서 코에 뜨는 단: 실제 도안처럼 둘레에 고르게 (사슬 묶음·늘림은 폭만큼 자리 차지) */
  function evenRing(els) {
    const w = els.map(e => e.kind === "join" ? 0 : e.kind === "standing" ? 0.6 : e.kind === "chain" ? e.n * 0.8 : (e.mod === "inc" ? e.n * 0.9 : 1));
    const W = w.reduce((a, b) => a + b, 0) || 1;
    const v = new Array(els.length).fill(null);
    let cum = 0;
    els.forEach((e, i) => { if (e.kind === "join") return; v[i] = (cum + w[i] / 2) / W; cum += w[i]; });
    return v;
  }
  const R0 = 6;         // 매직링 반지름
  const FAN = 9.5;      // 같은 공간에 모여 뜨는 묶음의 기호 끝 간격 (가로선 8 + 틈, 서로 안 겹치게)

  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  function circMean(fs) {   // 둘레 위치(0~1)의 원형 평균
    let x = 0, y = 0;
    fs.forEach(f => { x += Math.cos(f * 2 * Math.PI); y += Math.sin(f * 2 * Math.PI); });
    let f = Math.atan2(y, x) / (2 * Math.PI);
    return f < 0 ? f + 1 : f;
  }
  const norm1 = (f) => ((f % 1) + 1) % 1;

  /* ---- 투영: 둘레 위치 f, 크기 R → 좌표 ---- */
  function projCircle(f, R) { const a = (-90 - 360 * f) * DEG; return { x: R * Math.cos(a), y: R * Math.sin(a) }; }
  function projSquare(f, R) {
    const u = norm1(f) * 8 * R;              // 12시(윗변 가운데)에서 반시계로 잰 둘레 거리
    if (u <= R) return { x: -u, y: -R };                 // 윗변 왼쪽 절반
    if (u <= 3 * R) return { x: -R, y: -R + (u - R) };   // 왼쪽 변
    if (u <= 5 * R) return { x: -R + (u - 3 * R), y: R }; // 아랫변
    if (u <= 7 * R) return { x: R, y: R - (u - 5 * R) }; // 오른쪽 변
    return { x: R - (u - 7 * R), y: -R };                // 윗변 오른쪽 절반
  }
  const perimeter = (shape, R) => shape === "square" ? 8 * R : 2 * Math.PI * R;
  /* 사각: 변에 수직인 방향(회전각). 모서리 근처면 대각선 */
  function squareNormalRot(f, R) {
    const u = norm1(f) * 8 * R;
    const corners = [R, 3 * R, 5 * R, 7 * R];
    const dc = Math.min(...corners.map(c => Math.abs(u - c)));
    if (dc < S * 0.6) {   // 모서리: 대각선 방향
      const k = corners.findIndex(c => Math.abs(u - c) === dc);
      return [-45, -135, -225, -315][k];
    }
    if (u <= R || u > 7 * R) return 0;
    if (u <= 3 * R) return -90;
    if (u <= 5 * R) return 180;
    return 90;
  }
  const distToCorner = (f, R) => { const u = norm1(f) * 8 * R; return Math.min(...[R, 3 * R, 5 * R, 7 * R].map(c => Math.abs(u - c))); };

  /* ================================================================
     공통: 이번 단 요소들의 위치값 배정
     prev  : { st:[v...], sp:[{v,n}...] }  (없으면 null)
     opts  : { circular, dir, spread, fanSpread }  spread = 코 하나 간격(위치값 단위)
     반환  : { v:[...], anchor:[...] }
     ================================================================ */
  function assign(els, prev, opts) {
    const m = els.length;
    const v = new Array(m).fill(null);
    const anchor = new Array(m).fill(null);
    const circular = !!opts.circular;
    const wrap = circular ? 1 : 0;
    const dir = circular ? 1 : opts.dir;
    const usable = prev && ((prev.st && prev.st.length) || (prev.sp && prev.sp.length));

    if (usable) {
      const spaces = (prev.sp || []).slice();   // 전 단에서 만든 순서(반시계) 그대로
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
      // 기둥사슬(코를 안 쓰는 것): 첫 코 바로 앞(시계방향 쪽) 반 칸
      const firstV = v.find(x => x !== null);
      els.forEach((e, i) => { if (e.kind === "standing" && v[i] === null && firstV != null) { v[i] = firstV - opts.spread * 0.5 * dir; anchor[i] = firstV; } });
    }

    const placed = v.map((x, i) => x !== null ? i : -1).filter(i => i >= 0);
    if (!placed.length) {
      // 앵커 없음: 고르게. 기둥사슬은 시작점, 나머지는 반 칸씩 밀어서
      const body = els.map((e, i) => i).filter(i => els[i].kind !== "join" && els[i].kind !== "standing");
      body.forEach((idx, k) => { v[idx] = circular ? (k + 0.5) / body.length : (k + 0.5) * S * dir; });
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
          A = prevIdx >= 0 && v[prevIdx] !== null ? v[prevIdx] : v[placed[placed.length - 1]] - wrap;
          B = nextIdx >= 0 ? v[nextIdx] : v[placed[0]] + wrap;
          while (B <= A) B += wrap;
        } else {
          const d = dir * S;
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
      if (L > 1) for (let k = 0; k < L; k++) v[i + k] = base + (k - (L - 1) / 2) * fan * dir;
      i = j;
    }
    // 이음(join): 기둥사슬(없으면 첫 요소) 바로 옆(시계방향 쪽)
    els.forEach((e, i) => {
      if (e.kind !== "join") return;
      const standing = els.findIndex(x => x.kind === "standing");
      const f = standing >= 0 ? v[standing] : v.find(x => x !== null);
      v[i] = (f || 0) - opts.spread * 0.7 * dir;
    });
    return { v, anchor };
  }

  /* 사각 1단처럼 앵커가 없을 때: 모서리 사슬 4개를 대각선에 두고 변마다 고르게 */
  function assignSquareSegments(els) {
    const m = els.length;
    const v = new Array(m).fill(null);
    const corners = els.map((e, i) => (e.kind === "chain" && e.n >= 2) ? i : -1).filter(i => i >= 0);
    if (corners.length !== 4) return null;
    corners.forEach((idx, k) => { v[idx] = 1 / 8 + k / 4; });
    const sides = [[], [], [], []];
    let side = 0;
    els.forEach((e, i) => {
      if (e.kind === "join") return;
      if (v[i] !== null) { side++; return; }
      sides[side % 4].push(i);
    });
    sides.forEach((idxs, k) => {
      const a = 1 / 8 + (k - 1) / 4;
      idxs.forEach((idx, j) => { v[idx] = a + (j + 0.5) / (4 * idxs.length); });
    });
    els.forEach((e, i) => { if (e.kind === "join") v[i] = v[0] - 1 / 48; });
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
      R = Math.max(10, n * S / (2 * Math.PI));
      prev = { st: [], sp: [{ v: 0, n }] };
      for (let j = 0; j < n; j++) {
        const f = j / n;
        prev.st.push(f);
        const P = projCircle(f, R);
        startShape += `<g transform="translate(${P.x.toFixed(2)} ${P.y.toFixed(2)}) rotate(${(-360 * f).toFixed(1)})"><ellipse rx="4.2" ry="2.2"/></g>`;
      }
      guides.push({ type: "circle", r: R });
    } else {
      R = R0;
      startShape = SYM.drawMagicRing();
      prev = null;
    }

    p.rows.forEach((row) => {
      const els = row.elements;
      if (!els.length) return;
      const count = Math.max(row.producedSt, els.length);
      const Rin = R;                                   // 전 단(앵커) 크기
      R = Math.max(R + rowGap(row), count * S / (shape === "square" ? 8 : 2 * Math.PI));
      const per = perimeter(shape, R);
      const spread = S / per;                          // 코 하나 간격 (둘레 비율)
      const fanSpread = FAN / per;

      let v = null, anchor = new Array(els.length).fill(null);
      const usable = prev && (prev.st.length || prev.sp.length);
      const hasSg = els.some(e => e.sg != null);
      if (!hasSg && shape === "square") v = assignSquareSegments(els);   // 모서리 사슬 4개면 변마다 고르게
      if (!v && !hasSg && shape !== "square") v = evenRing(els);          // 원형: 둘레에 고르게
      if (!v) { const r = assign(els, prev, { circular: true, spread, fanSpread }); v = r.v; anchor = r.anchor; }
      else {
        // 고르게 놓았을 때 이음 위치
        const st = els.findIndex(e => e.kind === "standing");
        els.forEach((e, i) => { if (e.kind === "join") v[i] = (st >= 0 ? v[st] : v.find(x => x !== null) || 0) - spread * 0.7; });
      }

      const next = { st: [], sp: [] };
      els.forEach((e, i) => {
        const f = v[i];
        const P = proj(f, R);
        const radial = shape === "square" ? squareNormalRot(f, R) : -360 * f;   // 변에 수직 / 바큇살
        let rot = radial, ext = 0;
        const inFan = e.sg != null || (!usable && e.kind === "st");
        if ((e.kind === "st" || e.kind === "standing") && inFan) {
          // 같은 공간에 모여 뜨는 묶음(또는 매직링 1단): 앵커에서 바깥으로 부채꼴, 기둥을 앵커까지
          const A = anchor[i] !== null ? proj(anchor[i], Rin) : { x: 0, y: 0 };
          rot = Math.atan2(P.y - A.y, P.x - A.x) / DEG + 90;
          if (e.kind === "st" && !e.mod) {
            const def = SYM.STITCH_BY_ID[e.stitch];
            const D = Math.hypot(P.x - A.x, P.y - A.y);
            if (def && def.h >= 9) ext = Math.max(0, Math.min(48, D - 2 * def.h - (usable ? 3 : R0 + 2)));
          }
        }
        const el = { ...e, ext };
        if (shape === "square" && e.kind === "chain" && e.n >= 2 && distToCorner(f, R) < S * 1.2) el.corner = true;
        nodes.push({ key: `${row.index}-${i}`, row: row.index, i, x: P.x, y: P.y, rot, el });
        const pr = produce(e, f, spread, 1);
        next.st.push(...pr.st); next.sp.push(...pr.sp);
      });
      prev = next;
      guides.push(shape === "square" ? { type: "square", r: R } : { type: "circle", r: R });
    });

    // 단 번호는 도안 왼쪽 위에 목록으로 (기호와 겹치지 않게)
    const ext = R + 24;
    const bounds = { x: -ext - 30, y: -ext, w: ext * 2 + 30, h: ext * 2 };
    p.rows.forEach((row, k) => {
      labels.push({ x: bounds.x + 4, y: bounds.y + 12 + k * 9, text: `${row.index}단 ${row.producedSt}코`, anchor: "start", row: row.index });
    });
    return { nodes, guides, labels, startShape, bounds };
  }

  /* ================================================================
     평면(왕복뜨기)
     ================================================================ */
  function layoutFlat(p) {
    const nodes = [], guides = [], labels = [];
    let startShape = "";
    const n = Math.max(1, p.start.n || 1);
    let prev = { st: [], sp: [{ v: (n - 1) * S / 2, n }] };
    for (let j = 0; j < n; j++) {
      const x = j * S;
      prev.st.push(x);
      startShape += `<g transform="translate(${x} 0)"><ellipse rx="4.2" ry="2.2"/></g>`;
    }
    let minX = 0, maxX = (n - 1) * S;
    prev.st.reverse();   // 1단은 오른쪽→왼쪽

    let y = 0;
    p.rows.forEach((row) => {
      const els = row.elements;
      if (!els.length) return;
      const dir = row.index % 2 === 1 ? -1 : 1;
      const gap = rowGap(row);
      y -= gap;
      const r = assign(els, prev, { circular: false, dir, spread: S, fanSpread: FAN });
      if (!(prev.st.length || prev.sp.length)) {
        const startX = dir === -1 ? maxX : minX;
        r.v = r.v.map(x => startX + x);
      }
      const next = { st: [], sp: [] };
      els.forEach((e, i) => {
        const x = r.v[i];
        let rot = 0, ext = 0;
        if (e.kind === "st" && e.sg != null && r.anchor[i] !== null) {
          rot = Math.atan2(-gap, x - r.anchor[i]) / DEG + 90;
          const def = SYM.STITCH_BY_ID[e.stitch];
          const D = Math.hypot(gap, x - r.anchor[i]);
          if (def && def.h >= 9 && !e.mod) ext = Math.max(0, Math.min(48, D - 2 * def.h - 3));
        }
        const yy = e.kind === "standing" ? y + 2 : y;
        nodes.push({ key: `${row.index}-${i}`, row: row.index, i, x, y: yy, rot, el: { ...e, ext } });
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        const pr = produce(e, x, S, dir);
        next.st.push(...pr.st); next.sp.push(...pr.sp);
      });
      next.st.reverse(); next.sp.reverse();
      prev = next;
      guides.push({ type: "line", x1: minX - S, x2: maxX + S, y: y + gap / 2 });
      const lx = dir === -1 ? maxX + 14 : minX - 14;
      labels.push({ x: lx, y: y + 2.5, text: dir === -1 ? `${row.index}(${row.producedSt}) ←` : `→ ${row.index}(${row.producedSt})`, anchor: dir === -1 ? "start" : "end", row: row.index });
    });

    const x0 = minX - 70, x1 = maxX + 70;
    const y0 = y - 24, y1 = 24;
    return { nodes, guides, labels, startShape, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  }

  const LAYOUTS = {
    round: { name: "원형", fn: (p) => layoutRing(p, "circle") },
    flat: { name: "왕복 (평면)", fn: layoutFlat },
    square: { name: "모티브 (사각)", fn: (p) => layoutRing(p, "square") }
  };

  window.CROCHET_LAYOUT = { LAYOUTS, layout: (p, format) => (LAYOUTS[format] || LAYOUTS.round).fn(p) };
})();
