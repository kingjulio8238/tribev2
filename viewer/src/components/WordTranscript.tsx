import { useRef, useEffect, useMemo } from 'react';
import type { SegmentInfo } from '../types';

interface WordTranscriptProps {
  currentTime: number;
  segments: SegmentInfo[] | null;
}

interface FlatWord {
  text: string;
  start: number;
  end: number;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function WordTranscript({ currentTime, segments }: WordTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);

  // Flatten all words from all segments into a single list
  const words: FlatWord[] = useMemo(() => {
    if (!segments) return [];
    const result: FlatWord[] = [];
    for (const seg of segments) {
      for (const w of seg.words) {
        result.push({ text: w.text, start: w.start, end: w.end });
      }
    }
    return result;
  }, [segments]);

  // Find the index of the currently active word
  const activeIndex = useMemo(() => {
    for (let i = 0; i < words.length; i++) {
      if (currentTime >= words[i].start && currentTime <= words[i].end) {
        return i;
      }
    }
    // If between words, find the most recent word
    let closest = -1;
    for (let i = 0; i < words.length; i++) {
      if (words[i].end <= currentTime) {
        closest = i;
      }
    }
    return closest;
  }, [words, currentTime]);

  // Auto-scroll to keep active word visible
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const element = activeRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      const relativeTop = elementRect.top - containerRect.top;
      const centerOffset = containerRect.height / 2 - elementRect.height / 2;

      if (relativeTop < 40 || relativeTop > containerRect.height - 40) {
        container.scrollTo({
          top: container.scrollTop + relativeTop - centerOffset,
          behavior: 'smooth',
        });
      }
    }
  }, [activeIndex]);

  if (!segments || words.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#3a3a4e',
          fontSize: 13,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: '0.02em',
        }}
      >
        No transcript available
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="tribe-transcript-scroll"
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '12px 14px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '5px 4px',
          alignContent: 'flex-start',
        }}
      >
        {words.map((word, i) => {
          const isActive = i === activeIndex;
          const isPast = word.end < currentTime;
          return (
            <span
              key={`${i}-${word.start}`}
              ref={isActive ? activeRef : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: 12,
                lineHeight: '18px',
                fontFamily: "'Inter', sans-serif",
                transition: 'background 0.15s, color 0.15s',
                backgroundColor: isActive
                  ? 'rgba(240, 106, 40, 0.18)'
                  : isPast
                    ? 'rgba(74, 138, 154, 0.06)'
                    : 'transparent',
                color: isActive
                  ? '#f09050'
                  : isPast
                    ? '#6a8a8a'
                    : '#4a4a5e',
                border: isActive
                  ? '1px solid rgba(240, 106, 40, 0.3)'
                  : '1px solid transparent',
              }}
            >
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  color: isActive ? '#c06030' : '#333345',
                  marginRight: 2,
                  flexShrink: 0,
                }}
              >
                {formatTimestamp(word.start)}
              </span>
              <span>{word.text}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
