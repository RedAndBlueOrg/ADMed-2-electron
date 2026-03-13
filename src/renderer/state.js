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
