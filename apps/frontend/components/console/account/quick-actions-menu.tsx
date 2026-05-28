"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, ArrowDownToLine, ArrowUpFromLine, FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function QuickActionsMenu() {
  const [isOpen, setIsOpen] = useState(false)

  const actions = [
    { icon: ArrowDownToLine, label: "Deposit", color: "text-green-600" },
    { icon: ArrowUpFromLine, label: "Withdraw", color: "text-blue-600" },
    { icon: FileText, label: "Statements", color: "text-purple-600" },
  ]

  return (
    <div className="fixed bottom-6 right-6 z-50 lg:hidden">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.2 }}
            className="mb-4"
          >
            <Card className="shadow-lg">
              <CardContent className="p-2">
                <div className="flex flex-col gap-2">
                  {actions.map((action, index) => {
                    const Icon = action.icon
                    return (
                      <motion.div
                        key={action.label}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <Button
                          variant="ghost"
                          className="w-full justify-start gap-3 h-12"
                          onClick={() => setIsOpen(false)}
                        >
                          <Icon className={`w-5 h-5 ${action.color}`} />
                          {action.label}
                        </Button>
                      </motion.div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="lg"
        className="w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
      >
        <motion.div animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
          {isOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
        </motion.div>
      </Button>
    </div>
  )
}
