export function validNickname(value: string) {
  return value.trim().length >= 1 && value.trim().length <= 32;
}
export function validRoomCode(value: string) {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(
    value.trim().toUpperCase(),
  );
}
