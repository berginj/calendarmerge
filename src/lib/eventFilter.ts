import { ParsedEvent, PublishedEventFilter } from "./types";

const GAME_KEYWORD_PATTERN =
  /\b(game|games|match|matches|scrimmage|scrimmages|tournament|tournaments|playoff|playoffs|championship|doubleheader)\b/i;
const MATCHUP_PATTERN =
  /\b[\p{L}\p{N}][\p{L}\p{N}&.'’ -]{0,60}\s+(?:vs\.?|versus|v\.?|@)\s+[\p{L}\p{N}][\p{L}\p{N}&.'’ -]{0,60}\b/iu;
const GAME_TYPE_PATTERN =
  /\b(?:event\s*type|type)\s*[:=-]?\s*(game|match|scrimmage|tournament|playoff|championship)\b/i;

export function applyEventFilter(
  events: ParsedEvent[],
  eventFilter: PublishedEventFilter,
): ParsedEvent[] {
  if (eventFilter === "games-only") {
    return events.filter(isGameLikeEvent);
  }

  return events;
}

export function isGameLikeEvent(event: ParsedEvent): boolean {
  const categories = getPropertyValues(event, "CATEGORIES").flatMap((value) =>
    value
      .split(",")
      .map((category) => category.trim())
      .filter(Boolean),
  );

  if (categories.some((category) => GAME_KEYWORD_PATTERN.test(category))) {
    return true;
  }

  if (GAME_KEYWORD_PATTERN.test(event.summary) || MATCHUP_PATTERN.test(event.summary)) {
    return true;
  }

  const descriptions = getPropertyValues(event, "DESCRIPTION");
  if (descriptions.some((value) => GAME_TYPE_PATTERN.test(value) || MATCHUP_PATTERN.test(value))) {
    return true;
  }

  return false;
}

function getPropertyValues(event: ParsedEvent, name: string): string[] {
  return event.properties
    .filter((property) => property.name === name)
    .map((property) => property.value)
    .filter(Boolean);
}
