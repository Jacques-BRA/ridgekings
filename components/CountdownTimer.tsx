"use client";
import { useEffect, useState } from "react";
import { formatDeadlineCountdown } from "@/lib/format";

export function CountdownTimer({ deadline }: { deadline: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular">{formatDeadlineCountdown(deadline)}</span>;
}
