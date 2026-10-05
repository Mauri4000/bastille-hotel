import { useEffect, useState } from 'react';

interface Rate {
  blue: { buy: number; sell: number };
  official: { buy: number; sell: number };
}

export default function CurrencyRate() {
  const [rate, setRate] = useState<Rate | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchRate() {
      try {
        const res = await fetch('https://api.dolarbluebolivia.click/v1/officialRate');
        if (!res.ok) throw new Error();
        const json = await res.json();
        setRate(json.data);
      } catch {
        setError(true);
      }
    }
    fetchRate();
    const interval = setInterval(fetchRate, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (error || !rate) return null;

  const usdToBob = rate.blue.sell.toFixed(2);

  return (
    <div className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-full px-4 py-1.5 text-sm text-gray-700 w-fit">
      <span className="text-gray-400 text-xs">💱</span>
      <span className="font-semibold">1 USD = <span className="text-amber-500 font-bold">{usdToBob} Bs</span></span>
    </div>
  );
}
