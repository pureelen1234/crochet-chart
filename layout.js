/* =====================================================================
   도안 배치 (layout.js)
   ---------------------------------------------------------------------
   parsePattern 결과를 받아 각 기호의 좌표를 계산합니다.
   규격(format)별로 함수 하나씩. 새 규격을 추가하려면 LAYOUTS에 등록하세요.

   결과: { nodes:[{key,row,i,x,y,rot,el}], guides:[], labels:[], startShape:"<svg…>", bounds }
   ===================================================================== */
(function () {
  const DEG = Math.PI / 180;
  const S = 15;        // 이웃한 코 사이 거리
  const ROW_GAP = 26;  // 단 사이 거리(원형 반지름 증가량 / 평면 줄 간격)

  function circMean(angles) {
    let x = 0, y = 0;
    angles.forEach(a => { x += Math.cos(a * DEG); y += Math.sin(a * DEG); });
    return Math.atan2(y, x) / DEG;
  }

  /* 요소마다 "앞 단 어느 코에 뜨는지"로 위치 값을 정하고, 앞 단 코를 안 쓰는
     요소(사슬 등)는 이웃 사이에 고르게 끼워 넣습니다. 값(v)은 원형에선 각도, 평면에선 x. */
  function assignByPrev(elements, prevVals, opts) {
    const m = elements.length;
    const vals = new Array(m).fill(null);
    const totalConsumed = elements.reduce((a, e) => a + e.consumes, 0);
    if (!prevVals || prevVals.length === 0 || totalConsumed !== prevVals.length) return null;
    let c = 0;
    elements.forEach((e, i) => {
      if (e.consumes > 0) {
        const slice = prevVals.slice(c, c + e.consumes);
        vals[i] = opts.circular ? circMean(slice) : slice.reduce((a, b) => a + b, 0) / slice.length;
        c += e.consumes;
      }
    });
    const anchored = vals.map((v, i) => v !== null ? i : -1).filter(i => i >= 0);
    if (!anchored.length) return null;
    // 앞 단 코를 안 쓰는 요소 끼워 넣기
    let i = 0;
    while (i < m) {
      if (vals[i] !== null) { i++; continue; }
      let j = i; while (j < m && vals[j] === null) j++;
      const L = j - i;
      const prevIdx = i - 1, nextIdx = j < m ? j : -1;
      if (opts.circular) {
        let A = prevIdx >= 0 ? vals[prevIdx] : vals[anchored[anchored.length - 1]] - 360;
        let B = nextIdx >= 0 ? vals[nextIdx] : vals[anchored[0]] + 360;
        while (B <= A) B += 360;
        for (let k = 0; k < L; k++) vals[i + k] = A + (B - A) * (k + 1) / (L + 1);
      } else {
        const dir = opts.dir;
        if (prevIdx < 0) { const B = vals[nextIdx]; for (let k = 0; k < L; k++) vals[i + k] = B - dir * S * (L - k); }
        else if (nextIdx < 0) { const A = vals[prevIdx]; for (let k = 0; k < L; k++) vals[i + k] = A + dir * S * (k + 1); }
        else { const A = vals[prevIdx], B = vals[nextIdx]; for (let k = 0; k < L; k++) vals[i + k] = A + (B - A) * (k + 1) / (L + 1); }
      }
      i = j;
    }
    return vals;
  }

  /* ---------------- 원형 ---------------- */
  function layoutRound(p) {
    const nodes = [], guides = [], labels = [];
    let startShape = "";
    let prevAngles = null;
    let R = 0;

    if (p.start.kind === "chainring") {
      const n = Math.max(1, p.start.n);
      R = Math.max(12, n * S / (2 * Math.PI));
      prevAngles = [];
      for (let j = 0; j < n; j++) {
        const a = -90 + 360 * j / n;
        prevAngles.push(a);
        startShape += `<g transform="translate(${(R * Math.cos(a * DEG)).toFixed(2)} ${(R * Math.sin(a * DEG)).toFixed(2)}) rotate(${(a + 90).toFixed(1)})"><ellipse rx="6" ry="3.2"/></g>`;
      }
      guides.push({ type: "circle", r: R });
    } else {
      R = 6;
      startShape = `<circle r="6"/><path d="M-3 -1 A3.5 3.5 0 1 0 3 -1" stroke-width="1.2"/>`;
    }

    p.rows.forEach((row, ri) => {
      const els = row.elements, m = els.length;
      const P = row.produced;
      if (!m) return;
      R = Math.max(R + ROW_GAP, Math.max(P, m) * S / (2 * Math.PI));
      let angles = assignByPrev(els, prevAngles, { circular: true });
      if (!angles) angles = els.map((_, i) => -90 + 360 * i / m);
      const produced = [];
      els.forEach((e, i) => {
        const a = angles[i];
        nodes.push({ key: `${row.index}-${i}`, row: row.index, i, x: R * Math.cos(a * DEG), y: R * Math.sin(a * DEG), rot: a + 90, el: e });
        if (e.produces === 1) produced.push(a);
        else if (e.produces > 1) {
          const step = 360 / Math.max(P, 1);
          for (let j = 0; j < e.produces; j++) produced.push(a + (j - (e.produces - 1) / 2) * step);
        }
      });
      prevAngles = produced;
      guides.push({ type: "circle", r: R });
      labels.push({ x: 0, y: -(R + 12), text: `${row.index}(${P})`, anchor: "middle", row: row.index });
    });

    const ext = R + 22;
    return { nodes, guides, labels, startShape, bounds: { x: -ext, y: -ext, w: ext * 2, h: ext * 2 } };
  }

  /* ---------------- 평면(왕복뜨기) ---------------- */
  function layoutFlat(p) {
    const nodes = [], guides = [], labels = [];
    let startShape = "";
    const n = Math.max(1, p.start.n || 1);
    let prevXs = [];
    for (let j = 0; j < n; j++) {
      const x = j * S;
      prevXs.push(x);
      startShape += `<g transform="translate(${x} 0)"><ellipse rx="6" ry="3.2"/></g>`;
    }
    let minX = 0, maxX = (n - 1) * S;
    // 1단은 오른쪽→왼쪽으로 뜨므로 기초사슬 순서를 뒤집음
    prevXs = prevXs.slice().reverse();

    p.rows.forEach((row, ri) => {
      const els = row.elements, m = els.length;
      const P = row.produced;
      if (!m) return;
      const dir = row.index % 2 === 1 ? -1 : 1;   // 홀수단 ←, 짝수단 →
      const y = -row.index * ROW_GAP;
      let xs = assignByPrev(els, prevXs, { circular: false, dir });
      if (!xs) {
        const startX = dir === -1 ? maxX : minX;
        xs = els.map((_, i) => startX + dir * i * S);
      }
      const produced = [];
      els.forEach((e, i) => {
        const x = xs[i];
        nodes.push({ key: `${row.index}-${i}`, row: row.index, i, x, y, rot: 0, el: e });
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        if (e.produces === 1) produced.push(x);
        else if (e.produces > 1) for (let j = 0; j < e.produces; j++) produced.push(x + dir * (j - (e.produces - 1) / 2) * S);
      });
      prevXs = produced.slice().reverse();
      guides.push({ type: "line", x1: minX - S, x2: maxX + S, y: y + ROW_GAP / 2 });
      const lx = dir === -1 ? maxX + 14 : minX - 14;
      labels.push({ x: lx, y: y + 2.5, text: dir === -1 ? `${row.index}(${P}) ←` : `→ ${row.index}(${P})`, anchor: dir === -1 ? "start" : "end", row: row.index });
    });

    const rows = p.rows.length;
    const x0 = minX - 70, x1 = maxX + 70;
    const y0 = -rows * ROW_GAP - 24, y1 = 24;
    return { nodes, guides, labels, startShape, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  }

  const LAYOUTS = {
    round: { name: "원형", fn: layoutRound },
    flat: { name: "평면 (왕복뜨기)", fn: layoutFlat }
  };

  window.CROCHET_LAYOUT = { LAYOUTS, layout: (p, format) => (LAYOUTS[format] || LAYOUTS.round).fn(p) };
})();
