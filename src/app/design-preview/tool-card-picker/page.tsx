import { ToolApp } from '@/components/app/ToolApp';
import { TOOL_PICKER } from '../mock';

/** State 8 — the card picker sheet, the product's only modal. */
export default function Page() {
  return <ToolApp seed={TOOL_PICKER} />;
}
