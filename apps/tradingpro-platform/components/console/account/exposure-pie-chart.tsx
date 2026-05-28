"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"

const data = [
  { name: "Equity", value: 45, color: "hsl(var(--chart-1))" },
  { name: "Derivatives", value: 30, color: "hsl(var(--chart-2))" },
  { name: "Commodities", value: 15, color: "hsl(var(--chart-3))" },
  { name: "Currency", value: 10, color: "hsl(var(--chart-4))" },
]

export function ExposurePieChart() {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={5} dataKey="value">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`${value}%`, "Allocation"]}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
