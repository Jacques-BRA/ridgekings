"use client";
import useSWR from "swr";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function BetDetailClient({ betId, initialStatus }: { betId: number; initialStatus: string }) {
  const router = useRouter();
  const { data } = useSWR(`/api/bets/${betId}`, fetcher, {
    refreshInterval: ["open", "locked", "voting"].includes(initialStatus) ? 5000 : 0,
    revalidateOnFocus: true,
  });
  useEffect(() => {
    if (!data?.bet) return;
    if (data.bet.status !== initialStatus) router.refresh();
  }, [data?.bet?.status, initialStatus, router, data?.bet]);
  return null;
}
