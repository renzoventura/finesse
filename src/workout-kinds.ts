export const WORKOUT_KINDS = [
  "Run",
  "Cycle",
  "HIIT",
  "Gym",
  "Hike",
  "Walk",
  "Swim",
  "Row",
  "Yoga",
  "Other",
] as const;

export type WorkoutKind = (typeof WORKOUT_KINDS)[number];

export function workoutKind(
  note: string | null | undefined,
  source = "",
): WorkoutKind {
  const text = `${note ?? ""} ${source}`.toLowerCase();
  if (/hiit|highintensity|high.?intensity|interval.?train/.test(text)) {
    return "HIIT";
  }
  if (/trail.?run|virtual.?run|\brun\b|running/.test(text)) {
    return "Run";
  }
  if (/e-?bike|gravel|mountain.?bike|virtual.?ride|\bride\b|cycl/.test(text)) {
    return "Cycle";
  }
  if (/\bhike\b|hiking/.test(text)) {
    return "Hike";
  }
  if (/\bwalk\b|walking/.test(text)) {
    return "Walk";
  }
  if (/swim/.test(text)) {
    return "Swim";
  }
  if (/row|kayak|canoe|paddle/.test(text)) {
    return "Row";
  }
  if (/yoga|pilates/.test(text)) {
    return "Yoga";
  }
  if (/weight|strength|gym|cross.?fit|functional/.test(text)) {
    return "Gym";
  }
  if (/\bworkout\b/.test(text)) {
    return "Gym";
  }
  return "Other";
}
