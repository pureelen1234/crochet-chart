/* =====================================================================
   앱 본체 (app.js)
   - 저장/불러오기, 입력 → 파서 → 배치 → SVG 그리기
   - 확대/이동, 기호 편집(드래그·회전·미세 이동)
   - PDF / PNG 저장, 백업
   ===================================================================== */
(function () {
  const SYM = window.CROCHET_SYMBOLS;
  const { parsePattern } = window.CROCHET_PARSER;
  const { LAYOUTS, layout } = window.CROCHET_LAYOUT;
  const $ = (id) => document.getElementById(id);
  const KEY = "crochet-chart-v1";
  const PAPER = "#FAF7F0", CHART_INK = "#2B2A26", LABEL_INK = "#4A473F", GUIDE = "#E4DFD2";

  /* ---------------- 저장소 ---------------- */
  const uid = () => Math.random().toString(36).slice(2, 9);
  const newProject = (name, format, text) => ({
    id: uid(), name, format: format || "round", hook: "", yarn: "", notes: "", text: text || "", overrides: {}, updated: Date.now()
  });
  const EXAMPLES = {
    round: "사슬 원형 시작 10\n짧은뜨기 10\n짧은뜨기 2코 늘려뜨기 10\n(짧은뜨기, 짧은뜨기 2코 늘려뜨기)*10",
    flat: "기초 사슬 10\n사슬 1, 짧은뜨기 10\n사슬 1, 짧은뜨기 10\n사슬 2, 한길긴뜨기 10\n사슬 1, (짧은뜨기 3, 짧은뜨기 2코 모아뜨기)*2"
  };
  function seed() {
    const a = newProject("예시 · 원형 코스터", "round", EXAMPLES.round);
    a.hook = "모사용 5호 (3.0mm)"; a.yarn = "면사 중세사";
    const b = newProject("예시 · 평면 수세미", "flat", EXAMPLES.flat);
    return { projects: [a, b], current: a.id };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && Array.isArray(s.projects) && s.projects.length) return s;
    } catch (e) {}
    return seed();
  }
  let state = load();
  if (!state.projects.find(p => p.id === state.current)) state.current = state.projects[0].id;
  const cur = () => state.projects.find(p => p.id === state.current);
  let saveTimer;
  function save(now) {
    clearTimeout(saveTimer);
    const doSave = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("저장에 실패했어요 (저장 공간 부족?)"); } };
    if (now) doSave(); else saveTimer = setTimeout(doSave, 300);
  }

  /* ---------------- 파싱 + 배치 ---------------- */
  let parsed = null, lay = null;
  function rebuild() {
    const p = cur();
    parsed = parsePattern(p.text, p.format);
    lay = parsed.rows.length ? layout(parsed, p.format) : null;
  }

  /* ---------------- SVG 마크업 ---------------- */
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function nodeTransform(n, ov) {
    const o = ov || {};
    return `translate(${(n.x + (o.dx || 0)).toFixed(2)} ${(n.y + (o.dy || 0)).toFixed(2)}) rotate(${(n.rot + (o.rot || 0)).toFixed(1)})`;
  }
  function worldMarkup(opts) {
    if (!lay) return "";
    const p = cur();
    const ex = !!opts.forExport;
    let s = "";
    lay.guides.forEach(g => {
      if (g.type === "circle") s += `<circle class="guide" r="${g.r.toFixed(2)}" fill="none" stroke="${GUIDE}" stroke-width="0.8"/>`;
      else s += `<line class="guide" x1="${g.x1.toFixed(1)}" x2="${g.x2.toFixed(1)}" y1="${g.y.toFixed(1)}" y2="${g.y.toFixed(1)}" stroke="${GUIDE}" stroke-width="0.8"/>`;
    });
    s += `<g class="start">${lay.startShape}</g>`;
    lay.nodes.forEach(n => {
      const ov = p.overrides[n.key];
      const cls = ["node", ov ? "moved" : "", opts.selectedKey === n.key ? "selected" : ""].filter(Boolean).join(" ");
      s += `<g class="${cls}" data-key="${n.key}" transform="${nodeTransform(n, ov)}">`;
      if (!ex) s += `<circle class="hit" r="9" fill="transparent" stroke="none"/>`;
      s += SYM.drawElement(n.el);
      s += `</g>`;
    });
    lay.labels.forEach(l => {
      s += `<text class="label" x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="${l.anchor}" fill="${LABEL_INK}" stroke="none" font-family="Helvetica Neue, Arial, sans-serif" font-weight="600" font-size="7.5">${esc(l.text)}</text>`;
    });
    return s;
  }
  function exportSvgString(scale) {
    const b = lay.bounds;
    const w = Math.round(b.w * scale), h = Math.round(b.h * scale);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${w}" height="${h}">` +
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${PAPER}"/>` +
      `<g style="color:${CHART_INK}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${worldMarkup({ forExport: true })}</g></svg>`;
  }

  /* ---------------- 화면 그리기 ---------------- */
  const svg = $("chart"), world = $("world"), wrap = $("chartwrap");
  world.setAttribute("class", "chart-ink");
  world.setAttribute("fill", "none"); world.setAttribute("stroke", "currentColor");
  world.setAttribute("stroke-width", "1.4"); world.setAttribute("stroke-linecap", "round"); world.setAttribute("stroke-linejoin", "round");
  const view = { k: 1, tx: 0, ty: 0 };
  let lastBounds = null;
  let editing = false, selectedKey = null;
  const undoStack = [];

  function applyView() { world.setAttribute("transform", `translate(${view.tx} ${view.ty}) scale(${view.k})`); }
  function fit() {
    if (!lay) return;
    const r = svg.getBoundingClientRect();
    const b = lay.bounds;
    view.k = Math.min(r.width / b.w, r.height / b.h) * 0.92;
    view.tx = r.width / 2 - (b.x + b.w / 2) * view.k;
    view.ty = r.height / 2 - (b.y + b.h / 2) * view.k;
    applyView();
  }
  function renderChart() {
    $("empty").hidden = !!lay;
    world.innerHTML = lay ? worldMarkup({ selectedKey }) : "";
    if (lay) {
      const b = lay.bounds;
      const changed = !lastBounds || Math.abs(b.w - lastBounds.w) / lastBounds.w > 0.15 || Math.abs(b.h - lastBounds.h) / lastBounds.h > 0.15;
      if (changed) fit();
      lastBounds = { ...b };
    }
    applyView();
  }

  /* ---------------- 입력부 ---------------- */
  const ta = $("pattern"), gutter = $("gutter");
  function renderGutter() {
    const lines = ta.value.split(/\r?\n/);
    let rowIdx = 0, seenFirst = false;
    const out = lines.map(l => {
      const t = l.trim();
      if (!t || t.startsWith("#") || t.startsWith("//")) return " ";
      if (!seenFirst) { seenFirst = true; if (parsed.startFromText) return "시작"; }
      rowIdx++;
      const row = parsed.rows[rowIdx - 1];
      return row && row.warnings.length ? `<span class="warn">${rowIdx}</span>` : String(rowIdx);
    });
    gutter.innerHTML = out.join("\n") + "\n";
    gutter.scrollTop = ta.scrollTop;
  }
  ta.addEventListener("scroll", () => { gutter.scrollTop = ta.scrollTop; });
  function renderRows() {
    const box = $("rows");
    box.innerHTML = "";
    if (!parsed) return;
    const st = parsed.start;
    const sc = document.createElement("span");
    sc.className = "chip start";
    sc.textContent = st.kind === "magic" ? "매직링" : st.kind === "chainring" ? `사슬 ${st.n}코 원형` : `기초 사슬 ${st.n}코`;
    box.appendChild(sc);
    parsed.rows.forEach(r => {
      const c = document.createElement("span");
      c.className = "chip" + (r.warnings.length ? " warn" : "");
      c.textContent = `${r.index}단 ${r.produced}코`;
      if (r.warnings.length) c.title = r.warnings.join(" / ");
      box.appendChild(c);
    });
    const warn = parsed.rows.find(r => r.warnings.length);
    if (warn) {
      const m = document.createElement("span");
      m.className = "chip warn";
      m.textContent = `${warn.index}단: ${warn.warnings[0]}`;
      box.appendChild(m);
    }
  }
  let inputTimer;
  ta.addEventListener("input", () => {
    cur().text = ta.value; cur().updated = Date.now();
    save();
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => { rebuild(); renderGutter(); renderRows(); renderChart(); }, 120);
  });

  /* ---------------- 규격 ---------------- */
  function renderFormatSeg() {
    const seg = $("format-seg");
    seg.innerHTML = "";
    Object.entries(LAYOUTS).forEach(([id, def]) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = def.name;
      b.setAttribute("aria-pressed", cur().format === id ? "true" : "false");
      b.addEventListener("click", () => {
        const p = cur();
        if (p.format === id) return;
        p.format = id; p.updated = Date.now(); save();
        lastBounds = null; selectedKey = null;
        renderAll();
      });
      seg.appendChild(b);
    });
  }

  /* ---------------- 작품 정보 ---------------- */
  ["name", "hook", "yarn", "notes"].forEach(f => {
    $("f-" + f).addEventListener("input", (e) => {
      cur()[f] = e.target.value; cur().updated = Date.now(); save();
      if (f === "name") renderProjectSelect();
    });
  });
  function renderInfo() {
    const p = cur();
    $("f-name").value = p.name; $("f-hook").value = p.hook || ""; $("f-yarn").value = p.yarn || ""; $("f-notes").value = p.notes || "";
  }

  /* ---------------- 작품 목록 ---------------- */
  function renderProjectSelect() {
    const sel = $("project-select");
    sel.innerHTML = "";
    state.projects.forEach(p => {
      const o = document.createElement("option");
      o.value = p.id; o.textContent = p.name || "이름 없음";
      if (p.id === state.current) o.selected = true;
      sel.appendChild(o);
    });
  }
  $("project-select").addEventListener("change", (e) => {
    state.current = e.target.value; save(true);
    lastBounds = null; selectedKey = null;
    renderAll();
  });
  $("btn-new").addEventListener("click", () => {
    const name = prompt("새 작품 이름", "새 작품");
    if (name === null) return;
    const p = newProject(name.trim() || "새 작품", cur().format, "");
    state.projects.push(p); state.current = p.id; save(true);
    lastBounds = null; selectedKey = null;
    renderAll();
    ta.focus();
  });
  $("btn-delete").addEventListener("click", () => {
    const p = cur();
    if (!confirm(`「${p.name}」 작품을 삭제할까요? 되돌릴 수 없어요.`)) return;
    state.projects = state.projects.filter(x => x.id !== p.id);
    if (!state.projects.length) state.projects.push(newProject("새 작품", "round", ""));
    state.current = state.projects[0].id; save(true);
    lastBounds = null; selectedKey = null;
    renderAll();
    toast("삭제했어요");
  });
  $("btn-example").addEventListener("click", () => {
    const p = cur();
    if (p.text.trim() && !confirm("지금 입력한 내용을 예시로 바꿀까요?")) return;
    p.text = EXAMPLES[p.format] || EXAMPLES.round; p.updated = Date.now(); save();
    lastBounds = null;
    renderAll();
  });

  /* ---------------- 확대 · 이동 · 드래그 ---------------- */
  const pointers = new Map();
  let gesture = null; // {mode:'pan'|'drag'|'pinch', ...}
  function pt(e) { const r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pt(e));
    if (pointers.size === 1) {
      const node = editing ? e.target.closest(".node") : null;
      const p = pt(e);
      if (node) {
        const key = node.getAttribute("data-key");
        gesture = { mode: "drag", key, node, start: p, last: p, moved: false, snapshot: JSON.stringify(cur().overrides) };
      } else {
        gesture = { mode: "pan", last: p, start: p, moved: false };
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { mode: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, k0: view.k, tx0: view.tx, ty0: view.ty };
    }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pt(e);
    pointers.set(e.pointerId, p);
    if (!gesture) return;
    if (gesture.mode === "pan") {
      view.tx += p.x - gesture.last.x; view.ty += p.y - gesture.last.y; gesture.last = p;
      if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 4) gesture.moved = true;
      applyView();
    } else if (gesture.mode === "drag") {
      const dx = (p.x - gesture.last.x) / view.k, dy = (p.y - gesture.last.y) / view.k;
      gesture.last = p;
      if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 4) gesture.moved = true;
      if (!gesture.moved) return;
      const ov = cur().overrides[gesture.key] || (cur().overrides[gesture.key] = { dx: 0, dy: 0, rot: 0 });
      ov.dx += dx; ov.dy += dy;
      const n = lay.nodes.find(x => x.key === gesture.key);
      gesture.node.setAttribute("transform", nodeTransform(n, ov));
    } else if (gesture.mode === "pinch" && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = Math.min(12, Math.max(0.15, gesture.k0 * d / gesture.d0));
      const wx = (gesture.mid0.x - gesture.tx0) / gesture.k0, wy = (gesture.mid0.y - gesture.ty0) / gesture.k0;
      view.k = k; view.tx = mid.x - wx * k; view.ty = mid.y - wy * k;
      applyView();
    }
  });
  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (gesture && gesture.mode === "drag") {
      if (gesture.moved) {
        undoStack.push(gesture.snapshot); if (undoStack.length > 40) undoStack.shift();
        cur().updated = Date.now(); save();
        selectedKey = gesture.key;
      } else {
        selectedKey = selectedKey === gesture.key ? null : gesture.key;
      }
      renderChart(); renderEditPanel();
    }
    gesture = pointers.size === 1 ? { mode: "pan", last: [...pointers.values()][0], start: [...pointers.values()][0], moved: true } : null;
  }
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  svg.addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;   // 컴퓨터에서는 Ctrl+휠(트랙패드 핀치)로만 확대, 그냥 휠은 페이지 스크롤
    e.preventDefault();
    const p = pt(e);
    const f = Math.exp(-e.deltaY * 0.0015);
    const k = Math.min(12, Math.max(0.15, view.k * f));
    const wx = (p.x - view.tx) / view.k, wy = (p.y - view.ty) / view.k;
    view.k = k; view.tx = p.x - wx * k; view.ty = p.y - wy * k;
    applyView();
  }, { passive: false });
  $("btn-fit").addEventListener("click", fit);
  window.addEventListener("resize", () => { if (lay) fit(); });

  /* ---------------- 편집 패널 ---------------- */
  $("btn-edit").addEventListener("click", () => {
    editing = !editing;
    $("btn-edit").setAttribute("aria-pressed", String(editing));
    wrap.classList.toggle("editing", editing);
    $("editcard").hidden = !editing;
    $("hint").textContent = editing ? "기호를 눌러 선택하고, 끌어서 옮기세요" : "한 손가락으로 이동 · 두 손가락으로 확대";
    if (!editing) selectedKey = null;
    renderChart(); renderEditPanel();
  });
  function describe(key) {
    const n = lay && lay.nodes.find(x => x.key === key);
    if (!n) return "";
    const def = SYM.STITCH_BY_ID[n.el.stitch];
    const modName = n.el.mod === "inc" ? ` ${n.el.n}코 늘림` : n.el.mod === "dec" ? ` ${n.el.n}코 모아뜨기` : "";
    return `<b>${n.row}단 ${n.i + 1}번째</b> · ${def ? def.name : n.el.stitch}${modName}`;
  }
  function renderEditPanel() {
    const has = !!selectedKey && lay && lay.nodes.some(n => n.key === selectedKey);
    $("sel-text").innerHTML = has ? describe(selectedKey) : "도안에서 기호를 눌러 선택하세요";
    const ov = has ? (cur().overrides[selectedKey] || {}) : {};
    $("e-rot").disabled = !has; $("e-rot").value = ov.rot || 0; $("e-rot-out").textContent = `${Math.round(ov.rot || 0)}°`;
    document.querySelectorAll("[data-nudge]").forEach(b => b.disabled = !has);
    $("e-reset").disabled = !has || !cur().overrides[selectedKey];
    $("e-undo").disabled = !undoStack.length;
  }
  function pushUndo() { undoStack.push(JSON.stringify(cur().overrides)); if (undoStack.length > 40) undoStack.shift(); }
  function setOverride(key, patch) {
    const ov = cur().overrides[key] || (cur().overrides[key] = { dx: 0, dy: 0, rot: 0 });
    Object.assign(ov, patch);
    cur().updated = Date.now(); save();
  }
  let rotSnapshotTaken = false;
  $("e-rot").addEventListener("input", (e) => {
    if (!selectedKey) return;
    if (!rotSnapshotTaken) { pushUndo(); rotSnapshotTaken = true; }
    setOverride(selectedKey, { rot: Number(e.target.value) });
    $("e-rot-out").textContent = `${e.target.value}°`;
    const n = lay.nodes.find(x => x.key === selectedKey);
    const g = world.querySelector(`[data-key="${selectedKey}"]`);
    if (g) { g.setAttribute("transform", nodeTransform(n, cur().overrides[selectedKey])); g.classList.add("moved"); }
  });
  $("e-rot").addEventListener("change", () => { rotSnapshotTaken = false; renderEditPanel(); });
  document.querySelectorAll("[data-nudge]").forEach(b => b.addEventListener("click", () => {
    if (!selectedKey) return;
    const [dx, dy] = b.getAttribute("data-nudge").split(",").map(Number);
    pushUndo();
    const ov = cur().overrides[selectedKey] || { dx: 0, dy: 0, rot: 0 };
    setOverride(selectedKey, { dx: ov.dx + dx * 2, dy: ov.dy + dy * 2 });
    renderChart(); renderEditPanel();
  }));
  $("e-reset").addEventListener("click", () => {
    if (!selectedKey) return;
    pushUndo(); delete cur().overrides[selectedKey]; save();
    renderChart(); renderEditPanel();
  });
  $("e-undo").addEventListener("click", () => {
    if (!undoStack.length) return;
    cur().overrides = JSON.parse(undoStack.pop()); save();
    renderChart(); renderEditPanel();
  });
  $("e-reset-all").addEventListener("click", () => {
    if (!Object.keys(cur().overrides).length) return;
    if (!confirm("옮긴 기호를 모두 원래 자리로 되돌릴까요?")) return;
    pushUndo(); cur().overrides = {}; save();
    renderChart(); renderEditPanel();
  });

  /* ---------------- 내보내기 (PNG / PDF) ---------------- */
  function svgToImage(svgString) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("svg render failed")); };
      img.src = url;
    });
  }
  async function saveBlob(blob, filename) {
    const file = new File([blob], filename, { type: blob.type });
    const touch = navigator.maxTouchPoints > 0;
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  const safeName = () => (cur().name || "도안").replace(/[\\/:*?"<>|]/g, "_");
  const today = () => new Date().toISOString().slice(0, 10);

  $("btn-png").addEventListener("click", async () => {
    if (!lay) return toast("먼저 도안을 입력하세요");
    try {
      const b = lay.bounds;
      const scale = Math.min(4, 3000 / Math.max(b.w, b.h));
      const img = await svgToImage(exportSvgString(scale));
      const c = document.createElement("canvas");
      c.width = Math.round(b.w * scale); c.height = Math.round(b.h * scale);
      const ctx = c.getContext("2d");
      ctx.fillStyle = PAPER; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(async (blob) => { await saveBlob(blob, `${safeName()}_${today()}.png`); toast("이미지를 준비했어요"); }, "image/png");
    } catch (e) { console.error(e); toast("이미지를 만들지 못했어요"); }
  });

  function patternLines() {
    const lines = [];
    const st = parsed.start;
    lines.push(["시작", st.kind === "magic" ? "매직링" : st.kind === "chainring" ? `사슬 ${st.n}코 원형` : `기초 사슬 ${st.n}코`]);
    parsed.rows.forEach(r => lines.push([`${r.index}단`, `${r.raw.replace(/^\s*\d+\s*단\s*[:.)]?\s*/, "")}   (${r.produced}코)`]));
    return lines;
  }
  function wrapText(ctx, text, maxW) {
    const words = text.split(/(\s+)/); const out = []; let line = "";
    for (const w of words) {
      if (ctx.measureText(line + w).width > maxW && line) { out.push(line); line = w.trimStart(); }
      else line += w;
    }
    if (line) out.push(line);
    return out;
  }
  async function buildPdfPages() {
    const W = 1654, H = 2339, M = 110;
    const p = cur();
    await (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve());
    const FONT = '"Gowun Dodum", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
    const pages = [];
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const paint = () => { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H); };
    const footer = (n) => {
      ctx.fillStyle = "#8C93A3"; ctx.font = `24px ${FONT}`; ctx.textAlign = "left";
      ctx.fillText(`${p.name || "도안"} · ${today()}`, M, H - 60);
      ctx.textAlign = "right"; ctx.fillText(`${n}`, W - M, H - 60);
    };
    // 1쪽: 제목 + 도안
    paint();
    ctx.fillStyle = "#1F2A3C"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = `600 56px ${FONT}`;
    ctx.fillText(p.name || "도안", M, M + 50);
    ctx.font = `26px ${FONT}`; ctx.fillStyle = "#5A6375";
    const meta = [LAYOUTS[p.format] ? LAYOUTS[p.format].name : p.format, p.hook && `바늘 ${p.hook}`, p.yarn && `실 ${p.yarn}`].filter(Boolean).join("   ·   ");
    ctx.fillText(meta, M, M + 100);
    ctx.strokeStyle = "#D9D8E2"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, M + 130); ctx.lineTo(W - M, M + 130); ctx.stroke();

    const boxY = M + 160, boxH = 1330, boxW = W - 2 * M;
    ctx.fillStyle = PAPER; ctx.fillRect(M, boxY, boxW, boxH);
    const b = lay.bounds;
    const scale = Math.min((boxW - 40) / b.w, (boxH - 40) / b.h);
    const img = await svgToImage(exportSvgString(Math.min(scale, 4000 / Math.max(b.w, b.h))));
    const iw = b.w * scale, ih = b.h * scale;
    ctx.drawImage(img, M + (boxW - iw) / 2, boxY + (boxH - ih) / 2, iw, ih);

    // 지시문
    let y = boxY + boxH + 70;
    ctx.fillStyle = "#8C93A3"; ctx.font = `22px ${FONT}`; ctx.fillText("도 안 지 시 문", M, y); y += 44;
    const lines = patternLines();
    const LH = 42;
    const writeLine = (label, text) => {
      ctx.fillStyle = "#8C93A3"; ctx.font = `26px ${FONT}`; ctx.textAlign = "right"; ctx.fillText(label, M + 90, y);
      ctx.fillStyle = "#1F2A3C"; ctx.textAlign = "left";
      const parts = wrapText(ctx, text, boxW - 120);
      parts.forEach((t, i) => { ctx.fillText(t, M + 120, y); if (i < parts.length - 1) y += LH; });
      y += LH;
    };
    let pageNo = 1;
    for (const [label, text] of lines) {
      if (y > H - 140) {
        footer(pageNo); pages.push(c.toDataURL("image/jpeg", 0.9)); pageNo++;
        paint(); y = M + 40;
      }
      writeLine(label, text);
    }
    if (p.notes && p.notes.trim()) {
      if (y > H - 260) { footer(pageNo); pages.push(c.toDataURL("image/jpeg", 0.9)); pageNo++; paint(); y = M + 40; }
      y += 20; ctx.fillStyle = "#8C93A3"; ctx.font = `22px ${FONT}`; ctx.textAlign = "left"; ctx.fillText("메 모", M, y); y += 40;
      ctx.fillStyle = "#1F2A3C"; ctx.font = `26px ${FONT}`;
      p.notes.split(/\r?\n/).forEach(l => wrapText(ctx, l || " ", boxW).forEach(t => { ctx.fillText(t, M, y); y += LH; }));
    }
    footer(pageNo); pages.push(c.toDataURL("image/jpeg", 0.9));
    return pages;
  }
  $("btn-pdf").addEventListener("click", async () => {
    if (!lay) return toast("먼저 도안을 입력하세요");
    if (!window.jspdf) return toast("PDF 도구를 불러오지 못했어요. 인터넷 연결을 확인하세요");
    toast("PDF 만드는 중…");
    try {
      const pages = await buildPdfPages();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      pages.forEach((img, i) => { if (i) doc.addPage(); doc.addImage(img, "JPEG", 0, 0, 210, 297, undefined, "FAST"); });
      await saveBlob(doc.output("blob"), `${safeName()}_${today()}.pdf`);
      toast("PDF를 준비했어요");
    } catch (e) { console.error(e); toast("PDF를 만들지 못했어요"); }
  });

  /* ---------------- 백업 ---------------- */
  $("btn-export").addEventListener("click", async () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    await saveBlob(blob, `코바늘도안_백업_${today()}.json`);
  });
  $("btn-import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!s || !Array.isArray(s.projects) || !s.projects.length) throw new Error();
      const merge = state.projects.length && confirm("지금 있는 작품에 추가할까요?\n확인: 추가 / 취소: 백업으로 통째로 바꾸기");
      if (merge) {
        const ids = new Set(state.projects.map(p => p.id));
        s.projects.forEach(p => { if (ids.has(p.id)) p.id = uid(); state.projects.push(p); });
      } else state = s;
      if (!state.projects.find(p => p.id === state.current)) state.current = state.projects[0].id;
      save(true); lastBounds = null; selectedKey = null; renderAll(); toast("불러왔어요");
    } catch (err) { toast("백업 파일 형식이 맞지 않아요"); }
    e.target.value = "";
  });

  /* ---------------- 도움말 ---------------- */
  function renderLegend() {
    const box = $("legend"); box.innerHTML = "";
    const items = SYM.STITCHES.map(s => ({ label: s.name, sub: s.aliases.slice(0, 3).join(", "), el: { stitch: s.id, mod: null, n: 1 }, h: s.h }));
    items.push({ label: "늘려뜨기 (2코)", sub: "N코 늘려뜨기", el: { stitch: "sc", mod: "inc", n: 2 }, h: 8 });
    items.push({ label: "모아뜨기 (2코)", sub: "N코 모아뜨기", el: { stitch: "sc", mod: "dec", n: 2 }, h: 8 });
    items.forEach(it => {
      const d = document.createElement("div"); d.className = "item";
      d.innerHTML = `<svg viewBox="-17 -17 34 34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${SYM.drawElement(it.el)}</svg><span>${it.label}<small>${it.sub}</small></span>`;
      box.appendChild(d);
    });
  }
  $("btn-help").addEventListener("click", () => { renderLegend(); $("help").showModal(); });
  $("help-close").addEventListener("click", () => $("help").close());
  $("help").addEventListener("click", (e) => { if (e.target === $("help")) $("help").close(); });

  /* ---------------- 공통 ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2000);
  }
  function renderAll() {
    const p = cur();
    ta.value = p.text;
    rebuild();
    renderProjectSelect(); renderFormatSeg(); renderInfo();
    renderGutter(); renderRows(); renderChart(); renderEditPanel();
  }
  renderAll();
  save(true);
  window.CROCHET_APP = { buildPdfPages, exportSvgString };   // 콘솔 디버그용

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
