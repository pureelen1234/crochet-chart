/* =====================================================================
   도안 텍스트 파서 (parser.js)
   ---------------------------------------------------------------------
   입력 예)
     매직링
     기둥사슬 3, 한길긴뜨기 2, 사슬 2, (한길긴뜨기 3, 사슬 2)*3, 빼뜨기
     사슬2 공간에 (기둥사슬 3, 한길긴뜨기 2, 사슬 2, 한길긴뜨기 3), 사슬 1, ...

   결과: { start:{kind, n}, rows:[...], startFromText }
   row  : { index, raw, elements:[...], producedSt, spaces, consumedSt, consumedSp, warnings }
   element 종류(kind)
     st       : 일반 코  { stitch, mod, n, consumes, produces, sg }
     chain    : 사슬 묶음 { n }  → 코 n개 + 사슬 공간 1개를 만듦
     standing : 기둥사슬 { n }  → n>=2면 코 1개로 셈
     join     : 단 끝 빼뜨기(이음)
   sg : "사슬N 공간에"로 묶인 그룹 번호 (같은 번호 = 같은 공간에 뜸)
   ===================================================================== */
(function () {
  const S = window.CROCHET_SYMBOLS;

  function normalize(line) {
    return line
      .replace(/[×xX]\s*(?=\d)/g, "*")
      .replace(/[\[\{]/g, "(").replace(/[\]\}]/g, ")")
      // "사슬2 공간에", "사슬 2 공간에", "2코 공간에", "공간에", "같은 공간에" → 공간 토큰 (쉼표 앞은 건드리지 않음)
      .replace(/(?:사슬\s*)?(\d+)?\s*코?\s*(?:같은\s*)?공간\s*에/g, (m, n) => ` @sp${n || ""} `)
      .replace(/같은\s*공간/g, " @sp ")
      .replace(/[,，、]/g, " ")
      .replace(/(\d+)\s*코/g, "$1코")
      .replace(/(\d+)\s*회/g, "$1")
      .replace(/(\d+)\s*번/g, "$1")
      .trim();
  }

  function tokenize(line) {
    const tokens = [];
    const re = /\(|\)|\*|@sp(\d*)|(\d+)(코)?|([^\s()*\d]+)/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[0] === "(" || m[0] === ")" || m[0] === "*") tokens.push({ t: m[0] });
      else if (m[0].startsWith("@sp")) tokens.push({ t: "space", n: m[1] ? parseInt(m[1], 10) : null });
      else if (m[2]) tokens.push({ t: "num", v: parseInt(m[2], 10), ko: !!m[3] });
      else tokens.push({ t: "word", v: m[4] });
    }
    return tokens;
  }

  function matchWord(tokens, i) {
    for (let len = 3; len >= 1; len--) {
      const slice = tokens.slice(i, i + len);
      if (slice.length < len || slice.some(t => t.t !== "word")) continue;
      const joined = slice.map(t => t.v).join("").toLowerCase();
      const hit = S.ALIAS_INDEX.find(a => a.alias === joined);
      if (hit) return { hit, len };
    }
    return null;
  }

  let sgCounter = 0;

  function parseSequence(tokens, pos, errors) {
    const items = [];
    while (pos < tokens.length) {
      const tk = tokens[pos];
      if (tk.t === ")") break;
      if (tk.t === "space") {
        // 다음 항목(괄호 묶음 또는 기호 하나)을 같은 공간 그룹으로
        pos++;
        const r = parseItem(tokens, pos, errors);
        pos = r.pos;
        // "공간에 (…)*4" 처럼 반복 묶음이면 반복마다 다른 공간 (4곳에 뜸)
        const per = r.times > 1 ? r.items.length / r.times : r.items.length;
        let id = ++sgCounter;
        r.items.forEach((it, k) => {
          if (k > 0 && per > 0 && k % per === 0) id = ++sgCounter;
          if (it.sg == null) { it.sg = id; it.spaceN = tk.n; }
        });
        items.push(...r.items);
        continue;
      }
      const r = parseItem(tokens, pos, errors);
      if (r.pos === pos) { pos++; continue; }   // 안전장치
      pos = r.pos;
      items.push(...r.items);
    }
    return { items, pos };
  }

  /* 괄호 묶음 하나 또는 기호 항목 하나 */
  function parseItem(tokens, pos, errors) {
    const tk = tokens[pos];
    if (!tk) return { items: [], pos };
    if (tk.t === "(") {
      const r = parseSequence(tokens, pos + 1, errors);
      pos = r.pos;
      if (tokens[pos] && tokens[pos].t === ")") pos++;
      else errors.push("괄호가 닫히지 않았어요");
      let times = 1;
      if (tokens[pos] && tokens[pos].t === "*") {
        pos++;
        if (tokens[pos] && tokens[pos].t === "num") { times = tokens[pos].v; pos++; }
        else errors.push("*(곱하기) 뒤에 숫자가 없어요");
      } else if (tokens[pos] && tokens[pos].t === "num") {
        times = tokens[pos].v; pos++;
      }
      const items = [];
      for (let k = 0; k < times; k++) {
        // 반복마다 공간 그룹 번호를 새로 부여 (각 반복은 다른 공간에 뜸)
        const map = {};
        r.items.forEach(it => {
          const c = { ...it };
          if (c.sg != null) { if (!(c.sg in map)) map[c.sg] = ++sgCounter; c.sg = map[c.sg]; }
          items.push(c);
        });
      }
      return { items, pos, times };
    }
    if (tk.t === ")") return { items: [], pos };
    if (tk.t === "*") { errors.push("*는 괄호 뒤에만 쓸 수 있어요"); return { items: [], pos: pos + 1 }; }
    if (tk.t === "space") return { items: [], pos };
    if (tk.t === "num") {
      const nx = matchWord(tokens, pos + 1);
      if (nx && nx.hit.type === "mod") return parseStitch(tokens, pos, errors);
      return { items: repeat({ stitch: "sc", mod: null, n: 1 }, tk.v), pos: pos + 1 };
    }
    return parseStitch(tokens, pos, errors);
  }

  function repeat(el, count) {
    const def = S.STITCH_BY_ID[el.stitch];
    let consumes = def.consumes, produces = def.produces;
    if (el.mod === "inc") { consumes = 1; produces = el.n; }
    if (el.mod === "dec") { consumes = el.n; produces = 1; }
    const out = [];
    for (let i = 0; i < count; i++) out.push({ ...el, consumes, produces, sg: null });
    return out;
  }

  function parseStitch(tokens, pos, errors) {
    let stitch = null, mod = null, n = null;
    let m = tokens[pos].t === "word" ? matchWord(tokens, pos) : null;
    if (m && m.hit.type === "stitch") { stitch = m.hit.def.id; pos += m.len; }
    else if (m && m.hit.type === "mod") { /* 수식어만 */ }
    else if (tokens[pos].t === "num") { /* "2코 늘려뜨기" */ }
    else {
      errors.push(`모르는 단어: "${tokens[pos].v}"`);
      return { pos: pos + 1, items: repeat({ stitch: "sc", mod: null, n: 1, unknown: tokens[pos].v }, 1) };
    }
    let look = pos, nk = null;
    if (tokens[look] && tokens[look].t === "num") {
      const after = matchWord(tokens, look + 1);
      if (tokens[look].ko || (after && after.hit.type === "mod")) { nk = tokens[look].v; look++; }
    }
    const mm = matchWord(tokens, look);
    if (mm && mm.hit.type === "mod") {
      const md = mm.hit.def;
      mod = md.kind; n = nk || md.defaultN || 1; pos = look + mm.len;
      if (!stitch) {
        // "앞걸어뜨기 한길긴뜨기"처럼 수식어 뒤에 기본 기호가 올 수도 있음
        const ns = md.variant ? matchWord(tokens, pos) : null;
        if (ns && ns.hit.type === "stitch") { stitch = ns.hit.def.id; pos += ns.len; }
        else stitch = md.defaultStitch || "sc";
      }
    } else if (nk !== null) {
      return { pos: look, items: repeat({ stitch, mod: null, n: 1 }, nk) };
    }
    let count = 1;
    if (tokens[pos] && tokens[pos].t === "num" && !tokens[pos].ko) { count = tokens[pos].v; pos++; }
    return { pos, items: repeat({ stitch, mod, n: n || 1 }, count) };
  }

  /* 낱개 항목들을 화면용 요소로: 사슬 묶기, 기둥사슬, 단 끝 빼뜨기 */
  function buildElements(items) {
    const els = [];
    const push = (e) => els.push(e);
    let i = 0;
    while (i < items.length) {
      const it = items[i];
      if (it.stitch === "standing" || it.stitch === "ch") {
        // 같은 종류·같은 그룹의 연속 사슬을 하나로
        let j = i;
        while (j < items.length && items[j].stitch === it.stitch && !items[j].mod && items[j].sg === it.sg) j++;
        const n = j - i;
        push({ kind: it.stitch === "standing" ? "standing" : "chain", stitch: "ch", n, sg: it.sg, spaceN: it.spaceN, consumes: 0, produces: 0 });
        i = j;
        continue;
      }
      push({ kind: "st", ...it });
      i++;
    }
    // 단 첫머리의 사슬은 기둥사슬
    if (els.length && els[0].kind === "chain") els[0].kind = "standing";
    // 단 끝 빼뜨기 = 이음
    const last = els[els.length - 1];
    if (els.length > 1 && last.kind === "st" && last.stitch === "sl" && !last.mod && last.sg == null) {
      last.kind = "join"; last.consumes = 0; last.produces = 0;
    }
    // 코 수
    els.forEach(e => {
      if (e.kind === "chain") e.produces = e.n;
      else if (e.kind === "standing") { e.produces = e.n >= 2 ? 1 : 0; e.consumes = (e.n >= 2 && e.sg == null) ? 1 : 0; }   // 기둥사슬 2 이상 = 첫 코 대신 (전 단 첫 코를 건너뜀)
      if (e.sg != null && e.kind === "st") e.consumes = 0;   // 공간에 뜨는 코는 전 단 코를 쓰지 않음
    });
    return els;
  }

  function parseStart(line, format) {
    const compact = line.replace(/\s+/g, "").toLowerCase().replace(/(시작|으로시작|에서시작)$/, "");
    const num = (line.match(/(\d+)/) || [])[1];
    for (const st of S.STARTS) {
      for (const a of st.aliases) {
        if (compact.startsWith(a) || compact.replace(/\d+/g, "") === a) {
          if (st.kind === "chainring" || (st.kind === "magic" && num && /사슬/.test(line)))
            return { kind: "chainring", n: parseInt(num || "6", 10) };
          if (st.kind === "magic") return { kind: "magic", n: 0 };
          if (st.kind === "chain") {
            if (!num) return null;
            return format === "flat" ? { kind: "chain", n: parseInt(num, 10) } : { kind: "chainring", n: parseInt(num, 10) };
          }
        }
      }
    }
    return null;
  }

  function parsePattern(text, format) {
    sgCounter = 0;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#") && !l.startsWith("//"));
    let start = null;
    const rows = [];
    let firstRowLine = 0;
    if (lines.length) {
      const st = parseStart(lines[0], format);
      if (st) { start = st; firstRowLine = 1; }
    }
    if (!start) start = format === "flat" ? { kind: "chain", n: null } : { kind: "magic", n: 0 };

    // 전 단이 만든 코 수 / 사슬 공간 수
    let prevSt = start.kind === "magic" ? null : start.n;
    let prevSp = start.kind === "magic" ? 1 : (start.kind === "chainring" ? 1 : 0);
    lines.slice(firstRowLine).forEach((raw, i) => {
      const lineErrors = [];
      let line = raw.replace(/^\s*(\d+)\s*단\s*[:.)]?\s*/, "");
      line = normalize(line);
      const tokens = tokenize(line);
      const { items } = parseSequence(tokens, 0, lineErrors);
      const elements = buildElements(items);
      const producedSt = elements.reduce((a, e) => a + (e.produces || 0), 0);
      const spaces = elements.filter(e => e.kind === "chain").length;
      const consumedSt = elements.reduce((a, e) => a + (e.sg == null ? (e.consumes || 0) : 0), 0);
      const consumedSp = new Set(elements.filter(e => e.sg != null).map(e => e.sg)).size;
      const warnings = [...lineErrors];
      if (consumedSp > 0 && prevSp !== null && consumedSp !== prevSp && !(prevSt === null && start.kind === "magic" && i === 0)) {
        warnings.push(`전 단 사슬 공간 ${prevSp}개인데 ${consumedSp}곳에 떠요`);
      } else if (consumedSp === 0 && consumedSt > 0 && prevSt !== null && consumedSt !== prevSt) {
        warnings.push(`전 단 ${prevSt}코인데 ${consumedSt}코를 사용해요`);
      }
      rows.push({ index: i + 1, raw, elements, producedSt, spaces, consumedSt, consumedSp, warnings, produced: producedSt, consumed: consumedSt });
      prevSt = producedSt; prevSp = spaces;
    });

    if (start.kind === "chain" && start.n === null) start.n = rows[0] ? rows[0].consumedSt : 0;
    return { start, rows, startFromText: firstRowLine === 1 };
  }

  window.CROCHET_PARSER = { parsePattern };
})();
