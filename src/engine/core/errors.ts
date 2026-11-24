/** Lỗi có kiểu của command bus. `code` cũng là hậu tố khóa i18n `commandError.<code>`. */
export type CommandErrorCode =
  | 'invalid-command'
  | 'unknown-dragon'
  | 'dragon-unavailable'
  | 'zone-locked'
  | 'habitat-locked'
  | 'food-too-fast'
  | 'food-limit'
  | 'unknown-food'
  | 'food-expired'
  | 'wrong-diet'
  | 'wrong-place'
  | 'feed-cooldown'
  | 'pet-cooldown'
  | 'name-empty'
  | 'name-too-long'
  | 'name-invalid-chars';

export interface CommandError {
  code: CommandErrorCode;
  /** Khóa i18n để UI hiển thị. */
  messageKey: `commandError.${CommandErrorCode}`;
  detail?: string;
}

export function commandError(code: CommandErrorCode, detail?: string): CommandError {
  return detail === undefined
    ? { code, messageKey: `commandError.${code}` }
    : { code, messageKey: `commandError.${code}`, detail };
}
