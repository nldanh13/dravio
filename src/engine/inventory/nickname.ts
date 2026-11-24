import { NICKNAME_MAX_GRAPHEMES } from '../../data/care';
import type { CommandErrorCode } from '../core/errors';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Ký tự điều khiển (Cc), ký tự định hướng/ghi đè (bidi) và ký tự thay thế không hợp lệ. */
const FORBIDDEN = /[\p{Cc}‪-‮⁦-⁩‎‏�]/u;

export function graphemeCount(s: string): number {
  return Array.from(segmenter.segment(s)).length;
}

/**
 * Chuẩn hóa và kiểm tên rồng: NFC, trim, 1–24 grapheme, không ký tự điều khiển.
 * Tên được lưu nguyên văn dạng text; UI hiển thị qua React (tự escape), không chèn HTML.
 */
export function normalizeNickname(raw: string): { ok: true; value: string } | { ok: false; code: CommandErrorCode } {
  const value = raw.normalize('NFC').trim();
  if (FORBIDDEN.test(value)) return { ok: false, code: 'name-invalid-chars' };
  const n = graphemeCount(value);
  if (n === 0) return { ok: false, code: 'name-empty' };
  if (n > NICKNAME_MAX_GRAPHEMES) return { ok: false, code: 'name-too-long' };
  return { ok: true, value };
}
