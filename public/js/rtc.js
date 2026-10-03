const isDescription = (d) =>
  d && (d.type === 'offer' || d.type === 'answer') && typeof d.sdp === 'string';

/**
 * Connessione WebRTC con un solo DataChannel.
 * Il signaling (sig) trasporta solo SDP e candidati ICE.
 */
export function createPeer({ sig, initiator, iceServers = [], onChannel, onState }) {
  const pc = new RTCPeerConnection({ iceServers });
  const pending = [];
  let channel = null;
  let closed = false;

  const signal = (data) => sig.send({ type: 'signal', data });

  pc.onicecandidate = (event) => {
    if (event.candidate) signal({ candidate: event.candidate });
  };
  pc.onconnectionstatechange = () => onState?.(pc.connectionState);

  const useChannel = (ch) => {
    ch.binaryType = 'arraybuffer';
    channel = ch;
    onChannel(ch);
  };
  if (initiator) useChannel(pc.createDataChannel('file', { ordered: true }));
  else pc.ondatachannel = (event) => useChannel(event.channel);

  async function handleSignal(data) {
    if (closed || !data || typeof data !== 'object') return;
    try {
      if (isDescription(data.description)) {
        await pc.setRemoteDescription(data.description);
        for (const candidate of pending.splice(0)) await pc.addIceCandidate(candidate);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          signal({ description: pc.localDescription });
        }
      } else if (data.candidate && typeof data.candidate === 'object') {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else pending.push(data.candidate);
      }
    } catch (err) {
      console.error('[cable] signal', err);
      onState?.('failed');
    }
  }

  async function start() {
    if (!initiator) return;
    await pc.setLocalDescription();
    signal({ description: pc.localDescription });
  }

  function close() {
    if (closed) return;
    closed = true;
    try {
      channel?.close();
    } catch {
      /* già chiuso */
    }
    pc.close();
  }

  return { start, handleSignal, close };
}
