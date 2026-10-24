import { useEffect, useState } from 'react';
export function useUrl(blob?: Blob) {
  const [resource, setResource] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) {
      setResource(undefined);
      return;
    }
    const url = URL.createObjectURL(blob);
    setResource({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return resource?.blob === blob ? resource?.url : undefined;
}
