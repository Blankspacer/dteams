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
  ],
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
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const announcedToRef = useRef<Set<string>>(new Set());
  const sessionStartRef = useRef<number>(Date.now());

  useEffect(() => {
    localStreamRef.current = localStream;
    // Attach or replace tracks on any already-open peer connections
    if (localStream) {
      peersRef.current.forEach(async (pc, peerUid) => {
        const senders = pc.getSenders();
        let addedNewTrack = false;
        localStream.getTracks().forEach((track) => {
          const existingSender = senders.find((s) => s.track?.kind === track.kind);
          if (existingSender) {
            existingSender.replaceTrack(track).catch(() => {});
          } else {
            pc.addTrack(track, localStream);
            addedNewTrack = true;
          }
        });
        if (addedNewTrack && pc.signalingState === 'stable' && pc.remoteDescription && meetingId && myUid) {
          try {
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await pc.setLocalDescription(offer);
            const sigId = `${myUid.slice(0, 12)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await setDoc(doc(db, 'meetings', meetingId, 'signals', sigId), {
              meetingId,
              fromUid: myUid,
              toUid: peerUid,
              type: 'offer',
              payload: JSON.stringify({ sdp: offer.sdp, type: offer.type }).slice(0, 15000),
              createdAt: serverTimestamp(),
            });
          } catch {
            // Ignore transient renegotiation race
          }
        }
      });
    }
  }, [localStream, meetingId, myUid]);

  useEffect(() => {
    if (!meetingId || !myUid) {
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      pendingIceRef.current.clear();
      processedSignalsRef.current.clear();
      announcedToRef.current.clear();
      setRemoteStreams({});
      return;
    }

    sessionStartRef.current = Date.now() - 5000;

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

    function getOrCreatePeer(peerUid: string, resetIfClosed = true): RTCPeerConnection {
      const existing = peersRef.current.get(peerUid);
      if (existing && (!resetIfClosed || existing.connectionState !== 'closed')) {
        return existing;
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(peerUid, 'ice', event.candidate.toJSON());
        }
      };

      pc.ontrack = (event) => {
        const [inboundStream] = event.streams;
        if (inboundStream) {
          setRemoteStreams((prev) => ({ ...prev, [peerUid]: inboundStream }));
        } else {
          setRemoteStreams((prev) => {
            const current = prev[peerUid] || new MediaStream();
            current.addTrack(event.track);
            return { ...prev, [peerUid]: current };
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
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

    async function initiateOffer(peerUid: string) {
      // Recreate PC cleanly if previous was already closed/failed
      const old = peersRef.current.get(peerUid);
      if (old && (old.connectionState === 'failed' || old.connectionState === 'closed')) {
        old.close();
        peersRef.current.delete(peerUid);
      }
      const pc = getOrCreatePeer(peerUid);
      if (pc.signalingState !== 'stable') return;
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        await sendSignal(peerUid, 'offer', { sdp: offer.sdp, type: offer.type });
      } catch {
        // Ignore offer race
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
          if (createdMs < sessionStartRef.current - 30000) continue;

          let parsed: any = {};
          try {
            parsed = data.payload ? JSON.parse(data.payload) : {};
          } catch {
            continue;
          }

          if (data.type === 'ready') {
            if (myUid < data.fromUid) {
              await initiateOffer(data.fromUid);
            }
          } else if (data.type === 'offer') {
            const existing = peersRef.current.get(data.fromUid);
            if (existing && (existing.connectionState === 'failed' || existing.connectionState === 'closed' || existing.signalingState !== 'stable')) {
              existing.close();
              peersRef.current.delete(data.fromUid);
            }
            const pc = getOrCreatePeer(data.fromUid);
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(parsed));
              await flushIce(data.fromUid, pc);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await sendSignal(data.fromUid, 'answer', { sdp: answer.sdp, type: answer.type });
            } catch {
              // Ignore malformed offer
            }
          } else if (data.type === 'answer') {
            const pc = peersRef.current.get(data.fromUid);
            if (pc && pc.signalingState === 'have-local-offer') {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(parsed));
                await flushIce(data.fromUid, pc);
              } catch {
                // Ignore stale answer
              }
            }
          } else if (data.type === 'ice') {
            const pc = peersRef.current.get(data.fromUid);
            if (pc && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(parsed));
              } catch {
                // Ignore stale ICE
              }
            } else {
              const queue = pendingIceRef.current.get(data.fromUid) || [];
              queue.push(parsed);
              pendingIceRef.current.set(data.fromUid, queue);
            }
          } else if (data.type === 'leave') {
            const pc = peersRef.current.get(data.fromUid);
            if (pc) {
              pc.close();
              peersRef.current.delete(data.fromUid);
            }
            setRemoteStreams((prev) => {
              const copy = { ...prev };
              delete copy[data.fromUid];
              return copy;
            });
          }
        }
      },
      () => {
        // Non-fatal signaling listener fallback
      }
    );

    // Announce readiness to current participants
    participantIds.forEach((peerUid) => {
      if (peerUid === myUid || announcedToRef.current.has(peerUid)) return;
      announcedToRef.current.add(peerUid);
      if (myUid < peerUid) {
        initiateOffer(peerUid);
      } else {
        sendSignal(peerUid, 'ready', { ts: Date.now() });
      }
    });

    return () => {
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
      announcedToRef.current.clear();
      setRemoteStreams({});
    };
  }, [meetingId, myUid, participantIds.join(',')]);

  return { remoteStreams };
}
