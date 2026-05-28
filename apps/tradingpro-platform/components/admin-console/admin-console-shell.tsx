/**
 * File:        components/admin-console/admin-console-shell.tsx
 * Module:      Admin Console · Client shell
 * Purpose:     Holds the interactive admin-console chrome (sidebar collapse, mobile-menu
 *              toggle, QR scanner FAB, route transition motion). Lifted out of
 *              `app/(admin)/admin-console/layout.tsx` so the layout can be a server
 *              component and the chrome's framer-motion + state machinery only ship
 *              once instead of being wrapped at the layout level.
 *
 * Exports:
 *   - AdminConsoleShell({ children }) — client component that renders sidebar/header/main
 *
 * Depends on:
 *   - framer-motion · motion — page-transition animation (already in optimizePackageImports)
 *   - @/components/admin-console/{sidebar,header,qr-scanner}
 *   - next/navigation.usePathname — drives active tab + route key
 *   - @/lib/branding-routes.getAdminConsoleRoute — strips brand prefix from path
 *
 * Side-effects:
 *   - usePathname re-renders on navigation
 *   - QR scanner mounts a video stream when opened
 *
 * Key invariants:
 *   - All useState lives here, never on the layout. Re-introducing "use client" at the
 *     layout level was the Wave 1 perf miss this file fixes.
 *
 * Read order:
 *   1. AdminConsoleShell — sole export
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { QrCode } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { Sidebar } from "@/components/admin-console/sidebar"
import { Header } from "@/components/admin-console/header"
import { QRScanner } from "@/components/admin-console/qr-scanner"
import { usePathname } from "next/navigation"
import { getAdminConsoleRoute } from "@/lib/branding-routes"

export function AdminConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [qrScannerOpen, setQrScannerOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const getActiveTab = () => {
    const adminConsoleRoot = getAdminConsoleRoute()
    const path = pathname.replace(adminConsoleRoot, "").replace("/", "") || "dashboard"
    return path
  }

  // Dense "command center" pages break out of the 1280px content cap and use the
  // full viewport width. Add routes here when a page needs every pixel.
  const activeSection = getActiveTab()
  const isWidePage = activeSection === "advanced"

  const handleQRScanComplete = (data: { clientId: string; amount: number; utr: string }) => {
    toast({
      title: "Funds Added Successfully",
      description: `₹${data.amount.toLocaleString()} added to ${data.clientId}`,
    })
    console.log("Processing fund addition:", data)
  }

  return (
    <div data-admin-shell className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <div className="flex flex-col md:flex-row">
        <Sidebar
          activeTab={getActiveTab()}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
        />
        <div className={`flex-1 w-full transition-all duration-300 ${sidebarCollapsed ? "md:ml-16" : "md:ml-64"}`}>
          <Header
            onQRScannerOpen={() => setQrScannerOpen(true)}
            onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
          />
          <main
            className={
              isWidePage
                ? "p-2 sm:p-3 overflow-x-hidden"
                : "p-2 sm:p-3 md:p-4 lg:p-6 overflow-x-hidden"
            }
          >
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className={isWidePage ? "w-full" : "w-full max-w-7xl mx-auto"}>
                {children}
              </div>
            </motion.div>
          </main>
        </div>
      </div>

      <QRScanner isOpen={qrScannerOpen} onClose={() => setQrScannerOpen(false)} onScanComplete={handleQRScanComplete} />

      <Button
        onClick={() => setQrScannerOpen(true)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary hover:bg-primary/90 shadow-lg md:hidden z-40 touch-manipulation"
        size="icon"
        aria-label="Open QR Scanner"
      >
        <QrCode className="w-5 h-5 sm:w-6 sm:h-6" />
      </Button>
    </div>
  )
}
