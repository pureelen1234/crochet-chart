/* =====================================================================
   기호 사전 (symbols.js)
   ---------------------------------------------------------------------
   여기에 줄을 추가하면 도안 입력 문법과 범례에 자동으로 반영됩니다.

   id        : 내부 식별자 (영문, 겹치지 않게)
   name      : 범례에 보이는 이름
   aliases   : 도안 입력에서 인식할 이름들 (한글/영문, 띄어쓰기 없이)
   consumes  : 전 단에서 사용하는 코 수 (사슬·피코처럼 전 단과 무관하면 0)
   produces  : 이 기호가 만드는 코 수
   h         : 기호 세로 반높이 (늘림/줄임 부채꼴 회전 중심 계산용)
   draw(ext) : SVG 조각. 좌표 원점(0,0)이 기호 중심, 위쪽이 -y.
               ext = 기둥을 아래로 더 늘일 길이 (부채꼴로 벌어질 때 배치에서 넘겨줌, 무시해도 됨)
               선은 stroke="currentColor"로 그려지므로 fill/stroke는
               특별한 경우가 아니면 지정하지 않습니다.
   ===================================================================== */

const STITCHES = [
  {
    id: "standing", name: "기둥사슬", aliases: ["기둥사슬", "기둥코", "기둥", "돌림사슬", "시작사슬"],
    consumes: 0, produces: 0, h: 4, pseudo: true,   // 단 시작 사슬. 개수는 layout에서 세로로 쌓아 그림
    draw: () => `<ellipse rx="3.2" ry="6"/>`
  },
  {
    id: "ch", name: "사슬뜨기", aliases: ["사슬", "사슬뜨기", "ch", "체인"],
    consumes: 0, produces: 1, h: 4,
    draw: () => `<ellipse rx="6" ry="3.2"/>`
  },
  {
    id: "sl", name: "빼뜨기", aliases: ["빼뜨기", "빼기", "sl", "slst", "빼"],
    consumes: 1, produces: 1, h: 3,
    draw: () => `<circle r="2.6" fill="currentColor" stroke="none"/>`
  },
  {
    id: "sc", name: "짧은뜨기", aliases: ["짧은뜨기", "짧은", "sc"],
    consumes: 1, produces: 1, h: 5,
    draw: () => `<path d="M-5 -5 L5 5 M-5 5 L5 -5"/>`
  },
  {
    id: "hdc", name: "긴뜨기", aliases: ["긴뜨기", "긴", "hdc"],
    consumes: 1, produces: 1, h: 9,
    draw: (ext = 0) => `<path d="M0 ${9 + ext} L0 -9 M-6 -9 L6 -9"/>`
  },
  {
    id: "dc", name: "한길긴뜨기", aliases: ["한길긴뜨기", "한길", "한길긴", "dc"],
    consumes: 1, produces: 1, h: 10,
    draw: (ext = 0) => `<path d="M0 ${10 + ext} L0 -10 M-6 -10 L6 -10 M-4 -1 L4 -5"/>`
  },
  {
    id: "tr", name: "두길긴뜨기", aliases: ["두길긴뜨기", "두길", "두길긴", "tr"],
    consumes: 1, produces: 1, h: 12,
    draw: (ext = 0) => `<path d="M0 ${12 + ext} L0 -12 M-6 -12 L6 -12 M-4 -2 L4 -6 M-4 3 L4 -1"/>`
  },
  {
    id: "dtr", name: "세길긴뜨기", aliases: ["세길긴뜨기", "세길", "세길긴", "dtr"],
    consumes: 1, produces: 1, h: 14,
    draw: (ext = 0) => `<path d="M0 ${14 + ext} L0 -14 M-6 -14 L6 -14 M-4 -4 L4 -8 M-4 1 L4 -3 M-4 6 L4 2"/>`
  },
  {
    id: "blo", name: "이랑뜨기(뒤반코)", aliases: ["이랑뜨기", "이랑", "뒤반코", "blo"],
    consumes: 1, produces: 1, h: 6,
    draw: () => `<path d="M-5 -6 L5 4 M-5 4 L5 -6 M-5 8 A5 2.5 0 0 0 5 8"/>`
  },
  {
    id: "flo", name: "앞반코 짧은뜨기", aliases: ["앞반코", "앞이랑", "flo"],
    consumes: 1, produces: 1, h: 6,
    draw: () => `<path d="M-5 -4 L5 6 M-5 6 L5 -4 M-5 -8 A5 2.5 0 0 1 5 -8"/>`
  },
  {
    id: "picot", name: "피코", aliases: ["피코", "피코뜨기", "picot"],
    consumes: 0, produces: 0, h: 6,
    draw: () => `<path d="M0 6 L0 1 M-4 -2 A4 4 0 1 1 4 -2 L0 1 Z"/>`
  },
  {
    id: "fpdc", name: "앞걸어 한길긴뜨기", aliases: ["앞걸어뜨기", "앞걸어", "앞걸어한길긴뜨기", "fpdc"],
    consumes: 1, produces: 1, h: 10,
    draw: (ext = 0) => `<path d="M0 ${6 + ext} L0 -10 M-6 -10 L6 -10 M-4 -1 L4 -5 M-4 ${6 + ext} Q0 ${12 + ext} 4 ${6 + ext}"/>`
  },
  {
    id: "bpdc", name: "뒤걸어 한길긴뜨기", aliases: ["뒤걸어뜨기", "뒤걸어", "뒤걸어한길긴뜨기", "bpdc"],
    consumes: 1, produces: 1, h: 10,
    draw: (ext = 0) => `<path d="M0 ${6 + ext} L0 -10 M-6 -10 L6 -10 M-4 -1 L4 -5 M-4 ${10 + ext} Q0 ${4 + ext} 4 ${10 + ext}"/>`
  }
];

/* 늘림/줄임 수식어. 앞에 기본 기호가 없으면 짧은뜨기로 간주합니다. */
const MODIFIERS = [
  { kind: "inc", aliases: ["늘려뜨기", "늘림", "늘리기", "늘려", "inc", "증가"], defaultN: 2 },
  { kind: "dec", aliases: ["모아뜨기", "줄임뜨기", "줄임", "줄이기", "모아", "dec", "감소"], defaultN: 2 }
];

/* 시작 방법 (첫 줄) — 매직링은 원 하나(○), 사슬 원형은 사슬 N개를 원으로 */
const STARTS = [
  { kind: "magic", aliases: ["매직링", "매직", "원형시작", "원형", "magicring", "mr"] },
  { kind: "chainring", aliases: ["사슬원형시작", "사슬원형", "사슬링", "원형사슬", "사슬로원형"] },
  { kind: "chain", aliases: ["기초사슬", "시작사슬", "사슬시작", "사슬", "foundation", "fch"] }
];

const STITCH_BY_ID = Object.fromEntries(STITCHES.map(s => [s.id, s]));

/* 별칭 → 정의. 긴 별칭부터 매칭하도록 정렬 */
const ALIAS_INDEX = (() => {
  const list = [];
  STITCHES.forEach(s => s.aliases.forEach(a => list.push({ alias: a.toLowerCase(), type: "stitch", def: s })));
  MODIFIERS.forEach(m => m.aliases.forEach(a => list.push({ alias: a.toLowerCase(), type: "mod", def: m })));
  list.sort((a, b) => b.alias.length - a.alias.length);
  return list;
})();

/* 늘림/줄임 부채꼴 그리기: k개의 기호를 아래(늘림) 또는 위(줄임) 한 점에서 벌립니다 */
function drawFan(def, kind, k) {
  const spread = Math.min(26, 60 / Math.max(1, k - 1));
  let out = "";
  for (let j = 0; j < k; j++) {
    const a = (j - (k - 1) / 2) * spread;
    const pivot = kind === "inc" ? def.h : -def.h;
    out += `<g transform="translate(0 ${pivot}) rotate(${a}) translate(0 ${-pivot})">${def.draw()}</g>`;
  }
  return out;
}

/* ---- 묶음 기호 (layout이 만든 요소 종류별) ---- */
const CH_LEN = 12.5;   // 사슬 동그라미 하나의 길이(이어 붙일 때 간격)

/* 사슬 N개를 끝과 끝이 붙게 한 줄로. corner=true면 모서리처럼 가운데가 바깥쪽으로 꺾임 */
function drawChain(n, corner) {
  let out = "";
  for (let k = 0; k < n; k++) {
    const x = (k - (n - 1) / 2) * CH_LEN;
    if (corner && n >= 2) {
      const side = k < n / 2 ? -1 : 1;           // 왼쪽 절반 / 오른쪽 절반
      const bend = 32 * side;                    // 바깥쪽(-y)으로 모이는 ^ 모양
      out += `<g transform="translate(${x.toFixed(1)} 1.5) rotate(${bend})"><ellipse rx="6" ry="3.2"/></g>`;
    } else {
      out += `<ellipse cx="${x.toFixed(1)}" rx="6" ry="3.2"/>`;
    }
  }
  return out;
}

/* 기둥사슬: 동그라미 N개를 세로(바깥쪽 방향)로 쌓음 */
function drawStanding(n) {
  let out = "";
  for (let k = 0; k < n; k++) {
    const y = ((n - 1) / 2 - k) * 7;            // 아래(안쪽)부터 위(바깥쪽)로
    out += `<ellipse cy="${y.toFixed(1)}" rx="3.2" ry="4"/>`;
  }
  return out;
}

/* 단 끝 빼뜨기(이음): 점 하나 */
function drawJoin() { return `<circle r="2.4" fill="currentColor" stroke="none"/>`; }

/* 매직링: 원 하나 */
function drawMagicRing() { return `<circle r="7"/>`; }

/* 하나의 코 요소(element)를 SVG 문자열로 */
function drawElement(el) {
  if (el.kind === "chain") return drawChain(el.n, !!el.corner);
  if (el.kind === "standing") return drawStanding(el.n);
  if (el.kind === "join") return drawJoin();
  const def = STITCH_BY_ID[el.stitch] || STITCH_BY_ID.sc;
  if (el.mod === "inc" || el.mod === "dec") return drawFan(def, el.mod, el.n);
  return def.draw(el.ext || 0);
}

window.CROCHET_SYMBOLS = { STITCHES, MODIFIERS, STARTS, STITCH_BY_ID, ALIAS_INDEX, drawElement, drawChain, drawStanding, drawJoin, drawMagicRing, CH_LEN };
