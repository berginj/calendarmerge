import { GameFilterRules, ParsedEvent, PublishedEventFilter } from "./types";

const DEFAULT_INCLUDE_KEYWORDS = [
  "game",
  "games",
  "match",
  "matches",
  "scrimmage",
  "scrimmages",
  "tournament",
  "tournaments",
  "playoff",
  "playoffs",
  "championship",
  "doubleheader",
];
const DEFAULT_MATCHUP_REGEX =
  String.raw`\b[\p{L}\p{N}][\p{L}\p{N}&.'’ -]{0,60}\s+(?:vs\.?|versus|v\.?|@)\s+[\p{L}\p{N}][\p{L}\p{N}&.'’ -]{0,60}\b`;
const DEFAULT_GAME_TYPE_REGEX =
  String.raw`\b(?:event\s*type|type)\s*[:=-]?\s*(game|match|scrimmage|tournament|playoff|championship)\b`;
const MATCHUP_MARKER_PATTERN = /\s(?:vs\.?|versus|v\.?|@)\s/i;

export const DEFAULT_GAME_FILTER_RULES: GameFilterRules = {
  forceIncludeFeedIds: [],
  forceExcludeFeedIds: [],
  includeKeywords: DEFAULT_INCLUDE_KEYWORDS,
  excludeKeywords: [],
  includeRegex: [DEFAULT_MATCHUP_REGEX, DEFAULT_GAME_TYPE_REGEX],
  excludeRegex: [],
  teamAliases: [],
};

export function applyEventFilter(
  events: ParsedEvent[],
  eventFilter: PublishedEventFilter,
  gameFilterRules?: Partial<GameFilterRules>,
): ParsedEvent[] {
  if (eventFilter === "games-only") {
    return events.filter((event) => isGameLikeEvent(event, gameFilterRules));
  }

  return events;
}

export function isGameLikeEvent(
  event: ParsedEvent,
  gameFilterRules?: Partial<GameFilterRules>,
): boolean {
  const rules = normalizeGameFilterRules(gameFilterRules);

  if (rules.forceExcludeFeedIds.includes(event.sourceId)) {
    return false;
  }

  const categories = getPropertyValues(event, "CATEGORIES").flatMap((value) =>
    value
      .split(",")
      .map((category) => category.trim())
      .filter(Boolean),
  );
  const descriptions = getPropertyValues(event, "DESCRIPTION");
  const searchableText = [event.summary, event.location, ...categories, ...descriptions].filter(Boolean);

  if (
    rules.excludeKeywords.some((keyword) => searchableText.some((value) => containsKeyword(value, keyword))) ||
    rules.excludeRegex.some((pattern) => searchableText.some((value) => matchesRegex(value, pattern)))
  ) {
    return false;
  }

  if (rules.forceIncludeFeedIds.includes(event.sourceId)) {
    return true;
  }

  if (rules.includeKeywords.some((keyword) => searchableText.some((value) => containsKeyword(value, keyword)))) {
    return true;
  }

  if (rules.includeRegex.some((pattern) => searchableText.some((value) => matchesRegex(value, pattern)))) {
    return true;
  }

  if (rules.teamAliases.some((alias) => searchableText.some((value) => containsAliasInMatchup(value, alias)))) {
    return true;
  }

  return false;
}

export function normalizeGameFilterRules(input?: Partial<GameFilterRules>): GameFilterRules {
  return {
    forceIncludeFeedIds: normalizeStringList(input?.forceIncludeFeedIds),
    forceExcludeFeedIds: normalizeStringList(input?.forceExcludeFeedIds),
    includeKeywords: normalizeStringList(input?.includeKeywords, DEFAULT_GAME_FILTER_RULES.includeKeywords),
    excludeKeywords: normalizeStringList(input?.excludeKeywords),
    includeRegex: normalizeStringList(input?.includeRegex, DEFAULT_GAME_FILTER_RULES.includeRegex),
    excludeRegex: normalizeStringList(input?.excludeRegex),
    teamAliases: normalizeStringList(input?.teamAliases),
  };
}

export function getInvalidGameFilterRegex(rules: Partial<GameFilterRules>): string[] {
  return [
    ...normalizeStringList(rules.includeRegex).filter((pattern) => !compileRegex(pattern)),
    ...normalizeStringList(rules.excludeRegex).filter((pattern) => !compileRegex(pattern)),
  ];
}

function getPropertyValues(event: ParsedEvent, name: string): string[] {
  return event.properties
    .filter((property) => property.name === name)
    .map((property) => property.value)
    .filter(Boolean);
}

function normalizeStringList(value: unknown, fallback: string[] = []): string[] {
  const raw = Array.isArray(value) ? value : fallback;
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function containsKeyword(value: string, keyword: string): boolean {
  const escaped = escapeRegExp(keyword.trim());
  if (!escaped) {
    return false;
  }

  return new RegExp(`\\b${escaped}\\b`, "iu").test(value);
}

function containsAliasInMatchup(value: string, alias: string): boolean {
  return containsLooseText(value, alias) && MATCHUP_MARKER_PATTERN.test(value);
}

function containsLooseText(value: string, needle: string): boolean {
  const normalizedValue = value.toLocaleLowerCase();
  const normalizedNeedle = needle.trim().toLocaleLowerCase();
  return normalizedNeedle.length > 0 && normalizedValue.includes(normalizedNeedle);
}

function matchesRegex(value: string, pattern: string): boolean {
  const regex = compileRegex(pattern);
  return regex ? regex.test(value) : false;
}

function compileRegex(pattern: string): RegExp | null {
  try {
    const literal = pattern.match(/^\/(.+)\/([dgimsuvy]*)$/);
    if (literal) {
      const flags = literal[2].includes("u") ? literal[2] : `${literal[2]}u`;
      return new RegExp(literal[1], flags);
    }

    return new RegExp(pattern, "iu");
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
