"use client";
import { useEffect, useState } from "react";

interface Stock {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChangePercent: number;
}

export default function StocksPage() {
  const [data, setData] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/stocks", { cache: "no-store" });
      const json = await res.json();
      if (!json.error) {
        setData(json);
      }
    } catch (err) {
      console.error("Error fetching stocks", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000); // 2 sec polling
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>📈 Live Stock Prices (Polling)</h1>
      {loading && <p>Loading...</p>}
      <ul>
        {data.map((s) => (
          <li key={s.symbol}>
            <b>{s.symbol}</b>: {s.regularMarketPrice} (
            {s.regularMarketChangePercent.toFixed(2)}%)
          </li>
        ))}
      </ul>
    </div>
  );
}
