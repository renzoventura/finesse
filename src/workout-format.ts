export type WorkoutInterval = {
  type?: string | null;
  label?: string | null;
  movingTimeSec?: number | null;
  distanceMeters?: number | null;
  averageHeartrate?: number | null;
  averageWatts?: number | null;
  averageSpeedMps?: number | null;
  intensity?: number | null;
};

export type WorkoutStep = {
  duration?: number | null;
  distance?: number | null;
  text?: string | null;
  reps?: number | null;
  steps?: WorkoutStep[] | null;
  power?: WorkoutTarget | null;
  pace?: WorkoutTarget | null;
  hr?: WorkoutTarget | null;
};

export type WorkoutTarget = {
  value?: number | null;
  start?: number | null;
  end?: number | null;
  units?: string | null;
};

export type WorkoutDetails = {
  type?: string | null;
  name?: string | null;
  description?: string | null;
  distanceMeters?: number | null;
  movingTimeSec?: number | null;
  elevationGainM?: number | null;
  averageHeartrate?: number | null;
  maxHeartrate?: number | null;
  averageWatts?: number | null;
  normalizedWatts?: number | null;
  averageSpeedMps?: number | null;
  averageCadence?: number | null;
  calories?: number | null;
  trainingLoad?: number | null;
  intensity?: number | null;
  warmupSec?: number | null;
  cooldownSec?: number | null;
  intervalSummary?: string[] | null;
  intervals?: WorkoutInterval[] | null;
  workoutSteps?: WorkoutStep[] | null;
};

const SPORT_LABELS: Record<string, string> = {
  HighIntensityIntervalTraining: "HIIT",
  WeightTraining: "Gym",
  StrengthTraining: "Gym",
  Workout: "Workout",
  Ride: "Ride",
  VirtualRide: "Ride",
  GravelRide: "Gravel",
  MountainBikeRide: "MTB",
  EBikeRide: "E-bike",
  Run: "Run",
  VirtualRun: "Run",
  TrailRun: "Trail run",
  Walk: "Walk",
  Hike: "Hike",
  Swim: "Swim",
  OpenWaterSwim: "Swim",
  Rowing: "Row",
  Kayaking: "Kayak",
  Yoga: "Yoga",
  Pilates: "Pilates",
  StairStepper: "Stairs",
  Elliptical: "Elliptical",
  Crossfit: "CrossFit",
};

const GENERIC_NAME =
  /^(running|cycling|ride|run|workout|hiit|walk|walking|swim|swimming)$/i;
const MAX_STRUCTURE_LINES = 10;
const MIN_PHASE_SEC = 30;

export function sportLabel(type?: string | null): string {
  const raw = type?.trim() || "";
  if (!raw) {
    return "";
  }
  return SPORT_LABELS[raw] ?? raw.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatWorkoutLabel(input: {
  type?: string | null;
  name?: string | null;
  distanceMeters?: number | null;
  movingTimeSec?: number | null;
}): string {
  const name = input.name?.trim() || "";
  const type = sportLabel(input.type) || input.type?.trim() || "";
  const head = workoutHead(type, name);
  const extra: string[] = [];
  if (input.distanceMeters && input.distanceMeters >= 100) {
    extra.push(`${(input.distanceMeters / 1000).toFixed(1)} km`);
  }
  if (input.movingTimeSec && input.movingTimeSec >= 30) {
    extra.push(formatDuration(input.movingTimeSec));
  }
  return extra.length ? `${head} · ${extra.join(" · ")}` : head;
}

export function formatWorkoutDetail(input: WorkoutDetails): string | null {
  const parts = [
    statsLine(input),
    ...structureLines(input),
    usefulDescription(input),
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join("\n") : null;
}

function workoutHead(type: string, name: string): string {
  if (!name) {
    return type || "Workout";
  }
  if (!type) {
    return name;
  }
  if (namesMatch(type, name) || GENERIC_NAME.test(name)) {
    return type;
  }
  return `${type} — ${name}`;
}

function namesMatch(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

function statsLine(input: WorkoutDetails): string | null {
  const bits: string[] = [];
  const speed = input.averageSpeedMps ?? 0;
  const distance = input.distanceMeters ?? 0;
  const moving = input.movingTimeSec ?? 0;
  if (showPace(input) && distance >= 100 && moving >= 30) {
    bits.push(`Pace ${formatPace(moving / (distance / 1000))}`);
  } else if (showSpeed(input) && speed > 0) {
    bits.push(`${(speed * 3.6).toFixed(1)} km/h`);
  }
  const hr = roundPositive(input.averageHeartrate, 40);
  const maxHr = roundPositive(input.maxHeartrate, 40);
  if (hr) {
    bits.push(maxHr && maxHr > hr ? `HR ${hr} (max ${maxHr})` : `HR ${hr}`);
  }
  const np = roundPositive(input.normalizedWatts, 30);
  const watts = roundPositive(input.averageWatts, 30);
  if (np && watts && Math.abs(np - watts) >= 10) {
    bits.push(`${watts} W · NP ${np}`);
  } else if (np) {
    bits.push(`${np} W`);
  } else if (watts) {
    bits.push(`${watts} W`);
  }
  const elev = input.elevationGainM ?? 0;
  if (elev >= 5) {
    bits.push(`Elev ${Math.round(elev)} m`);
  }
  const cadence = roundPositive(input.averageCadence, 40);
  if (cadence) {
    bits.push(`${cadence} rpm`);
  }
  const load = roundPositive(input.trainingLoad, 1);
  if (load) {
    bits.push(`Load ${load}`);
  }
  const intensity = input.intensity ?? 0;
  if (intensity >= 20) {
    bits.push(`Intensity ${Math.round(intensity)}%`);
  }
  const kcal = roundPositive(input.calories, 20);
  if (kcal) {
    bits.push(`${kcal} kcal`);
  }
  return bits.length ? bits.join(" · ") : null;
}

function showPace(input: WorkoutDetails): boolean {
  const type = `${input.type ?? ""} ${input.name ?? ""}`.toLowerCase();
  if (/ride|cycle|bike|row|kayak/.test(type)) {
    return false;
  }
  if (/run|walk|hike|jog/.test(type)) {
    return true;
  }
  const speed = input.averageSpeedMps ?? 0;
  return speed > 0 && speed < 4.2;
}

function showSpeed(input: WorkoutDetails): boolean {
  return !showPace(input);
}

function structureLines(input: WorkoutDetails): string[] {
  const fromIntervals = formatExecutedIntervals(input);
  if (fromIntervals.length) {
    return fromIntervals;
  }
  const fromPlan = formatPlannedSteps(input.workoutSteps ?? [], 0);
  if (fromPlan.length) {
    return fromPlan.slice(0, MAX_STRUCTURE_LINES);
  }
  const fromPhases = formatWarmupWorkCooldown(input);
  if (fromPhases.length) {
    return fromPhases;
  }
  return formatIntervalSummary(input);
}

function formatExecutedIntervals(input: WorkoutDetails): string[] {
  const useful = (input.intervals ?? []).filter((interval) =>
    isUsefulInterval(interval, input),
  );
  if (
    useful.length < 2 &&
    !useful.some((interval) => phaseOf(interval) !== "work")
  ) {
    return [];
  }
  if (looksLikeAutolaps(useful)) {
    return useful.length <= 4
      ? useful.map((interval) => formatIntervalLine(interval))
      : [];
  }
  return collapseIntervals(useful).slice(0, MAX_STRUCTURE_LINES);
}

function isUsefulInterval(
  interval: WorkoutInterval,
  activity: WorkoutDetails,
): boolean {
  const duration = interval.movingTimeSec ?? 0;
  if (duration < 15) {
    return false;
  }
  const whole = activity.movingTimeSec ?? 0;
  if (whole >= 60 && duration >= whole * 0.9) {
    return false;
  }
  return true;
}

function looksLikeAutolaps(intervals: WorkoutInterval[]): boolean {
  if (intervals.length < 2) {
    return false;
  }
  return intervals.every(
    (interval) => phaseOf(interval) === "work" && !interval.label,
  );
}

function collapseIntervals(intervals: WorkoutInterval[]): string[] {
  const lines: string[] = [];
  let index = 0;
  while (index < intervals.length) {
    const work = intervals[index];
    const rest = intervals[index + 1];
    if (
      work &&
      rest &&
      phaseOf(work) === "work" &&
      phaseOf(rest) === "recovery"
    ) {
      let reps = 0;
      let cursor = index;
      while (cursor + 1 < intervals.length) {
        const left = intervals[cursor];
        const right = intervals[cursor + 1];
        if (
          !left ||
          !right ||
          !similarInterval(left, work) ||
          !similarInterval(right, rest)
        ) {
          break;
        }
        reps += 1;
        cursor += 2;
      }
      if (reps >= 2) {
        lines.push(
          `${reps}× (${formatIntervalInner(work)} · ${formatIntervalInner(rest)})`,
        );
        index = cursor;
        continue;
      }
    }
    if (work) {
      lines.push(formatIntervalLine(work));
    }
    index += 1;
  }
  return lines;
}

function similarInterval(
  left: WorkoutInterval,
  right: WorkoutInterval,
): boolean {
  if (phaseOf(left) !== phaseOf(right)) {
    return false;
  }
  const a = left.movingTimeSec ?? 0;
  const b = right.movingTimeSec ?? 0;
  const delta = Math.abs(a - b);
  return delta <= 15 || (Math.max(a, b) > 0 && delta / Math.max(a, b) <= 0.2);
}

function formatIntervalLine(interval: WorkoutInterval): string {
  const bits = [
    intervalTitle(interval),
    durationBit(interval.movingTimeSec),
    distanceBit(interval.distanceMeters),
    wattsBit(interval.averageWatts),
    hrBit(interval.averageHeartrate),
  ].filter(Boolean);
  return bits.join(" · ");
}

function formatIntervalInner(interval: WorkoutInterval): string {
  const title = intervalTitle(interval).toLowerCase();
  const duration = durationBit(interval.movingTimeSec);
  const watts = wattsBit(interval.averageWatts);
  if (watts && duration) {
    return `${duration} ${title} @ ${watts}`;
  }
  if (duration) {
    return `${duration} ${title}`;
  }
  return title;
}

function intervalTitle(interval: WorkoutInterval): string {
  const label = interval.label?.trim();
  if (label) {
    return label;
  }
  switch (phaseOf(interval)) {
    case "warmup":
      return "Warm-up";
    case "cooldown":
      return "Cool-down";
    case "recovery":
      return "Easy";
    default:
      return "Work";
  }
}

function phaseOf(
  interval: WorkoutInterval,
): "warmup" | "cooldown" | "recovery" | "work" {
  const text = `${interval.type ?? ""} ${interval.label ?? ""}`.toLowerCase();
  if (/warm/.test(text)) {
    return "warmup";
  }
  if (/cool/.test(text)) {
    return "cooldown";
  }
  if (/recover|rest/.test(text)) {
    return "recovery";
  }
  return "work";
}

function formatWarmupWorkCooldown(input: WorkoutDetails): string[] {
  const warmup = input.warmupSec ?? 0;
  const cooldown = input.cooldownSec ?? 0;
  const moving = input.movingTimeSec ?? 0;
  if (warmup < MIN_PHASE_SEC && cooldown < MIN_PHASE_SEC) {
    return [];
  }
  const lines: string[] = [];
  if (warmup >= MIN_PHASE_SEC) {
    lines.push(`Warm-up · ${formatDuration(warmup)}`);
  }
  const work = moving - warmup - cooldown;
  if (work >= MIN_PHASE_SEC) {
    lines.push(`Work · ${formatDuration(work)}`);
  }
  if (cooldown >= MIN_PHASE_SEC) {
    lines.push(`Cool-down · ${formatDuration(cooldown)}`);
  }
  return lines;
}

function formatIntervalSummary(input: WorkoutDetails): string[] {
  const items = (input.intervalSummary ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length < 2) {
    return [];
  }
  return items
    .slice(0, MAX_STRUCTURE_LINES)
    .map((item) => item.replace(/^1x\s+/i, ""));
}

function formatPlannedSteps(steps: WorkoutStep[], depth: number): string[] {
  if (depth > 4) {
    return [];
  }
  const lines: string[] = [];
  for (const step of steps) {
    const kids = Array.isArray(step.steps) ? step.steps : [];
    const reps = step.reps && step.reps > 1 ? step.reps : 0;
    if (kids.length && reps) {
      const inner = kids
        .map((child) => formatPlannedInner(child))
        .filter(Boolean)
        .join(" · ");
      if (inner) {
        lines.push(`${reps}× (${inner})`);
      }
      continue;
    }
    if (kids.length) {
      lines.push(...formatPlannedSteps(kids, depth + 1));
      continue;
    }
    const line = formatPlannedLine(step);
    if (line) {
      lines.push(line);
    }
  }
  return lines;
}

function formatPlannedLine(step: WorkoutStep): string | null {
  const bits = [
    plannedTitle(step),
    durationBit(step.duration ?? null),
    distanceBit(step.distance ?? null),
    targetBit(step.power, "W"),
    targetBit(step.hr, "bpm"),
    paceTargetBit(step.pace),
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : null;
}

function formatPlannedInner(step: WorkoutStep): string {
  const title = (step.text?.trim() || plannedTitle(step)).toLowerCase();
  const duration = durationBit(step.duration ?? null);
  const power = targetBit(step.power, "W");
  if (duration && power) {
    return `${duration} ${title} @ ${power}`;
  }
  if (duration) {
    return `${duration} ${title}`.trim();
  }
  return [title, power].filter(Boolean).join(" ");
}

function plannedTitle(step: WorkoutStep): string {
  const text = step.text?.trim();
  if (text && !/^\d+x$/i.test(text)) {
    return text;
  }
  const blob = text ?? "";
  if (/warm/i.test(blob)) {
    return "Warm-up";
  }
  if (/cool/i.test(blob)) {
    return "Cool-down";
  }
  return blob || "Work";
}

function usefulDescription(input: WorkoutDetails): string | null {
  const text = input.description?.trim() ?? "";
  if (!text) {
    return null;
  }
  const compact = text.replace(/\s+/g, " ");
  const name = input.name?.trim() ?? "";
  const type = sportLabel(input.type);
  if (namesMatch(compact, name) || namesMatch(compact, type)) {
    return null;
  }
  const clipped = compact.length > 280 ? `${compact.slice(0, 279)}…` : compact;
  return clipped;
}

function durationBit(seconds: number | null | undefined): string {
  return seconds && seconds >= 15 ? formatDuration(seconds) : "";
}

function distanceBit(meters: number | null | undefined): string {
  return meters && meters >= 100 ? `${(meters / 1000).toFixed(1)} km` : "";
}

function wattsBit(watts: number | null | undefined): string {
  const value = roundPositive(watts, 30);
  return value ? `${value} W` : "";
}

function hrBit(hr: number | null | undefined): string {
  const value = roundPositive(hr, 40);
  return value ? `${value} bpm` : "";
}

function targetBit(
  target: WorkoutTarget | null | undefined,
  unit: string,
): string {
  if (!target) {
    return "";
  }
  const value = target.value ?? midpoint(target.start, target.end);
  if (value === null) {
    return "";
  }
  const units = target.units?.trim() || unit;
  if (units.startsWith("%")) {
    return `${Math.round(value)}${units}`;
  }
  return `${Math.round(value)} ${unit}`;
}

function paceTargetBit(target: WorkoutTarget | null | undefined): string {
  if (!target) {
    return "";
  }
  const value = target.value ?? midpoint(target.start, target.end);
  if (value === null) {
    return "";
  }
  const units = (target.units ?? "").toLowerCase();
  if (units.includes("min") || units.includes("pace")) {
    return formatPace(value);
  }
  return `${Math.round(value)} ${target.units ?? ""}`.trim();
}

function midpoint(
  start: number | null | undefined,
  end: number | null | undefined,
): number | null {
  if (start != null && end != null) {
    return (start + end) / 2;
  }
  return start ?? end ?? null;
}

function formatPace(secondsPerKm: number): string {
  if (
    !Number.isFinite(secondsPerKm) ||
    secondsPerKm <= 0 ||
    secondsPerKm > 1800
  ) {
    return "";
  }
  const rounded = Math.round(secondsPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function roundPositive(
  value: number | null | undefined,
  min: number,
): number | null {
  if (value == null || !Number.isFinite(value) || value < min) {
    return null;
  }
  return Math.round(value);
}
