import { ParsedEvent, PublishedEventFilter } from "./types";

const GAME_KEYWORD_PATTERN =
  /\b(game|games|match|matches|scrimmage|scrimmages|tournament|tournaments|playoff|playoffs|championship|doubleheader)\b/i;
const OPPONENT_PATTERN = /(?:^|\s)(?:vs\.?|versus|v\.)\s+\S|\s@\s+\S/i;
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

  if (GAME_KEYWORD_PATTERN.test(event.summary) || OPPONENT_PATTERN.test(event.summary)) {
    return true;
  }

  const descriptions = getPropertyValues(event, "DESCRIPTION");
  if (descriptions.some((value) => GAME_TYPE_PATTERN.test(value) || OPPONENT_PATTERN.test(value))) {
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
