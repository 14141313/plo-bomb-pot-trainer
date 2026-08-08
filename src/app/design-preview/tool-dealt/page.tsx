import { ToolApp } from '@/components/app/ToolApp';
import { TOOL_DEALT } from '../mock';

/** State 2 — Tool with four hands, both boards to the turn, equity live. */
export default function Page() {
  return <ToolApp seed={TOOL_DEALT} />;
}
