import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from process.env automatically.
// maxRetries: 4 overrides the SDK default of 2. The SDK retries with
// exponential backoff on 429s, 408/409, 5xx, and connection errors —
// covering transient rate limits and hiccups without custom wrapping.
export const anthropic = new Anthropic({
  maxRetries: 4,
});
