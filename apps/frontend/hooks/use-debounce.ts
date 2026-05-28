import { useEffect, useState, useRef, useCallback } from "react";

export function useDebounce<T>(value: T, delay: number = 500) {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    cancel();
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return cancel;
  }, [value, delay, cancel]);

  return { debouncedValue, cancel };
}
