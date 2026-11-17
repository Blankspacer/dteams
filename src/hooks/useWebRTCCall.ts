import { useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 6,
};

type SignalType = 'ready' | 'offer' | 'answer' | 'ice' | 'leave';

interface SignalDoc {
  meetingId: string;
  fromUid: string;
  toUid: string;
  type: SignalType;
  payload: string;
}

export function useWebRTCCall(params: {
  meetingId: string | null;
  myUid: string | null;
  participantIds: string[];
  localStream: MediaStream | null;
}) {
  const { meetingId, myUid, participantIds, localStream } = params;
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  const settingRemoteAnswerRef = useRef<Map<string, boolean>>(new Map());
  const connectedPeersRef = useRef<Set<string>>(new Set());
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const sessionStartRef = useRef<number>(Date.now());

  const syncLocalTracksToPeer = async (
    pc: RTCPeerConnection,
    stream: MediaStream | null
  ): Promise<boolean> => {
    const transceivers = pc.getTransceivers();

    if (!stream) {
      // Ensure bidirectional transceivers exist before offer/answer so media flows immediately once mic/cam loads
      const hasAudio = transceivers.some((t) => t.receiver.track?.kind === 'audio');
      const hasVideo = transceivers.some((t) => t.receiver.track?.kind === 'video');
      if (!hasAudio) {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }
      if (!hasVideo) {
        pc.addTransceiver('video', { direction: 'sendrecv' });
      }
      return false;
    }

    let needsRenegotiation = false;

    for (const kind of ['audio', 'video'] as const) {
      const localTrack = stream.getTracks().find((t) => t.kind === kind) || null;
      const existingTransceiver = transceivers.find(
        (t) =>
          t.sender.track?.kind === kind ||
          t.receiver.track?.kind === kind
      );

      if (existingTransceiver) {
        if (localTrack) {
          if (existingTransceiver.direction !== 'sendrecv') {
            existingTransceiver.direction = 'sendrecv';
            needsRenegotiation = true;
          }
          if (existingTransceiver.sender.track !== localTrack) {
            try {
              await existingTransceiver.sender.replaceTrack(localTrack);
            } catch {
              pc.addTrack(localTrack, stream);
              needsRenegotiation = true;
            }
          }
        }
      } else if (localTrack) {
        pc.addTrack(localTrack, stream);
        needsRenegotiation = true;
      } else {
        pc.addTransceiver(kind, { direction: 'sendrecv' });
        needsRenegotiation = true;
      }
    }

    return needsRenegotiation;
  };

  // Attach or replace tracks whenever localStream arrives or upgrades (e.g. voice -> video)
  useEffect(() => {
    localStreamRef.current = localStream;
    if (!localStream || !meetingId || !myUid) return;

    peersRef.current.forEach(async (pc, peerUid) => {
      if (pc.connectionState === 'closed') return;
      const changed = await syncLocalTracksToPeer(pc, localStream);
      if (changed && pc.signalingState === 'stable' && pc.remoteDescription) {
        try {
          makingOfferRef.current.set(peerUid, true);
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
          const sigId = `${myUid.slice(0, 12)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await setDoc(doc(db, 'meetings', meetingId, 'signals', sigId), {
            meetingId,
            fromUid: myUid,
            toUid: peerUid,
            type: 'offer',
            payload: JSON.stringify({
              sdp: pc.localDescription?.sdp || offer.sdp,
              type: pc.localDescription?.type || offer.type,
            }).slice(0, 15000),
            createdAt: serverTimestamp(),
          });
        } catch {
          // Ignore transient renegotiation race
        } finally {
          makingOfferRef.current.set(peerUid, false);
        }
      }
    });
  }, [localStream, meetingId, myUid]);

  useEffect(() => {
    if (!meetingId || !myUid) {
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      pendingIceRef.current.clear();
      processedSignalsRef.current.clear();
      makingOfferRef.current.clear();
      ignoreOfferRef.current.clear();
      settingRemoteAnswerRef.current.clear();
      connectedPeersRef.current.clear();
      setRemoteStreams({});
      return;
    }

    sessionStartRef.current = Date.now() - 120000;

    async function sendSignal(toUid: string, type: SignalType, payloadObj: unknown) {
      if (!meetingId || !myUid || toUid === myUid) return;
      const sigId = `${myUid.slice(0, 12)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = JSON.stringify(payloadObj ?? {}).slice(0, 15000);
      try {
        await setDoc(doc(db, 'meetings', meetingId, 'signals', sigId), {
          meetingId,
          fromUid: myUid,
          toUid,
          type,
          payload,
          createdAt: serverTimestamp(),
        });
      } catch {
        // Ignore transient signaling error
      }
    }

    function updatePeerStream(peerUid: string, inboundStream?: MediaStream, track?: MediaStreamTrack) {
      setRemoteStreams((prev) => {
        if (inboundStream) {
          // Create a fresh MediaStream clone when a new track arrives so React effects always re-sync audio/video
          const merged = new MediaStream(inboundStream.getTracks());
          if (track && !merged.getTracks().some((t) => t.id === track.id)) {
            merged.addTrack(track);
          }
          return { ...prev, [peerUid]: merged };
        }
        const current = prev[peerUid];
        const nextTracks = current ? [...current.getTracks()] : [];
        if (track && !nextTracks.some((t) => t.id === track.id)) {
          nextTracks.push(track);
        }
        return { ...prev, [peerUid]: new MediaStream(nextTracks) };
      });
    }

    function getOrCreatePeer(peerUid: string, resetIfClosed = true): RTCPeerConnection {
      const existing = peersRef.current.get(peerUid);
      if (existing && (!resetIfClosed || (existing.connectionState !== 'closed' && existing.connectionState !== 'failed'))) {
        return existing;
      }
      if (existing) {
        try {
          existing.close();
        } catch {
          // Ignore
        }
        peersRef.current.delete(peerUid);
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);

      // Attach existing local tracks or reserve bidirectional sendrecv transceivers for audio + video
      syncLocalTracksToPeer(pc, localStreamRef.current).catch(() => {});

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(peerUid, 'ice', event.candidate.toJSON());
        }
      };

      pc.ontrack = (event) => {
        connectedPeersRef.current.add(peerUid);
        const [inboundStream] = event.streams;
        updatePeerStream(peerUid, inboundStream, event.track);
      };

      pc.onnegotiationneeded = async () => {
        if (makingOfferRef.current.get(peerUid)) return;
        if (pc.signalingState !== 'stable') return;
        // Before initial remote description, let deterministic offerer initiate
        if (!pc.remoteDescription && !(myUid! < peerUid)) return;
        try {
          makingOfferRef.current.set(peerUid, true);
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
          await sendSignal(peerUid, 'offer', {
            sdp: pc.localDescription?.sdp || offer.sdp,
            type: pc.localDescription?.type || offer.type,
          });
        } catch {
          // Ignore transient negotiation race
        } finally {
          makingOfferRef.current.set(peerUid, false);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          connectedPeersRef.current.add(peerUid);
        } else if (pc.connectionState === 'failed') {
          connectedPeersRef.current.delete(peerUid);
          try {
            pc.restartIce();
          } catch {
            // Ignore
          }
        } else if (pc.connectionState === 'closed') {
          connectedPeersRef.current.delete(peerUid);
          setRemoteStreams((prev) => {
            const copy = { ...prev };
            delete copy[peerUid];
            return copy;
          });
        }
      };

      peersRef.current.set(peerUid, pc);
      return pc;
    }

    async function initiateOffer(peerUid: string, force = false) {
      const pc = getOrCreatePeer(peerUid);
      if (makingOfferRef.current.get(peerUid)) return;
      if (!force && pc.signalingState !== 'stable') return;
      if (force && pc.signalingState !== 'stable') return;
      try {
        makingOfferRef.current.set(peerUid, true);
        await syncLocalTracksToPeer(pc, localStreamRef.current);
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        await sendSignal(peerUid, 'offer', {
          sdp: pc.localDescription?.sdp || offer.sdp,
          type: pc.localDescription?.type || offer.type,
        });
      } catch {
        // Ignore offer race
      } finally {
        makingOfferRef.current.set(peerUid, false);
      }
    }

    async function flushIce(peerUid: string, pc: RTCPeerConnection) {
      const queued = pendingIceRef.current.get(peerUid) || [];
      pendingIceRef.current.delete(peerUid);
      for (const cand of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch {
          // Ignore stale ICE
        }
      }
    }

    const q = query(
      collection(db, 'meetings', meetingId, 'signals'),
      where('toUid', '==', myUid)
    );

    const unsub = onSnapshot(
      q,
      async (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type !== 'added') continue;
          const sigId = change.doc.id;
          if (processedSignalsRef.current.has(sigId)) continue;
          processedSignalsRef.current.add(sigId);

          const data = change.doc.data() as SignalDoc & { createdAt?: { toMillis?: () => number } };
          if (data.fromUid === myUid) continue;
          const createdMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
          if (createdMs < sessionStartRef.current) continue;

          let parsed: any = {};
          try {
            parsed = data.payload ? JSON.parse(data.payload) : {};
          } catch {
            continue;
          }

          const peerUid = data.fromUid;
          const polite = myUid > peerUid;

          if (data.type === 'ready') {
            if (myUid < peerUid) {
              await initiateOffer(peerUid);
            } else {
              // Ensure peer object is ready to receive offer
              getOrCreatePeer(peerUid);
            }
          } else if (data.type === 'offer') {
            const pc = getOrCreatePeer(peerUid);
            const readyForOffer =
              !makingOfferRef.current.get(peerUid) &&
              (pc.signalingState === 'stable' || Boolean(settingRemoteAnswerRef.current.get(peerUid)));
            const offerCollision = !readyForOffer;
            const ignoreOffer = !polite && offerCollision;
            ignoreOfferRef.current.set(peerUid, ignoreOffer);
            if (ignoreOffer) {
              continue;
            }

            try {
              await pc.setRemoteDescription(new RTCSessionDescription(parsed));
              await syncLocalTracksToPeer(pc, localStreamRef.current);
              await flushIce(peerUid, pc);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await sendSignal(peerUid, 'answer', {
                sdp: pc.localDescription?.sdp || answer.sdp,
                type: pc.localDescription?.type || answer.type,
              });
            } catch {
              // Ignore malformed or colliding offer
            }
          } else if (data.type === 'answer') {
            const pc = peersRef.current.get(peerUid);
            if (pc && pc.signalingState === 'have-local-offer') {
              try {
                settingRemoteAnswerRef.current.set(peerUid, true);
                await pc.setRemoteDescription(new RTCSessionDescription(parsed));
                await flushIce(peerUid, pc);
              } catch {
                // Ignore stale answer
              } finally {
                settingRemoteAnswerRef.current.set(peerUid, false);
              }
            }
          } else if (data.type === 'ice') {
            if (ignoreOfferRef.current.get(peerUid)) continue;
            const pc = peersRef.current.get(peerUid);
            if (pc && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(parsed));
              } catch {
                // Ignore stale ICE
              }
            } else {
              const queue = pendingIceRef.current.get(peerUid) || [];
              queue.push(parsed);
              pendingIceRef.current.set(peerUid, queue);
            }
          } else if (data.type === 'leave') {
            connectedPeersRef.current.delete(peerUid);
            const pc = peersRef.current.get(peerUid);
            if (pc) {
              pc.close();
              peersRef.current.delete(peerUid);
            }
            setRemoteStreams((prev) => {
              const copy = { ...prev };
              delete copy[peerUid];
              return copy;
            });
          }
        }
      },
      () => {
        // Non-fatal signaling listener fallback
      }
    );

    const announceAndDial = () => {
      participantIds.forEach((peerUid) => {
        if (peerUid === myUid) return;
        const pc = peersRef.current.get(peerUid);
        if (pc && (pc.connectionState === 'connected' || connectedPeersRef.current.has(peerUid))) {
          return;
        }
        if (myUid < peerUid) {
          initiateOffer(peerUid);
        } else {
          sendSignal(peerUid, 'ready', { ts: Date.now() });
        }
      });
    };

    announceAndDial();

    // Retry handshake periodically for any peer that hasn't connected yet (handles late joiners)
    let retries = 0;
    const retryTimer = window.setInterval(() => {
      retries += 1;
      if (retries > 10) {
        window.clearInterval(retryTimer);
        return;
      }
      announceAndDial();
    }, 3500);

    return () => {
      window.clearInterval(retryTimer);
      unsub();
      participantIds.forEach((peerUid) => {
        if (peerUid !== myUid) {
          sendSignal(peerUid, 'leave', {});
        }
      });
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      pendingIceRef.current.clear();
      processedSignalsRef.current.clear();
      makingOfferRef.current.clear();
      ignoreOfferRef.current.clear();
      settingRemoteAnswerRef.current.clear();
      connectedPeersRef.current.clear();
      setRemoteStreams({});
    };
  }, [meetingId, myUid, participantIds.join(',')]);

  return { remoteStreams };
}
