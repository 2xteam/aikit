/** 전화번호를 숫자만 남기도록 정규화합니다. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}
