"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import CountUp from "react-countup";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function BalanceCounter({ initial }: { initial: number }) {
  const [prev, setPrev] = useState(initial);
  const { data } = useSWR<{ balance: number }>("/api/me/balance", fetcher, { refreshInterval: 10_000 });
  const current = data?.balance ?? initial;
  useEffect(() => {
    if (current !== prev) setPrev(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
  return (
    <span className="font-display text-2xl text-primary tabular">
      <CountUp start={prev} end={current} duration={0.6} separator="," preserveValue />
      <span className="text-text-dim text-xs ml-1">RKD</span>
    </span>
  );
}
