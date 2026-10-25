import { useEffect, useState } from 'react';
export function useBlobUrl(blob?: Blob): string | undefined {
  const [resource, setResource] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) {
      setResource(undefined);
      return;
    }
    const value = URL.createObjectURL(blob);
    setResource({ blob, url: value });
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return resource?.blob === blob ? resource?.url : undefined;
}
export type { Translate } from '../i18n.ts';
