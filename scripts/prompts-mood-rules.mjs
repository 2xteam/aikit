/**
 * 분위기 1차 배정 규칙 — **기계가 하는 몫**.
 *
 * 볼트는 이 자리를 "모델에 넣어 12개 중 하나를 고르게 한다"로 설계했다.
 * 27,549건을 전부 모델에 태우면 비용이 크므로 **순서를 뒤집었다** —
 *
 * ```
 * ① 규칙으로 1차 배정        ← 이 파일. 공짜다
 * ② 못 정한 것은 버린다       ← 후보를 줄이는 것이 목적이지 다 살리는 게 아니다
 * ③ 남은 수백 건만 사람이 본다 ← 검수 화면. 여기서 고친다
 * ```
 *
 * 모델 분류는 규칙이 못 잡은 것 중 **아까운 것**이 많다고 확인될 때 넣는다.
 * 지금은 27,549건에서 수백 건만 있으면 되므로 규칙으로 충분하다.
 *
 * ⚠️ **자동 배정을 그대로 서비스에 내보내지 않는다.** `mood` 는 사용자가 직접
 * 고르는 축이라 정확도가 곧 제품 품질이다. ⑦ 검수를 건너뛰지 않는다.
 *
 * 어휘 원본은 `lib/prompts/vocab.ts` 다. ⚠️ **두 곳이 갈리면 추천이 조용히 빈다** —
 * 아래 MOOD_IDS 를 고치면 vocab.ts 도 함께 고친다.
 * (스크립트는 .mjs 라 TS 를 import 할 수 없어 목록이 두 벌이다. 순서까지 같게 둔다.)
 *
 * → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ③
 */

export const MOOD_IDS = [
  "cinematic",
  "editorial",
  "film",
  "vintage",
  "neon_night",
  "soft_daylight",
  "monochrome",
  "dreamy",
  "bold_graphic",
  "minimal",
  "illustration",
  "retro_print",
];

/**
 * 규칙 — **위에서부터 먼저 맞는 것**을 쓴다. 순서가 곧 우선순위다.
 *
 * 좁고 분명한 것을 위에 둔다. `cinematic` 같은 넓은 말을 위에 두면 다른
 * 분위기가 전부 그리로 빨려 든다(태그 상위 3위가 cinematic 2,167건이다).
 */
const RULES = [
  { mood: "monochrome", any: ["black and white", "monochrome", "b&w", "grayscale", "noir"] },
  { mood: "neon_night", any: ["neon", "cyberpunk", "nightlife", "night portrait", "night city", "blade runner"] },
  { mood: "illustration", any: ["illustration", "anime", "cartoon", "watercolor", "digital painting", "character design", "sketch", "comic"] },
  { mood: "retro_print", any: ["risograph", "halftone", "screen print", "lithograph", "poster print", "zine"] },
  { mood: "vintage", any: ["vintage", "retro", "1970s", "1980s", "1990s", "old photo", "nostalgic", "polaroid"] },
  { mood: "film", any: ["film photography", "35mm", "film grain", "analog", "kodak", "portra", "disposable camera", "film camera"] },
  { mood: "dreamy", any: ["dreamy", "surreal", "surrealism", "ethereal", "fantasy", "bokeh", "hazy", "dream"] },
  { mood: "bold_graphic", any: ["poster", "typography", "graphic design", "bold colors", "pop art", "collage"] },
  { mood: "minimal", any: ["minimalist", "minimal", "clean background", "negative space", "simple background", "studio portrait"] },
  { mood: "soft_daylight", any: ["natural light", "golden hour", "golden-hour", "soft light", "daylight", "sunlight", "pastel", "window light", "sunset"] },
  { mood: "editorial", any: ["editorial", "fashion editorial", "magazine", "vogue", "high fashion", "haute couture", "lookbook", "fashion photography"] },
  { mood: "cinematic", any: ["cinematic", "movie still", "film still", "anamorphic", "cinematic lighting", "cinematic portrait"] },
];

/**
 * 태그를 먼저 보고, 없으면 본문을 본다. **어느 쪽이 맞혔는지 함께 돌려준다.**
 *
 * ⚠️ 2026-09-18 실측 — 본문 매칭이 **너무 넓게 먹는다.** 본문 fallback 만으로
 * `film` 이 7,265건이 됐다. "35mm" · "film grain" 같은 말이 분위기와 무관한
 * 프롬프트의 카메라 묘사에도 흔히 들어 있기 때문이다.
 *
 * 그래서 버리지 않고 **확신도로 나눈다** — 태그가 맞힌 것을 위로 올리고,
 * 본문이 맞힌 것은 분위기가 모자랄 때만 채운다. 판단은 ⑦ 사람이 한다.
 *
 * @returns {{mood: string, via: "tag"|"body"}|null}
 */
export function pickMood(tags, haystack) {
  const tagText = ` ${(tags || []).join(" | ")} `;

  for (const rule of RULES) {
    if (rule.any.some((w) => tagText.includes(w))) return { mood: rule.mood, via: "tag" };
  }
  /*
    태그로 못 정했으면 본문에서 **좁은 규칙만** 다시 본다.
    cinematic·editorial 은 제외한다 — 그 두 말은 거의 모든 프롬프트 본문에
    지나가듯 들어 있어서, 넣으면 나머지 분위기가 전부 그리로 빨려 든다.
  */
  for (const rule of RULES) {
    if (rule.mood === "cinematic" || rule.mood === "editorial") continue;
    if (rule.any.some((w) => (haystack || "").includes(w))) return { mood: rule.mood, via: "body" };
  }
  return null;
}
