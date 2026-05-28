"use client"

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

const data = [
  { date: "Week 1", profit: 1200, loss: -800 },
  { date: "Week 2", profit: 2100, loss: -1200 },
  { date: "Week 3", profit: 800, loss: -1500 },
  { date: "Week 4", profit: 3200, loss: -900 },
]

export function PLTrendChart() {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" className="text-muted-foreground" />
          <YAxis className="text-muted-foreground" />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
            formatter={(value: number, name: string) => [
              new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
              }).format(Math.abs(value)),
              name === "profit" ? "Profit" : "Loss",
            ]}
          />
          <Area
            type="monotone"
            dataKey="profit"
            stackId="1"
            stroke="hsl(var(--success))"
            fill="hsl(var(--success))"
            fillOpacity={0.6}
          />
          <Area
            type="monotone"
            dataKey="loss"
            stackId="2"
            stroke="hsl(var(--destructive))"
            fill="hsl(var(--destructive))"
            fillOpacity={0.6}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
