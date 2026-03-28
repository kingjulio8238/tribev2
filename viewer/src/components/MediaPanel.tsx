import { useState, useEffect, useCallback } from 'react';
import type { SegmentInfo } from '../types';
import { Waveform } from './Waveform';
import { WordTranscript } from './WordTranscript';

interface MediaPanelProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  segments: SegmentInfo[] | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTimeUpdate?: (time: number) => void;
  basePath?: string;
}

export function MediaPanel({
  currentTime,
  duration,
  isPlaying,
  segments,
  videoRef,
  onTimeUpdate,
  basePath = '/data',
}: MediaPanelProps) {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);

  // Try to load the video from the expected path
  useEffect(() => {
    const testSrc = `${basePath}/stimulus/media.mp4`;
    setVideoSrc(testSrc);
    setVideoError(false);
  }, [basePath]);

  // Sync video element to currentTime from playback (only when not playing,
  // to avoid fighting with the animation-frame driven time)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) return; // let the video play naturally when playing
    if (Math.abs(video.currentTime - currentTime) > 0.1) {
      video.currentTime = currentTime;
    }
  }, [currentTime, isPlaying, videoRef]);

  const handleVideoError = useCallback(() => {
    setVideoError(true);
    setVideoSrc(null);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    setVideoError(false);
  }, []);

  const handleWaveformClick = useCallback(
    (time: number) => {
      if (onTimeUpdate) {
        onTimeUpdate(time);
      }
    },
    [onTimeUpdate],
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        color: '#4A4E5A',
        overflow: 'hidden',
      }}
    >
      {/* Video area - 50% */}
      <div
        style={{
          flex: '1 1 50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #EEF0F4',
          padding: 16,
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {videoSrc && !videoError ? (
          <video
            ref={videoRef}
            src={videoSrc}
            onError={handleVideoError}
            onLoadedMetadata={handleLoadedMetadata}
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 8,
              border: '1px solid #E8EAF0',
              objectFit: 'cover',
            }}
            playsInline
          />
        ) : (
          <VideoPlaceholder />
        )}
      </div>

      {/* Waveform area - 80px fixed */}
      <div
        style={{
          flex: '0 0 80px',
          borderBottom: '1px solid #EEF0F4',
          overflow: 'hidden',
        }}
      >
        <Waveform
          currentTime={currentTime}
          duration={duration}
          onClick={handleWaveformClick}
        />
      </div>

      {/* Word transcript area - remaining space */}
      <div
        style={{
          flex: '1 1 30%',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <WordTranscript currentTime={currentTime} segments={segments} />
      </div>
    </div>
  );
}

function VideoPlaceholder() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EEF0F4',
        borderRadius: 8,
        border: '1px dashed #D8DBE4',
        gap: 12,
      }}
    >
      {/* Film icon */}
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#C0C4D0"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
        <line x1="17" y1="17" x2="22" y2="17" />
      </svg>
      <div
        style={{
          color: '#8B90A0',
          fontSize: 13,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: '0.02em',
        }}
      >
        No video loaded
      </div>
      <div
        style={{
          color: '#B0B5C3',
          fontSize: 11,
          fontFamily: 'monospace',
        }}
      >
        /data/stimulus/media.mp4
      </div>
    </div>
  );
}
