import { useState, useCallback, useRef, useEffect } from 'react';

interface UsePlaybackOptions {
  duration: number;
  trSeconds: number;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

interface UsePlaybackReturn {
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  trSeconds: number;
  timestepIndex: number;
  nTimesteps: number;
  playbackSpeed: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  setPlaybackSpeed: (speed: number) => void;
}

export function usePlayback({
  duration,
  trSeconds,
  videoRef,
}: UsePlaybackOptions): UsePlaybackReturn {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const lastFrameTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playbackSpeedRef = useRef(1);

  // Keep refs for the latest duration/trSeconds so callbacks don't go stale
  const durationRef = useRef(duration);
  const trSecondsRef = useRef(trSeconds);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);
  useEffect(() => {
    trSecondsRef.current = trSeconds;
  }, [trSeconds]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
    const video = videoRef?.current;
    if (video) {
      video.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, videoRef]);

  // Sync video element on play
  const syncVideoPlay = useCallback(() => {
    const video = videoRef?.current;
    if (video && video.readyState >= 2) {
      video.play().catch(() => {
        // autoplay may be blocked, that's OK
      });
    }
  }, [videoRef]);

  // Sync video element on pause
  const syncVideoPause = useCallback(() => {
    const video = videoRef?.current;
    if (video && !video.paused) {
      video.pause();
    }
  }, [videoRef]);

  // Sync video element on seek
  const syncVideoSeek = useCallback(
    (time: number) => {
      const video = videoRef?.current;
      if (video && Math.abs(video.currentTime - time) > 0.05) {
        video.currentTime = time;
      }
    },
    [videoRef],
  );

  const play = useCallback(() => {
    setIsPlaying(true);
    syncVideoPlay();
  }, [syncVideoPlay]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    lastFrameTimeRef.current = null;
    syncVideoPause();
  }, [syncVideoPause]);

  const toggle = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        syncVideoPlay();
      } else {
        lastFrameTimeRef.current = null;
        syncVideoPause();
      }
      return next;
    });
  }, [syncVideoPlay, syncVideoPause]);

  const seek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(time, durationRef.current));
      setCurrentTime(clamped);
      syncVideoSeek(clamped);
    },
    [syncVideoSeek],
  );

  const stepForward = useCallback(() => {
    setCurrentTime((prev) => {
      const next = Math.min(prev + trSecondsRef.current, durationRef.current);
      syncVideoSeek(next);
      return next;
    });
  }, [syncVideoSeek]);

  const stepBackward = useCallback(() => {
    setCurrentTime((prev) => {
      const next = Math.max(prev - trSecondsRef.current, 0);
      syncVideoSeek(next);
      return next;
    });
  }, [syncVideoSeek]);

  // Animation frame loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const tick = (timestamp: number) => {
      const video = videoRef?.current;
      if (video && !video.paused && video.readyState >= 2) {
        // Drive time from the video element when it is playing
        const vt = video.currentTime;
        if (vt >= durationRef.current) {
          setIsPlaying(false);
          lastFrameTimeRef.current = null;
          syncVideoPause();
          setCurrentTime(durationRef.current);
        } else {
          setCurrentTime(vt);
        }
      } else if (lastFrameTimeRef.current !== null) {
        // Fallback: compute from RAF delta when no video is available
        const delta = ((timestamp - lastFrameTimeRef.current) / 1000) * playbackSpeedRef.current;
        setCurrentTime((prev) => {
          const next = prev + delta;
          if (next >= durationRef.current) {
            setIsPlaying(false);
            lastFrameTimeRef.current = null;
            syncVideoPause();
            return durationRef.current;
          }
          return next;
        });
      }
      lastFrameTimeRef.current = timestamp;
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, syncVideoPause]);

  const nTimesteps =
    trSeconds > 0 ? Math.floor(duration / trSeconds) : 0;

  const timestepIndex =
    trSeconds > 0 ? Math.min(Math.floor(currentTime / trSeconds), Math.max(0, nTimesteps - 1)) : 0;

  return {
    currentTime,
    isPlaying,
    duration,
    trSeconds,
    timestepIndex,
    nTimesteps,
    playbackSpeed,
    play,
    pause,
    toggle,
    seek,
    stepForward,
    stepBackward,
    setPlaybackSpeed,
  };
}
