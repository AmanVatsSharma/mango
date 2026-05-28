"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

const data = [
  { date: "Jan 1", balance: 100000 },
  { date: "Jan 5", balance: 102500 },
  { date: "Jan 10", balance: 98000 },
  { date: "Jan 15", balance: 105000 },
  { date: "Jan 20", balance: 110000 },
  { date: "Jan 25", balance: 108500 },
  { date: "Jan 30", balance: 125000 },
]

export function BalanceTrendChart() {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" className="text-muted-foreground" />
          <YAxis className="text-muted-foreground" />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
            formatter={(value: number) => [
              new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
              }).format(value),
              "Balance",
            ]}
          />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="hsl(var(--primary))"
            strokeWidth={3}
            dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: "hsl(var(--primary))", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
