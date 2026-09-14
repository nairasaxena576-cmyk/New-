import { useCallback, useState } from 'react';

export function useCopyToClipboard(timeout = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback(
    async (text: string, key: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), timeout);
        return true;
      } catch {
        return false;
      }
    },
    [timeout]
  );

  return { copiedKey, copy };
}
