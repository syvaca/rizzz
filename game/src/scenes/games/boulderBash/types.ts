export interface TrackMeta {
  bpm: number;
  meter: string; // e.g. "4/4"
  beats: number[]; // beat timestamps in seconds
  downBeats?: number[]; // optional, timestamps of downbeats in seconds
  sections?: Array<{ id: string; start: number; end: number; label?: string }>;
  onsets?: number[]; // onset timestamps in seconds
}
