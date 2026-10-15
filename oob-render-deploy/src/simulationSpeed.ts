// Delays match the fixed manual playback options (milliseconds per play).
export function playbackClock(clock = 'Q1 12:00') {
  const match = clock.match(/^(Q(\d+)|OT\d*|\d+OT) (\d+):(\d{2})$/i);
  if (!match) return {quarter: 1, seconds: 720};
  return {
    quarter: match[2] ? Number(match[2]) : 5,
    seconds: Number(match[3]) * 60 + Number(match[4]),
  };
}

export function simulationInterval(speed: string, clock?: string): number {
  if (speed !== 'auto') return Number(speed);
  const {quarter, seconds} = playbackClock(clock);
  if (quarter > 4 || (quarter === 4 && seconds <= 180)) return 1800;
  if ((quarter === 2 && seconds <= 180) || (quarter === 4 && seconds <= 300)) return 900;
  return 400;
}
