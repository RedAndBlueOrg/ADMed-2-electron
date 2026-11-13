export function normalizePct(value, min, max) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 100;
}

export function noticeDurationSec(barWidth, textWidth, speedPct) {
  // 짧은 공지의 기존 최소 시간도 배율 적용 전에 계산한다.
  return Math.max(8, (barWidth + textWidth) / 140) * (100 / normalizePct(speedPct, 50, 200));
}

export function fontScaleValue(fontPct) {
  const pct = normalizePct(fontPct, 50, 150);
  return pct === 100 ? null : String(pct / 100);
}
