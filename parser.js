/* =====================================================================
   도안 텍스트 파서 (parser.js)
   ---------------------------------------------------------------------
   입력 예)
     사슬 원형 시작 10
     짧은뜨기 10
     짧은뜨기 2코 늘려뜨기 10
     (짧은뜨기, 짧은뜨기 2코 늘려뜨기)*10

   결과: { start:{kind, n}, rows:[{ index, elements:[...], produced, consumed, warnings }] , errors }
   element = { stitch:"sc", mod:null|"inc"|"dec", n:2, consumes, produces }
   ===================================================================== */
(function () {
  const S = window.CROCHET_SYMBOLS;

  function normalize(line) {
    return line
      .replace(/[×xX]\s*(?=\d)/g, "*")     // ×10, x10 → *10
      .replace(/[\[\{]/g, "(").replace(/[\]\}]/g, ")")
      .replace(/[,，、]/g, " ")
      .replace(/(\d+)\s*코/g, "$1코")      // "2 코" → "2코"
      .replace(/(\d+)\s*회/g, "$1")        // "10회" → "10"
      .replace(/(\d+)\s*번/g, "$1")
      .trim();
  }

  function tokenize(line) {
    const tokens = [];
    const re = /\(|\)|\*|(\d+)(코)?|([^\s()*\d]+)/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[0] === "(" || m[0] === ")" || m[0] === "*") tokens.push({ t: m[0] });
      else if (m[1]) tokens.push({ t: "num", v: parseInt(m[1], 10), ko: !!m[2] });
      else tokens.push({ t: "word", v: m[3] });
    }
    return tokens;
  }

  /* 단어(또는 연속 단어)를 기호/수식어로 매칭 */
  function matchWord(tokens, i) {
    // 최대 3단어까지 붙여서 시도 ("짧은 뜨기" 같은 띄어쓰기 허용)
    for (let len = 3; len >= 1; len--) {
      const slice = tokens.slice(i, i + len);
      if (slice.length < len || slice.some(t => t.t !== "word")) continue;
      const joined = slice.map(t => t.v).join("").toLowerCase();
      const hit = S.ALIAS_INDEX.find(a => a.alias === joined);
      if (hit) return { hit, len };
    }
    return null;
  }

  function parseSequence(tokens, pos, errors) {
    const items = [];
    while (pos < tokens.length) {
      const tk = tokens[pos];
      if (tk.t === ")") break;
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
          // "(…) 6" 도 6회 반복으로 허용
          times = tokens[pos].v; pos++;
        }
        for (let k = 0; k < times; k++) items.push(...r.items);
        continue;
      }
      if (tk.t === "*") { errors.push("*는 괄호 뒤에만 쓸 수 있어요"); pos++; continue; }
      if (tk.t === "num") {
        const nx = matchWord(tokens, pos + 1);
        if (nx && nx.hit.type === "mod") {
          // "2코 늘려뜨기 5" 처럼 기호 없이 수식어만
          const r = parseStitch(tokens, pos, errors);
          pos = r.pos;
          if (r.items) items.push(...r.items);
          continue;
        }
        // 기호 없이 숫자만: 짧은뜨기로 간주
        items.push(...repeat({ stitch: "sc", mod: null, n: 1 }, tk.v));
        pos++;
        continue;
      }
      // word: 기호 항목 파싱
      const r = parseStitch(tokens, pos, errors);
      pos = r.pos;
      if (r.items) items.push(...r.items);
    }
    return { items, pos };
  }

  function repeat(el, count) {
    const def = S.STITCH_BY_ID[el.stitch];
    let consumes = def.consumes, produces = def.produces;
    if (el.mod === "inc") { consumes = 1; produces = el.n; }
    if (el.mod === "dec") { consumes = el.n; produces = 1; }
    const out = [];
    for (let i = 0; i < count; i++) out.push({ ...el, consumes, produces });
    return out;
  }

  function parseStitch(tokens, pos, errors) {
    let stitch = null, mod = null, n = null;
    // 1) 기본 기호
    let m = tokens[pos].t === "word" ? matchWord(tokens, pos) : null;
    if (m && m.hit.type === "stitch") { stitch = m.hit.def.id; pos += m.len; }
    else if (m && m.hit.type === "mod") { /* 기호 없이 수식어만 */ }
    else if (tokens[pos].t === "num") { /* "2코 늘려뜨기" 형태 */ }
    else {
      errors.push(`모르는 단어: "${tokens[pos].v}"`);
      return { pos: pos + 1, items: repeat({ stitch: "sc", mod: null, n: 1, unknown: tokens[pos].v }, 1) };
    }
    // 2) "N코 늘려뜨기" / "2 늘려뜨기" / "늘려뜨기" 수식어
    let look = pos;
    let nk = null;
    if (tokens[look] && tokens[look].t === "num") {
      const after = matchWord(tokens, look + 1);
      if (tokens[look].ko || (after && after.hit.type === "mod")) { nk = tokens[look].v; look++; }
    }
    const mm = matchWord(tokens, look);
    if (mm && mm.hit.type === "mod") {
      mod = mm.hit.def.kind;
      n = nk || mm.hit.def.defaultN;
      pos = look + mm.len;
      if (!stitch) stitch = "sc";
    } else if (nk !== null) {
      // "짧은뜨기 10코" → 개수
      pos = look;
      return { pos, items: repeat({ stitch, mod: null, n: 1 }, nk) };
    }
    // 3) 개수
    let count = 1;
    if (tokens[pos] && tokens[pos].t === "num" && !tokens[pos].ko) {
      count = tokens[pos].v; pos++;
    }
    return { pos, items: repeat({ stitch, mod, n: n || 1 }, count) };
  }

  /* 첫 줄이 시작 지시인지 판단 */
  function parseStart(line, format) {
    const compact = line.replace(/\s+/g, "").toLowerCase().replace(/시작$/, "");
    const num = (line.match(/(\d+)/) || [])[1];
    for (const st of S.STARTS) {
      for (const a of st.aliases) {
        if (compact.startsWith(a) || compact.replace(/\d+/g, "") === a) {
          if (st.kind === "chainring" || (st.kind === "magic" && num && /사슬/.test(line)))
            return { kind: "chainring", n: parseInt(num || "6", 10) };
          if (st.kind === "magic") return { kind: "magic", n: 0 };
          if (st.kind === "chain") {
            // "사슬 10" 만 있고 원형이면 사슬링, 평면이면 기초사슬
            if (!num) return null;
            return format === "round" ? { kind: "chainring", n: parseInt(num, 10) } : { kind: "chain", n: parseInt(num, 10) };
          }
        }
      }
    }
    return null;
  }

  function parsePattern(text, format) {
    const errors = [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#") && !l.startsWith("//"));
    let start = null;
    const rows = [];
    let firstRowLine = 0;
    if (lines.length) {
      const st = parseStart(lines[0], format);
      if (st) { start = st; firstRowLine = 1; }
    }
    if (!start) start = format === "round" ? { kind: "magic", n: 0 } : { kind: "chain", n: null };

    let prevProduced = start.kind === "magic" ? null : start.n;
    lines.slice(firstRowLine).forEach((raw, i) => {
      const lineErrors = [];
      let line = raw.replace(/^\s*(\d+)\s*단\s*[:.)]?\s*/, "");
      line = normalize(line);
      const tokens = tokenize(line);
      const { items } = parseSequence(tokens, 0, lineErrors);
      // 단 첫머리의 사슬은 기둥코(돌림사슬)로 보고 코 수에 넣지 않음
      for (const it of items) { if (it.stitch !== "ch" || it.mod) break; it.produces = 0; it.turning = true; }
      const produced = items.reduce((a, e) => a + e.produces, 0);
      const consumed = items.reduce((a, e) => a + e.consumes, 0);
      const warnings = [...lineErrors];
      if (prevProduced !== null && consumed !== prevProduced && consumed > 0) {
        warnings.push(`전 단 ${prevProduced}코인데 ${consumed}코를 사용해요`);
      }
      rows.push({ index: i + 1, raw, elements: items, produced, consumed, warnings });
      prevProduced = produced;
    });

    // 평면이고 기초사슬 수가 없으면 1단 사용 코수로 정함
    if (start.kind === "chain" && start.n === null) start.n = rows[0] ? rows[0].consumed : 0;
    return { start, rows, errors, startFromText: firstRowLine === 1 };
  }

  window.CROCHET_PARSER = { parsePattern };
})();
