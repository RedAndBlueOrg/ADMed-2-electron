/** Shared mutable state — imported by every renderer module. */
const state = {
  playlist: [],
  currentIndex: 0,
  waitingInfo: null,
  noticeList: [],
  noticeIndex: 0,
  overlayLocked: true,
  errorState: false,
  playlistLoading: false,
  recovering: false,
  videoMutedByAlert: false,
  // 한 번이라도 정상 재생했는가 — no-playable 시 직전 프레임 유지 여부 판단용
  hasEverPlayed: false,
  // 코너 도넛 스피너 표시 조건 (둘 중 하나라도 true 면 표시)
  downloadActive: false,
  fetchingContent: false,

  // Clinic config (shared with notice.js loadNotices)
  clinicMemberSeq: null,
  clinicDeviceSerial: '',
  clinicApiOrigin: '',
  clinicWsOrigin: '',
  clinicEnabled: false,

  // Callback slots (break circular deps)
  onPlayNext: null,
};

export default state;
