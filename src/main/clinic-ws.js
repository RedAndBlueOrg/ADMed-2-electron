'use strict';

const { BrowserWindow } = require('electron');
const { Client: StompClient } = require('@stomp/stompjs');
const WsImpl = require('ws');
const state = require('./state');

function sendClinicWsEvent(payload) {
  const wins = BrowserWindow.getAllWindows();
  for (const win of wins) {
    if (!win.isDestroyed()) {
      win.webContents.send('clinic:ws:event', payload);
    }
  }
}

function stopClinicSocket() {
  if (state.stompClient) {
    try { state.stompClient.deactivate(); } catch (_) { /* noop */ }
    state.stompClient = null;
  }
}

function startClinicSocket(config) {
  const memberSeq = config?.memberSeq;
  const origin = config?.clinicWsOrigin;
  if (!memberSeq || !origin) {
    stopClinicSocket();
    return;
  }

  stopClinicSocket();
  state.clinicWsConfig = {
    memberSeq,
    clinicSeqList: config.clinicSeqList || [],
    clinicWsOrigin: origin,
  };

  const brokerURL = origin.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws/websocket';

  state.stompClient = new StompClient({
    brokerURL,
    webSocketFactory: () => new WsImpl(brokerURL),
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
    reconnectDelay: 3000,
    debug: () => {},

    onConnect: () => {
      console.log('[clinic] STOMP connected, subscribing to /topic/clinic/' + memberSeq);
      sendClinicWsEvent({ type: 'status', status: 'open', clinicSeq: null });

      state.stompClient.subscribe(`/topic/clinic/${memberSeq}`, (message) => {
        try {
          const parsed = JSON.parse(message.body);
          sendClinicWsEvent({ type: 'data', data: parsed, raw: message.body, clinicSeq: null });
        } catch (err) {
          console.warn('[clinic] STOMP message parse failed:', err.message);
        }
      });
    },

    onStompError: (frame) => {
      console.warn('[clinic] STOMP error:', frame.headers?.message);
      sendClinicWsEvent({
        type: 'status',
        status: 'error',
        error: frame.headers?.message,
        clinicSeq: null,
      });
    },

    onWebSocketClose: () => {
      sendClinicWsEvent({ type: 'status', status: 'closed', clinicSeq: null });
    },
  });

  state.stompClient.activate();
}

module.exports = {
  startClinicSocket,
  stopClinicSocket,
};
