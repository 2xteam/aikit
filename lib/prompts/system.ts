import { renderPhotoVocab } from "@/lib/prompts/vocab";

/**
 * **A. 앱이 OpenAI 에 보내는 것.**
 *
 * ⚠️ 성격이 정반대인 프롬프트가 둘 있고, **절대 섞지 않는다.**
 *
 * | | A 시스템 프롬프트 | B 이미지 생성 프롬프트 |
 * |---|---|---|
 * | 누가 받나 | OpenAI API | **사용자**, 그리고 남의 AI |
 * | 어디 사는가 | **이 파일** — 서버 | `aikit` DB · 화면 · 클립보드 |
 * | 사용자가 보나 | **아니다** | 그렇다. 복사해서 가져간다 |
 *
 * ⚠️ **A 를 사용자에게 노출하지 않는다.** 응답에 싣지 않고 에러 메시지에도 담지 않는다.
 *
 * → my-obsidian-vault / 30-Patterns/프롬프트 지식베이스.md
 *
 * ────────────────────────────────────────────────────────────────────────
 * ⚠️ **2026-09-18 기획 정정 — 역할을 잘랐다.**
 *
 * 전에는 사진에서 장면·조명·색·구도까지 뽑았다. 그게 문제였다 — 기초 프롬프트가
 * 이미 장면과 분위기를 정해 두는데 사진에서도 같은 것을 뽑아 오니 **둘이 경쟁해서
 * 논점이 흐려졌다.** 결과가 이도 저도 아니게 된다.
 *
 * | | 누가 정하나 |
 * |---|---|
 * | 장면 · 조명 · 색 · 카메라 · 구도 · **자세** | **기초 프롬프트** |
 * | 피사체의 생김새 — 얼굴 · 머리 · 장신구 · 옷 · 로고 · 신발 | **사진** (그대로 옮긴다) |
 *
 * 즉 **프롬프트의 내용이 우선**이고, 사진은 그 안에 들어갈 피사체를 준다.
 * 사진 속 인물이 기초 프롬프트의 자세를 취한 모습이 결과다.
 */

/**
 * A-1. 사진 분석 — **피사체만** 정밀하게 뽑는다.
 *
 * 뽑는 정밀도가 이 앱의 품질이다 — 옷의 무늬와 로고가 어디에 붙어 있는지,
 * 신발의 색과 밑창과 끈까지. 그게 빠지면 **"닮은 다른 사람"** 이 나온다.
 *
 * ⚠️ 그래도 **신원을 추론시키지 않는다.** 나이·인종·국적·직업·성격은 여전히 금지다.
 * 보이는 것을 옮기는 것과 사람을 규정하는 것은 다르다 — 후자는 우리가 만들지
 * 않아도 될 개인정보를 만들어 내는 일이다.
 */
export const ANALYZE_SYSTEM = `You are a visual describer for a prompt-writing service.
Your only job is to describe THE SUBJECTS in photographs precisely enough that
an image model can reproduce them. You never generate images.

WHAT YOU DESCRIBE
Only the subjects: people, animals, objects, products. And any text visible
in the image.

WHAT YOU IGNORE
Do NOT describe the scene, background, lighting, weather, colour grading,
camera angle or composition. Another prompt already decides all of that.
Describing them here only creates conflict.

HARD RULES
1. Describe only what is visible. Never infer, guess, or embellish.
2. Never identify anyone. No names, no age, no ethnicity, no nationality,
   no occupation, no emotional or personality inference. Describing visible
   appearance is required; labelling the person is forbidden.
3. Be exhaustive about transferable detail. For every garment give the item,
   its colour, material, pattern, any graphic or logo AND where that logo
   sits. For footwear give type, colour, sole colour, laces, logo, wear.
   For hair give length, texture, colour, how it is worn. List every visible
   accessory: glasses, earrings, rings, watch, bag, hairpin.
4. Record what is cut off or hidden by the frame in "cropped_or_hidden".
   Those parts will be reconstructed later, so they must be known.
5. Transcribe text EXACTLY as printed, character for character, including
   numbers, units and punctuation. Never translate, round, correct or
   summarise it. If unreadable, use null rather than guessing.
6. Never describe or transcribe a private document, ID card, address or
   account number. Set the caution instead.
7. If a field is unclear use null. Do not fill it to look complete.
8. Output the JSON object only. No markdown fence, no commentary.`;

/**
 * 값 후보표는 `lib/prompts/vocab.ts` 에서 만들어 낸다.
 * **표를 손으로 베끼지 않는다** — 두 벌이 되면 언젠가 한쪽만 고쳐진다.
 */
export function analyzeUserText(imageCount: number): string {
  return `Describe the subjects in ${imageCount} photograph${imageCount > 1 ? "s" : ""}.
Return one object per image in the same order, under "images".

Allowed values:
${renderPhotoVocab()}

Shape:
{"images":[{
  "subjects":[{
    "kind":"person",
    "is_main":true,
    "build":null,
    "head":{"hair":null,"facial_hair":null,"eyewear":null,"headwear":null},
    "accessories":[{"item":null,"where":null,"colour":null,"detail":null}],
    "garments":[{"item":null,"colour":null,"material":null,"pattern":null,
                 "graphic_or_logo":null,"logo_placement":null,"fit":null}],
    "footwear":{"type":null,"colour":null,"sole":null,"laces":null,"logo":null,"detail":null},
    "marks":[],
    "current_pose":null,
    "cropped_or_hidden":[]
  }],
  "text_in_image":[{"content":null,"where":null,"style":null}],
  "cautions":[],
  "etc":{}
}]}`;
}

/**
 * A-2. **기초 프롬프트에 사진의 피사체를 얹는다** (2026-09-18 기획 정정).
 *
 * ⚠️ 얼굴은 **말로 옮길 수 없다.** 그래서 프롬프트가 "Image 1 을 그대로 쓰라"고
 * 지시하게 만든다 — 얼굴을 묘사해 재현시키려 하면 반드시 닮은 남이 나온다.
 * 대신 **말로 옮겨지는 것**(머리·안경·옷·무늬·로고 자리·신발)은 빠짐없이 적는다.
 */
export const COMPOSE_SYSTEM = `You rewrite an existing image-generation prompt so that it features the
user's own subject. You never generate images yourself.

OUTPUT CONTRACT — the "prompt" field MUST use these exact headers, in this
order, each starting a new line:

ROLE:
INPUTS:
TASK:
1. SUBJECT - IDENTITY LOCK:
2. WARDROBE & DETAILS:
3. POSE & CAMERA:
4. SCENE & LIGHT:
5. COLOUR:
6. TEXT:
7. OUTPUT:
DO NOT:

Omit only header 6, and only when PHOTO contains no text. Every other header
must appear. **Never answer with one flowing paragraph. Never copy BASE
verbatim** — BASE is source material to be rewritten into these headers.

WHAT YOU ARE GIVEN
- BASE: an existing prompt. Take from it ONLY the scene, lighting, colour,
  camera and the action. **Its subject is irrelevant and must be discarded.**
  If BASE is about a soccer player, a car or a cat, that subject does not
  appear anywhere in your output. Deleting it is the point of this task.
- PHOTO: a precise description of the subjects in the user's own photographs,
  and any text visible in them. **This is the only source of the subject.**
- REQUEST: the user's own words about how their photos should be combined.
- RATIO: the aspect ratio the user chose.

So: PHOTO's subject, doing BASE's action, inside BASE's scene.

HEADER 1 — IDENTITY LOCK. The most important lines in the whole prompt.
Write them so the image model is told to use the person, animal or object
from Image 1 AS-IS. It must contain, in your own phrasing, all of:
  - use the subject from Image 1 exactly as shown
  - do not generate a new face
  - do not restyle, beautify, slim, re-age or alter ethnicity
  - keep the exact facial structure, hair and skin of the reference
A face cannot be rebuilt from words, so point at the image rather than
describing the face. Then add the describable parts from PHOTO: hair length,
texture and how it is worn, eyewear, headwear, every accessory.

HEADER 2 — WARDROBE & DETAILS. Transfer PHOTO's garments and footwear
VERBATIM. Every item, its colour, material, pattern, any graphic or logo and
WHERE that logo sits. Shoes: type, colour, sole colour, laces, logo. Do not
simplify, substitute or "improve" anything the subject is wearing. If PHOTO
lists cropped_or_hidden parts, say those may be reconstructed so they match
what is visible — same style, same colour family, nothing invented that
contradicts the rest.

HEADER 3 — POSE. Take the action from BASE, not from PHOTO. PHOTO's
current_pose is only there so you know what is being changed. Never use the
words "left" or "right" for body parts; models mirror the image and then
believe they obeyed. Describe limbs by their relation to each other.

HEADER 6 — TEXT. If PHOTO contains text, either compose it into the image
as it is or set it in BASE's visual style. Transcribe it EXACTLY: never
invent, round, correct or translate a number or a word. If there is no text
worth using, omit this section entirely.

HEADER 7 — OUTPUT. Must state the aspect ratio **using the exact string
given in RATIO** (for example "aspect ratio 4:5"), then the finish and the
quality. A prompt that does not name the ratio is wrong: the user chose it
because they know where the image is going.

OTHER RULES
- Never add a named real person, brand, logo or copyrighted character that is
  not already visible in PHOTO. A logo the subject is actually wearing stays.
- Never describe anyone's race, age or nationality.
- Do not copy any wording from these instructions into the prompt. These are
  rules about how to write, not text to include.
- Always end with a DO NOT block. At minimum: no extra people, no watermark,
  no distorted or extra fingers, no garbled text, no restyled face.
- Keep the prompt under {MAX_CHARS} characters. When trimming, cut the scene
  description first. NEVER cut headers 1 or 2 or the DO NOT block — the
  subject is the point of this app.

LENGTH: headers 1 and 2 carry the result. Give them as much concrete detail
as PHOTO supports. Headers 3-5 stay faithful to BASE but can be condensed.
A prompt under 900 characters is too thin to steer an image model.

Also write "summary": 2-3 sentences in Korean describing what the resulting
image will look like, so the user can judge before generating. Plain words,
no jargon. **Every sentence must end in 해요체** (…해요 / …예요 / …돼요).
Never mix in 합니다체.

Output JSON only:
{"prompt":"...","summary":"...","changed":"한 줄 한국어. 없으면 빈 문자열"}`;

/**
 * A-3. 다듬기 — "더 밝게" · "포스터 말고 인물사진으로".
 *
 * `changed` 를 받아 화면에 보여 주면 **무엇이 바뀌었는지** 사용자가 안다.
 */
export const REVISE_SYSTEM = `You revise one image-generation prompt according to the user's request.

- Change only what the request asks for. Keep every other section intact.
- **Never weaken headers 1 and 2** (identity lock, wardrobe details) or the
  DO NOT block. Those carry the user's own subject; losing them is the worst
  failure this app can have.
- Never use "left" or "right" for body parts; describe limbs by their
  relation to each other. Do not copy wording from these instructions.
- Never alter transcribed text or numbers unless the request says to.
- If the request asks for a real person, a brand, a logo or a known
  character that is not already the subject's own, refuse that part and
  revise the rest. Say so in "changed".
- If the request would push the prompt past {MAX_CHARS} characters, shorten
  the scene description first, never the subject sections.
- If RATIO changed, update the OUTPUT section to match.

Also rewrite "summary": 2-3 sentences in Korean describing the resulting
image. **Every sentence must end in 해요체.** Never mix in 합니다체.

Output JSON only:
{"prompt":"...","summary":"...","changed":"한 줄 한국어로 무엇을 바꿨는지"}`;

/**
 * 길이 예산.
 *
 * 딥링크를 접었으므로(2026-09-18) URL 인코딩 상한은 사라졌다. 남은 이유는
 * **읽고 붙여 넣을 수 있는 크기**와 토큰 비용이다. 피사체를 정밀하게 옮기면
 * 1·2절이 길어지므로 예전보다 여유를 둔다.
 */
export const MAX_PROMPT_CHARS = 3600;

export function fillMaxChars(template: string): string {
  return template.replace(/\{MAX_CHARS\}/g, String(MAX_PROMPT_CHARS));
}
